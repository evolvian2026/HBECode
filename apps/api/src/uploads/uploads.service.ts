import { Worker } from 'node:worker_threads';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { questions, uploadJobs, uploadRows, type UploadActor, type UploadIssue } from '@hbe/db';
import { profileCard, sumArray, topEarner } from '@hbe/db/seed';
import { errorReport, exportFile, templateFile, type FileFormat, type ParseResult } from '@hbe/question-format';
import { QuestionInput, type CodingQuestionInput } from '@hbe/shared';
import { and, asc, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { AuditService } from '../common/audit.service.js';
import { dbCtx, type AuthUser, type RequestMeta } from '../common/decorators.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { CONFIG, type AppConfig } from '../config.js';
import { DbService, REDIS } from '../infra/infra.module.js';
import { contentHash, QuestionsService } from '../questions/questions.service.js';

const PARSE_TIMEOUT_MS = 120_000;
const LEASE_MS = 180_000;
const RETENTION_DAYS = 7;

/** Magic bytes: .xlsx/.docx are zip archives; JSON starts with { or [ (after optional BOM/space). */
function sniff(buf: Buffer, format: FileFormat): boolean {
  if (format === 'json') return /^\uFEFF?\s*[[{]/.test(buf.subarray(0, 64).toString('utf8'));
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

/** Small, valid example questions for the templates (the seeds' 200k stress tests would make a 5 MB file). */
function examples(): QuestionInput[] {
  const small = sumArray.hidden.filter((h) => h.input.length < 20_000);
  const gen = (n: number, seed: number) => {
    const a = Array.from({ length: n }, (_, i) => ((i * 7919 + seed * 104_729) % 2_000_001) - 1_000_000);
    return { input: `${n}\n${a.join(' ')}\n`, output: `${a.reduce((x, y) => x + y, 0)}\n`, weight: 2, isStress: true };
  };
  const coding: CodingQuestionInput = { ...(sumArray as CodingQuestionInput), hidden: [...small, ...[1, 2, 3, 4].map((s) => gen(1000, s))].slice(0, 12) };
  // Clearly labelled, and not practice questions: importing the unchanged template must not
  // look like (or show up next to) the real bank questions they are based on.
  const label = (q: unknown, title: string) => QuestionInput.parse({ ...(q as object), title, isPractice: false });
  return [label(coding, 'Template example: add up an array'), label(profileCard, 'Template example: responsive card'), label(topEarner, 'Template example: best paid per department')];
}

export function runParse(buf: Buffer, format: FileFormat): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./parse-worker.js', import.meta.url), {
      workerData: { buf: new Uint8Array(buf), format },
      resourceLimits: { maxOldGenerationSizeMb: 384, maxYoungGenerationSizeMb: 64 },
    });
    const timer = setTimeout(() => {
      void w.terminate();
      reject(new Error('the file took too long to read (over 2 minutes)'));
    }, PARSE_TIMEOUT_MS);
    w.once('message', (m: { ok: boolean; result?: ParseResult; error?: string }) => {
      clearTimeout(timer);
      void w.terminate();
      if (m.ok) resolve(m.result!);
      else reject(new Error(m.error));
    });
    w.once('error', (e) => {
      clearTimeout(timer);
      reject(new Error(/memory/i.test(e.message) ? 'the file needs too much memory to read' : e.message));
    });
  });
}

const actorUser = (a: UploadActor): AuthUser => ({ id: a.id, role: a.role, tenantId: a.tenantId, sessionId: 'upload', mfa: true, mfaSetupRequired: false });

/**
 * Bulk upload: store → parse (worker thread) → preview with per-row problems → author confirms →
 * import (create/update under the author's RLS context) → optional sandbox validation and
 * publish. Jobs survive restarts: a lease + poller resume `queued`, `parsing` and `importing`.
 */
