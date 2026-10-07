import type { CodingJob as ExecJob } from '@hbe/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sumArray } from '../../../packages/db/src/seed/questions/sum-array.js';
import { PASSWORD, seedOrg, systemQuery, type Org } from './fixtures.js';
import { Client, executor, startApp, type TestApp } from './harness.js';
import type { Redis } from 'ioredis';

let t: TestApp;
let org: Org;
let teacher: Client;
let student: Client;
let other: Client;
let questionId: string;
const ex = () => executor(t);

// Small but complete question (hidden stress tests trimmed to keep payloads light in this test).
const q = {
  ...sumArray,
  title: 'Flow test: sum of an array',
  hidden: sumArray.hidden.slice(0, 8).concat([{ input: '2\nHIDDEN-SENTINEL-IN 1\n', output: 'HIDDEN-SENTINEL-OUT\n', weight: 2, isStress: false }, { ...sumArray.hidden[9]! }]),
};

/** Fake executor: answers every test with the given verdict function. */
async function runFakeExecutor(verdict: (job: ExecJob, i: number) => string = () => 'AC') {
  const r = await ex().claim();
  expect(r.statusCode).toBe(200);
  const job = r.json() as ExecJob;
  const res = await ex().result({
    jobId: job.jobId,
    compile: { ok: true, output: '', wallMs: 50 },
    tests: job.tests.map((tc, i) => ({ id: tc.id, verdict: verdict(job, i), cpuMs: 10, wallMs: 12, memKb: 2048, stdout: tc.hidden ? 'should-not-be-stored' : (tc.expected ?? 'out'), stderr: '' })),
  });
  expect(res.statusCode).toBe(200);
  return job;
}

beforeAll(async () => {
  t = await startApp();
  org = await seedOrg(t);
  teacher = new Client(t);
  await teacher.login(org.users.teacherA.email, PASSWORD);
  student = new Client(t);
  await student.login(org.users.studentA.email, PASSWORD);
  other = new Client(t);
  await other.login(org.users.studentB.email, PASSWORD);
});
afterAll(async () => {
  await t?.close();
});

describe('authoring → validation → publish', () => {
  it('rejects publishing before validation', async () => {
    questionId = (await teacher.post('/api/v1/questions', { ...q, isPractice: true })).json().id;
    expect((await teacher.post(`/api/v1/questions/${questionId}/publish`)).statusCode).toBe(400);
  });

  it('a structurally incomplete question fails validation without running anything', async () => {
    const bad = (await teacher.post('/api/v1/questions', { ...q, title: 'Incomplete one', hidden: q.hidden.slice(0, 3) })).json().id;
    const r = (await teacher.post(`/api/v1/questions/${bad}/validate`, {})).json();
    expect(r.status).toBe('invalid');
    expect(r.problems).toContain('10–15 hidden test cases are required');
  });

  it('validation runs every reference solution; a failing one marks the question invalid', async () => {
    const v = await teacher.post(`/api/v1/questions/${questionId}/validate`, {});
    expect(v.statusCode).toBe(202);
    const runtimes = Object.keys(q.templates);
    for (let i = 0; i < runtimes.length; i++) {
      // The JS reference "fails" one hidden test.
      await runFakeExecutor((job, idx) => (job.runtime === 'javascript' && idx === 5 ? 'WA' : 'AC'));
    }
    const d = (await teacher.get(`/api/v1/questions/${questionId}`)).json();
    expect(d.status).toBe('invalid');
    expect(d.validation.ok).toBe(false);
    expect(d.validation.problems.join('\n')).toMatch(/javascript: reference solution fails/);
  });

  it('a clean validation run with publishIfValid publishes the question', async () => {
    await teacher.post(`/api/v1/questions/${questionId}/validate`, { publishIfValid: true });
    const jobs: ExecJob[] = [];
    for (let i = 0; i < Object.keys(q.templates).length; i++) jobs.push(await runFakeExecutor());
    // Validation jobs run the reference solution against samples + hidden tests.
    expect(jobs[0]!.tests).toHaveLength(2 + q.hidden.length);
    expect(jobs.map((j) => j.studentCode)).toContain(q.templates.python!.solution);
    const d = (await teacher.get(`/api/v1/questions/${questionId}`)).json();
    expect(d.validation.ok).toBe(true);
    expect(d.status).toBe('published');
  });
});

