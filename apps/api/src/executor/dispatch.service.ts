import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { languageSecrets, questionVersions, submissionResults, submissions, testCases, users } from '@hbe/db';
import { CheckSpec, DbCompare, setupFor, stateQueryFor, WebFiles, type Capability, type DbDialect, type ExecJob, type ExecResult, type RuntimeId, type Verdict } from '@hbe/shared';
import { dbSpec, expectedOf, limitFor, questionType, webCheckOf, webSpec } from '../questions/question-types.js';
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { CONFIG, type AppConfig } from '../config.js';
import { DbService, REDIS_RAW } from '../infra/infra.module.js';

export type Priority = 'run' | 'submit' | 'practice' | 'validate';
/** Claim order: interactive runs first, then submissions, guests, and background validation. */
const PRIORITY_ORDER: Priority[] = ['run', 'submit', 'practice', 'validate'];
const LEASE_MS = 120_000;
const MAX_DISPATCH = 3;
const CLAIM_WAIT_SEC = 20;
const OUTPUT_LIMIT = 1024 * 1024;

/**
 * Postgres is the source of truth for submissions; Redis lists only carry ids. A claim
 * atomically moves a submission from `queued` to `running` with a lease, so duplicate ids in a
 * list are harmless, and the sweeper re-queues anything whose lease expired or that fell out of
 * Redis (e.g. after a restart of the non-persistent free-tier Key Value store).
 */
