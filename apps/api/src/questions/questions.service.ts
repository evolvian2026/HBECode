import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { languageSecrets, languageStubs, questions, questionVersions, submissions, testCases, type Tx, type ValidationReport } from '@hbe/db';
import {
  hasPermission,
  publishProblems,
  RUNTIMES,
  type CodingQuestionInput,
  type ExecResult,
  type Page,
  type RuntimeId,
} from '@hbe/shared';
import { and, arrayContains, asc, desc, eq, ilike, inArray, isNotNull, lt, or } from 'drizzle-orm';
import { AuditService } from '../common/audit.service.js';
import { sha256 } from '../common/crypto.js';
import { dbCtx, type AuthUser, type RequestMeta } from '../common/decorators.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { pagination } from '../common/mailer.js';
import { DispatchService } from '../executor/dispatch.service.js';
import { DbService } from '../infra/infra.module.js';

/** Validator rule: the slowest reference run must leave at least 30% of the time limit unused. */
const HEADROOM = 0.7;

export interface QuestionSummary {
  id: string;
  title: string;
  difficulty: string;
  tags: string[];
  status: string;
  isPractice: boolean;
  global: boolean;
  versionNo: number;
  published: boolean;
  updatedAt: string;
}

export interface StudentQuestion {
  id: string;
  title: string;
  statement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  difficulty: string;
  tags: string[];
  memoryLimitMb: number;
  samples: { input: string; output: string; explanation: string }[];
  runtimes: { id: RuntimeId; label: string; version: string; monaco: string; timeLimitMs: number; stub: string }[];
  preview: boolean;
}

function slugify(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'question';
  return `${base}-${randomUUID().slice(0, 6)}`;
}

const contentHash = (q: CodingQuestionInput) => sha256(`${q.title.trim().toLowerCase()}\n${q.statement.replace(/\s+/g, ' ').trim().toLowerCase()}`);
const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');

