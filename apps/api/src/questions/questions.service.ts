import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { languageSecrets, languageStubs, questions, questionVersions, submissions, testCases, type Tx, type ValidationReport } from '@hbe/db';
import {
  compareResults,
  DIALECT_INFO,
  hasPermission,
  questionProblems,
  RUNTIMES,
  type DbDialect,
  type ExecResult,
  type Page,
  type QuestionInput,
  type ResultSet,
  type RuntimeId,
  type WebFile,
} from '@hbe/shared';
import { and, arrayContains, asc, desc, eq, ilike, inArray, isNotNull, lt, or } from 'drizzle-orm';
import { AuditService } from '../common/audit.service.js';
import { sha256 } from '../common/crypto.js';
import { dbCtx, type AuthUser, type RequestMeta } from '../common/decorators.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { pagination } from '../common/mailer.js';
import { DispatchService } from '../executor/dispatch.service.js';
import { DbService } from '../infra/infra.module.js';
import { dbSpec, expectedOf, fromStorage, limitFor, questionType, toStorage, validationTargets, webCheckOf, webSpec } from './question-types.js';

/** Validator rule: the slowest reference run must leave at least 30% of the time limit unused. */
const HEADROOM = 0.7;

export interface QuestionSummary {
  id: string;
  type: 'coding' | 'web' | 'db';
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
  type: 'coding';
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

export interface StudentWebQuestion {
  type: 'web';
  id: string;
  title: string;
  statement: string;
  difficulty: string;
  tags: string[];
  framework: 'html' | 'react';
  starterFiles: WebFile[];
  /** Sample check titles (what is checked); hidden checks are only counted. */
  samples: { title: string }[];
  hiddenCount: number;
  preview: boolean;
}

export interface StudentDbQuestion {
  type: 'db';
  id: string;
  title: string;
  statement: string;
  difficulty: string;
  tags: string[];
  mode: 'query' | 'dml';
  schemaDisplay: string;
  timeLimitMs: number;
  dialects: { id: DbDialect; label: string; version: string; monaco: string; starter: string }[];
  /** Sample datasets: explanation and the expected result per dialect. */
  samples: { explanation: string; expected: Partial<Record<DbDialect, ResultSet>> }[];
  hiddenCount: number;
  preview: boolean;
}

function slugify(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'question';
  return `${base}-${randomUUID().slice(0, 6)}`;
}

const contentHash = (q: QuestionInput) => sha256(`${q.title.trim().toLowerCase()}\n${q.statement.replace(/\s+/g, ' ').trim().toLowerCase()}`);
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

  private async writeContent(tx: Tx, versionId: string, q: QuestionInput) {
    const { tests, templates } = toStorage(q);
    if (tests.length) await tx.insert(testCases).values(tests.map((t) => ({ ...t, versionId })));
    if (templates.length) {
      await tx.insert(languageStubs).values(templates.map((t) => ({ versionId, runtime: t.runtime, stub: t.stub })));
      await tx.insert(languageSecrets).values(templates.map((t) => ({ versionId, runtime: t.runtime, driver: t.driver, solution: t.solution })));
    }
  }

  private versionFields(q: QuestionInput) {
    return toStorage(q).version;
  }

