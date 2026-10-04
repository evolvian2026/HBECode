import { Worker } from 'node:worker_threads';
import { Injectable, Logger } from '@nestjs/common';
import { plagiarismPairs, plagiarismRuns, type Tx } from '@hbe/db';
import { and, eq, lt, or, sql, type SQL } from 'drizzle-orm';
import { AuditService } from '../common/audit.service.js';
import { dbCtx, type AuthUser, type RequestMeta } from '../common/decorators.js';
import { conflict, notFound } from '../common/errors.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { DbService } from '../infra/infra.module.js';
import type { Group, WorkerInput } from './plagiarism.worker.js';
import { sourceOf, type PairResult } from './winnow.js';

/** Defaults: flag pairs sharing ≥ 75% of the smaller submission's fingerprints. */
const DEFAULTS = { threshold: 0.75, minFingerprints: 10, k: 5, w: 4 };
const LEASE_MS = 5 * 60_000;

async function rows<T>(tx: Tx, q: SQL): Promise<T[]> {
  return ((await tx.execute(q)) as unknown as { rows: T[] }).rows;
}

function runWorker(input: WorkerInput): Promise<{ questionId: string; pairs: PairResult[] }[]> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./plagiarism.worker.js', import.meta.url), { workerData: input, resourceLimits: { maxOldGenerationSizeMb: 384 } });
    const timer = setTimeout(() => {
      void w.terminate();
      reject(new Error('comparison took longer than 5 minutes'));
    }, 5 * 60_000);
    w.once('message', (m: { ok: boolean; out?: { questionId: string; pairs: PairResult[] }[]; error?: string }) => {
      clearTimeout(timer);
      void w.terminate();
      if (m.ok) resolve(m.out!);
      else reject(new Error(m.error));
    });
    w.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

export type PlagiarismScope = 'test' | 'institution';

/**
 * Plagiarism check for one test: per question and language, each student's best graded submit is
 * compared with every other student's (winnowing over normalised tokens, starter code removed).
 * Scope `institution` also compares them with answers to the same questions in the institution's
 * other tests (e.g. section A passing answers to section B, who sit the test a day later).
 * Coding and web questions only: SQL answers are short and legitimately alike.
 * Results are evidence for a human to review, never an automatic penalty.
 */
