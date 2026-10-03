/**
 * Phase 6 exit criterion: report endpoints < 200 ms p95 on seeded data.
 *
 * Seeds one busy institution's semester (and a smaller second institution as noise), rebuilds
 * the rollups, then times each report endpoint through the API (in-process: no network/TLS).
 * Run: pnpm --filter @hbe/api test:perf   (needs Postgres + Redis, like the API tests)
 */
import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { enrollMfa, PASSWORD, seedOrg, systemQuery, type Org } from '../fixtures.js';
import { Client, startApp, type TestApp } from '../harness.js';

const SIZE = {
  students: Number(process.env.PERF_STUDENTS ?? 2000),
  batches: 20,
  questions: 60,
  tests: 20,
  studentsPerTest: 1000,
  questionsPerTest: 4,
  submissions: Number(process.env.PERF_SUBMISSIONS ?? 300_000),
  days: 120,
};
const RUNS = 50;
let t: TestApp;
let org: Org;
let teacher: Client;
let student: Client;
let root: Client;
const ids: { test?: string; question?: string; batch?: string; student?: string } = {};
const seedTimings: Record<string, number> = {};

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const r = await fn();
  seedTimings[label] = Math.round(performance.now() - t0);
  return r;
}

async function seedTenant(tenantId: string, prefix: string, scale: number) {
  const n = (x: number) => Math.max(1, Math.round(x * scale));
  await systemQuery(t, `INSERT INTO hbe.users (email, name, status) SELECT $1 || g || '@perf.test', 'Student ' || g, 'active' FROM generate_series(1, $2) g`, [`${prefix}s`, n(SIZE.students)]);
  await systemQuery(t, `INSERT INTO hbe.memberships (user_id, tenant_id, role) SELECT id, $1, 'student' FROM hbe.users WHERE email LIKE $2`, [tenantId, `${prefix}s%@perf.test`]);
  await systemQuery(t, `INSERT INTO hbe.batches (tenant_id, name) SELECT $1, 'Batch ' || g FROM generate_series(1, $2) g`, [tenantId, SIZE.batches]);
  await systemQuery(
    t,
    `WITH s AS (SELECT id, row_number() OVER (ORDER BY email) AS rn FROM hbe.users WHERE email LIKE $2),
          b AS (SELECT id, row_number() OVER (ORDER BY name) AS rn FROM hbe.batches WHERE tenant_id = $1)
     INSERT INTO hbe.batch_members (batch_id, user_id, tenant_id) SELECT b.id, s.id, $1 FROM s JOIN b ON b.rn = 1 + (s.rn % $3)`,
    [tenantId, `${prefix}s%@perf.test`, SIZE.batches],
  );
  // Questions: one published version each, with tags.
  await systemQuery(t, `INSERT INTO hbe.questions (tenant_id, slug, status, is_practice) SELECT $1, $2 || g, 'published', true FROM generate_series(1, $3) g`, [tenantId, `${prefix}q`, n(SIZE.questions)]);
  await systemQuery(
    t,
    `INSERT INTO hbe.question_versions (question_id, version_no, title, statement, difficulty, tags, base_time_limit_ms, memory_limit_mb, compare, published_at)
     SELECT id, 1, 'Perf question ' || slug, 'x', (ARRAY['easy','moderate','hard'])[1 + (abs(hashtext(slug)) % 3)],
            ARRAY[(ARRAY['arrays','strings','graphs','dp','math','sql'])[1 + (abs(hashtext(slug)) % 6)]], 1000, 256, '{"mode":"exact"}', now()
     FROM hbe.questions WHERE tenant_id = $1`,
    [tenantId],
  );
  await systemQuery(t, `UPDATE hbe.questions q SET latest_version_id = v.id, published_version_id = v.id FROM hbe.question_versions v WHERE v.question_id = q.id AND q.tenant_id = $1`, [tenantId]);
  // Tests: each assigned to half the batches, with 4 questions.
  await systemQuery(
    t,
    `INSERT INTO hbe.tests (tenant_id, title, status, starts_at, ends_at, duration_min)
     SELECT $1, 'Perf test ' || g, 'closed', now() - (g * 5 || ' days')::interval, now() - (g * 5 || ' days')::interval + interval '3 hours', 60 FROM generate_series(1, $2) g`,
    [tenantId, SIZE.tests],
  );
  await systemQuery(
    t,
    `WITH tt AS (SELECT id, row_number() OVER (ORDER BY title) AS rn FROM hbe.tests WHERE tenant_id = $1),
          qq AS (SELECT q.id, q.published_version_id AS vid, row_number() OVER (ORDER BY q.slug) AS rn FROM hbe.questions q WHERE q.tenant_id = $1)
     INSERT INTO hbe.test_questions (test_id, question_id, version_id, ordinal, points)
     SELECT tt.id, qq.id, qq.vid, k, 25 FROM tt CROSS JOIN generate_series(1, $2) k JOIN qq ON qq.rn = 1 + ((tt.rn * 7 + k * 3) % (SELECT count(*) FROM qq))
     ON CONFLICT DO NOTHING`,
    [tenantId, SIZE.questionsPerTest],
  );
  await systemQuery(
    t,
    `WITH tt AS (SELECT id, row_number() OVER (ORDER BY title) AS rn FROM hbe.tests WHERE tenant_id = $1),
          b AS (SELECT id, row_number() OVER (ORDER BY name) AS rn FROM hbe.batches WHERE tenant_id = $1)
     INSERT INTO hbe.test_assignments (test_id, batch_id) SELECT tt.id, b.id FROM tt JOIN b ON (b.rn + tt.rn) % 2 = 0`,
    [tenantId],
  );
  // One finished attempt per assigned student, with a per-question breakdown.
  await systemQuery(
    t,
    `WITH a AS (
       SELECT DISTINCT ta.test_id, bm.user_id, t.starts_at FROM hbe.test_assignments ta JOIN hbe.batch_members bm ON bm.batch_id = ta.batch_id JOIN hbe.tests t ON t.id = ta.test_id WHERE t.tenant_id = $1)
     INSERT INTO hbe.attempts (test_id, user_id, status, started_at, deadline_at, submitted_at, score, max_score, breakdown, violation_count, submit_reason)
     SELECT a.test_id, a.user_id, 'submitted', a.starts_at + interval '5 minutes', a.starts_at + interval '65 minutes',
            a.starts_at + ((20 + abs(hashtext(a.user_id::text || a.test_id::text)) % 40) || ' minutes')::interval,
            b.earned, b.points, b.breakdown, abs(hashtext(a.user_id::text)) % 4, 'student'
     FROM a CROSS JOIN LATERAL (
       SELECT sum(x.points * x.score / 100) AS earned, sum(x.points) AS points,
              jsonb_object_agg(x.question_id, jsonb_build_object('score', x.score, 'points', x.points, 'earned', x.points * x.score / 100, 'submissions', 1 + abs(hashtext(x.question_id::text || a.user_id::text)) % 4)) AS breakdown
       FROM (SELECT tq.question_id, tq.points, ((abs(hashtext(tq.question_id::text || a.user_id::text)) % 11) * 10)::numeric AS score FROM hbe.test_questions tq WHERE tq.test_id = a.test_id) x) b`,
    [tenantId],
  );
  // Graded runs and submits spread over the semester.
  await systemQuery(
    t,
    `WITH u AS (SELECT array_agg(m.user_id ORDER BY m.user_id) AS ids FROM hbe.memberships m WHERE m.tenant_id = $1 AND m.role = 'student'),
          q AS (SELECT array_agg(id ORDER BY id) AS ids, array_agg(published_version_id ORDER BY id) AS vids FROM hbe.questions WHERE tenant_id = $1)
     INSERT INTO hbe.submissions (tenant_id, user_id, question_id, version_id, runtime, kind, priority, code, status, verdict, score, passed, total, created_at, finished_at)
     SELECT $1, u.ids[1 + (g::bigint * 7919) % array_length(u.ids, 1)], q.ids[1 + (g::bigint * 104729) % array_length(q.ids, 1)], q.vids[1 + (g::bigint * 104729) % array_length(q.ids, 1)],
            (ARRAY['python','cpp','java','c','javascript'])[1 + g % 5], CASE WHEN g % 3 = 0 THEN 'submit' ELSE 'run' END, 'practice', 'code', 'done',
            CASE WHEN g % 4 = 0 THEN 'WA' WHEN g % 17 = 0 THEN 'TLE' ELSE 'AC' END,
            CASE WHEN g % 3 = 0 THEN CASE WHEN g % 4 = 0 THEN 40 ELSE 100 END END, 10, 12,
            now() - ((g % $3) || ' days')::interval - ((g % 86400) || ' seconds')::interval, now() - ((g % $3) || ' days')::interval
     FROM generate_series(1, $2) g, u, q`,
    [tenantId, n(SIZE.submissions), SIZE.days],
  );
}