@Injectable()
export class DispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Dispatch');
  private readonly blocking: Redis[] = [];
  private readonly idle: Redis[] = [];
  private sweeper?: NodeJS.Timeout;
  private subscriber?: Redis;
  private readonly listeners = new Map<string, Set<(msg: string) => void>>();
  /** Registered by QuestionsService (kept as a hook to avoid an import cycle). */
  private validationHandler?: (submissionId: string, result: ExecResult) => Promise<void>;
  /** Registered by AttemptsService: re-score an attempt when one of its submissions finishes. */
  private attemptHandler?: (attemptId: string) => Promise<void>;

  constructor(
    private readonly db: DbService,
    @Inject(REDIS_RAW) private readonly redis: Redis,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  onValidationResult(handler: (submissionId: string, result: ExecResult) => Promise<void>) {
    this.validationHandler = handler;
  }

  onAttemptSubmissionDone(handler: (attemptId: string) => Promise<void>) {
    this.attemptHandler = handler;
  }

  private key(p: Priority) {
    return `${this.cfg.REDIS_PREFIX}exec:${p}`;
  }
  private channel(id: string) {
    return `${this.cfg.REDIS_PREFIX}sub:${id}`;
  }

  async onModuleInit() {
    this.subscriber = this.redis.duplicate();
    this.subscriber.on('message', (ch: string, msg: string) => {
      const id = ch.slice(this.channel('').length);
      for (const fn of this.listeners.get(id) ?? []) fn(msg);
    });
    if (this.cfg.SWEEPER_INTERVAL_MS > 0) {
      this.sweeper = setInterval(() => void this.sweep().catch((e) => this.log.error(`sweep failed: ${(e as Error).message}`)), this.cfg.SWEEPER_INTERVAL_MS);
      this.sweeper.unref();
    }
  }

  async onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
    await Promise.allSettled([...this.blocking.map((c) => c.quit()), this.subscriber?.quit()]);
  }

  // ------------------------------------------------------------------ queue
  async enqueue(p: Priority, submissionId: string): Promise<void> {
    await this.redis.rpush(this.key(p), submissionId);
    await this.notify(submissionId, 'queued');
  }

  private acquire(): Redis {
    const c = this.idle.pop();
    if (c) return c;
    const n = this.redis.duplicate();
    this.blocking.push(n);
    return n;
  }

  /** Long-poll: wait up to CLAIM_WAIT_SEC for a submission and lease it to this executor. */
  async claim(executorId: string, runtimes: Capability[]): Promise<ExecJob | null> {
    const deadline = Date.now() + CLAIM_WAIT_SEC * 1000;
    const conn = this.acquire();
    try {
      while (Date.now() < deadline) {
        const wait = Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
        const res = (await conn.call('BLMPOP', String(wait), String(PRIORITY_ORDER.length), ...PRIORITY_ORDER.map((p) => this.key(p)), 'LEFT')) as [string, string[]] | null;
        if (!res) return null;
        const [list, ids] = res;
        const id = ids[0]!;
        const job = await this.lease(id, executorId, runtimes);
        if (job === 'unsupported') {
          await this.redis.lpush(list, id); // another executor may support it
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        if (job) return job;
      }
      return null;
    } finally {
      this.idle.push(conn);
    }
  }

  private async lease(id: string, executorId: string, capabilities: Capability[]): Promise<ExecJob | null | 'unsupported'> {
    const job = await this.db.system(async (tx) => {
      const [s] = await tx.select().from(submissions).where(eq(submissions.id, id)).for('update', { skipLocked: true });
      if (!s || s.status !== 'queued') return null; // duplicate id or already handled
      const [v] = await tx.select().from(questionVersions).where(eq(questionVersions.id, s.versionId));
      const [secret] = await tx.select().from(languageSecrets).where(and(eq(languageSecrets.versionId, s.versionId), eq(languageSecrets.runtime, s.runtime)));
      const fail = async () => {
        await tx.update(submissions).set({ status: 'failed', verdict: 'IE', finishedAt: new Date() }).where(eq(submissions.id, id));
        return null;
      };
      if (!v || !secret) return fail();
      const type = questionType(v);
      const capability = (type === 'web' ? `web:${s.runtime}` : type === 'db' ? `db:${s.runtime}` : s.runtime) as Capability;
      if (!capabilities.includes(capability)) return 'unsupported' as const;

      const all = await tx.select().from(testCases).where(eq(testCases.versionId, s.versionId)).orderBy(asc(testCases.visibility), asc(testCases.ordinal));
      const samples = all.filter((t) => t.visibility === 'sample');
      const hidden = all.filter((t) => t.visibility === 'hidden');
      // Samples first, then hidden tests ('hidden' sorts before 'sample', so order explicitly).
      const chosen = s.kind === 'run' ? samples : [...samples, ...hidden];
      let out: ExecJob;
      if (type === 'web') {
        const files = WebFiles.safeParse(safeJson(s.code));
        if (!files.success) return fail();
        out = {
          type: 'web', jobId: s.id, kind: s.kind, framework: webSpec(v).framework, files: files.data, checkTimeoutMs: v.baseTimeLimitMs,
          checks: chosen.map((t, i) => {
            const c = webCheckOf(t);
            return { id: t.id, ordinal: i + 1, hidden: t.visibility === 'hidden', title: c.title, viewport: c.viewport ?? undefined, spec: CheckSpec.parse(c.check) };
          }),
        };
      } else if (type === 'db') {
        const spec = dbSpec(v);
        const dialect = s.runtime as DbDialect;
        const stateQuery = spec.mode === 'dml' ? stateQueryFor({ stateQuery: spec.stateQuery ?? undefined }, dialect) : undefined;
        out = {
          type: 'db', jobId: s.id, kind: s.kind, dialect, mode: spec.mode, code: s.code, timeLimitMs: v.baseTimeLimitMs, compare: DbCompare.parse(spec.compare ?? {}),
          datasets: chosen.map((t, i) => {
            const setup = setupFor((t.spec as { setup: Parameters<typeof setupFor>[0] }).setup, dialect) ?? '';
            // Validation runs have no expected result: the reference output becomes it.
            const expected = s.kind === 'validate' ? undefined : expectedOf(t)[dialect];
            return { id: t.id, ordinal: i + 1, hidden: t.visibility === 'hidden', setup, stateQuery, expected };
          }),
        };
        if (s.kind !== 'validate' && out.datasets.some((d) => !d.expected)) return fail(); // never validated for this dialect
      } else {
        let tests: Extract<ExecJob, { type: 'coding' }>['tests'];
        if (s.kind === 'run' && s.customInput !== null) tests = [{ id: 'custom', ordinal: 1, hidden: false, input: s.customInput }];
        else tests = chosen.map((t, i) => ({ id: t.id, ordinal: i + 1, hidden: t.visibility === 'hidden', input: t.input, expected: t.expected }));
        out = {
          type: 'coding', jobId: s.id, kind: s.kind, runtime: s.runtime as RuntimeId, studentCode: s.code, driverCode: secret.driver, tests,
          limits: { cpuMs: limitFor(v, s.runtime), memMb: v.memoryLimitMb, outputBytes: OUTPUT_LIMIT }, compare: v.compare, stopOnFirstFailure: false,
        };
      }
      const total = out.type === 'web' ? out.checks.length : out.type === 'db' ? out.datasets.length : out.tests.length;
      await tx
        .update(submissions)
        .set({ status: 'running', executorId, leaseUntil: new Date(Date.now() + LEASE_MS), startedAt: new Date(), dispatchCount: sql`${submissions.dispatchCount} + 1`, total })
        .where(eq(submissions.id, id));
      return out;
    });
    if (job && job !== 'unsupported') await this.notify(id, 'running');
    return job;
  }

  // ------------------------------------------------------------------ results
  async complete(executorId: string, result: ExecResult): Promise<'ok' | 'stale'> {
    const outcome = await this.db.system(async (tx) => {
      const [s] = await tx.select().from(submissions).where(eq(submissions.id, result.jobId)).for('update');
      if (!s || s.status !== 'running' || s.executorId !== executorId) return null;
      const tests = s.kind === 'run' && s.customInput !== null ? [] : await tx.select().from(testCases).where(eq(testCases.versionId, s.versionId));
      const byId = new Map(tests.map((t) => [t.id, t]));
      let verdict: Verdict;
      let passed = 0;
      let score: number | null = null;
      if (result.internalError) verdict = 'IE';
      else if (!result.compile.ok) verdict = 'CE';
      else {
        const failing = result.tests.find((t) => t.verdict !== 'AC');
        verdict = failing?.verdict ?? 'AC';
        passed = result.tests.filter((t) => t.verdict === 'AC').length;
        const hidden = result.tests.filter((t) => byId.get(t.id)?.visibility === 'hidden');
        const totalWeight = hidden.reduce((a, t) => a + (byId.get(t.id)?.weight ?? 1), 0);
        if (s.kind === 'submit' && totalWeight > 0) {
          const got = hidden.filter((t) => t.verdict === 'AC').reduce((a, t) => a + (byId.get(t.id)?.weight ?? 1), 0);
          score = Math.round((got / totalWeight) * 10000) / 100;
        }
      }
      if (result.tests.length) {
        await tx.insert(submissionResults).values(
          result.tests.map((t, i) => {
            const tc = byId.get(t.id);
            const hidden = tc?.visibility === 'hidden';
            return {
              submissionId: s.id, tenantId: s.tenantId, ordinal: i + 1, testCaseId: tc?.id ?? null, hidden, verdict: t.verdict,
              cpuMs: t.cpuMs, wallMs: t.wallMs, memKb: t.memKb,
              // Output, explanations and result tables of hidden tests are never stored.
              stdout: hidden ? null : t.stdout, stderr: hidden ? null : t.stderr,
              detail: hidden ? null : (t.detail ?? null), result: hidden ? null : (t.result ?? null),
            };
          }),
        );
      }
      await tx
        .update(submissions)
        .set({
          status: result.internalError ? 'failed' : 'done', verdict, passed, total: result.tests.length || s.total, score: score === null ? null : String(score),
          compileOutput: result.compile.ok ? null : result.compile.output, maxCpuMs: Math.max(0, ...result.tests.map((t) => t.cpuMs)),
          maxMemKb: Math.max(0, ...result.tests.map((t) => t.memKb)), finishedAt: new Date(), leaseUntil: null,
        })
        .where(eq(submissions.id, s.id));
      return { kind: s.kind, attemptId: s.attemptId };
    });
    if (!outcome) return 'stale';
    await this.notify(result.jobId, 'done');
    if (outcome.kind === 'validate') await this.validationHandler?.(result.jobId, result);
    if (outcome.attemptId) await this.attemptHandler?.(outcome.attemptId).catch((e) => this.log.error(`attempt re-score failed: ${(e as Error).message}`));
    return 'ok';
  }

  // ------------------------------------------------------------------ events
  private async notify(id: string, status: string) {
    await this.redis.publish(this.channel(id), status);
  }

  async subscribe(id: string, fn: (msg: string) => void): Promise<() => Promise<void>> {
    let set = this.listeners.get(id);
    if (!set) {
      set = new Set();
      this.listeners.set(id, set);
      await this.subscriber!.subscribe(this.channel(id));
    }
    set.add(fn);
    return async () => {
      set!.delete(fn);
      if (set!.size === 0) {
        this.listeners.delete(id);
        await this.subscriber!.unsubscribe(this.channel(id));
      }
    };
  }

  // ------------------------------------------------------------------ sweeper
  /** One API replica at a time (Redis lock): requeue expired leases, recover lost ids, purge guests. */
  async sweep(): Promise<{ requeued: number; failed: number }> {
    const lock = await this.redis.set(`${this.cfg.REDIS_PREFIX}sweeper-lock`, '1', 'PX', Math.max(5000, this.cfg.SWEEPER_INTERVAL_MS), 'NX');
    if (lock !== 'OK') return { requeued: 0, failed: 0 };
    const now = new Date();
    const r = await this.db.system(async (tx) => {
      const expired = await tx
        .select({ id: submissions.id, dispatchCount: submissions.dispatchCount, priority: submissions.priority, attemptId: submissions.attemptId })
        .from(submissions)
        .where(and(eq(submissions.status, 'running'), lt(submissions.leaseUntil, now)))
        .limit(200);
      const dead = expired.filter((e) => e.dispatchCount >= MAX_DISPATCH);
      if (dead.length) await tx.update(submissions).set({ status: 'failed', verdict: 'IE', finishedAt: now, leaseUntil: null }).where(inArray(submissions.id, dead.map((d) => d.id)));
      const retry = expired.filter((e) => e.dispatchCount < MAX_DISPATCH);
      // Queued rows that have waited too long (e.g. the id was lost from Redis): push them again.
      const stuck = await tx
        .select({ id: submissions.id, priority: submissions.priority })
        .from(submissions)
        .where(and(eq(submissions.status, 'queued'), lt(sql`coalesce(${submissions.leaseUntil}, ${submissions.createdAt} + interval '60 seconds')`, now)))
        .limit(200);
      const again = [...retry, ...stuck];
      if (again.length) {
        await tx
          .update(submissions)
          .set({ status: 'queued', executorId: null, leaseUntil: new Date(now.getTime() + 60_000) })
          .where(inArray(submissions.id, again.map((a) => a.id)));
      }
      await tx.delete(users).where(and(eq(users.kind, 'guest'), lt(users.createdAt, new Date(now.getTime() - 86_400_000))));
      return { again, dead };
    });
    for (const a of r.again) await this.redis.rpush(this.key(a.priority), a.id);
    for (const d of r.dead) await this.notify(d.id, 'done');
    for (const d of r.dead) if (d.attemptId) await this.attemptHandler?.(d.attemptId).catch(() => undefined);
    if (r.again.length || r.dead.length) this.log.warn(`sweeper requeued ${r.again.length}, failed ${r.dead.length}`);
    return { requeued: r.again.length, failed: r.dead.length };
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