@Injectable()
export class QuestionsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly dispatch: DispatchService,
  ) {
    dispatch.onValidationResult((id, result) => this.onValidationResult(id, result));
  }

  private async writeContent(tx: Tx, versionId: string, q: CodingQuestionInput) {
    const rows = [
      ...q.samples.map((s, i) => ({ versionId, visibility: 'sample' as const, ordinal: i + 1, input: s.input, expected: s.output, explanation: s.explanation, weight: 0 })),
      ...q.hidden.map((h, i) => ({ versionId, visibility: 'hidden' as const, ordinal: i + 1, input: h.input, expected: h.output, weight: h.weight, isStress: h.isStress })),
    ];
    if (rows.length) await tx.insert(testCases).values(rows);
    const tpl = Object.entries(q.templates) as [RuntimeId, { stub: string; driver: string; solution: string }][];
    if (tpl.length) {
      await tx.insert(languageStubs).values(tpl.map(([runtime, t]) => ({ versionId, runtime, stub: t.stub })));
      await tx.insert(languageSecrets).values(tpl.map(([runtime, t]) => ({ versionId, runtime, driver: t.driver, solution: t.solution })));
    }
  }

  private versionFields(q: CodingQuestionInput) {
    return {
      title: q.title,
      statement: q.statement,
      constraints: q.constraints,
      inputFormat: q.inputFormat,
      outputFormat: q.outputFormat,
      difficulty: q.difficulty,
      tags: q.tags,
      timeComplexity: q.timeComplexity,
      spaceComplexity: q.spaceComplexity,
      baseTimeLimitMs: q.baseTimeLimitMs,
      memoryLimitMb: q.memoryLimitMb,
      compare: q.compare,
      validation: null,
    };
  }

  // ------------------------------------------------------------------ authoring
  async create(u: AuthUser, q: CodingQuestionInput, meta: RequestMeta): Promise<{ id: string }> {
    if (q.global && u.role !== 'super_admin') throw forbidden('Only super admins can add questions to the global bank.');
    const tenantId = u.role === 'super_admin' ? null : u.tenantId;
    if (u.role !== 'super_admin' && !tenantId) throw forbidden();
    const hash = contentHash(q);
    return this.db.run(dbCtx(u), async (tx) => {
      const [dup] = await tx
        .select({ id: questions.id })
        .from(questions)
        .where(and(eq(questions.contentHash, hash), tenantId ? eq(questions.tenantId, tenantId) : undefined));
      if (dup) throw conflict('A question with the same title and statement already exists.');
      const questionId = randomUUID();
      const versionId = randomUUID();
      await tx.insert(questions).values({ id: questionId, tenantId, slug: slugify(q.title), isPractice: q.isPractice, latestVersionId: versionId, contentHash: hash, createdBy: u.id });
      await tx.insert(questionVersions).values({ id: versionId, questionId, versionNo: 1, createdBy: u.id, ...this.versionFields(q) });
      await this.writeContent(tx, versionId, q);
      await this.audit.record(tx, { tenantId, actorId: u.id, action: 'question.create', entityType: 'question', entityId: questionId, data: { title: q.title } }, meta);
      return { id: questionId };
    });
  }

  async update(u: AuthUser, id: string, q: CodingQuestionInput, meta: RequestMeta): Promise<{ id: string; versionNo: number }> {
    return this.db.run(dbCtx(u), async (tx) => {
      const [row] = await tx.select().from(questions).where(eq(questions.id, id)).for('update');
      if (!row) throw notFound('Question');
      if (row.tenantId === null && u.role !== 'super_admin') throw forbidden('Global questions can only be edited by super admins.');
      const [latest] = await tx.select().from(questionVersions).where(eq(questionVersions.id, row.latestVersionId!));
      let versionId = latest!.id;
      let versionNo = latest!.versionNo;
      if (latest!.publishedAt) {
        // Published versions are frozen (tests pin them): edits go into a new draft version.
        versionId = randomUUID();
        versionNo += 1;
        await tx.insert(questionVersions).values({ id: versionId, questionId: id, versionNo, createdBy: u.id, ...this.versionFields(q) });
      } else {
        await tx.update(questionVersions).set(this.versionFields(q)).where(eq(questionVersions.id, versionId));
        await tx.delete(testCases).where(eq(testCases.versionId, versionId));
        await tx.delete(languageStubs).where(eq(languageStubs.versionId, versionId));
        await tx.delete(languageSecrets).where(eq(languageSecrets.versionId, versionId));
      }
      await this.writeContent(tx, versionId, q);
      await tx
        .update(questions)
        .set({ latestVersionId: versionId, isPractice: q.isPractice, contentHash: contentHash(q), status: row.publishedVersionId ? 'published' : 'draft' })
        .where(eq(questions.id, id));
      await this.audit.record(tx, { tenantId: row.tenantId, actorId: u.id, action: 'question.update', entityType: 'question', entityId: id, data: { versionNo } }, meta);
      return { id, versionNo };
    });
  }

  async remove(u: AuthUser, id: string, meta: RequestMeta): Promise<{ archived: boolean }> {
    return this.db.run(dbCtx(u), async (tx) => {
      const [row] = await tx.select().from(questions).where(eq(questions.id, id));
      if (!row) throw notFound('Question');
      if (row.tenantId === null && u.role !== 'super_admin') throw forbidden('Global questions can only be deleted by super admins.');
      if (row.publishedVersionId) {
        // Published questions may be referenced by tests and reports: archive instead of deleting.
        await tx.update(questions).set({ status: 'archived', isPractice: false }).where(eq(questions.id, id));
      } else {
        await tx.update(questions).set({ latestVersionId: null }).where(eq(questions.id, id));
        await tx.delete(questions).where(eq(questions.id, id));
      }
      await this.audit.record(tx, { tenantId: row.tenantId, actorId: u.id, action: row.publishedVersionId ? 'question.archive' : 'question.delete', entityType: 'question', entityId: id }, meta);
      return { archived: Boolean(row.publishedVersionId) };
    });
  }

  // ------------------------------------------------------------------ reading
  async list(u: AuthUser, f: { q?: string; difficulty?: string; status?: string; tag?: string; cursor?: string; limit: number }): Promise<Page<QuestionSummary>> {
    const cur = pagination.decode(f.cursor);
    return this.db.run(dbCtx(u), async (tx) => {
      const rows = await tx
        .select({ q: questions, v: questionVersions })
        .from(questions)
        .innerJoin(questionVersions, eq(questionVersions.id, questions.latestVersionId))
        .where(
          and(
            f.q ? ilike(questionVersions.title, `%${escapeLike(f.q)}%`) : undefined,
            f.difficulty ? eq(questionVersions.difficulty, f.difficulty as 'easy') : undefined,
            f.status ? eq(questions.status, f.status as 'draft') : undefined,
            f.tag ? arrayContains(questionVersions.tags, [f.tag]) : undefined,
            cur ? or(lt(questions.updatedAt, cur.createdAt), and(eq(questions.updatedAt, cur.createdAt), lt(questions.id, cur.id))) : undefined,
          ),
        )
        .orderBy(desc(questions.updatedAt), desc(questions.id))
        .limit(f.limit + 1);
      const items = rows.slice(0, f.limit).map(({ q, v }) => ({
        id: q.id, title: v.title, difficulty: v.difficulty, tags: v.tags, status: q.status, isPractice: q.isPractice,
        global: q.tenantId === null, versionNo: v.versionNo, published: q.publishedVersionId !== null, updatedAt: q.updatedAt.toISOString(),
      }));
      const last = rows[f.limit - 1];
      return { items, nextCursor: rows.length > f.limit && last ? pagination.encode(last.q.updatedAt, last.q.id) : null };
    });
  }

  /** Full authoring view. Drivers/solutions only for question:write (RLS also enforces this). */
  async detail(u: AuthUser, id: string) {
    const canWrite = hasPermission(u.role, 'question:write');
    return this.db.run(dbCtx(u), async (tx) => {
      const [row] = await tx.select().from(questions).where(eq(questions.id, id));
      if (!row) throw notFound('Question');
      const [v] = await tx.select().from(questionVersions).where(eq(questionVersions.id, row.latestVersionId!));
      const tests = await tx.select().from(testCases).where(eq(testCases.versionId, v!.id)).orderBy(asc(testCases.visibility), asc(testCases.ordinal));
      const stubs = await tx.select().from(languageStubs).where(eq(languageStubs.versionId, v!.id));
      const secrets = canWrite ? await tx.select().from(languageSecrets).where(eq(languageSecrets.versionId, v!.id)) : [];
      const templates = Object.fromEntries(
        stubs.map((s) => {
          const sec = secrets.find((x) => x.runtime === s.runtime);
          return [s.runtime, canWrite ? { stub: s.stub, driver: sec?.driver ?? '', solution: sec?.solution ?? '' } : { stub: s.stub }];
        }),
      );
      const input: CodingQuestionInput = {
        title: v!.title, statement: v!.statement, constraints: v!.constraints, inputFormat: v!.inputFormat, outputFormat: v!.outputFormat,
        difficulty: v!.difficulty, tags: v!.tags, timeComplexity: v!.timeComplexity, spaceComplexity: v!.spaceComplexity,
        baseTimeLimitMs: v!.baseTimeLimitMs, memoryLimitMb: v!.memoryLimitMb, compare: v!.compare, isPractice: row.isPractice,
        samples: tests.filter((t) => t.visibility === 'sample').map((t) => ({ input: t.input, output: t.expected, explanation: t.explanation })),
        hidden: tests.filter((t) => t.visibility === 'hidden').map((t) => ({ input: t.input, output: t.expected, weight: t.weight, isStress: t.isStress })),
        templates: templates as CodingQuestionInput['templates'],
      };
      return {
        id: row.id,
        status: row.status,
        global: row.tenantId === null,
        canEdit: canWrite && (row.tenantId !== null || u.role === 'super_admin'),
        versionNo: v!.versionNo,
        publishedVersionId: row.publishedVersionId,
        latestIsPublished: v!.publishedAt !== null,
        validation: v!.validation,
        problems: canWrite ? publishProblems(input) : [],
        question: input,
      };
    });
  }

  /** Learner view: never includes hidden tests, drivers, solutions or complexity hints. */
  async studentView(u: AuthUser, id: string): Promise<StudentQuestion> {
    const staff = hasPermission(u.role, 'question:read_full');
    return this.db.run(dbCtx(u), async (tx) => {
      const [row] = await tx.select().from(questions).where(eq(questions.id, id));
      if (!row) throw notFound('Question');
      const versionId = row.publishedVersionId ?? (staff ? row.latestVersionId : null);
      if (!versionId) throw notFound('Question');
      const [v] = await tx.select().from(questionVersions).where(eq(questionVersions.id, versionId));
      if (!v) throw notFound('Question');
      const samples = await tx
        .select({ input: testCases.input, output: testCases.expected, explanation: testCases.explanation })
        .from(testCases)
        .where(and(eq(testCases.versionId, versionId), eq(testCases.visibility, 'sample')))
        .orderBy(asc(testCases.ordinal));
      const stubs = await tx.select().from(languageStubs).where(eq(languageStubs.versionId, versionId));
      return {
        id: row.id, title: v.title, statement: v.statement, constraints: v.constraints, inputFormat: v.inputFormat,
        outputFormat: v.outputFormat, difficulty: v.difficulty, tags: v.tags, memoryLimitMb: v.memoryLimitMb, samples,
        runtimes: stubs
          .filter((s) => s.runtime in RUNTIMES)
          .map((s) => {
            const r = RUNTIMES[s.runtime as RuntimeId];
            return { id: r.id, label: r.label, version: r.version, monaco: r.monaco, timeLimitMs: Math.round(v.baseTimeLimitMs * r.timeMultiplier), stub: s.stub };
          })
          .sort((a, b) => Object.keys(RUNTIMES).indexOf(a.id) - Object.keys(RUNTIMES).indexOf(b.id)),
        preview: row.publishedVersionId !== versionId,
      };
    });
  }

  async practiceList(u: AuthUser, f: { q?: string; difficulty?: string; tag?: string; cursor?: string; limit: number }) {
    const cur = pagination.decode(f.cursor);
    return this.db.run(dbCtx(u), async (tx) => {
      const rows = await tx
        .select({ id: questions.id, updatedAt: questions.updatedAt, title: questionVersions.title, difficulty: questionVersions.difficulty, tags: questionVersions.tags, global: questions.tenantId })
        .from(questions)
        .innerJoin(questionVersions, eq(questionVersions.id, questions.publishedVersionId))
        .where(
          and(
            eq(questions.status, 'published'),
            eq(questions.isPractice, true),
            isNotNull(questions.publishedVersionId),
            f.q ? ilike(questionVersions.title, `%${escapeLike(f.q)}%`) : undefined,
            f.difficulty ? eq(questionVersions.difficulty, f.difficulty as 'easy') : undefined,
            f.tag ? arrayContains(questionVersions.tags, [f.tag]) : undefined,
            cur ? or(lt(questions.updatedAt, cur.createdAt), and(eq(questions.updatedAt, cur.createdAt), lt(questions.id, cur.id))) : undefined,
          ),
        )
        .orderBy(desc(questions.updatedAt), desc(questions.id))
        .limit(f.limit + 1);
      const last = rows[f.limit - 1];
      return {
        items: rows.slice(0, f.limit).map((r) => ({ id: r.id, title: r.title, difficulty: r.difficulty, tags: r.tags, global: r.global === null })),
        nextCursor: rows.length > f.limit && last ? pagination.encode(last.updatedAt, last.id) : null,
      };
    });
  }

  // ------------------------------------------------------------------ validation & publishing
  /**
   * Run every reference solution against every test in the executor. Results arrive through
   * `onValidationResult`. With `publishIfValid`, a fully passing run publishes automatically.
   */
  async validate(u: AuthUser, id: string, publishIfValid: boolean, meta: RequestMeta): Promise<{ status: 'validating' | 'invalid'; problems: string[] }> {
    const detail = await this.detail(u, id);
    if (!detail.canEdit) throw forbidden();
    const problems = publishProblems(detail.question);
    const runId = randomUUID();
    const runtimes = Object.keys(detail.question.templates) as RuntimeId[];
    const report: ValidationReport = {
      runId, ok: false, pending: problems.length === 0, publishIfValid, requestedAt: new Date().toISOString(), checkedAt: problems.length ? new Date().toISOString() : null,
      expected: runtimes, problems, runtimes: {},
    };
    const target = await this.db.run(dbCtx(u), async (tx) => {
      const [row] = await tx.select().from(questions).where(eq(questions.id, id)).for('update');
      await tx.update(questionVersions).set({ validation: report }).where(eq(questionVersions.id, row!.latestVersionId!));
      if (!row!.publishedVersionId) await tx.update(questions).set({ status: problems.length ? 'invalid' : 'validating' }).where(eq(questions.id, id));
      await this.audit.record(tx, { tenantId: row!.tenantId, actorId: u.id, action: 'question.validate', entityType: 'question', entityId: id, data: { problems: problems.length } }, meta);
      return { tenantId: row!.tenantId, versionId: row!.latestVersionId! };
    });
    // Separate transaction (after the lock above is released): validation submissions are
    // system-only rows. If the question is edited meanwhile, the run id no longer matches and
    // the results are ignored.
    const subIds = problems.length
      ? []
      : await this.db.system(async (stx) => {
          const ids: string[] = [];
          for (const rt of runtimes) {
            const [s] = await stx
              .insert(submissions)
              .values({
                tenantId: target.tenantId, userId: u.id, questionId: id, versionId: target.versionId, runtime: rt, kind: 'validate', priority: 'validate',
                code: detail.question.templates[rt]!.solution, validationRun: runId,
              })
              .returning({ id: submissions.id });
            ids.push(s!.id);
          }
          return ids;
        });
    for (const sid of subIds) await this.dispatch.enqueue('validate', sid);
    return { status: problems.length ? 'invalid' : 'validating', problems };
  }

  /** Called by the dispatcher (system context) when a validation submission finishes. */
  async onValidationResult(submissionId: string, result: ExecResult): Promise<void> {
    let publish: { questionId: string; actorId: string } | null = null;
    await this.db.system(async (tx) => {
      const [s] = await tx.select().from(submissions).where(eq(submissions.id, submissionId));
      if (!s?.validationRun) return;
      const [q] = await tx.select().from(questions).where(eq(questions.id, s.questionId)).for('update');
      const [v] = await tx.select().from(questionVersions).where(eq(questionVersions.id, s.versionId));
      const report = v?.validation;
      if (!q || !v || !report || report.runId !== s.validationRun || q.latestVersionId !== v.id) return; // stale run
      const limitMs = Math.round(v.baseTimeLimitMs * RUNTIMES[s.runtime as RuntimeId].timeMultiplier);
      const verdicts = result.tests.map((t) => t.verdict);
      const maxCpuMs = Math.max(0, ...result.tests.map((t) => t.cpuMs));
      const expectedCount = (await tx.select({ id: testCases.id }).from(testCases).where(eq(testCases.versionId, v.id))).length;
      const ok = result.compile.ok && !result.internalError && verdicts.length === expectedCount && verdicts.every((x) => x === 'AC') && maxCpuMs <= limitMs * HEADROOM;
      report.runtimes[s.runtime] = {
        ok, maxCpuMs, limitMs, verdicts,
        compileOutput: result.compile.ok ? undefined : result.compile.output.slice(0, 2000) || result.internalError,
      };
      if (!ok) {
        const why = !result.compile.ok ? 'reference solution does not compile' : verdicts.some((x) => x !== 'AC') ? `reference solution fails: ${verdicts.join(' ')}` : `slowest test ${maxCpuMs} ms exceeds ${Math.round(HEADROOM * 100)}% of the ${limitMs} ms limit`;
        report.problems.push(`${s.runtime}: ${why}`);
      }
      const done = report.expected.every((rt) => rt in report.runtimes);
      if (done) {
        report.pending = false;
        report.ok = report.problems.length === 0;
        report.checkedAt = new Date().toISOString();
        if (!q.publishedVersionId) await tx.update(questions).set({ status: report.ok ? 'draft' : 'invalid' }).where(eq(questions.id, q.id));
        if (report.ok && report.publishIfValid) publish = { questionId: q.id, actorId: s.userId };
      }
      await tx.update(questionVersions).set({ validation: report }).where(eq(questionVersions.id, v.id));
    });
    if (publish) await this.publishSystem((publish as { questionId: string }).questionId, (publish as { actorId: string }).actorId);
  }

  private async doPublish(tx: Tx, questionId: string): Promise<{ versionId: string; tenantId: string | null }> {
    const [q] = await tx.select().from(questions).where(eq(questions.id, questionId)).for('update');
    if (!q) throw notFound('Question');
    const [v] = await tx.select().from(questionVersions).where(eq(questionVersions.id, q.latestVersionId!));
    if (v!.publishedAt) throw badRequest('This version is already published.');
    if (!v!.validation?.ok || v!.validation.pending) throw badRequest('The latest version must pass validation before it can be published.');
    await tx.update(questionVersions).set({ publishedAt: new Date() }).where(eq(questionVersions.id, v!.id));
    await tx.update(questions).set({ publishedVersionId: v!.id, status: 'published' }).where(eq(questions.id, questionId));
    return { versionId: v!.id, tenantId: q.tenantId };
  }

  async publish(u: AuthUser, id: string, meta: RequestMeta) {
    return this.db.run(dbCtx(u), async (tx) => {
      const [q] = await tx.select({ tenantId: questions.tenantId }).from(questions).where(eq(questions.id, id));
      if (!q) throw notFound('Question');
      if (q.tenantId === null && u.role !== 'super_admin') throw forbidden();
      const r = await this.doPublish(tx, id);
      await this.audit.record(tx, { tenantId: r.tenantId, actorId: u.id, action: 'question.publish', entityType: 'question', entityId: id, data: { versionId: r.versionId } }, meta);
      return { published: true };
    });
  }

  private async publishSystem(id: string, actorId: string) {
    await this.db.system(async (tx) => {
      const r = await this.doPublish(tx, id);
      await this.audit.record(tx, { tenantId: r.tenantId, actorId, action: 'question.publish', entityType: 'question', entityId: id, data: { versionId: r.versionId, auto: true } });
    });
  }

  /** Used by the dispatcher (system context) to resolve versions for a set of ids. */
  async versionsByIds(tx: Tx, ids: string[]) {
    return ids.length ? tx.select().from(questionVersions).where(inArray(questionVersions.id, ids)) : [];
  }
}
