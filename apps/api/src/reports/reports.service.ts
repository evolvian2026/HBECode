import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type Tx } from '@hbe/db';
import { hasPermission } from '@hbe/shared';
import { sql, type SQL } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { dbCtx, type AuthUser } from '../common/decorators.js';
import { forbidden, notFound } from '../common/errors.js';
import { CONFIG, type AppConfig } from '../config.js';
import { DispatchService } from '../executor/dispatch.service.js';
import { DbService, REDIS_RAW } from '../infra/infra.module.js';

/** "Too easy / too hard": solve rate above / below these, with at least this many students. */
export const FLAGS = {
  minStudents: Number(process.env.REPORT_FLAG_MIN_ATTEMPTS ?? 30),
  easy: Number(process.env.REPORT_FLAG_EASY ?? 0.9),
  hard: Number(process.env.REPORT_FLAG_HARD ?? 0.1),
};
export const flagOf = (students: number, rate: number): 'too_easy' | 'too_hard' | null =>
  students < FLAGS.minStudents ? null : rate > FLAGS.easy ? 'too_easy' : rate < FLAGS.hard ? 'too_hard' : null;

const r1 = (n: number) => Math.round(n * 10) / 10;
/** Raw SQL (tx.execute) returns timestamps as strings; typed queries return Dates. */
const ms = (v: Date | string) => new Date(v).getTime();
const pct = (score: number | null, max: number | null) => (score === null || !max ? null : r1((score / max) * 100));
type Row = Record<string, unknown>;

async function rows<T = Row>(tx: Tx, q: SQL): Promise<T[]> {
  const r = (await tx.execute(q)) as unknown as { rows: T[] };
  return r.rows;
}

function stats(xs: number[]) {
  if (!xs.length) return { count: 0, mean: null, median: null, min: null, max: null, stddev: null };
  const s = [...xs].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
  return { count: s.length, mean: r1(mean), median: r1(median), min: r1(s[0]!), max: r1(s[s.length - 1]!), stddev: r1(sd) };
}

/**
 * Reports. Dashboards read rollups (rpt_*), which are updated when a submission is graded and
 * rebuilt from the raw tables once a day (and on demand), so they self-heal. Test reports read
 * `attempts`, whose score and per-question breakdown are already maintained by the scorer.
 *
 * Scope: super admins see everything; institution staff see their institution; students see
 * their own progress only. RLS enforces the same independently.
 */