describe('dispatch sweeper', () => {
  it('re-queues a lost job once, and never duplicates one still waiting in the queue', async () => {
    // The app under test is built from dist, so its injection tokens come from there too.
    const { DispatchService } = await import('../dist/executor/dispatch.service.js');
    const { REDIS_RAW } = await import('../dist/infra/infra.module.js');
    const redis = t.app.get<Redis>(REDIS_RAW, { strict: false });
    const dispatch = t.app.get(DispatchService, { strict: false });
    const run = (await student.post('/api/v1/submissions', { questionId, runtime: 'python', code: 'def sum_array(a):\n    return 0\n', kind: 'run' })).json();
    const list = `${process.env.REDIS_PREFIX}exec:run`;
    const copies = async () => (await redis.lrange(list, 0, -1)).filter((x) => x === run.id).length;
    expect(await copies()).toBe(1);
    // No executor has claimed it for a while: the sweeper must not push it again and again.
    // Each sweep holds a 5 s lock (one API replica sweeps at a time); release it between sweeps.
    const sweep = async () => {
      await redis.del(`${process.env.REDIS_PREFIX}sweeper-lock`);
      return dispatch.sweep();
    };
    const age = () => systemQuery(t, `UPDATE hbe.submissions SET created_at = now() - interval '5 minutes', lease_until = NULL WHERE id = $1`, [run.id]);
    await age();
    expect((await sweep()).requeued).toBe(1);
    await age();
    expect((await sweep()).requeued).toBe(1);
    expect(await copies()).toBe(1);
    // The id was lost from Redis (restart, eviction): the sweeper pushes it back, once.
    await redis.lrem(list, 0, run.id);
    await age();
    await sweep();
    expect(await copies()).toBe(1);
    expect((await runFakeExecutor()).jobId).toBe(run.id); // drain, so later tests claim their own jobs
  });
});

describe('student view and submissions', () => {
  it('practice list and question view never expose hidden tests, drivers or solutions', async () => {
    const list = (await student.get('/api/v1/practice/questions')).json();
    expect(list.items.map((i: { id: string }) => i.id)).toContain(questionId);
    const view = await student.get(`/api/v1/practice/questions/${questionId}`);
    const body = view.body;
    expect(body).not.toContain('HIDDEN-SENTINEL');
    for (const tpl of Object.values(q.templates)) {
      expect(body).not.toContain(JSON.stringify(tpl.solution).slice(1, -1));
      expect(body).not.toContain(JSON.stringify(tpl.driver).slice(1, -1).slice(0, 60));
    }
    const v = view.json();
    expect(v.samples).toHaveLength(2);
    expect(v.runtimes.map((r: { id: string }) => r.id)).toEqual(['c', 'cpp', 'java', 'python', 'javascript', 'go', 'rust', 'csharp']);
    expect(v.runtimes.find((r: { id: string }) => r.id === 'python').timeLimitMs).toBe(3000);
    // The authoring endpoint is closed to students.
    expect((await student.get(`/api/v1/questions/${questionId}`)).statusCode).toBe(403);
  });

  it('another tenant’s student cannot see the question', async () => {
    expect((await other.get(`/api/v1/practice/questions/${questionId}`)).statusCode).toBe(404);
    expect((await other.post('/api/v1/submissions', { questionId, runtime: 'python', code: 'x', kind: 'run' })).statusCode).toBe(404);
  });

  it('run uses samples only; submit adds hidden tests; hidden results expose the verdict only', async () => {
    const run = (await student.post('/api/v1/submissions', { questionId, runtime: 'python', code: 'def sum_array(a):\n    return sum(a)\n', kind: 'run' })).json();
    const runJob = await runFakeExecutor();
    expect(runJob.jobId).toBe(run.id);
    expect(runJob.tests.every((x) => !x.hidden)).toBe(true);
    expect(runJob.tests).toHaveLength(2);

    const sub = (await student.post('/api/v1/submissions', { questionId, runtime: 'python', code: 'def sum_array(a):\n    return sum(a)\n', kind: 'submit' })).json();
    const job = await runFakeExecutor((j, i) => (i === 10 ? 'WA' : 'AC')); // the weight-2 sentinel test fails
    expect(job.tests.filter((x) => x.hidden)).toHaveLength(q.hidden.length);
    expect(job.driverCode).toBe(q.templates.python!.driver);

    const res = await student.get(`/api/v1/submissions/${sub.id}`);
    const s = res.json();
    expect(s).toMatchObject({ status: 'done', verdict: 'WA', passed: 11, total: 12 });
    // 11 of 12 hidden weight units passed (the failed test has weight 2): 9/11
    expect(s.score).toBeCloseTo((9 / 11) * 100, 1);
    for (const tr of s.tests.filter((x: { hidden: boolean }) => x.hidden)) expect(Object.keys(tr).sort()).toEqual(['hidden', 'ordinal', 'verdict']);
    expect(res.body).not.toContain('HIDDEN-SENTINEL');
    expect(res.body).not.toContain('should-not-be-stored');
    const stored = await systemQuery<{ hidden: number; leaked: number }>(t, `SELECT count(*) FILTER (WHERE hidden)::int AS hidden, count(*) FILTER (WHERE hidden AND (stdout IS NOT NULL OR stderr IS NOT NULL))::int AS leaked FROM hbe.submission_results`);
    expect(stored[0]!.hidden).toBeGreaterThan(0); // the query really sees the rows
    expect(stored[0]!.leaked).toBe(0);
  });

  it('custom input runs a single test without expected output', async () => {
    await student.post('/api/v1/submissions', { questionId, runtime: 'c', code: 'long long sum_array(int n, const long long *a){return 0;}', kind: 'run', customInput: '1\n5\n' });
    const job = await runFakeExecutor();
    expect(job.tests).toEqual([{ id: 'custom', ordinal: 1, hidden: false, input: '1\n5\n' }]);
    expect(job.limits.cpuMs).toBe(1000);
  });

  it('students cannot read other students’ submissions', async () => {
    const mine = (await student.post('/api/v1/submissions', { questionId, runtime: 'python', code: 'pass', kind: 'run' })).json();
    await runFakeExecutor();
    const classmate = new Client(t);
    await classmate.login(org.users.studentA2.email, PASSWORD).catch(() => undefined);
    const outsider = await other.get(`/api/v1/submissions/${mine.id}`);
    expect(outsider.statusCode).toBe(404);
    // The teacher of the same tenant can review it.
    expect((await teacher.get(`/api/v1/submissions/${mine.id}`)).statusCode).toBe(200);
  });

  it('SSE stream sends the current state and closes when done', async () => {
    const sub = (await student.post('/api/v1/submissions', { questionId, runtime: 'python', code: 'x', kind: 'run' })).json();
    await runFakeExecutor();
    const r = await student.get(`/api/v1/submissions/${sub.id}/events`);
    expect(r.headers['content-type']).toContain('text/event-stream');
    expect(r.body).toMatch(/event: submission\ndata: \{.*"status":"done"/);
  });

  it('drafts autosave per runtime and stay private', async () => {
    expect((await student.put(`/api/v1/drafts/${questionId}/python`, { code: 'draft code' })).statusCode).toBe(204);
    expect((await student.get(`/api/v1/drafts/${questionId}`)).json()).toMatchObject([{ runtime: 'python', code: 'draft code' }]);
    expect((await teacher.get(`/api/v1/drafts/${questionId}`)).json()).toEqual([]);
  });

  it('enforces the per-user submit rate limit', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await student.post('/api/v1/submissions', { questionId, runtime: 'python', code: `# ${i}`, kind: 'submit' })).statusCode);
    expect(codes).toContain(429);
  });
});