@Injectable()
export class UploadsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Uploads');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly qs: QuestionsService,
    private readonly limits: RateLimitService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  onModuleInit() {
    if (this.cfg.SWEEPER_INTERVAL_MS > 0) {
      this.timer = setInterval(() => void this.poll().catch((e) => this.log.error(`upload poll failed: ${(e as Error).message}`)), this.cfg.SWEEPER_INTERVAL_MS);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private actorOf(u: AuthUser): UploadActor {
    if (u.role === 'super_admin') return { id: u.id, role: 'super_admin', tenantId: null };
    if (u.role !== 'teacher' || !u.tenantId) throw forbidden();
    return { id: u.id, role: 'teacher', tenantId: u.tenantId };
  }

  // ------------------------------------------------------------------ templates & export
  template(format: 'xlsx' | 'docx') {
    return templateFile(format, examples());
  }

  /** Exports include hidden tests, drivers and reference solutions: only questions you can edit. */
  async export(u: AuthUser, ids: string[], format: FileFormat, meta: RequestMeta): Promise<Buffer> {
    await this.limits.enforce(`export:${u.id}`, 20, 600);
    const items = [];
    for (const id of ids) {
      const d = await this.qs.detail(u, id);
      if (!d.canEdit) throw forbidden(`"${d.question.title}" cannot be exported: exports include reference solutions, so only questions you can edit can be exported.`);
      items.push({ id, question: d.question as QuestionInput });
    }
    await this.db.run(dbCtx(u), (tx) => this.audit.record(tx, { tenantId: u.tenantId, actorId: u.id, action: 'question.export', entityType: 'question', data: { format, count: ids.length, ids: ids.slice(0, 50) } }, meta));
    return exportFile(items, format);
  }

  // ------------------------------------------------------------------ upload → parse
  async create(u: AuthUser, buf: Buffer, format: FileFormat, filename: string, meta: RequestMeta): Promise<{ id: string }> {
    const actor = this.actorOf(u);
    await this.limits.enforce(`upload:${u.id}`, 10, 600);
    if (!buf.length) throw badRequest('The file is empty.');
    if (!sniff(buf, format)) throw badRequest(format === 'json' ? 'This is not a JSON file.' : `This is not an .${format} file.`);
    const [job] = await this.db.run(dbCtx(u), async (tx) => {
      const rows = await tx
        .insert(uploadJobs)
        .values({ tenantId: actor.tenantId, createdBy: u.id, filename: filename.slice(0, 200), format, sizeBytes: buf.length, file: buf, actor })
        .returning({ id: uploadJobs.id });
      await this.audit.record(tx, { tenantId: actor.tenantId, actorId: u.id, action: 'upload.create', entityType: 'upload', entityId: rows[0]!.id, data: { filename, format, bytes: buf.length } }, meta);
      return rows;
    });
    setImmediate(() => void this.parse(job!.id).catch((e) => this.log.error(`parse ${job!.id}: ${(e as Error).message}`)));
    return { id: job!.id };
  }

  /** Claim a job in `from` state (or a stale lease in `running`) for this replica. */
  private async claim(id: string, from: 'queued' | 'importing', running: 'parsing' | 'importing') {
    const [job] = await this.db.system((tx) =>
      tx
        .update(uploadJobs)
        .set({ status: running, leaseUntil: new Date(Date.now() + LEASE_MS), attempts: sql`${uploadJobs.attempts} + 1` })
        .where(and(eq(uploadJobs.id, id), or(and(eq(uploadJobs.status, from), from === 'importing' ? sql`(${uploadJobs.leaseUntil} IS NULL OR ${uploadJobs.leaseUntil} < now())` : sql`true`), and(eq(uploadJobs.status, running), lt(uploadJobs.leaseUntil, new Date())))))
        .returning(),
    );
    return job;
  }

  async parse(id: string): Promise<void> {
    const job = await this.claim(id, 'queued', 'parsing');
    if (!job) return;
    const fail = (error: string) => this.db.system((tx) => tx.update(uploadJobs).set({ status: 'failed', error, file: null, leaseUntil: null, finishedAt: new Date() }).where(eq(uploadJobs.id, id)));
    if (!job.file) return void (await fail('the file is no longer available; upload it again'));
    if (job.attempts > 3) return void (await fail('reading the file failed repeatedly'));
    let result: ParseResult;
    try {
      result = await runParse(job.file, job.format);
    } catch (e) {
      return void (await fail((e as Error).message));
    }
    if (result.questions.length === 0) {
      return void (await fail(result.issues.map((i) => i.message).join('; ') || 'no questions found in the file'));
    }
    const u = actorUser(job.actor);
    // Duplicates and update targets are resolved under the uploader's own RLS context.
    const hashes = result.questions.filter((q) => q.input).map((q) => contentHash(q.input!));
    const ids = result.questions.map((q) => q.id).filter((x): x is string => !!x && /^[0-9a-f-]{36}$/i.test(x));
    const existing = await this.db.run(dbCtx(u), async (tx) => ({
      byHash: hashes.length ? await tx.select({ id: questions.id, hash: questions.contentHash, tenantId: questions.tenantId }).from(questions).where(inArray(questions.contentHash, hashes)) : [],
      byId: ids.length ? await tx.select({ id: questions.id, tenantId: questions.tenantId, type: questions.type }).from(questions).where(inArray(questions.id, ids)) : [],
    }));
    const writable = (t: string | null) => (u.role === 'super_admin' ? t === null : t === u.tenantId);
    const seen = new Map<string, string>();
    const rows = result.questions.map((q, i) => {
      const warnings: UploadIssue[] = [...q.warnings];
      let status: 'invalid' | 'duplicate' | 'ready' = q.input && q.errors.length === 0 ? 'ready' : 'invalid';
      let action: 'create' | 'update' = 'create';
      let targetId: string | null = null;
      let message: string | null = null;
      if (q.input) {
        const target = q.id ? existing.byId.find((e) => e.id === q.id) : undefined;
        if (q.id && target && writable(target.tenantId)) {
          if (target.type !== q.input.type) {
            status = 'invalid';
            q.errors.push({ loc: q.loc, field: 'type', message: `question ${q.id} is a ${target.type} question; the type cannot change` });
          } else {
            action = 'update';
            targetId = target.id;
          }
        } else if (q.id) {
          warnings.push({ loc: q.loc, field: 'id', message: 'this id is not a question you can edit here; a new question will be created' });
        }
        const hash = contentHash(q.input);
        if (action === 'create' && status === 'ready') {
          const dup = existing.byHash.find((e) => e.hash === hash && (u.role === 'super_admin' || e.tenantId === u.tenantId));
          if (dup) {
            status = 'duplicate';
            message = 'A question with the same title and statement already exists. To update it, re-import an exported file (it carries the id).';
          } else if (seen.has(hash)) {
            status = 'duplicate';
            message = `Same title and statement as ${seen.get(hash)} in this file.`;
          }
        }
        if (status === 'ready') seen.set(hash, q.key);
      }
      return {
        jobId: id, rowNo: i + 1, key: q.key || `#${i + 1}`, title: q.title.slice(0, 200), type: q.type, loc: q.loc, action, targetId, status,
        errors: q.errors, warnings, payload: status === 'ready' ? (q.input as unknown as Record<string, unknown>) : null, message,
      };
    });
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    const issues = [...result.issues.map((x) => ({ ...x, severity: 'error' as const })), ...result.warnings.map((x) => ({ ...x, severity: 'warning' as const }))];
    await this.db.system(async (tx) => {
      for (let i = 0; i < rows.length; i += 50) await tx.insert(uploadRows).values(rows.slice(i, i + 50));
      await tx
        .update(uploadJobs)
        .set({
          status: 'parsed', file: null, leaseUntil: null, parsedAt: new Date(), issues,
          counts: { total: rows.length, ready: count('ready'), invalid: count('invalid'), duplicate: count('duplicate'), updates: rows.filter((r) => r.status === 'ready' && r.action === 'update').length, withWarnings: rows.filter((r) => r.warnings.length > 0).length },
        })
        .where(eq(uploadJobs.id, id));
    });
  }

  // ------------------------------------------------------------------ preview / report
  list(u: AuthUser) {
    this.actorOf(u);
    return this.db.run(dbCtx(u), (tx) =>
      tx
        .select({ id: uploadJobs.id, filename: uploadJobs.filename, format: uploadJobs.format, status: uploadJobs.status, counts: uploadJobs.counts, createdAt: uploadJobs.createdAt })
        .from(uploadJobs)
        .where(sql`${uploadJobs.status} <> 'discarded'`)
        .orderBy(desc(uploadJobs.createdAt))
        .limit(30),
    );
  }

  async get(u: AuthUser, id: string) {
    this.actorOf(u);
    return this.db.run(dbCtx(u), async (tx) => {
      const [job] = await tx.select().from(uploadJobs).where(eq(uploadJobs.id, id));
      if (!job) throw notFound('Upload');
      const rows = await tx
        .select({ rowNo: uploadRows.rowNo, key: uploadRows.key, title: uploadRows.title, type: uploadRows.type, loc: uploadRows.loc, action: uploadRows.action, status: uploadRows.status, errors: uploadRows.errors, warnings: uploadRows.warnings, questionId: uploadRows.questionId, message: uploadRows.message, questionStatus: questions.status })
        .from(uploadRows)
        .leftJoin(questions, eq(questions.id, uploadRows.questionId))
        .where(eq(uploadRows.jobId, id))
        .orderBy(asc(uploadRows.rowNo));
      const validation = {
        validating: rows.filter((r) => r.questionStatus === 'validating').length,
        published: rows.filter((r) => r.questionStatus === 'published').length,
        invalid: rows.filter((r) => r.questionStatus === 'invalid').length,
      };
      return {
        id: job.id, filename: job.filename, format: job.format, sizeBytes: job.sizeBytes, status: job.status, counts: job.counts, issues: job.issues, error: job.error,
        options: job.options, createdAt: job.createdAt.toISOString(), parsedAt: job.parsedAt?.toISOString() ?? null, finishedAt: job.finishedAt?.toISOString() ?? null,
        validation, rows,
      };
    });
  }

  async report(u: AuthUser, id: string): Promise<Buffer> {
    const j = await this.get(u, id);
    const entries = [
      ...j.issues.map((i) => ({ key: '', title: '', severity: i.severity, loc: i.loc, field: i.field, message: i.message })),
      ...j.rows.flatMap((r) => [
        ...r.errors.map((e) => ({ key: r.key, title: r.title, severity: 'error' as const, loc: e.loc, field: e.field, message: e.message })),
        ...(r.message && r.status !== 'imported' ? [{ key: r.key, title: r.title, severity: 'error' as const, loc: r.loc, message: r.message }] : []),
        ...r.warnings.map((w) => ({ key: r.key, title: r.title, severity: 'warning' as const, loc: w.loc, field: w.field, message: w.message })),
      ]),
    ];
    if (j.error) entries.unshift({ key: '', title: '', severity: 'error', loc: 'file', field: undefined, message: j.error });
    return errorReport(entries);
  }

  // ------------------------------------------------------------------ confirm → import
  async confirm(u: AuthUser, id: string, publish: boolean, meta: RequestMeta) {
    const actor = this.actorOf(u);
    await this.db.run(dbCtx(u), async (tx) => {
      const [job] = await tx.select().from(uploadJobs).where(eq(uploadJobs.id, id)).for('update');
      if (!job) throw notFound('Upload');
      if (job.status !== 'parsed') throw conflict(job.status === 'importing' || job.status === 'done' ? 'This upload was already imported.' : 'The file has not been read yet.');
      const ready = await tx.select({ n: sql<number>`count(*)::int` }).from(uploadRows).where(and(eq(uploadRows.jobId, id), eq(uploadRows.status, 'ready')));
      if (!ready[0]?.n) throw badRequest('Nothing to import: fix the problems in the file and upload it again.');
      // The import runs as the author who confirms it (their RLS context and audit identity).
      await tx.update(uploadJobs).set({ status: 'importing', options: { publish }, actor, confirmedAt: new Date(), leaseUntil: null }).where(eq(uploadJobs.id, id));
      await this.audit.record(tx, { tenantId: actor.tenantId, actorId: u.id, action: 'upload.confirm', entityType: 'upload', entityId: id, data: { publish, questions: ready[0].n } }, meta);
    });
    setImmediate(() => void this.importJob(id).catch((e) => this.log.error(`import ${id}: ${(e as Error).message}`)));
    return { status: 'importing' as const };
  }

  async importJob(id: string): Promise<void> {
    const job = await this.claim(id, 'importing', 'importing');
    if (!job) return;
    const u = actorUser(job.actor);
    const meta: RequestMeta = { ip: '', userAgent: 'bulk upload', requestId: `upload:${id}` };
    const rows = await this.db.system((tx) => tx.select().from(uploadRows).where(and(eq(uploadRows.jobId, id), eq(uploadRows.status, 'ready'))).orderBy(asc(uploadRows.rowNo)));
    let imported = 0;
    for (const r of rows) {
      const parsed = QuestionInput.safeParse({ ...r.payload, global: u.role === 'super_admin' ? true : undefined });
      let status: 'imported' | 'failed' = 'failed';
      let questionId: string | null = null;
      let message: string | null = null;
      if (!parsed.success) message = 'stored question no longer matches the schema';
      else {
        try {
          questionId = r.action === 'update' && r.targetId ? (await this.qs.update(u, r.targetId, parsed.data, meta)).id : (await this.qs.create(u, parsed.data, meta)).id;
          status = 'imported';
          imported++;
          if (job.options.publish) {
            const v = await this.qs.validate(u, questionId, true, meta);
            if (v.status === 'invalid') message = `imported as a draft: ${v.problems.slice(0, 3).join('; ')}`;
          }
        } catch (e) {
          message = (e as Error).message;
        }
      }
      await this.db.system((tx) => tx.update(uploadRows).set({ status, questionId, message, payload: null }).where(and(eq(uploadRows.jobId, id), eq(uploadRows.rowNo, r.rowNo))));
      // Keep the lease alive on long imports.
      await this.db.system((tx) => tx.update(uploadJobs).set({ leaseUntil: new Date(Date.now() + LEASE_MS) }).where(eq(uploadJobs.id, id)));
    }
    await this.db.system(async (tx) => {
      const [j] = await tx.select({ counts: uploadJobs.counts }).from(uploadJobs).where(eq(uploadJobs.id, id));
      const done = await tx.select({ n: sql<number>`count(*)::int` }).from(uploadRows).where(and(eq(uploadRows.jobId, id), eq(uploadRows.status, 'imported')));
      const failed = await tx.select({ n: sql<number>`count(*)::int` }).from(uploadRows).where(and(eq(uploadRows.jobId, id), eq(uploadRows.status, 'failed')));
      await tx.update(uploadJobs).set({ status: 'done', leaseUntil: null, finishedAt: new Date(), counts: { ...(j?.counts ?? {}), imported: done[0]?.n ?? 0, failed: failed[0]?.n ?? 0 } }).where(eq(uploadJobs.id, id));
      await this.audit.record(tx, { tenantId: job.tenantId, actorId: u.id, action: 'upload.import', entityType: 'upload', entityId: id, data: { imported, failed: failed[0]?.n ?? 0 } }, meta);
    });
  }

  async discard(u: AuthUser, id: string) {
    this.actorOf(u);
    await this.db.run(dbCtx(u), async (tx) => {
      const [job] = await tx.select({ status: uploadJobs.status }).from(uploadJobs).where(eq(uploadJobs.id, id));
      if (!job) throw notFound('Upload');
      if (job.status === 'importing') throw conflict('The import is running.');
      await tx.update(uploadJobs).set({ status: 'discarded', file: null }).where(eq(uploadJobs.id, id));
      await tx.update(uploadRows).set({ payload: null }).where(eq(uploadRows.jobId, id));
    });
  }

  // ------------------------------------------------------------------ resume + retention
  async poll(): Promise<void> {
    const lock = await this.redis.set('upload-poll-lock', '1', 'PX', 30_000, 'NX');
    if (lock !== 'OK') return;
    try {
      const pending = await this.db.system((tx) =>
        tx
          .select({ id: uploadJobs.id, status: uploadJobs.status })
          .from(uploadJobs)
          .where(or(eq(uploadJobs.status, 'queued'), and(inArray(uploadJobs.status, ['parsing', 'importing']), or(sql`${uploadJobs.leaseUntil} IS NULL`, lt(uploadJobs.leaseUntil, new Date())))))
          .limit(5),
      );
      for (const p of pending) {
        if (p.status === 'importing') await this.importJob(p.id);
        else await this.parse(p.id);
      }
      // Uploads (and the hidden data in their rows) are kept for 7 days.
      await this.db.system((tx) => tx.delete(uploadJobs).where(lt(uploadJobs.createdAt, new Date(Date.now() - RETENTION_DAYS * 86_400_000))));
    } finally {
      await this.redis.del('upload-poll-lock');
    }
  }
}