function pct(xs: number[], p: number) {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]! * 10) / 10;
}

beforeAll(async () => {
  t = await startApp();
  org = await seedOrg(t);
  await timed('seed institution A', () => seedTenant(org.tenantA, 'a', 1));
  await timed('seed institution B (10%)', () => seedTenant(org.tenantB, 'b', 0.1));
  await systemQuery(t, 'ANALYZE');
  const { ReportsService } = await import('../../dist/reports/reports.service.js');
  const r = await timed('rebuild all rollups', () => t.app.get(ReportsService).rebuild());
  expect(r.ms).toBeGreaterThan(0);
  teacher = new Client(t);
  await teacher.login(org.users.teacherA.email, PASSWORD);
  root = new Client(t);
  await root.login(org.users.admin.email, PASSWORD);
  await enrollMfa(root);
  const [x] = await systemQuery<{ test: string; question: string; batch: string; student: string }>(
    t,
    `SELECT (SELECT test_id FROM hbe.attempts WHERE tenant_id = $1 GROUP BY test_id ORDER BY count(*) DESC LIMIT 1) AS test,
            (SELECT question_id FROM hbe.rpt_student_question WHERE tenant_id = $1 GROUP BY question_id ORDER BY count(*) DESC LIMIT 1) AS question,
            (SELECT batch_id FROM hbe.batch_members WHERE tenant_id = $1 GROUP BY batch_id ORDER BY count(*) DESC LIMIT 1) AS batch,
            (SELECT user_id FROM hbe.rpt_student_question WHERE tenant_id = $1 GROUP BY user_id ORDER BY count(*) DESC LIMIT 1) AS student`,
    [org.tenantA],
  );
  Object.assign(ids, x);
  // A real student account for the self view: give the seeded student the demo password.
  const [h] = await systemQuery<{ password_hash: string }>(t, 'SELECT password_hash FROM hbe.users WHERE id = $1', [org.users.studentA.id]);
  await systemQuery(t, 'UPDATE hbe.users SET password_hash = $1 WHERE id = $2', [h!.password_hash, ids.student]);
  const [e] = await systemQuery<{ email: string }>(t, 'SELECT email FROM hbe.users WHERE id = $1', [ids.student]);
  student = new Client(t);
  await student.login(e!.email, PASSWORD);
}, 900_000);
afterAll(async () => {
  await t?.close();
});