describe('request size limits', () => {
  const pad = 'x'.repeat(3 * 1024 * 1024);
  it('JSON bodies over 2 MB are refused (413), even on the sign-in route', async () => {
    expect((await new Client(t).post('/api/v1/auth/login', { email: 'nobody@alpha.edu', password: pad })).statusCode).toBe(413);
    expect((await student.put(`/api/v1/drafts/00000000-0000-0000-0000-000000000000/python`, { code: pad })).statusCode).toBe(413);
  });
  it('executor routes refuse a request without a valid token before reading its body', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/api/v1/internal/executor/claim', payload: { pad } });
    expect(r.statusCode).toBe(401);
  });
  it('question authoring still accepts large bodies (big stress tests): validated, not refused for size', async () => {
    expect((await teacher.post('/api/v1/questions', { title: 'too big?', pad })).statusCode).toBe(400);
  });
});

describe('executor boundary', () => {
  it('rejects executor calls without the bearer token, even with a browser session', async () => {
    const r = await teacher.post('/api/v1/internal/executor/claim', { executorId: 'x', runtimes: ['c'] });
    expect(r.statusCode).toBe(401);
    const wrong = await t.app.inject({ method: 'POST', url: '/api/v1/internal/executor/claim', headers: { authorization: 'Bearer nope-nope-nope-nope-nope-nope-nope-nope' }, payload: { executorId: 'x', runtimes: ['c'] } });
    expect(wrong.statusCode).toBe(401);
  });
  it('a result from an executor that does not hold the lease is refused', async () => {
    const sub = (await student.get('/api/v1/auth/me')).json();
    expect(sub.role).toBe('student');
    const r = await ex().result({ jobId: '00000000-0000-0000-0000-000000000000', compile: { ok: true, output: '', wallMs: 1 }, tests: [] });
    expect(r.statusCode).toBe(409);
  });
});