  // ------------------------------------------------------------------ authoring
  async create(u: AuthUser, q: QuestionInput, meta: RequestMeta): Promise<{ id: string }> {
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
      await tx.insert(questions).values({ id: questionId, tenantId, type: q.type, slug: slugify(q.title), isPractice: q.isPractice, latestVersionId: versionId, contentHash: hash, createdBy: u.id });
      await tx.insert(questionVersions).values({ id: versionId, questionId, versionNo: 1, createdBy: u.id, ...this.versionFields(q) });
      await this.writeContent(tx, versionId, q);
      await this.audit.record(tx, { tenantId, actorId: u.id, action: 'question.create', entityType: 'question', entityId: questionId, data: { title: q.title, type: q.type } }, meta);
      return { id: questionId };
    });
  }

  async update(u: AuthUser, id: string, q: QuestionInput, meta: RequestMeta): Promise<{ id: string; versionNo: number }> {
    return this.db.run(dbCtx(u), async (tx) => {
      const [row] = await tx.select().from(questions).where(eq(questions.id, id)).for('update');
      if (!row) throw notFound('Question');
      if (row.tenantId === null && u.role !== 'super_admin') throw forbidden('Global questions can only be edited by super admins.');
      if (row.type !== q.type) throw badRequest(`This is a ${row.type} question; its type cannot change.`);
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
        id: q.id, type: q.type, title: v.title, difficulty: v.difficulty, tags: v.tags, status: q.status, isPractice: q.isPractice,
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
      const input = fromStorage(v!, row.isPractice, tests, stubs, secrets, canWrite);
      return {
        id: row.id,
        status: row.status,
        global: row.tenantId === null,
        canEdit: canWrite && (row.tenantId !== null || u.role === 'super_admin'),
        versionNo: v!.versionNo,
        publishedVersionId: row.publishedVersionId,
        latestIsPublished: v!.publishedAt !== null,
        validation: v!.validation,
        problems: canWrite ? questionProblems(input) : [],
        type: input.type,
        question: input,
      };
    });
  }

  /** Learner view: never includes hidden tests/checks/datasets, drivers, references or hints. */
  async studentView(u: AuthUser, id: string): Promise<StudentQuestion | StudentWebQuestion | StudentDbQuestion> {
    const staff = hasPermission(u.role, 'question:read_full');
    return this.db.run(dbCtx(u), async (tx) => {
      const [row] = await tx.select().from(questions).where(eq(questions.id, id));
      if (!row) throw notFound('Question');
      const versionId = row.publishedVersionId ?? (staff ? row.latestVersionId : null);
      if (!versionId) throw notFound('Question');
      const [v] = await tx.select().from(questionVersions).where(eq(questionVersions.id, versionId));
      if (!v) throw notFound('Question');
      // Students can read sample rows only (RLS); staff previews also return hidden rows, so filter.
      const samples = (await tx.select().from(testCases).where(and(eq(testCases.versionId, versionId), eq(testCases.visibility, 'sample'))).orderBy(asc(testCases.ordinal)));
      const hiddenCount = staff
        ? (await tx.select({ id: testCases.id }).from(testCases).where(and(eq(testCases.versionId, versionId), eq(testCases.visibility, 'hidden')))).length
        : 0;
      const stubs = await tx.select().from(languageStubs).where(eq(languageStubs.versionId, versionId));
      const preview = row.publishedVersionId !== versionId;
      const type = questionType(v);
      if (type === 'web') {
        const fw = webSpec(v).framework;
        const stub = stubs.find((x) => x.runtime === fw);
        return {
          type: 'web', id: row.id, title: v.title, statement: v.statement, difficulty: v.difficulty, tags: v.tags, framework: fw,
          starterFiles: JSON.parse(stub?.stub ?? '[]') as WebFile[], samples: samples.map((t) => ({ title: webCheckOf(t).title })), hiddenCount, preview,
        };
      }
      if (type === 'db') {
        const spec = dbSpec(v);
        return {
          type: 'db', id: row.id, title: v.title, statement: v.statement, difficulty: v.difficulty, tags: v.tags, mode: spec.mode,
          schemaDisplay: spec.schemaDisplay, timeLimitMs: v.baseTimeLimitMs,
          dialects: spec.dialects.map((d) => ({ id: d, label: DIALECT_INFO[d].label, version: DIALECT_INFO[d].version, monaco: DIALECT_INFO[d].monaco, starter: stubs.find((x) => x.runtime === d)?.stub ?? '' })),
          samples: samples.map((t) => ({ explanation: t.explanation, expected: expectedOf(t) })),
          hiddenCount, preview,
        };
      }
      return {
        type: 'coding', id: row.id, title: v.title, statement: v.statement, constraints: v.constraints, inputFormat: v.inputFormat,
        outputFormat: v.outputFormat, difficulty: v.difficulty, tags: v.tags, memoryLimitMb: v.memoryLimitMb,
        samples: samples.map((t) => ({ input: t.input, output: t.expected, explanation: t.explanation })),
        runtimes: stubs
          .filter((s) => s.runtime in RUNTIMES)
          .map((s) => {
            const r = RUNTIMES[s.runtime as RuntimeId];
            return { id: r.id, label: r.label, version: r.version, monaco: r.monaco, timeLimitMs: Math.round(v.baseTimeLimitMs * r.timeMultiplier), stub: s.stub };
          })
          .sort((a, b) => Object.keys(RUNTIMES).indexOf(a.id) - Object.keys(RUNTIMES).indexOf(b.id)),
        preview,
      };
    });
  }

  async practiceList(u: AuthUser, f: { q?: string; difficulty?: string; tag?: string; cursor?: string; limit: number }) {
    const cur = pagination.decode(f.cursor);
    return this.db.run(dbCtx(u), async (tx) => {
      const rows = await tx
        .select({ id: questions.id, type: questions.type, updatedAt: questions.updatedAt, title: questionVersions.title, difficulty: questionVersions.difficulty, tags: questionVersions.tags, global: questions.tenantId })
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
        items: rows.slice(0, f.limit).map((r) => ({ id: r.id, type: r.type, title: r.title, difficulty: r.difficulty, tags: r.tags, global: r.global === null })),
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
    const problems = questionProblems(detail.question);
    const runId = randomUUID();
    const targets = validationTargets(detail.question);
    const report: ValidationReport = {
      runId, ok: false, pending: problems.length === 0, publishIfValid, requestedAt: new Date().toISOString(), checkedAt: problems.length ? new Date().toISOString() : null,
      expected: targets.map((t) => t.key), problems, runtimes: {},
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
          for (const t of targets) {
            const [s] = await stx
              .insert(submissions)
              .values({
                tenantId: target.tenantId, userId: u.id, questionId: id, versionId: target.versionId, runtime: t.runtime, kind: 'validate', priority: 'validate',
                code: t.code, validationRun: runId, validationRole: t.role,
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
      const all = await tx.select().from(testCases).where(eq(testCases.versionId, v.id)).orderBy(asc(testCases.ordinal));
      const tests = [...all.filter((t) => t.visibility === 'sample'), ...all.filter((t) => t.visibility === 'hidden')];
      // Results are matched to tests by id, never by position.
      const byTest = new Map(result.tests.map((r) => [r.id, r]));
      const type = questionType(v);
      const key = s.validationRole === 'starter' ? `${s.runtime}:starter` : s.runtime;
      const limitMs = limitFor(v, s.runtime);
      const verdicts = result.tests.map((t) => t.verdict);
      // Coding: CPU time measured in the jail. Web/DB: the browser and the DB servers are not
      // CPU-accounted per test, so their wall time is held to the same headroom rule.
      const maxCpuMs = Math.max(0, ...result.tests.map((t) => (type === 'coding' ? t.cpuMs : Math.max(t.cpuMs, t.wallMs ?? 0))));
      const ranAll = result.compile.ok && !result.internalError && verdicts.length === tests.length;
      let ok: boolean;
      let why = '';
      if (s.validationRole === 'starter') {
        // The starter files must not already solve the question.
        const hiddenIds = new Set(tests.filter((t) => t.visibility === 'hidden').map((t) => t.id));
        ok = !ranAll || result.tests.some((t) => hiddenIds.has(t.id) && t.verdict !== 'AC');
        if (!ok) why = 'the starter files already pass every hidden check';
      } else if (type === 'coding') {
        ok = ranAll && verdicts.every((x) => x === 'AC') && maxCpuMs <= limitMs * HEADROOM;
        if (!ok) why = !result.compile.ok ? 'reference solution does not compile' : verdicts.some((x) => x !== 'AC') ? `reference solution fails: ${verdicts.join(' ')}` : `slowest test ${maxCpuMs} ms exceeds ${Math.round(HEADROOM * 100)}% of the ${limitMs} ms limit`;
      } else {
        ok = ranAll && verdicts.every((x) => x === 'AC') && maxCpuMs <= limitMs * HEADROOM;
        if (!ok && ranAll && verdicts.every((x) => x === 'AC')) why = `slowest ${type === 'web' ? 'check' : 'dataset'} took ${maxCpuMs} ms, over ${Math.round(HEADROOM * 100)}% of the ${limitMs} ms limit`;
        else if (!ok) {
          const badTest = tests.find((t) => byTest.get(t.id)?.verdict !== 'AC');
          const r = badTest ? byTest.get(badTest.id) : undefined;
          const label = badTest ? `${badTest.visibility} ${badTest.ordinal}` : '';
          why = result.internalError ? `executor error: ${result.internalError}` : !result.compile.ok ? `reference does not build: ${result.compile.output.slice(0, 300)}` : badTest ? `reference fails ${type === 'web' ? 'check' : 'dataset'} ${label} (${r?.verdict ?? 'not run'}${r?.detail ? `: ${r.detail}` : ''})` : 'reference did not run on every test';
        }
        if (ok && type === 'db') {
          // The reference output is the expected result for this dialect.
          const dialect = s.runtime as DbDialect;
          for (const t of tests) {
            const exp = { ...expectedOf(t), [dialect]: byTest.get(t.id)!.result };
            await tx.update(testCases).set({ expected: JSON.stringify(exp) }).where(eq(testCases.id, t.id));
            t.expected = JSON.stringify(exp);
          }
        }
      }
      report.runtimes[key] = { ok, maxCpuMs, limitMs, verdicts, compileOutput: result.compile.ok ? undefined : (result.compile.output.slice(0, 2000) || result.internalError) };
      if (!ok) report.problems.push(`${key}: ${why}`);

      const done = report.expected.every((k) => k in report.runtimes);
      if (done && type === 'db' && report.problems.length === 0) report.problems.push(...this.dbConsistency(v, tests));
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

  /**
   * DB-specific checks once every dialect has run: dialects must agree with each other, and
   * hard-coding the sample answers must not pass the hidden datasets.
   */
  private dbConsistency(v: typeof questionVersions.$inferSelect, tests: (typeof testCases.$inferSelect)[]): string[] {
    const spec = dbSpec(v);
    const problems: string[] = [];
    const [first, ...others] = spec.dialects;
    for (const t of tests) {
      const exp = expectedOf(t);
      for (const d of others) {
        if (exp[first!] && exp[d] && !compareResults(exp[d]!, exp[first!]!, { ...spec.compare, columnNames: 'ignore' }).ok) {
          problems.push(`${t.visibility} dataset ${t.ordinal}: ${DIALECT_INFO[first!].label} and ${DIALECT_INFO[d].label} references give different results`);
        }
      }
    }
    const results = (vis: 'sample' | 'hidden') => tests.filter((t) => t.visibility === vis).map((t) => expectedOf(t)[first!]).filter((x): x is ResultSet => Boolean(x));
    const sampleRs = results('sample');
    const hiddenRs = results('hidden');
    const distinct = hiddenRs.filter((h) => !sampleRs.some((s0) => compareResults(h, s0, spec.compare).ok)).length;
    if (hiddenRs.length && distinct < Math.ceil(hiddenRs.length / 2)) {
      problems.push(`only ${distinct} of ${hiddenRs.length} hidden datasets produce a result different from the samples; hard-coded sample answers would pass too often`);
    }
    return problems;
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
