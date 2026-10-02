/**
 * Phase 4 with the real sandbox: an attempt's submissions are graded by the hbe-executor
 * container, the deadline sweeper auto-submits the final draft and it is graded too, and the
 * attempt endpoints are timed with 20 simulated students working at once.
 */
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import type { ClientSubmission } from '@hbe/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sumArray } from '../../../../packages/db/src/seed/questions/sum-array.js';
import { DOCKER_FLAGS, IMAGE } from '../../../executor/test/sandbox/harness.js';
import { PASSWORD, seedOrg, systemQuery, type Org } from '../fixtures.js';
import { Client, EXECUTOR_TOKEN, startApp, type TestApp } from '../harness.js';

const exec = promisify(execFile);
const PORT = 4778;
const STUDENTS = 20;
let t: TestApp;
let org: Org;
let container = '';
let teacher: Client;
let questionId = '';
const H = 'x-attempt-token';

async function waitFor<T>(fn: () => Promise<T | undefined>, ms: number, step = 100): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, step));
  }
}
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!);
};

beforeAll(async () => {
  t = await startApp({ SWEEPER_INTERVAL_MS: '2000', RATE_LIMIT_RUN_PER_MIN: '1000', RATE_LIMIT_SUBMIT_PER_MIN: '1000' });
  await t.app.listen({ port: PORT, host: '127.0.0.1' });
  org = await seedOrg(t);
  const { stdout } = await exec('docker', [
    'run', '-d', '--rm', ...DOCKER_FLAGS, '--network', 'host',
    '-e', `EXECUTOR_API_URL=http://127.0.0.1:${PORT}`, '-e', `EXECUTOR_TOKEN=${EXECUTOR_TOKEN}`, '-e', 'EXECUTOR_ID=e2e-attempts', '-e', 'EXECUTOR_SLOTS=2',
    IMAGE,
  ]);
  container = stdout.trim();
  teacher = new Client(t);
  await teacher.login(org.users.teacherA.email, PASSWORD);
  // Validate and publish an exam-only question in the real sandbox.
  questionId = (await teacher.post('/api/v1/questions', { ...sumArray, title: 'E2E exam sum', isPractice: false })).json().id;
  await teacher.post(`/api/v1/questions/${questionId}/validate`, { publishIfValid: true });
  await waitFor(async () => ((await teacher.get(`/api/v1/questions/${questionId}`)).json().status === 'published' ? true : undefined), 240_000, 500);
});
afterAll(async () => {
  if (container) await exec('docker', ['rm', '-f', container]).catch(() => undefined);
  await t?.close();
});

async function makeTest(userIds: string[], durationMin = 30) {
  const now = Date.now();
  const id = (await teacher.post('/api/v1/tests', { title: `E2E ${now}`, startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 3600_000).toISOString(), durationMin, questions: [{ questionId, points: 40 }] })).json().id as string;
  await teacher.post(`/api/v1/tests/${id}/assign`, { userIds });
  expect((await teacher.post(`/api/v1/tests/${id}/publish`)).statusCode).toBe(200);
  return id;
}