@Injectable()
export class ReportsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Reports');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly db: DbService,
    dispatch: DispatchService,
    @Inject(REDIS_RAW) private readonly redis: Redis,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {
    dispatch.onSubmissionGraded((id) => this.onGraded(id));
  }

  onModuleInit() {
    if (this.cfg.SWEEPER_INTERVAL_MS > 0) {
      // Once a day (one replica), rebuild every rollup from the raw tables.
      this.timer = setInterval(() => void this.dailyRebuild().catch((e) => this.log.error(`rollup rebuild failed: ${(e as Error).message}`)), 10 * 60_000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private get tz() {
    return this.cfg.REPORT_TIMEZONE;
  }

  // ------------------------------------------------------------------ rollup maintenance
  /** Incremental update for one graded run/submit (called once per submission by the dispatcher). */
  async onGraded(submissionId: string): Promise<void> {
    const tz = this.tz;
    await this.db.system(async (tx) => {
      const [s] = await rows<{ tenant_id: string | null; user_id: string; question_id: string; runtime: string; kind: string; status: string; verdict: string | null; score: string | null; created_at: Date; d: string }>(
        tx,
        sql`SELECT tenant_id, user_id, question_id, runtime, kind, status, verdict, score, created_at, to_char((created_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS d
            FROM hbe.submissions WHERE id = ${submissionId} AND kind IN ('run', 'submit') AND status IN ('done', 'failed')`,
      );
      if (!s) return;
      const run = s.kind === 'run' ? 1 : 0;
      const graded = s.kind === 'submit' && s.status === 'done';
      const submit = graded ? 1 : 0;
      const ac = graded && s.verdict === 'AC' ? 1 : 0;
      const score = graded ? Number(s.score ?? 0) : 0;
      await tx.execute(sql`
        INSERT INTO hbe.rpt_platform_daily AS p (day, runs, submits, accepted, internal_errors, guest_runs)
        VALUES (${s.d}::date, ${run}, ${submit}, ${ac}, ${s.verdict === 'IE' ? 1 : 0}, ${s.tenant_id === null ? run : 0})
        ON CONFLICT (day) DO UPDATE SET runs = p.runs + excluded.runs, submits = p.submits + excluded.submits, accepted = p.accepted + excluded.accepted,
          internal_errors = p.internal_errors + excluded.internal_errors, guest_runs = p.guest_runs + excluded.guest_runs`);
      if (!s.tenant_id) return;
      await tx.execute(sql`
        INSERT INTO hbe.rpt_tenant_daily AS t (tenant_id, day, runs, submits, accepted) VALUES (${s.tenant_id}, ${s.d}::date, ${run}, ${submit}, ${ac})
        ON CONFLICT (tenant_id, day) DO UPDATE SET runs = t.runs + excluded.runs, submits = t.submits + excluded.submits, accepted = t.accepted + excluded.accepted`);
      const firstToday = await rows(tx, sql`INSERT INTO hbe.rpt_tenant_daily_users (tenant_id, day, user_id) VALUES (${s.tenant_id}, ${s.d}::date, ${s.user_id}) ON CONFLICT DO NOTHING RETURNING user_id`);
      if (firstToday.length) await tx.execute(sql`UPDATE hbe.rpt_tenant_daily SET active_users = active_users + 1 WHERE tenant_id = ${s.tenant_id} AND day = ${s.d}::date`);
      await tx.execute(sql`
        INSERT INTO hbe.rpt_user_activity AS a (tenant_id, user_id, last_at) VALUES (${s.tenant_id}, ${s.user_id}, ${s.created_at})
        ON CONFLICT (tenant_id, user_id) DO UPDATE SET last_at = greatest(a.last_at, excluded.last_at)`);
      // Per-question student totals change when a student submits a question for the first time
      // or solves it for the first time (prior state read under a row lock).
      const [prev] = await rows<{ submits: number; solved: boolean }>(
        tx,
        sql`SELECT submits, solved FROM hbe.rpt_student_question WHERE tenant_id = ${s.tenant_id} AND user_id = ${s.user_id} AND question_id = ${s.question_id} FOR UPDATE`,
      );
      const newStudent = submit === 1 && (!prev || prev.submits === 0) ? 1 : 0;
      const newSolved = ac === 1 && !prev?.solved ? 1 : 0;
      if (newStudent || newSolved) {
        await tx.execute(sql`
          INSERT INTO hbe.rpt_question_totals AS q (tenant_id, question_id, students, solved) VALUES (${s.tenant_id}, ${s.question_id}, ${newStudent}, ${newSolved})
          ON CONFLICT (tenant_id, question_id) DO UPDATE SET students = q.students + excluded.students, solved = q.solved + excluded.solved`);
      }
      const verdicts = graded && s.verdict ? { [s.verdict]: 1 } : {};
      await tx.execute(sql`
        INSERT INTO hbe.rpt_question_daily AS q (tenant_id, question_id, day, runtime, runs, submits, accepted, score_sum, verdicts)
        VALUES (${s.tenant_id}, ${s.question_id}, ${s.d}::date, ${s.runtime}, ${run}, ${submit}, ${ac}, ${score}, ${JSON.stringify(verdicts)}::jsonb)
        ON CONFLICT (tenant_id, question_id, day, runtime) DO UPDATE SET runs = q.runs + excluded.runs, submits = q.submits + excluded.submits,
          accepted = q.accepted + excluded.accepted, score_sum = q.score_sum + excluded.score_sum,
          verdicts = q.verdicts || (SELECT coalesce(jsonb_object_agg(k, coalesce((q.verdicts->>k)::int, 0) + v::int), '{}'::jsonb) FROM jsonb_each_text(excluded.verdicts) AS e(k, v))`);
      await tx.execute(sql`
        INSERT INTO hbe.rpt_student_question AS r (tenant_id, user_id, question_id, runs, submits, best_score, solved, first_solved_at, last_at)
        VALUES (${s.tenant_id}, ${s.user_id}, ${s.question_id}, ${run}, ${submit}, ${score}, ${ac === 1}, ${ac ? s.created_at : null}, ${s.created_at})
        ON CONFLICT (tenant_id, user_id, question_id) DO UPDATE SET runs = r.runs + excluded.runs, submits = r.submits + excluded.submits,
          best_score = greatest(r.best_score, excluded.best_score), solved = r.solved OR excluded.solved,
          first_solved_at = CASE WHEN excluded.first_solved_at IS NULL THEN r.first_solved_at WHEN r.first_solved_at IS NULL THEN excluded.first_solved_at ELSE least(r.first_solved_at, excluded.first_solved_at) END,
          last_at = greatest(r.last_at, excluded.last_at)`);
    });
  }

  /** Recompute every rollup from `submissions` (all institutions, or one). Idempotent. */
  async rebuild(tenantId?: string): Promise<{ ms: number }> {
    const t0 = Date.now();
    const tz = this.tz;
    const only = tenantId ? sql`AND tenant_id = ${tenantId}` : sql``;
    const onlyT = tenantId ? sql`WHERE tenant_id = ${tenantId}` : sql``;
    await this.db.system(async (tx) => {
      await tx.execute(sql`DELETE FROM hbe.rpt_question_daily ${onlyT}`);
      await tx.execute(sql`DELETE FROM hbe.rpt_student_question ${onlyT}`);
      await tx.execute(sql`DELETE FROM hbe.rpt_tenant_daily ${onlyT}`);
      await tx.execute(sql`DELETE FROM hbe.rpt_tenant_daily_users ${onlyT}`);
      await tx.execute(sql`DELETE FROM hbe.rpt_user_activity ${onlyT}`);
      await tx.execute(sql`DELETE FROM hbe.rpt_question_totals ${onlyT}`);
      const base = sql`SELECT tenant_id, user_id, question_id, runtime, kind, status, verdict, coalesce(score, 0) AS score, created_at, (created_at AT TIME ZONE ${tz})::date AS d
                       FROM hbe.submissions WHERE kind IN ('run', 'submit') AND status IN ('done', 'failed') AND tenant_id IS NOT NULL ${only}`;
      await tx.execute(sql`
        WITH b AS (${base}),
        v AS (SELECT tenant_id, question_id, d, runtime, jsonb_object_agg(verdict, n) AS verdicts
              FROM (SELECT tenant_id, question_id, d, runtime, verdict, count(*) AS n FROM b WHERE kind = 'submit' AND status = 'done' AND verdict IS NOT NULL GROUP BY 1, 2, 3, 4, 5) x
              GROUP BY 1, 2, 3, 4),
        a AS (SELECT tenant_id, question_id, d, runtime,
                     count(*) FILTER (WHERE kind = 'run') AS runs,
                     count(*) FILTER (WHERE kind = 'submit' AND status = 'done') AS submits,
                     count(*) FILTER (WHERE kind = 'submit' AND status = 'done' AND verdict = 'AC') AS accepted,
                     coalesce(sum(score) FILTER (WHERE kind = 'submit' AND status = 'done'), 0) AS score_sum
              FROM b GROUP BY 1, 2, 3, 4)
        INSERT INTO hbe.rpt_question_daily (tenant_id, question_id, day, runtime, runs, submits, accepted, score_sum, verdicts)
        SELECT a.tenant_id, a.question_id, a.d, a.runtime, a.runs, a.submits, a.accepted, a.score_sum, coalesce(v.verdicts, '{}'::jsonb)
        FROM a LEFT JOIN v USING (tenant_id, question_id, d, runtime)`);
      await tx.execute(sql`
        WITH b AS (${base})
        INSERT INTO hbe.rpt_student_question (tenant_id, user_id, question_id, runs, submits, best_score, solved, first_solved_at, last_at)
        SELECT tenant_id, user_id, question_id,
               count(*) FILTER (WHERE kind = 'run'),
               count(*) FILTER (WHERE kind = 'submit' AND status = 'done'),
               coalesce(max(score) FILTER (WHERE kind = 'submit' AND status = 'done'), 0),
               coalesce(bool_or(kind = 'submit' AND status = 'done' AND verdict = 'AC'), false),
               min(created_at) FILTER (WHERE kind = 'submit' AND status = 'done' AND verdict = 'AC'),
               max(created_at)
        FROM b GROUP BY 1, 2, 3`);
      await tx.execute(sql`
        WITH b AS (${base})
        INSERT INTO hbe.rpt_tenant_daily (tenant_id, day, runs, submits, accepted)
        SELECT tenant_id, d, count(*) FILTER (WHERE kind = 'run'), count(*) FILTER (WHERE kind = 'submit' AND status = 'done'),
               count(*) FILTER (WHERE kind = 'submit' AND status = 'done' AND verdict = 'AC')
        FROM b GROUP BY 1, 2`);
      await tx.execute(sql`WITH b AS (${base}) INSERT INTO hbe.rpt_tenant_daily_users (tenant_id, day, user_id) SELECT DISTINCT tenant_id, d, user_id FROM b`);
      await tx.execute(sql`
        UPDATE hbe.rpt_tenant_daily d SET active_users = x.n
        FROM (SELECT tenant_id, day, count(*)::int AS n FROM hbe.rpt_tenant_daily_users ${onlyT} GROUP BY 1, 2) x
        WHERE d.tenant_id = x.tenant_id AND d.day = x.day`);
      await tx.execute(sql`WITH b AS (${base}) INSERT INTO hbe.rpt_user_activity (tenant_id, user_id, last_at) SELECT tenant_id, user_id, max(created_at) FROM b GROUP BY 1, 2`);
      await tx.execute(sql`
        INSERT INTO hbe.rpt_question_totals (tenant_id, question_id, students, solved)
        SELECT tenant_id, question_id, count(*) FILTER (WHERE submits > 0), count(*) FILTER (WHERE solved) FROM hbe.rpt_student_question ${onlyT} GROUP BY 1, 2`);
      if (!tenantId) {
        await tx.execute(sql`DELETE FROM hbe.rpt_platform_daily`);
        await tx.execute(sql`
          INSERT INTO hbe.rpt_platform_daily (day, runs, submits, accepted, internal_errors, guest_runs)
          SELECT (created_at AT TIME ZONE ${tz})::date, count(*) FILTER (WHERE kind = 'run'), count(*) FILTER (WHERE kind = 'submit' AND status = 'done'),
                 count(*) FILTER (WHERE kind = 'submit' AND status = 'done' AND verdict = 'AC'), count(*) FILTER (WHERE verdict = 'IE'),
                 count(*) FILTER (WHERE kind = 'run' AND tenant_id IS NULL)
          FROM hbe.submissions WHERE kind IN ('run', 'submit') AND status IN ('done', 'failed') GROUP BY 1`);
      }
    });
    return { ms: Date.now() - t0 };
  }

  private async dailyRebuild() {
    const due = await this.redis.set(`${this.cfg.REDIS_PREFIX}reports-rebuilt`, new Date().toISOString(), 'EX', 23 * 3600, 'NX');
    if (due !== 'OK') return;
    const r = await this.rebuild();
    this.log.log(`rollups rebuilt in ${r.ms} ms`);
  }

  // ------------------------------------------------------------------ scope helpers
  private staff(u: AuthUser) {
    if (!['client_admin', 'teacher', 'associate'].includes(u.role) || !u.tenantId) throw forbidden();
    return u.tenantId;
  }

  // ------------------------------------------------------------------ institution dashboard
  async tenantDashboard(u: AuthUser) {
    const tenantId = this.staff(u);
    const tz = this.tz;
    return this.db.run(dbCtx(u), async (tx) => {
      const [people] = await rows<{ students: number; teachers: number; associates: number }>(
        tx,
        sql`SELECT count(*) FILTER (WHERE role = 'student' AND status = 'active')::int AS students, count(*) FILTER (WHERE role = 'teacher' AND status = 'active')::int AS teachers,
                   count(*) FILTER (WHERE role = 'associate' AND status = 'active')::int AS associates
            FROM hbe.memberships WHERE tenant_id = ${tenantId}`,
      );
      const [content] = await rows<{ questions: number; published: number; tests: number; live_tests: number }>(
        tx,
        sql`SELECT (SELECT count(*)::int FROM hbe.questions WHERE tenant_id = ${tenantId} AND status <> 'archived') AS questions,
                   (SELECT count(*)::int FROM hbe.questions WHERE tenant_id = ${tenantId} AND status = 'published') AS published,
                   (SELECT count(*)::int FROM hbe.tests WHERE tenant_id = ${tenantId}) AS tests,
                   (SELECT count(*)::int FROM hbe.tests WHERE tenant_id = ${tenantId} AND status = 'published' AND starts_at <= now() AND ends_at > now()) AS live_tests`,
      );
      const daily = await rows<{ day: string; runs: number; submits: number; accepted: number; active: number }>(
        tx,
        sql`WITH days AS (SELECT generate_series((now() AT TIME ZONE ${tz})::date - 29, (now() AT TIME ZONE ${tz})::date, interval '1 day')::date AS day)
            SELECT to_char(days.day, 'YYYY-MM-DD') AS day, coalesce(d.runs, 0)::int AS runs, coalesce(d.submits, 0)::int AS submits, coalesce(d.accepted, 0)::int AS accepted,
                   coalesce(d.active_users, 0)::int AS active
            FROM days LEFT JOIN hbe.rpt_tenant_daily d ON d.tenant_id = ${tenantId} AND d.day = days.day ORDER BY days.day`,
      );
      const [active] = await rows<{ d7: number; d30: number }>(
        tx,
        sql`SELECT count(*) FILTER (WHERE last_at > now() - interval '7 days')::int AS d7, count(*)::int AS d30
            FROM hbe.rpt_user_activity WHERE tenant_id = ${tenantId} AND last_at > now() - interval '30 days'`,
      );
      const recentTests = await rows<{ id: string; title: string; status: string; starts_at: Date; attempts: number; finished: number; avg_pct: string | null }>(
        tx,
        sql`SELECT t.id, t.title, t.status, t.starts_at,
                   (SELECT count(*)::int FROM hbe.attempts a WHERE a.test_id = t.id) AS attempts,
                   (SELECT count(*)::int FROM hbe.attempts a WHERE a.test_id = t.id AND a.status <> 'in_progress') AS finished,
                   (SELECT avg(a.score / nullif(a.max_score, 0) * 100) FROM hbe.attempts a WHERE a.test_id = t.id AND a.status <> 'in_progress') AS avg_pct
            FROM hbe.tests t WHERE t.tenant_id = ${tenantId} AND t.status <> 'draft' ORDER BY t.starts_at DESC LIMIT 8`,
      );
      const flagged = await this.flaggedQuestions(tx, tenantId, 10);
      return {
        people, content, active, daily,
        totals30: daily.reduce((a, d) => ({ runs: a.runs + d.runs, submits: a.submits + d.submits, accepted: a.accepted + d.accepted }), { runs: 0, submits: 0, accepted: 0 }),
        recentTests: recentTests.map((t) => ({ id: t.id, title: t.title, status: t.status, startsAt: t.starts_at, attempts: t.attempts, finished: t.finished, avgPercent: t.avg_pct === null ? null : r1(Number(t.avg_pct)) })),
        flagged,
        flagRule: FLAGS,
      };
    });
  }

  private async flaggedQuestions(tx: Tx, tenantId: string, limit: number) {
    const qs = await rows<{ question_id: string; title: string; type: string; difficulty: string; students: number; solved: number }>(
      tx,
      sql`SELECT r.question_id, v.title, q.type, v.difficulty, r.students, r.solved
          FROM hbe.rpt_question_totals r
          JOIN hbe.questions q ON q.id = r.question_id
          JOIN hbe.question_versions v ON v.id = coalesce(q.published_version_id, q.latest_version_id)
          WHERE r.tenant_id = ${tenantId} AND r.students >= ${FLAGS.minStudents}`,
    );
    return qs
      .map((q) => ({ questionId: q.question_id, title: q.title, type: q.type, difficulty: q.difficulty, students: q.students, solveRate: r1((q.solved / q.students) * 100), flag: flagOf(q.students, q.solved / q.students) }))
      .filter((q) => q.flag)
      .sort((a, b) => b.students - a.students)
      .slice(0, limit);
  }

  // ------------------------------------------------------------------ test report
  async testReport(u: AuthUser, testId: string) {
    this.staff(u);
    return this.db.run(dbCtx(u), async (tx) => {
      const [t] = await rows<{ id: string; title: string; status: string; starts_at: Date; ends_at: Date; duration_min: number; settings: Row }>(
        tx,
        sql`SELECT id, title, status, starts_at, ends_at, duration_min, settings FROM hbe.tests WHERE id = ${testId}`,
      );
      if (!t) throw notFound('Test');
      const questions = await rows<{ question_id: string; title: string; type: string; points: string; ordinal: number }>(
        tx,
        sql`SELECT tq.question_id, v.title, q.type, tq.points, tq.ordinal FROM hbe.test_questions tq
            JOIN hbe.questions q ON q.id = tq.question_id
            JOIN hbe.question_versions v ON v.id = coalesce(tq.version_id, q.published_version_id, q.latest_version_id)
            WHERE tq.test_id = ${testId} ORDER BY tq.ordinal`,
      );
      // Everyone assigned (directly or through a batch), plus anyone with an attempt.
      const people = await rows<{
        user_id: string; name: string; email: string; attempt_id: string | null; status: string | null; started_at: Date | null; submitted_at: Date | null;
        submit_reason: string | null; score: string | null; max_score: string | null; violation_count: number | null; breakdown: Record<string, { score: number; points: number; earned: number; submissions: number }> | null;
      }>(
        tx,
        sql`WITH assigned AS (
              SELECT ta.user_id FROM hbe.test_assignments ta WHERE ta.test_id = ${testId} AND ta.user_id IS NOT NULL
              UNION SELECT bm.user_id FROM hbe.test_assignments ta JOIN hbe.batch_members bm ON bm.batch_id = ta.batch_id WHERE ta.test_id = ${testId}
              UNION SELECT a.user_id FROM hbe.attempts a WHERE a.test_id = ${testId})
            SELECT u.id AS user_id, u.name, u.email, a.id AS attempt_id, a.status, a.started_at, a.submitted_at, a.submit_reason, a.score, a.max_score, a.violation_count, a.breakdown
            FROM assigned s JOIN hbe.users u ON u.id = s.user_id LEFT JOIN hbe.attempts a ON a.test_id = ${testId} AND a.user_id = s.user_id
            ORDER BY u.name`,
      );
      const [run] = await rows<{ id: string; status: string; created_at: Date; finished_at: Date | null }>(
        tx,
        sql`SELECT id, status, created_at, finished_at FROM hbe.plagiarism_runs WHERE test_id = ${testId} ORDER BY created_at DESC LIMIT 1`,
      );
      const plag = run
        ? await rows<{ user_id: string; sim: string }>(
            tx,
            sql`SELECT user_id, max(similarity) AS sim FROM (SELECT user_a AS user_id, similarity FROM hbe.plagiarism_pairs WHERE run_id = ${run.id}
                UNION ALL SELECT user_b, similarity FROM hbe.plagiarism_pairs WHERE run_id = ${run.id}) x GROUP BY user_id`,
          )
        : [];
      const plagBy = new Map(plag.map((p) => [p.user_id, Math.round(Number(p.sim) * 100)]));

      const finished = people.filter((p) => p.status && p.status !== 'in_progress');
      const percents = finished.map((p) => pct(Number(p.score ?? 0), Number(p.max_score ?? 0)) ?? 0);
      const sorted = [...finished].sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
      const rank = new Map<string, number>();
      sorted.forEach((p, i) => rank.set(p.user_id, i > 0 && Number(p.score) === Number(sorted[i - 1]!.score) ? rank.get(sorted[i - 1]!.user_id)! : i + 1));
      const distribution = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, count: 0 }));
      for (const x of percents) distribution[Math.min(9, Math.floor(x / 10))]!.count++;
      const times = finished.filter((p) => p.started_at && p.submitted_at).map((p) => (ms(p.submitted_at!) - ms(p.started_at!)) / 60_000);
      const byStatus = (s: string) => people.filter((p) => p.status === s).length;

      const perQuestion = questions.map((q) => {
        const bs = finished.map((p) => p.breakdown?.[q.question_id]).filter((b): b is NonNullable<typeof b> => !!b);
        const attempted = bs.filter((b) => b.submissions > 0);
        const full = attempted.filter((b) => b.score >= 100).length;
        return {
          questionId: q.question_id, title: q.title, type: q.type, points: Number(q.points),
          attempted: attempted.length, avgScore: attempted.length ? r1(attempted.reduce((a, b) => a + b.score, 0) / attempted.length) : null,
          fullScorePercent: attempted.length ? r1((full / attempted.length) * 100) : null,
          avgSubmissions: attempted.length ? r1(attempted.reduce((a, b) => a + b.submissions, 0) / attempted.length) : null,
          flag: flagOf(attempted.length, attempted.length ? full / attempted.length : 0),
        };
      });
      const violations = finished.map((p) => p.violation_count ?? 0);
      return {
        test: { id: t.id, title: t.title, status: t.status, startsAt: t.starts_at, endsAt: t.ends_at, durationMin: t.duration_min },
        summary: {
          assigned: people.length, started: people.filter((p) => p.attempt_id).length, inProgress: byStatus('in_progress'), submitted: byStatus('submitted'),
          autoSubmitted: byStatus('auto_submitted'), terminated: byStatus('terminated'), notStarted: people.filter((p) => !p.attempt_id).length,
          score: stats(percents), minutes: stats(times),
          violations: { total: violations.reduce((a, b) => a + b, 0), studentsWithAny: violations.filter((v) => v > 0).length },
        },
        distribution,
        questions: perQuestion,
        plagiarism: run ? { runId: run.id, status: run.status, createdAt: run.created_at, finishedAt: run.finished_at, flaggedStudents: plagBy.size } : null,
        students: people.map((p) => ({
          userId: p.user_id, name: p.name, email: p.email, attemptId: p.attempt_id, status: p.status ?? 'not_started', submitReason: p.submit_reason,
          score: p.score === null ? null : Number(p.score), maxScore: p.max_score === null ? null : Number(p.max_score), percent: pct(p.score === null ? null : Number(p.score), p.max_score === null ? null : Number(p.max_score)),
          rank: rank.get(p.user_id) ?? null,
          minutes: p.started_at && p.submitted_at ? r1((ms(p.submitted_at!) - ms(p.started_at!)) / 60_000) : null,
          violations: p.violation_count ?? 0,
          perQuestion: Object.fromEntries(questions.map((q) => [q.question_id, p.breakdown?.[q.question_id]?.score ?? null])),
          plagiarismMax: plagBy.get(p.user_id) ?? null,
        })),
      };
    });
  }

  // ------------------------------------------------------------------ question report
  async questionReport(u: AuthUser, questionId: string) {
    const tenantId = this.staff(u);
    const tz = this.tz;
    return this.db.run(dbCtx(u), async (tx) => {
      const [q] = await rows<{ id: string; title: string; type: string; difficulty: string; tags: string[]; global: boolean; status: string }>(
        tx,
        sql`SELECT q.id, v.title, q.type, v.difficulty, v.tags, q.tenant_id IS NULL AS global, q.status FROM hbe.questions q
            JOIN hbe.question_versions v ON v.id = coalesce(q.published_version_id, q.latest_version_id) WHERE q.id = ${questionId}`,
      );
      if (!q) throw notFound('Question');
      const byRuntime = await rows<{ runtime: string; runs: number; submits: number; accepted: number; score_sum: string }>(
        tx,
        sql`SELECT runtime, sum(runs)::int AS runs, sum(submits)::int AS submits, sum(accepted)::int AS accepted, sum(score_sum) AS score_sum
            FROM hbe.rpt_question_daily WHERE tenant_id = ${tenantId} AND question_id = ${questionId} GROUP BY runtime ORDER BY 3 DESC`,
      );
      const verdicts = await rows<{ verdict: string; n: number }>(
        tx,
        sql`SELECT e.key AS verdict, sum(e.value::int)::int AS n FROM hbe.rpt_question_daily d, jsonb_each_text(d.verdicts) e
            WHERE d.tenant_id = ${tenantId} AND d.question_id = ${questionId} GROUP BY e.key ORDER BY 2 DESC`,
      );
      const daily = await rows<{ day: string; submits: number; accepted: number }>(
        tx,
        sql`WITH days AS (SELECT generate_series((now() AT TIME ZONE ${tz})::date - 29, (now() AT TIME ZONE ${tz})::date, interval '1 day')::date AS day)
            SELECT to_char(days.day, 'YYYY-MM-DD') AS day, coalesce(sum(d.submits), 0)::int AS submits, coalesce(sum(d.accepted), 0)::int AS accepted
            FROM days LEFT JOIN hbe.rpt_question_daily d ON d.tenant_id = ${tenantId} AND d.question_id = ${questionId} AND d.day = days.day
            GROUP BY days.day ORDER BY days.day`,
      );
      const [st] = await rows<{ students: number; solved: number; avg_best: string | null }>(
        tx,
        sql`SELECT count(*)::int AS students, count(*) FILTER (WHERE solved)::int AS solved, avg(best_score) AS avg_best
            FROM hbe.rpt_student_question WHERE tenant_id = ${tenantId} AND question_id = ${questionId} AND submits > 0`,
      );
      const inTests = await rows<{ test_id: string; title: string; status: string; attempted: number; avg: string | null }>(
        tx,
        sql`SELECT t.id AS test_id, t.title, t.status,
                   count(a.id) FILTER (WHERE (a.breakdown->${questionId}->>'submissions')::int > 0)::int AS attempted,
                   avg((a.breakdown->${questionId}->>'score')::numeric) FILTER (WHERE (a.breakdown->${questionId}->>'submissions')::int > 0) AS avg
            FROM hbe.test_questions tq JOIN hbe.tests t ON t.id = tq.test_id LEFT JOIN hbe.attempts a ON a.test_id = t.id
            WHERE tq.question_id = ${questionId} GROUP BY t.id ORDER BY t.starts_at DESC LIMIT 20`,
      );
      const tot = byRuntime.reduce((a, r) => ({ runs: a.runs + r.runs, submits: a.submits + r.submits, accepted: a.accepted + r.accepted }), { runs: 0, submits: 0, accepted: 0 });
      const students = st?.students ?? 0;
      return {
        question: q,
        totals: { ...tot, acceptance: tot.submits ? r1((tot.accepted / tot.submits) * 100) : null },
        students: { attempted: students, solved: st?.solved ?? 0, solveRate: students ? r1(((st?.solved ?? 0) / students) * 100) : null, avgBestScore: st?.avg_best ? r1(Number(st.avg_best)) : null },
        flag: flagOf(students, students ? (st?.solved ?? 0) / students : 0),
        flagRule: FLAGS,
        byRuntime: byRuntime.map((r) => ({ runtime: r.runtime, runs: r.runs, submits: r.submits, accepted: r.accepted, acceptance: r.submits ? r1((r.accepted / r.submits) * 100) : null, avgScore: r.submits ? r1(Number(r.score_sum) / r.submits) : null })),
        verdicts,
        daily,
        tests: inTests.map((x) => ({ testId: x.test_id, title: x.title, status: x.status, attempted: x.attempted, avgScore: x.avg === null ? null : r1(Number(x.avg)) })),
      };
    });
  }

  // ------------------------------------------------------------------ student report
  async studentReport(u: AuthUser, userId: string) {
    const self = userId === u.id;
    if (!self) this.staff(u);
    if (self && u.role !== 'student' && !hasPermission(u.role, 'submission:read_any')) throw forbidden();
    if (!u.tenantId) throw forbidden();
    const tenantId = u.tenantId;
    return this.db.run(dbCtx(u), async (tx) => {
      const [person] = await rows<{ id: string; name: string; email: string }>(
        tx,
        sql`SELECT u.id, u.name, u.email FROM hbe.users u JOIN hbe.memberships m ON m.user_id = u.id AND m.tenant_id = ${tenantId} WHERE u.id = ${userId}`,
      );
      if (!person) throw notFound('Student');
      const attempts = await rows<{ test_id: string; title: string; status: string; started_at: Date; submitted_at: Date | null; score: string | null; max_score: string | null; violation_count: number; show: boolean }>(
        tx,
        sql`SELECT a.test_id, t.title, a.status, a.started_at, a.submitted_at, a.score, a.max_score, a.violation_count,
                   coalesce((t.settings->>'showResults')::boolean, true) AS show
            FROM hbe.attempts a JOIN hbe.tests t ON t.id = a.test_id WHERE a.user_id = ${userId} AND a.tenant_id = ${tenantId} ORDER BY a.started_at DESC LIMIT 100`,
      );
      const progress = await rows<{ question_id: string; title: string; type: string; difficulty: string; tags: string[]; submits: number; runs: number; best: string; solved: boolean; last_at: Date }>(
        tx,
        sql`SELECT r.question_id, v.title, q.type, v.difficulty, v.tags, r.submits, r.runs, r.best_score AS best, r.solved, r.last_at
            FROM hbe.rpt_student_question r JOIN hbe.questions q ON q.id = r.question_id
            JOIN hbe.question_versions v ON v.id = coalesce(q.published_version_id, q.latest_version_id)
            WHERE r.tenant_id = ${tenantId} AND r.user_id = ${userId} ORDER BY r.last_at DESC`,
      );
      const topics = new Map<string, { questions: number; solved: number; scoreSum: number }>();
      for (const p of progress.filter((x) => x.submits > 0)) {
        for (const tag of p.tags.length ? p.tags : ['(untagged)']) {
          const t = topics.get(tag) ?? { questions: 0, solved: 0, scoreSum: 0 };
          t.questions++;
          t.solved += p.solved ? 1 : 0;
          t.scoreSum += Number(p.best);
          topics.set(tag, t);
        }
      }
      const byDiff = (d: string) => {
        const xs = progress.filter((p) => p.difficulty === d && p.submits > 0);
        return { attempted: xs.length, solved: xs.filter((x) => x.solved).length };
      };
      // A student sees a test score only when the test shows results (staff always see it).
      const hide = (a: (typeof attempts)[number]) => self && u.role === 'student' && (!a.show || a.status === 'in_progress');
      return {
        student: person,
        tests: attempts.map((a) => ({
          testId: a.test_id, title: a.title, status: a.status, startedAt: a.started_at, submittedAt: a.submitted_at,
          score: hide(a) || a.score === null ? null : Number(a.score), maxScore: hide(a) || a.max_score === null ? null : Number(a.max_score),
          percent: hide(a) ? null : pct(a.score === null ? null : Number(a.score), a.max_score === null ? null : Number(a.max_score)),
          violations: self && u.role === 'student' ? undefined : a.violation_count,
        })),
        practice: {
          attempted: progress.filter((p) => p.submits > 0).length, solved: progress.filter((p) => p.solved).length,
          byDifficulty: { easy: byDiff('easy'), moderate: byDiff('moderate'), hard: byDiff('hard') },
        },
        topics: [...topics.entries()].map(([tag, t]) => ({ tag, questions: t.questions, solved: t.solved, avgBestScore: r1(t.scoreSum / t.questions) })).sort((a, b) => b.questions - a.questions),
        recent: progress.slice(0, 20).map((p) => ({ questionId: p.question_id, title: p.title, type: p.type, difficulty: p.difficulty, bestScore: Number(p.best), solved: p.solved, submits: p.submits, lastAt: p.last_at })),
      };
    });
  }

  // ------------------------------------------------------------------ batch report
  async batchReport(u: AuthUser, batchId: string) {
    this.staff(u);
    return this.db.run(dbCtx(u), async (tx) => {
      const [b] = await rows<{ id: string; name: string }>(tx, sql`SELECT id, name FROM hbe.batches WHERE id = ${batchId}`);
      if (!b) throw notFound('Batch');
      const students = await rows<{ id: string; name: string; email: string }>(
        tx,
        sql`SELECT u.id, u.name, u.email FROM hbe.batch_members bm JOIN hbe.users u ON u.id = bm.user_id WHERE bm.batch_id = ${batchId} ORDER BY u.name`,
      );
      const tests = await rows<{ id: string; title: string; starts_at: Date }>(
        tx,
        sql`SELECT DISTINCT t.id, t.title, t.starts_at FROM hbe.test_assignments ta JOIN hbe.tests t ON t.id = ta.test_id
            WHERE ta.batch_id = ${batchId} AND t.status <> 'draft' ORDER BY t.starts_at`,
      );
      const ids = students.map((s) => s.id);
      const cells = ids.length && tests.length
        ? await rows<{ user_id: string; test_id: string; status: string; score: string | null; max_score: string | null }>(
            tx,
            sql`SELECT user_id, test_id, status, score, max_score FROM hbe.attempts
                WHERE test_id IN (${sql.join(tests.map((t) => sql`${t.id}`), sql`, `)}) AND user_id IN (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`,
          )
        : [];
      const cell = (uid: string, tid: string) => {
        const c = cells.find((x) => x.user_id === uid && x.test_id === tid);
        if (!c) return null;
        return { status: c.status, percent: c.status === 'in_progress' ? null : pct(c.score === null ? null : Number(c.score), c.max_score === null ? null : Number(c.max_score)) };
      };
      const matrix = students.map((s) => {
        const row = tests.map((t) => cell(s.id, t.id));
        const done = row.filter((c) => c?.percent !== null && c?.percent !== undefined).map((c) => c!.percent!);
        return { userId: s.id, name: s.name, email: s.email, cells: row, average: done.length ? r1(done.reduce((a, x) => a + x, 0) / done.length) : null };
      });
      return {
        batch: b,
        tests: tests.map((t, i) => {
          const xs = matrix.map((m) => m.cells[i]?.percent).filter((x): x is number => typeof x === 'number');
          return { id: t.id, title: t.title, startsAt: t.starts_at, taken: xs.length, average: xs.length ? r1(xs.reduce((a, x) => a + x, 0) / xs.length) : null };
        }),
        students: matrix,
      };
    });
  }

  // ------------------------------------------------------------------ platform (super admin)
  async platform(u: AuthUser) {
    if (u.role !== 'super_admin') throw forbidden();
    const tz = this.tz;
    const data = await this.db.run(dbCtx(u), async (tx) => {
      const tenants = await rows<{ id: string; name: string; status: string; students: number; questions: number; tests: number; submits30: number; active30: number }>(
        tx,
        sql`SELECT t.id, t.name, t.status,
                   (SELECT count(*)::int FROM hbe.memberships m WHERE m.tenant_id = t.id AND m.role = 'student') AS students,
                   (SELECT count(*)::int FROM hbe.questions q WHERE q.tenant_id = t.id) AS questions,
                   (SELECT count(*)::int FROM hbe.tests x WHERE x.tenant_id = t.id) AS tests,
                   (SELECT coalesce(sum(d.submits + d.runs), 0)::int FROM hbe.rpt_tenant_daily d WHERE d.tenant_id = t.id AND d.day > (now() AT TIME ZONE ${tz})::date - 30) AS submits30,
                   (SELECT count(*)::int FROM hbe.rpt_user_activity ua WHERE ua.tenant_id = t.id AND ua.last_at > now() - interval '30 days') AS active30
            FROM hbe.tenants t ORDER BY t.name`,
      );
      const daily = await rows<{ day: string; runs: number; submits: number; accepted: number; internal_errors: number; guest_runs: number }>(
        tx,
        sql`WITH days AS (SELECT generate_series((now() AT TIME ZONE ${tz})::date - 29, (now() AT TIME ZONE ${tz})::date, interval '1 day')::date AS day)
            SELECT to_char(days.day, 'YYYY-MM-DD') AS day, coalesce(p.runs, 0)::int AS runs, coalesce(p.submits, 0)::int AS submits, coalesce(p.accepted, 0)::int AS accepted,
                   coalesce(p.internal_errors, 0)::int AS internal_errors, coalesce(p.guest_runs, 0)::int AS guest_runs
            FROM days LEFT JOIN hbe.rpt_platform_daily p ON p.day = days.day ORDER BY days.day`,
      );
      const [queue] = await rows<{ queued: number; running: number; oldest_queued_sec: number | null; stuck: number }>(
        tx,
        sql`SELECT count(*) FILTER (WHERE status = 'queued')::int AS queued, count(*) FILTER (WHERE status = 'running')::int AS running,
                   extract(epoch FROM now() - min(created_at) FILTER (WHERE status = 'queued'))::int AS oldest_queued_sec,
                   count(*) FILTER (WHERE status = 'running' AND lease_until < now())::int AS stuck
            FROM hbe.submissions WHERE status IN ('queued', 'running')`,
      );
      return { tenants, daily, queue };
    });
    // Live, from Redis: list lengths per priority and executors seen in the last 5 minutes.
    const prefix = this.cfg.REDIS_PREFIX;
    const lists: Record<string, number> = {};
    for (const p of ['run', 'submit', 'practice', 'validate']) lists[p] = await this.redis.llen(`${prefix}exec:${p}`).catch(() => -1);
    const executors: { id: string; lastSeen: string; runtimes: string[] }[] = [];
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${prefix}exec-seen:*`, 'COUNT', 200);
      cursor = next;
      for (const k of keys) {
        const v = await this.redis.get(k);
        if (!v) continue;
        const x = JSON.parse(v) as { at: string; runtimes: string[] };
        executors.push({ id: k.slice(`${prefix}exec-seen:`.length), lastSeen: x.at, runtimes: x.runtimes });
      }
    } while (cursor !== '0');
    return { ...data, queue: { ...data.queue, lists }, executors: executors.sort((a, b) => a.id.localeCompare(b.id)) };
  }
}