@Injectable()
export class PlagiarismService {
  private readonly log = new Logger('Plagiarism');

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly limits: RateLimitService,
  ) {}

  async start(u: AuthUser, testId: string, meta: RequestMeta, scope: PlagiarismScope = 'test') {
    await this.limits.enforce(`plagiarism:${u.id}`, 10, 600);
    const run = await this.db.run(dbCtx(u), async (tx) => {
      const [t] = await rows<{ id: string; tenant_id: string }>(tx, sql`SELECT id, tenant_id FROM hbe.tests WHERE id = ${testId}`);
      if (!t) throw notFound('Test');
      const [busy] = await tx.select({ id: plagiarismRuns.id }).from(plagiarismRuns).where(and(eq(plagiarismRuns.testId, testId), or(eq(plagiarismRuns.status, 'queued'), eq(plagiarismRuns.status, 'running'))));
      if (busy) throw conflict('A check is already running for this test.');
      const [r] = await tx.insert(plagiarismRuns).values({ testId, params: { threshold: DEFAULTS.threshold, k: DEFAULTS.k, w: DEFAULTS.w, scope }, createdBy: u.id }).returning();
      await this.audit.record(tx, { tenantId: t.tenant_id, actorId: u.id, action: 'plagiarism.run', entityType: 'test', entityId: testId, data: { runId: r!.id, scope } }, meta);
      return r!;
    });
    setImmediate(() => void this.process(run.id).catch((e) => this.log.error(`plagiarism ${run.id}: ${(e as Error).message}`)));
    return { runId: run.id, status: run.status };
  }

  async process(runId: string): Promise<void> {
    const [run] = await this.db.system((tx) =>
      tx
        .update(plagiarismRuns)
        .set({ status: 'running', leaseUntil: new Date(Date.now() + LEASE_MS) })
        .where(and(eq(plagiarismRuns.id, runId), or(eq(plagiarismRuns.status, 'queued'), and(eq(plagiarismRuns.status, 'running'), lt(plagiarismRuns.leaseUntil, new Date())))))
        .returning(),
    );
    if (!run) return;
    try {
      const groups = await this.db.system(async (tx) => {
        const wide = run.params.scope === 'institution';
        // Best graded submit per attempt and question (highest score, then latest): this test's
        // attempts, plus (institution scope) every attempt of the tenant on the same questions.
        const where = wide
          ? sql`a.tenant_id = ${run.tenantId} AND s.question_id IN (SELECT question_id FROM hbe.test_questions WHERE test_id = ${run.testId})`
          : sql`a.test_id = ${run.testId}`;
        const subs = await rows<{ id: string; question_id: string; runtime: string; code: string; type: string; version_id: string; user_id: string; test_id: string }>(
          tx,
          sql`SELECT DISTINCT ON (s.attempt_id, s.question_id) s.id, s.question_id, s.runtime, s.code, q.type, s.version_id, s.user_id, a.test_id
              FROM hbe.submissions s JOIN hbe.attempts a ON a.id = s.attempt_id JOIN hbe.questions q ON q.id = s.question_id
              WHERE ${where} AND s.kind = 'submit' AND s.status = 'done' AND q.type IN ('coding', 'web')
              ORDER BY s.attempt_id, s.question_id, s.score DESC NULLS LAST, s.created_at DESC`,
        );
        const versions = [...new Set(subs.map((x) => x.version_id))];
        const stubs = versions.length
          ? await rows<{ version_id: string; runtime: string; stub: string }>(
              tx,
              sql`SELECT version_id, runtime, stub FROM hbe.language_stubs WHERE version_id IN (${sql.join(versions.map((v) => sql`${v}`), sql`, `)})`,
            )
          : [];
        const byKey = new Map<string, Group>();
        for (const s of subs) {
          const key = `${s.question_id}|${s.runtime}`;
          let g = byKey.get(key);
          if (!g) {
            g = { questionId: s.question_id, type: s.type, lang: s.runtime, starter: stubs.find((x) => x.version_id === s.version_id && x.runtime === s.runtime)?.stub ?? '', docs: [] };
            byKey.set(key, g);
          }
          g.docs.push({ id: s.id, code: s.code, owner: s.user_id, focus: s.test_id === run.testId });
        }
        const mine = subs.filter((x) => x.test_id === run.testId).length;
        return { groups: [...byKey.values()].filter((g) => g.docs.length > 1 && g.docs.some((d) => d.focus)), submissions: mine, compared: subs.length - mine };
      });
      const results = await runWorker({ groups: groups.groups, ...DEFAULTS });
      const pairs = results.flatMap((r) => r.pairs.map((p) => ({ ...p, questionId: r.questionId })));
      await this.db.system(async (tx) => {
        if (pairs.length) {
          const owners = new Map(
            (await rows<{ id: string; user_id: string }>(tx, sql`SELECT id, user_id FROM hbe.submissions WHERE id IN (${sql.join(pairs.flatMap((p) => [sql`${p.a}`, sql`${p.b}`]), sql`, `)})`)).map((r) => [r.id, r.user_id]),
          );
          for (let i = 0; i < pairs.length; i += 200) {
            await tx.insert(plagiarismPairs).values(
              pairs.slice(i, i + 200).map((p) => ({
                runId, questionId: p.questionId, subA: p.a, subB: p.b, userA: owners.get(p.a)!, userB: owners.get(p.b)!, similarity: String(p.similarity), matched: p.matched, regions: p.regions,
              })),
            );
          }
        }
        await tx
          .update(plagiarismRuns)
          .set({ status: 'done', leaseUntil: null, finishedAt: new Date(), counts: { submissions: groups.submissions, otherTests: groups.compared, groups: groups.groups.length, flagged: pairs.length } })
          .where(eq(plagiarismRuns.id, runId));
      });
    } catch (e) {
      await this.db.system((tx) => tx.update(plagiarismRuns).set({ status: 'failed', error: (e as Error).message.slice(0, 500), leaseUntil: null, finishedAt: new Date() }).where(eq(plagiarismRuns.id, runId)));
    }
  }

  /** Latest run for a test and its flagged pairs (staff of the institution). */
  async latest(u: AuthUser, testId: string) {
    return this.db.run(dbCtx(u), async (tx) => {
      const [t] = await rows<{ id: string }>(tx, sql`SELECT id FROM hbe.tests WHERE id = ${testId}`);
      if (!t) throw notFound('Test');
      const [run] = await tx.select().from(plagiarismRuns).where(eq(plagiarismRuns.testId, testId)).orderBy(sql`${plagiarismRuns.createdAt} DESC`).limit(1);
      if (!run) return { run: null, pairs: [] };
      const pairs = await rows<{ question_id: string; title: string; sub_a: string; sub_b: string; name_a: string; name_b: string; email_a: string; email_b: string; similarity: string; matched: number; test_a: string; test_b: string; test_a_title: string; test_b_title: string }>(
        tx,
        sql`SELECT p.question_id, v.title, p.sub_a, p.sub_b, ua.name AS name_a, ub.name AS name_b, ua.email AS email_a, ub.email AS email_b, p.similarity, p.matched,
                   ta.id AS test_a, ta.title AS test_a_title, tb.id AS test_b, tb.title AS test_b_title
            FROM hbe.plagiarism_pairs p
            JOIN hbe.users ua ON ua.id = p.user_a JOIN hbe.users ub ON ub.id = p.user_b
            JOIN hbe.submissions sa ON sa.id = p.sub_a JOIN hbe.attempts aa ON aa.id = sa.attempt_id JOIN hbe.tests ta ON ta.id = aa.test_id
            JOIN hbe.submissions sb ON sb.id = p.sub_b JOIN hbe.attempts ab ON ab.id = sb.attempt_id JOIN hbe.tests tb ON tb.id = ab.test_id
            JOIN hbe.questions q ON q.id = p.question_id JOIN hbe.question_versions v ON v.id = coalesce(q.published_version_id, q.latest_version_id)
            WHERE p.run_id = ${run.id} ORDER BY p.similarity DESC, v.title LIMIT 500`,
      );
      return {
        run: { id: run.id, status: run.status, createdAt: run.createdAt, finishedAt: run.finishedAt, counts: run.counts, params: run.params, error: run.error },
        pairs: pairs.map((p) => ({ questionId: p.question_id, question: p.title, subA: p.sub_a, subB: p.sub_b, a: { name: p.name_a, email: p.email_a, test: { id: p.test_a, title: p.test_a_title } }, b: { name: p.name_b, email: p.email_b, test: { id: p.test_b, title: p.test_b_title } }, similarity: Math.round(Number(p.similarity) * 100), matched: p.matched })),
      };
    });
  }

  /** Both submissions side by side with the matched line ranges. */
  async pair(u: AuthUser, runId: string, questionId: string, subA: string, subB: string) {
    return this.db.run(dbCtx(u), async (tx) => {
      const [p] = await tx
        .select()
        .from(plagiarismPairs)
        .where(and(eq(plagiarismPairs.runId, runId), eq(plagiarismPairs.questionId, questionId), eq(plagiarismPairs.subA, subA), eq(plagiarismPairs.subB, subB)));
      if (!p) throw notFound('Pair');
      const subs = await rows<{ id: string; code: string; runtime: string; type: string; name: string; email: string; created_at: Date; test_id: string; test_title: string }>(
        tx,
        sql`SELECT s.id, s.code, s.runtime, q.type, u.name, u.email, s.created_at, t.id AS test_id, t.title AS test_title
            FROM hbe.submissions s JOIN hbe.users u ON u.id = s.user_id JOIN hbe.questions q ON q.id = s.question_id
            JOIN hbe.attempts a ON a.id = s.attempt_id JOIN hbe.tests t ON t.id = a.test_id
            WHERE s.id IN (${subA}, ${subB})`,
      );
      const side = (id: string, regions: [number, number][]) => {
        const s = subs.find((x) => x.id === id)!;
        return { submissionId: id, name: s.name, email: s.email, runtime: s.runtime, submittedAt: s.created_at, test: { id: s.test_id, title: s.test_title }, source: sourceOf(s.code, s.type), regions };
      };
      return { similarity: Math.round(Number(p.similarity) * 100), matched: p.matched, a: side(subA, p.regions.a), b: side(subB, p.regions.b) };
    });
  }
}