describe('attempts graded by the real sandbox', () => {
  it('scores the best submit, and the deadline sweeper grades the final draft', async () => {
    const student = new Client(t);
    await student.login(org.users.studentA.email, PASSWORD);
    const testId = await makeTest([org.users.studentA.id]);
    const s = (await student.post(`/api/v1/tests/${testId}/attempt`, {})).json() as { attemptId: string; token: string };
    const tok = { [H]: s.token };
    const submit = async (code: string) => {
      const r = await student.req('POST', '/api/v1/submissions', { questionId, runtime: 'python', code, kind: 'submit', attemptId: s.attemptId }, tok);
      expect(r.statusCode, r.body).toBe(202);
      return waitFor(async () => {
        const x = (await student.get(`/api/v1/submissions/${r.json().id}`)).json() as ClientSubmission;
        return x.status === 'done' || x.status === 'failed' ? x : undefined;
      }, 60_000, 50);
    };
    const wrong = await submit('def sum_array(a):\n    return sum(a) + 1\n');
    expect(wrong.verdict).toBe('WA');
    let v = (await student.req('GET', `/api/v1/attempts/${s.attemptId}`, undefined, tok)).json();
    expect(v.questions[0]).toMatchObject({ bestScore: 0, submissions: 1 });

    // A correct solution is only saved as a draft, then time runs out.
    await student.req('PUT', `/api/v1/attempts/${s.attemptId}/drafts/${questionId}/python`, { code: 'def sum_array(a):\n    return sum(a)\n' }, tok);
    await systemQuery(t, `UPDATE hbe.attempts SET deadline_at = now() - interval '3 seconds' WHERE id = $1`, [s.attemptId]);
    // The running sweeper (every 2 s) auto-submits; the draft is graded by the executor.
    const final = await waitFor(async () => {
      const [a] = await systemQuery<{ status: string; score: string | null; breakdown: Record<string, { submissions: number }> }>(t, 'SELECT status, score, breakdown FROM hbe.attempts WHERE id = $1', [s.attemptId]);
      return a && a.status === 'auto_submitted' && a.breakdown[questionId]?.submissions === 2 && Number(a.score) === 40 ? a : undefined;
    }, 60_000, 200);
    expect(final.status).toBe('auto_submitted');
    v = (await student.req('GET', `/api/v1/attempts/${s.attemptId}`, undefined, tok)).json();
    expect(v).toMatchObject({ status: 'auto_submitted', score: 40, maxScore: 40 });
  });

  it(`${STUDENTS} students at once: attempt API latency and end-to-end grading`, async () => {
    // Extra students in tenant A, all assigned to one test.
    const argon2 = (await import('argon2')).default;
    const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const ids: string[] = [];
    for (let i = 0; i < STUDENTS; i++) {
      const [u] = await systemQuery<{ id: string }>(t, `INSERT INTO hbe.users (email, name, password_hash, status) VALUES ($1, $2, $3, 'active') RETURNING id`, [`load${i}@alpha.edu`, `Load ${i}`, hash]);
      await systemQuery(t, `INSERT INTO hbe.memberships (user_id, tenant_id, role) VALUES ($1, $2, 'student')`, [u!.id, org.tenantA]);
      ids.push(u!.id);
    }
    const testId = await makeTest(ids);
    const clients = await Promise.all(ids.map(async (_, i) => {
      const c = new Client(t);
      await c.login(`load${i}@alpha.edu`, PASSWORD);
      return c;
    }));
    const timings: Record<string, number[]> = { start: [], heartbeat: [], events: [], draft: [], submitToVerdict: [] };
    const timed = async <T>(k: string, fn: () => Promise<T>) => {
      const t0 = performance.now();
      const r = await fn();
      timings[k]!.push(performance.now() - t0);
      return r;
    };
    const sessions = await Promise.all(clients.map((c) => timed('start', async () => (await c.post(`/api/v1/tests/${testId}/attempt`, {})).json() as { attemptId: string; token: string })));
    // Five rounds of what each browser does: heartbeat, a batch of events, a draft save.
    for (let round = 0; round < 5; round++) {
      await Promise.all(clients.map(async (c, i) => {
        const s = sessions[i]!;
        const h = { [H]: s.token };
        await timed('heartbeat', () => c.req('POST', `/api/v1/attempts/${s.attemptId}/heartbeat`, { visible: true, focused: true, fullscreen: true, eventsSent: round * 2 }, h));
        await timed('events', () => c.req('POST', `/api/v1/attempts/${s.attemptId}/events`, { events: [{ type: 'window_focus', clientTs: new Date().toISOString() }, { type: 'mouse_leave', clientTs: new Date().toISOString() }] }, h));
        await timed('draft', () => c.req('PUT', `/api/v1/attempts/${s.attemptId}/drafts/${questionId}/python`, { code: `# round ${round}\ndef sum_array(a):\n    return sum(a)\n` }, h));
      }));
    }
    // Everyone submits at the same moment (the end-of-test burst), graded by one 2-slot executor.
    const verdicts = await Promise.all(clients.map((c, i) => timed('submitToVerdict', async () => {
      const s = sessions[i]!;
      const r = await c.req('POST', '/api/v1/submissions', { questionId, runtime: 'python', code: 'def sum_array(a):\n    return sum(a)\n', kind: 'submit', attemptId: s.attemptId }, { [H]: s.token });
      expect(r.statusCode, r.body).toBe(202);
      return waitFor(async () => {
        const x = (await c.get(`/api/v1/submissions/${r.json().id}`)).json() as ClientSubmission;
        return x.status === 'done' || x.status === 'failed' ? x.verdict : undefined;
      }, 180_000, 100);
    })));
    expect(verdicts.every((v) => v === 'AC')).toBe(true);
    const live = (await teacher.get(`/api/v1/tests/${testId}/live`)).json();
    await waitFor(async () => ((await teacher.get(`/api/v1/tests/${testId}/live`)).json().rows.every((r: { attempt: { score: number } }) => r.attempt?.score === 40) ? true : undefined), 30_000, 200);
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) await teacher.get(`/api/v1/tests/${testId}/live`);
    const liveMs = (performance.now() - t0) / 10;
    expect(live.rows).toHaveLength(STUDENTS);

    const report = Object.fromEntries(Object.entries(timings).map(([k, xs]) => [k, { n: xs.length, p50: pct(xs, 50), p95: pct(xs, 95), max: Math.round(Math.max(...xs)) }]));
    const out = { students: STUDENTS, executorSlots: 2, ms: report, liveMonitorAvgMs: Math.round(liveMs) };
    console.log(JSON.stringify(out, null, 2));
    if (process.env.LATENCY_OUT) writeFileSync(process.env.LATENCY_OUT, JSON.stringify(out, null, 2));
  });
});