it('every report endpoint answers in < 200 ms at p95 on seeded data', async () => {
  const counts = await systemQuery<Record<string, number>>(
    t,
    `SELECT (SELECT count(*)::int FROM hbe.submissions) AS submissions, (SELECT count(*)::int FROM hbe.attempts) AS attempts,
            (SELECT count(*)::int FROM hbe.memberships WHERE role = 'student') AS students, (SELECT count(*)::int FROM hbe.questions) AS questions,
            (SELECT count(*)::int FROM hbe.rpt_question_daily) AS rpt_question_daily, (SELECT count(*)::int FROM hbe.rpt_student_question) AS rpt_student_question,
            (SELECT count(*)::int FROM hbe.rpt_tenant_daily_users) AS rpt_tenant_daily_users,
            (SELECT count(*)::int FROM hbe.attempts WHERE test_id = $1) AS attempts_in_measured_test`,
    [ids.test],
  );
  const endpoints: [string, Client, string][] = [
    ['institution overview', teacher, '/api/v1/reports/overview'],
    ['test report (largest test)', teacher, `/api/v1/reports/tests/${ids.test}`],
    ['question report', teacher, `/api/v1/reports/questions/${ids.question}`],
    ['student report (staff)', teacher, `/api/v1/reports/students/${ids.student}`],
    ['student report (self)', student, '/api/v1/reports/me'],
    ['batch report', teacher, `/api/v1/reports/batches/${ids.batch}`],
    ['platform dashboard', root, '/api/v1/reports/platform'],
  ];
  const results: Record<string, { p50: number; p95: number; max: number; bytes: number }> = {};
  for (const [label, cl, url] of endpoints) {
    const ms: number[] = [];
    let bytes = 0;
    for (let i = 0; i < RUNS + 5; i++) {
      const t0 = performance.now();
      const r = await cl.get(url);
      const d = performance.now() - t0;
      expect(r.statusCode, `${label}: ${r.body.slice(0, 200)}`).toBe(200);
      bytes = r.body.length;
      if (i >= 5) ms.push(d); // 5 warm-up requests
    }
    results[label] = { p50: pct(ms, 50), p95: pct(ms, 95), max: Math.round(Math.max(...ms)), bytes };
  }
  const report = { data: counts[0], seedMs: seedTimings, runsPerEndpoint: RUNS, endpointsMs: results };
  console.log(JSON.stringify(report, null, 2));
  if (process.env.PERF_OUT) writeFileSync(process.env.PERF_OUT, JSON.stringify(report, null, 2));
  for (const [label, r] of Object.entries(results)) expect(r.p95, label).toBeLessThan(200);
}, 600_000);
