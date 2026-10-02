/**
 * Phase 4: tests (assessments), attempts, proctoring and the realtime gateway.
 * Every rule is checked through the HTTP API (and the WebSocket) as each role would use it.
 */
import type { CodingJob } from '@hbe/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { sumArray } from '../../../packages/db/src/seed/questions/sum-array.js';
import { enrollMfa, PASSWORD, seedOrg, systemQuery, type Org } from './fixtures.js';
import { Client, executor, ORIGIN, startApp, type TestApp } from './harness.js';

let t: TestApp;
let org: Org;
let port = 0;
const c: Record<'teacherA' | 'associateA' | 'adminA' | 'studentA' | 'studentA_dev2' | 'studentA_dev3' | 'studentA2' | 'studentB' | 'teacherB', Client> = {} as never;
let questionId: string;
let batchId: string;
let sweep: () => Promise<{ finalized: number; gaps: number; snapshotsDeleted: number }>;
const ex = () => executor(t);
const H = 'x-attempt-token';
const iso = (minFromNow: number) => new Date(Date.now() + minFromNow * 60_000).toISOString();

const q = {
  ...sumArray,
  title: 'Exam: sum of an array',
  isPractice: false,
  hidden: sumArray.hidden.slice(0, 9).concat([{ input: '2\nEXAM-SENTINEL-IN 1\n', output: 'EXAM-SENTINEL-OUT\n', weight: 1, isStress: false }]),
};

/** Answer one claimed job: every test gets `verdict(i)`. */
async function fakeExecute(verdict: (i: number) => string = () => 'AC') {
  const r = await ex().claim();
  expect(r.statusCode).toBe(200);
  const job = r.json() as CodingJob;
  await ex().result({
    jobId: job.jobId,
    compile: { ok: true, output: '', wallMs: 5 },
    tests: job.tests.map((tc, i) => ({ id: tc.id, verdict: verdict(i), cpuMs: 1, wallMs: 1, memKb: 1, stdout: '', stderr: '' })),
  });
  return job;
}

const withToken = (cl: Client, method: string, url: string, token: string | undefined, body?: unknown) => cl.req(method, url, body ?? (method === 'GET' ? undefined : {}), token ? { [H]: token } : {});

async function makeTest(over: Record<string, unknown> = {}, assign: { batchIds?: string[]; userIds?: string[] } = { batchIds: [batchId] }) {
  const r = await c.teacherA.post('/api/v1/tests', { title: 'Mid-term', startsAt: iso(-1), endsAt: iso(120), durationMin: 60, questions: [{ questionId, points: 50 }], ...over });
  expect(r.statusCode, r.body).toBe(201);
  const id = r.json().id as string;
  expect((await c.teacherA.post(`/api/v1/tests/${id}/assign`, assign)).statusCode).toBe(200);
  const p = await c.teacherA.post(`/api/v1/tests/${id}/publish`);
  expect(p.statusCode, p.body).toBe(200);
  return id;
}

async function start(cl: Client, testId: string, token?: string) {
  const r = await withToken(cl, 'POST', `/api/v1/tests/${testId}/attempt`, token, { fingerprint: 'fp-test' });
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as { state: string; attemptId: string; token: string; requestId?: string; status?: string };
}

const events = (types: string[], at = Date.now()) => ({ events: types.map((type, i) => ({ type, clientTs: new Date(at + i * 10).toISOString() })) });
const eventTypes = async (attemptId: string) => (await systemQuery<{ type: string }>(t, 'SELECT type FROM hbe.proctor_events WHERE attempt_id = $1 ORDER BY id', [attemptId])).map((r) => r.type);

beforeAll(async () => {
  t = await startApp();
  await t.app.listen({ port: 0, host: '127.0.0.1' });
  port = (t.app.getHttpServer().address() as { port: number }).port;
  const { AttemptsService } = await import('../dist/tests/attempts.service.js');
  const svc = t.app.get(AttemptsService);
  sweep = () => svc.sweep();
  org = await seedOrg(t);
  const login = async (email: string) => {
    const cl = new Client(t);
    await cl.login(email, PASSWORD);
    return cl;
  };
  c.teacherA = await login(org.users.teacherA.email);
  c.associateA = await login(org.users.associateA.email);
  c.adminA = await login(org.users.clientAdminA.email);
  await enrollMfa(c.adminA);
  c.studentA = await login(org.users.studentA.email);
  c.studentA_dev2 = await login(org.users.studentA.email);
  c.studentA_dev3 = await login(org.users.studentA.email);
  c.studentA2 = await login(org.users.studentA2.email);
  c.studentB = await login(org.users.studentB.email);
  c.teacherB = await login(org.users.teacherB.email);

  // An exam-only question, validated (fake executor) and published.
  questionId = (await c.teacherA.post('/api/v1/questions', q)).json().id;
  await c.teacherA.post(`/api/v1/questions/${questionId}/validate`, { publishIfValid: true });
  for (let i = 0; i < Object.keys(q.templates).length; i++) await fakeExecute();
  expect((await c.teacherA.get(`/api/v1/questions/${questionId}`)).json().status).toBe('published');
  batchId = (await c.teacherA.post('/api/v1/batches', { name: 'Exam batch' })).json().id;
  await c.teacherA.post(`/api/v1/batches/${batchId}/members`, { userIds: [org.users.studentA.id] });
});
afterAll(async () => {
  await t?.close();
});

describe('test authoring, RBAC and tenant isolation', () => {
  let draftId: string;
  it('only teachers create tests; students, associates and institution admins cannot', async () => {
    const body = { title: 'RBAC probe', startsAt: iso(-1), endsAt: iso(60), durationMin: 30, questions: [{ questionId, points: 10 }] };
    for (const who of ['studentA', 'associateA', 'adminA'] as const) expect((await c[who].post('/api/v1/tests', body)).statusCode).toBe(403);
    const r = await c.teacherA.post('/api/v1/tests', body);
    expect(r.statusCode).toBe(201);
    draftId = r.json().id;
  });
  it('rejects bad windows and unknown or foreign questions', async () => {
    expect((await c.teacherA.post('/api/v1/tests', { title: 'Bad window', startsAt: iso(10), endsAt: iso(5), durationMin: 30, questions: [{ questionId }] })).statusCode).toBe(400);
    expect((await c.teacherB.post('/api/v1/tests', { title: 'Foreign q', startsAt: iso(0), endsAt: iso(60), durationMin: 30, questions: [{ questionId }] })).statusCode).toBe(400);
  });
  it('publishing needs an assignment, and assignments only take own-tenant students/batches', async () => {
    expect((await c.teacherA.post(`/api/v1/tests/${draftId}/publish`)).statusCode).toBe(400);
    expect((await c.teacherA.post(`/api/v1/tests/${draftId}/assign`, { userIds: [org.users.studentB.id] })).statusCode).toBe(400);
    expect((await c.teacherA.post(`/api/v1/tests/${draftId}/assign`, { userIds: [org.users.teacherA.id] })).statusCode).toBe(400);
  });
  it('another tenant gets 404 on every test endpoint; students get 403 on staff endpoints', async () => {
    const id = draftId;
    const calls: [string, string, unknown?][] = [
      ['GET', `/api/v1/tests/${id}`], ['GET', `/api/v1/tests/${id}/live`], ['PUT', `/api/v1/tests/${id}`, { title: 'pwned', startsAt: iso(0), endsAt: iso(60), durationMin: 5, questions: [{ questionId }] }],
      ['POST', `/api/v1/tests/${id}/assign`, { userIds: [] }], ['POST', `/api/v1/tests/${id}/publish`], ['POST', `/api/v1/tests/${id}/close`], ['DELETE', `/api/v1/tests/${id}`],
    ];
    for (const [m, url, body] of calls) {
      const r = await c.teacherB.req(m, url, body ?? (m === 'GET' ? undefined : {}));
      expect([m, url, r.statusCode]).toEqual([m, url, 404]);
    }
    expect((await c.studentA.get('/api/v1/tests')).statusCode).toBe(403);
    expect((await c.studentA.get(`/api/v1/tests/${id}/live`)).statusCode).toBe(403);
    expect((await c.teacherB.get('/api/v1/tests')).json().map((x: { id: string }) => x.id)).not.toContain(id);
  });
  it('drafts can be deleted; published tests cannot be edited', async () => {
    expect((await c.teacherA.del(`/api/v1/tests/${draftId}`)).statusCode).toBe(204);
    const id = await makeTest({ title: 'Locked once published' });
    expect((await c.teacherA.put(`/api/v1/tests/${id}`, { title: 'changed', startsAt: iso(0), endsAt: iso(60), durationMin: 5, questions: [{ questionId }] })).statusCode).toBe(409);
    expect((await c.teacherA.del(`/api/v1/tests/${id}`)).statusCode).toBe(409);
    // The question version is pinned at publish time.
    const d = (await c.teacherA.get(`/api/v1/tests/${id}`)).json();
    expect(d.questions[0].versionId).toBeTruthy();
  });
});

describe('student flow, single device and second-device approval', () => {
  let testId: string;
  let attemptId: string;
  let tok1: string;
  let tok2: string;

  it('students see only tests assigned to them', async () => {
    testId = await makeTest({ title: 'Device test' });
    expect((await c.studentA.get('/api/v1/my/tests')).json().map((x: { id: string }) => x.id)).toContain(testId);
    expect((await c.studentA2.get('/api/v1/my/tests')).json().map((x: { id: string }) => x.id)).not.toContain(testId);
    expect((await c.studentB.get('/api/v1/my/tests')).json()).toEqual([]);
    // Unassigned students cannot start it; the exam question is unreachable via practice.
    expect((await c.studentA2.post(`/api/v1/tests/${testId}/attempt`, {})).statusCode).toBe(404);
    expect((await c.studentB.post(`/api/v1/tests/${testId}/attempt`, {})).statusCode).toBe(404);
    expect((await c.studentA.get(`/api/v1/practice/questions/${questionId}`)).statusCode).toBe(404);
    expect((await c.teacherA.post(`/api/v1/tests/${testId}/attempt`, {})).statusCode).toBe(403);
  });

  it('starting gives a device token; the attempt is usable only with it', async () => {
    const s = await start(c.studentA, testId);
    expect(s.state).toBe('active');
    ({ attemptId, token: tok1 } = s);
    const view = await withToken(c.studentA, 'GET', `/api/v1/attempts/${attemptId}`, tok1);
    expect(view.statusCode).toBe(200);
    const v = view.json();
    expect(v.questions).toHaveLength(1);
    expect(v.questions[0].title).toBe(q.title);
    expect(Date.parse(v.deadlineAt) - Date.parse(v.startedAt)).toBeLessThanOrEqual(60 * 60_000 + 1000);
    expect((await withToken(c.studentA, 'GET', `/api/v1/attempts/${attemptId}`, undefined)).statusCode).toBe(409);
    expect((await withToken(c.studentA, 'GET', `/api/v1/attempts/${attemptId}`, 'forged-token')).json().detail).toBe('session_inactive');
    expect(await eventTypes(attemptId)).toContain('session_rejected');
    // Same device again (reload): same token, still active.
    expect((await start(c.studentA, testId, tok1)).state).toBe('active');
    // Other students cannot touch it.
    expect((await withToken(c.studentA2, 'GET', `/api/v1/attempts/${attemptId}`, tok1)).statusCode).toBe(404);
    expect((await withToken(c.studentB, 'GET', `/api/v1/attempts/${attemptId}`, tok1)).statusCode).toBe(404);
  });

  it('the question view inside the attempt has no hidden data, driver or solution', async () => {
    const r = await withToken(c.studentA, 'GET', `/api/v1/attempts/${attemptId}/questions/${questionId}`, tok1);
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toContain('EXAM-SENTINEL');
    for (const tpl of Object.values(q.templates)) {
      expect(r.body).not.toContain(JSON.stringify(tpl.solution).slice(1, -1));
      expect(r.body).not.toContain(JSON.stringify(tpl.driver).slice(1, -1).slice(0, 60));
    }
    expect(r.json().samples).toHaveLength(2);
  });

  it('a second device is blocked (pending) and can do nothing until approved', async () => {
    const s = await start(c.studentA_dev2, testId);
    expect(s.state).toBe('pending');
    tok2 = s.token;
    expect((await withToken(c.studentA_dev2, 'GET', `/api/v1/attempts/${attemptId}`, tok2)).statusCode).toBe(409);
    expect((await withToken(c.studentA_dev2, 'GET', `/api/v1/attempts/${attemptId}/questions/${questionId}`, tok2)).statusCode).toBe(409);
    expect((await withToken(c.studentA_dev2, 'POST', '/api/v1/submissions', tok2, { questionId, runtime: 'python', code: 'x', kind: 'run', attemptId })).statusCode).toBe(409);
    // Not through practice either.
    expect((await c.studentA_dev2.post('/api/v1/submissions', { questionId, runtime: 'python', code: 'x', kind: 'run' })).statusCode).toBe(404);
    expect((await start(c.studentA_dev2, testId, tok2)).state).toBe('pending');
    const live = (await c.associateA.get(`/api/v1/tests/${testId}/live`)).json();
    const row = live.rows.find((r: { userId: string }) => r.userId === org.users.studentA.id);
    expect(row.attempt.pendingDevices).toHaveLength(1);
    expect(row.attempt.lastFlag.type).toBe('device_request');
  });

  it('only proctors of the same tenant can decide; approval moves the attempt to the new device', async () => {
    const live = (await c.associateA.get(`/api/v1/tests/${testId}/live`)).json();
    const reqId = live.rows.find((r: { userId: string }) => r.userId === org.users.studentA.id).attempt.pendingDevices[0].id;
    expect((await c.teacherB.post(`/api/v1/attempts/${attemptId}/devices/${reqId}/approve`)).statusCode).toBe(404);
    expect((await c.studentA.post(`/api/v1/attempts/${attemptId}/devices/${reqId}/approve`)).statusCode).toBe(403);
    expect((await c.associateA.post(`/api/v1/attempts/${attemptId}/devices/${reqId}/approve`)).statusCode).toBe(200);
    expect((await c.associateA.post(`/api/v1/attempts/${attemptId}/devices/${reqId}/approve`)).statusCode).toBe(409);
    expect((await start(c.studentA_dev2, testId, tok2)).state).toBe('active');
    expect((await withToken(c.studentA_dev2, 'GET', `/api/v1/attempts/${attemptId}`, tok2)).statusCode).toBe(200);
    const old = await withToken(c.studentA, 'GET', `/api/v1/attempts/${attemptId}`, tok1);
    expect([old.statusCode, old.json().detail]).toEqual([409, 'session_replaced']);
  });

  it('a denied device stays denied', async () => {
    const s = await start(c.studentA_dev3, testId);
    expect(s.state).toBe('pending');
    expect((await c.teacherA.post(`/api/v1/attempts/${attemptId}/devices/${s.requestId}/deny`)).statusCode).toBe(200);
    expect((await start(c.studentA_dev3, testId, s.token)).state).toBe('denied');
    expect((await withToken(c.studentA_dev3, 'GET', `/api/v1/attempts/${attemptId}`, s.token)).statusCode).toBe(409);
  });

  it('submissions count toward the attempt: best submit score × points', async () => {
    const sub = async (verdictFor: (i: number) => string) => {
      const r = await withToken(c.studentA_dev2, 'POST', '/api/v1/submissions', tok2, { questionId, runtime: 'python', code: 'def sum_array(a):\n    return sum(a)\n', kind: 'submit', attemptId });
      expect(r.statusCode, r.body).toBe(202);
      const job = await fakeExecute(verdictFor);
      expect(job.tests).toHaveLength(12); // the pinned version: 2 samples + 10 hidden
    };
    await sub((i) => (i < 7 ? 'AC' : 'WA')); // 5 of 10 hidden pass
    await sub((i) => (i < 2 ? 'AC' : 'WA')); // worse, must not lower the score
    const v = (await withToken(c.studentA_dev2, 'GET', `/api/v1/attempts/${attemptId}`, tok2)).json();
    expect(v.questions[0]).toMatchObject({ bestScore: 50, submissions: 2 });
    const live = (await c.teacherA.get(`/api/v1/tests/${testId}/live`)).json();
    expect(live.rows.find((r: { userId: string }) => r.userId === org.users.studentA.id).attempt).toMatchObject({ score: 25, maxScore: 50, answered: 1 });
  });

  it('drafts autosave inside the attempt and stay private', async () => {
    expect((await withToken(c.studentA_dev2, 'PUT', `/api/v1/attempts/${attemptId}/drafts/${questionId}/python`, tok2, { code: 'def sum_array(a):\n    return 42\n' })).statusCode).toBe(204);
    expect((await withToken(c.studentA_dev2, 'GET', `/api/v1/attempts/${attemptId}/drafts/${questionId}`, tok2)).json()[0].code).toContain('42');
    expect((await withToken(c.studentA, 'PUT', `/api/v1/attempts/${attemptId}/drafts/${questionId}/python`, tok1, { code: 'old device' })).statusCode).toBe(409);
  });

  it('finishing grades the final draft (newer than the last submit) and closes the attempt', async () => {
    const r = await withToken(c.studentA_dev2, 'POST', `/api/v1/attempts/${attemptId}/submit`, tok2);
    expect(r.json()).toEqual({ status: 'submitted' });
    const job = await fakeExecute(() => 'AC');
    expect(job.studentCode).toContain('return 42');
    const v = (await withToken(c.studentA_dev2, 'GET', `/api/v1/attempts/${attemptId}`, tok2)).json();
    expect(v).toMatchObject({ status: 'submitted', score: 50, maxScore: 50 });
    // A finished attempt accepts nothing more, and the question is hidden again.
    expect((await withToken(c.studentA_dev2, 'POST', '/api/v1/submissions', tok2, { questionId, runtime: 'python', code: 'x', kind: 'submit', attemptId })).statusCode).toBe(409);
    expect((await withToken(c.studentA_dev2, 'GET', `/api/v1/attempts/${attemptId}/questions/${questionId}`, tok2)).statusCode).toBe(409);
    expect((await start(c.studentA_dev2, testId, tok2))).toMatchObject({ state: 'ended', status: 'submitted' });
    const my = (await c.studentA.get('/api/v1/my/tests')).json().find((x: { id: string }) => x.id === testId);
    expect(my.attempt).toMatchObject({ status: 'submitted', score: 50 });
  });
});

describe('server-side time (timer tampering)', () => {
  let testId: string;
  let attemptId: string;
  let tok: string;

  it('the deadline comes from the server and ignores anything the client sends', async () => {
    testId = await makeTest({ title: 'Timer test', durationMin: 30 }, { userIds: [org.users.studentA2.id] });
    const s = await start(c.studentA2, testId);
    ({ attemptId, token: tok } = s);
    const before = (await withToken(c.studentA2, 'GET', `/api/v1/attempts/${attemptId}`, tok)).json().deadlineAt;
    // Extra fields (a forged deadline, a fake clock) are stripped by validation.
    const hb = await withToken(c.studentA2, 'POST', `/api/v1/attempts/${attemptId}/heartbeat`, tok, { visible: true, focused: true, fullscreen: true, eventsSent: 0, deadlineAt: iso(600), serverNow: iso(-600) });
    expect(hb.statusCode).toBe(200);
    expect(hb.json().deadlineAt).toBe(before);
    expect((await withToken(c.studentA2, 'POST', `/api/v1/attempts/${attemptId}/events`, tok, { events: [{ type: 'tab_visible', clientTs: '2000-01-01T00:00:00Z' }] })).statusCode).toBe(200);
    const [ev] = await systemQuery<{ client_ts: Date | null }>(t, `SELECT client_ts FROM hbe.proctor_events WHERE attempt_id = $1 AND type = 'tab_visible'`, [attemptId]);
    expect(ev!.client_ts).toBeNull(); // implausible client clock is not trusted
    // Students cannot extend their own time.
    expect((await c.studentA2.post(`/api/v1/attempts/${attemptId}/extend`, { minutes: 60 })).statusCode).toBe(403);
    expect((await withToken(c.studentA2, 'GET', `/api/v1/attempts/${attemptId}`, tok)).json().deadlineAt).toBe(before);
  });

  it('after the deadline, submissions and drafts are refused even with a valid device token', async () => {
    await withToken(c.studentA2, 'PUT', `/api/v1/attempts/${attemptId}/drafts/${questionId}/python`, tok, { code: 'def sum_array(a):\n    return sum(a)  # final\n' });
    await systemQuery(t, `UPDATE hbe.attempts SET deadline_at = now() - interval '5 seconds' WHERE id = $1`, [attemptId]);
    const r = await withToken(c.studentA2, 'POST', '/api/v1/submissions', tok, { questionId, runtime: 'python', code: 'late', kind: 'submit', attemptId });
    expect([r.statusCode, r.json().detail]).toEqual([409, 'attempt_closed']);
    // The lazy check finalised it already (the sweeper does the same for idle attempts).
    const v = (await withToken(c.studentA2, 'GET', `/api/v1/attempts/${attemptId}`, tok)).json();
    expect(v).toMatchObject({ status: 'auto_submitted' });
    const reason = await systemQuery<{ submit_reason: string }>(t, 'SELECT submit_reason FROM hbe.attempts WHERE id = $1', [attemptId]);
    expect(reason[0]!.submit_reason).toBe('deadline');
    // The final draft was submitted for grading on the student's behalf.
    const job = await fakeExecute();
    expect(job.studentCode).toContain('# final');
    expect((await withToken(c.studentA2, 'PUT', `/api/v1/attempts/${attemptId}/drafts/${questionId}/python`, tok, { code: 'later' })).statusCode).toBe(409);
  });

  it('the sweeper auto-submits idle attempts at the deadline', async () => {
    const id2 = await makeTest({ title: 'Sweeper test' }, { userIds: [org.users.studentA2.id] });
    const s = await start(c.studentA2, id2);
    await systemQuery(t, `UPDATE hbe.attempts SET deadline_at = now() - interval '5 seconds' WHERE id = $1`, [s.attemptId]);
    const r = await sweep();
    expect(r.finalized).toBeGreaterThanOrEqual(1);
    const [a] = await systemQuery<{ status: string; submit_reason: string }>(t, 'SELECT status, submit_reason FROM hbe.attempts WHERE id = $1', [s.attemptId]);
    expect(a).toEqual({ status: 'auto_submitted', submit_reason: 'deadline' });
  });

  it('the deadline never exceeds the test window', async () => {
    const id3 = await makeTest({ title: 'Short window', startsAt: iso(-1), endsAt: iso(10), durationMin: 120 }, { userIds: [org.users.studentA2.id] });
    const s = await start(c.studentA2, id3);
    const v = (await withToken(c.studentA2, 'GET', `/api/v1/attempts/${s.attemptId}`, s.token)).json();
    expect(Date.parse(v.deadlineAt)).toBeLessThanOrEqual(Date.parse(iso(10)) + 1000);
  });

  it('a test that has not started yet cannot be opened', async () => {
    const r = await c.teacherA.post('/api/v1/tests', { title: 'Future test', startsAt: iso(60), endsAt: iso(120), durationMin: 30, questions: [{ questionId }] });
    const id = r.json().id;
    await c.teacherA.post(`/api/v1/tests/${id}/assign`, { userIds: [org.users.studentA2.id] });
    await c.teacherA.post(`/api/v1/tests/${id}/publish`);
    const s = await c.studentA2.post(`/api/v1/tests/${id}/attempt`, {});
    expect([s.statusCode, s.json().detail]).toEqual([409, 'This test has not started yet.']);
  });
});

describe('proctoring events and the violation policy', () => {
  let testId: string;
  let attemptId: string;
  let tok: string;

  it('severity and counting are decided by the server; a tab switch + blur counts once', async () => {
    testId = await makeTest({ title: 'Policy test', settings: { violations: { warnAt: 1, finalWarnAt: 2, autoSubmitAt: 3 } } }, { userIds: [org.users.studentA2.id] });
    ({ attemptId, token: tok } = await start(c.studentA2, testId));
    const r = await withToken(c.studentA2, 'POST', `/api/v1/attempts/${attemptId}/events`, tok, events(['tab_hidden', 'window_blur', 'tab_visible', 'mouse_leave']));
    expect(r.json()).toMatchObject({ violationCount: 1, warningLevel: 1 });
    // Severity is not accepted from the client (unknown fields are stripped; unknown types rejected).
    expect((await withToken(c.studentA2, 'POST', `/api/v1/attempts/${attemptId}/events`, tok, { events: [{ type: 'made_up', clientTs: iso(0) }] })).statusCode).toBe(400);
    const v = (await withToken(c.studentA2, 'GET', `/api/v1/attempts/${attemptId}`, tok)).json();
    expect(v.notices[0].message).toMatch(/Warning: 1 proctoring violation/);
  });

  it('repeats of the same type within 3 s are logged but counted once', async () => {
    const r = await withToken(c.studentA2, 'POST', `/api/v1/attempts/${attemptId}/events`, tok, events(['paste', 'paste', 'paste']));
    expect(r.json()).toMatchObject({ violationCount: 2, warningLevel: 2 });
    const rows = await systemQuery<{ n: number }>(t, `SELECT count(*)::int AS n FROM hbe.proctor_events WHERE attempt_id = $1 AND type = 'paste'`, [attemptId]);
    expect(rows[0]!.n).toBe(3);
  });

  it('a heartbeat that claims more events than the server stored is flagged (tampered agent)', async () => {
    await withToken(c.studentA2, 'POST', `/api/v1/attempts/${attemptId}/heartbeat`, tok, { visible: true, focused: true, fullscreen: true, eventsSent: 50 });
    expect(await eventTypes(attemptId)).toContain('events_missing');
  });

  it('missing heartbeats are flagged by the sweeper, and cleared when they resume', async () => {
    await systemQuery(t, `UPDATE hbe.attempts SET last_heartbeat_at = now() - interval '2 minutes' WHERE id = $1`, [attemptId]);
    expect((await sweep()).gaps).toBeGreaterThanOrEqual(1);
    let live = (await c.teacherA.get(`/api/v1/tests/${testId}/live`)).json();
    expect(live.rows.find((r: { userId: string }) => r.userId === org.users.studentA2.id).attempt).toMatchObject({ heartbeatGap: true, online: false });
    await withToken(c.studentA2, 'POST', `/api/v1/attempts/${attemptId}/heartbeat`, tok, { visible: true, focused: true, fullscreen: true, eventsSent: 100 });
    live = (await c.teacherA.get(`/api/v1/tests/${testId}/live`)).json();
    expect(live.rows.find((r: { userId: string }) => r.userId === org.users.studentA2.id).attempt).toMatchObject({ heartbeatGap: false, online: true });
    expect(await eventTypes(attemptId)).toEqual(expect.arrayContaining(['heartbeat_gap', 'heartbeat_resumed']));
  });

  it('reaching the auto-submit threshold ends the attempt server-side', async () => {
    const r = await withToken(c.studentA2, 'POST', `/api/v1/attempts/${attemptId}/events`, tok, events(['fullscreen_exit']));
    expect(r.json()).toMatchObject({ violationCount: 3, status: 'auto_submitted' });
    const [a] = await systemQuery<{ status: string; submit_reason: string }>(t, 'SELECT status, submit_reason FROM hbe.attempts WHERE id = $1', [attemptId]);
    expect(a).toEqual({ status: 'auto_submitted', submit_reason: 'violations' });
    expect((await withToken(c.studentA2, 'POST', `/api/v1/attempts/${attemptId}/events`, tok, events(['copy']))).statusCode).toBe(409);
  });

  it('the timeline is staff-only and tenant-isolated', async () => {
    const tl = await c.associateA.get(`/api/v1/attempts/${attemptId}/timeline`);
    expect(tl.statusCode).toBe(200);
    expect(tl.json().events.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(['attempt_started', 'tab_hidden', 'warning_issued', 'auto_submitted']));
    expect((await c.teacherB.get(`/api/v1/attempts/${attemptId}/timeline`)).statusCode).toBe(404);
    expect((await c.studentA2.get(`/api/v1/attempts/${attemptId}/timeline`)).statusCode).toBe(403);
  });
});

describe('proctor actions', () => {
  let testId: string;
  let attemptId: string;
  let tok: string;
  it('warn, extend time and terminate — audited, staff of the tenant only', async () => {
    testId = await makeTest({ title: 'Actions test' }, { userIds: [org.users.studentA2.id] });
    ({ attemptId, token: tok } = await start(c.studentA2, testId));
    const before = Date.parse((await withToken(c.studentA2, 'GET', `/api/v1/attempts/${attemptId}`, tok)).json().deadlineAt);
    expect((await c.teacherB.post(`/api/v1/attempts/${attemptId}/extend`, { minutes: 10 })).statusCode).toBe(404);
    expect((await c.teacherB.post(`/api/v1/attempts/${attemptId}/warn`, { message: 'x' })).statusCode).toBe(404);
    expect((await c.teacherB.post(`/api/v1/attempts/${attemptId}/terminate`, { reason: 'x' })).statusCode).toBe(404);
    expect((await c.associateA.post(`/api/v1/attempts/${attemptId}/extend`, { minutes: 10 })).statusCode).toBe(200);
    const after = Date.parse((await withToken(c.studentA2, 'GET', `/api/v1/attempts/${attemptId}`, tok)).json().deadlineAt);
    expect(after - before).toBe(10 * 60_000);
    expect((await c.adminA.post(`/api/v1/attempts/${attemptId}/warn`, { message: 'Eyes on your screen, please.' })).statusCode).toBe(200);
    const hb = (await withToken(c.studentA2, 'POST', `/api/v1/attempts/${attemptId}/heartbeat`, tok, { visible: true, focused: true, fullscreen: true, eventsSent: 0 })).json();
    expect(hb.notices[0].message).toBe('Eyes on your screen, please.');
    expect((await c.teacherA.post(`/api/v1/attempts/${attemptId}/terminate`, { reason: 'Phone on desk' })).statusCode).toBe(200);
    expect((await withToken(c.studentA2, 'GET', `/api/v1/attempts/${attemptId}`, tok)).json().status).toBe('terminated');
    const actions = (await systemQuery<{ action: string }>(t, `SELECT action FROM hbe.audit_logs WHERE entity_id = $1`, [attemptId])).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['attempt.start', 'attempt.extend', 'attempt.warn', 'attempt.terminate']));
  });

  it('closing the test finalises every open attempt', async () => {
    const id = await makeTest({ title: 'Close test' }, { userIds: [org.users.studentA2.id] });
    const s = await start(c.studentA2, id);
    expect((await c.associateA.post(`/api/v1/tests/${id}/close`)).statusCode).toBe(403); // test:manage only
    expect((await c.teacherA.post(`/api/v1/tests/${id}/close`)).json()).toEqual({ status: 'closed', finalized: 1 });
    const [a] = await systemQuery<{ status: string; submit_reason: string }>(t, 'SELECT status, submit_reason FROM hbe.attempts WHERE id = $1', [s.attemptId]);
    expect(a).toEqual({ status: 'auto_submitted', submit_reason: 'test_closed' });
  });
});

describe('webcam snapshots (only when flagged)', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');
  it('are refused when the test has no webcam setting', async () => {
    const id = await makeTest({ title: 'No webcam' }, { userIds: [org.users.studentA2.id] });
    const s = await start(c.studentA2, id);
    expect((await withToken(c.studentA2, 'POST', `/api/v1/attempts/${s.attemptId}/snapshots`, s.token, { eventType: 'tab_hidden', image: jpeg })).statusCode).toBe(403);
  });
  it('need a flagged event in the last minute and a real JPEG; only proctors can view them (audited)', async () => {
    const id = await makeTest({ title: 'Webcam test', settings: { webcam: 'flagged' } }, { userIds: [org.users.studentA2.id] });
    const s = await start(c.studentA2, id);
    const url = `/api/v1/attempts/${s.attemptId}/snapshots`;
    expect((await withToken(c.studentA2, 'POST', url, s.token, { eventType: 'tab_hidden', image: jpeg })).statusCode).toBe(409);
    await withToken(c.studentA2, 'POST', `/api/v1/attempts/${s.attemptId}/events`, s.token, events(['tab_hidden']));
    expect((await withToken(c.studentA2, 'POST', url, s.token, { eventType: 'tab_hidden', image: Buffer.from('not a jpeg').toString('base64') })).statusCode).toBe(400);
    const ok = await withToken(c.studentA2, 'POST', url, s.token, { eventType: 'tab_hidden', image: jpeg });
    expect(ok.statusCode).toBe(201);
    const snapId = ok.json().id;
    expect((await c.studentA2.get(`${url}/${snapId}`)).statusCode).toBe(403);
    expect((await c.teacherB.get(`${url}/${snapId}`)).statusCode).toBe(404);
    const img = await c.teacherA.get(`${url}/${snapId}`);
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.rawPayload.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect((await systemQuery<{ action: string }>(t, `SELECT action FROM hbe.audit_logs WHERE action = 'snapshot.view'`)).length).toBe(1);
  });
  it('are deleted by the retention sweep', async () => {
    await systemQuery(t, `UPDATE hbe.proctor_snapshots SET created_at = now() - interval '31 days'`);
    expect((await sweep()).snapshotsDeleted).toBe(1);
  });
});

describe('WebSocket gateway', () => {
  const wsUrl = () => `ws://127.0.0.1:${port}/api/v1/ws`;
  const cookieOf = (cl: Client) => [...cl.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  const open = (headers: Record<string, string>) =>
    new Promise<{ ws: WebSocket; msgs: unknown[] }>((resolve, reject) => {
      const ws = new WebSocket(wsUrl(), { headers });
      const msgs: unknown[] = [];
      ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
      ws.on('open', () => resolve({ ws, msgs }));
      ws.on('unexpected-response', (_req, res) => reject(new Error(`status ${res.statusCode}`)));
      ws.on('error', reject);
    });
  const until = async (msgs: unknown[], pred: (m: Record<string, unknown>) => boolean) => {
    for (let i = 0; i < 100; i++) {
      if (msgs.some((m) => pred(m as Record<string, unknown>))) return;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error(`message not received; got ${JSON.stringify(msgs)}`);
  };

  it('rejects other origins and unauthenticated upgrades', async () => {
    await expect(open({ origin: 'https://evil.example', cookie: cookieOf(c.studentA2) })).rejects.toThrow('status 403');
    await expect(open({ cookie: cookieOf(c.studentA2) })).rejects.toThrow('status 403');
    await expect(open({ origin: ORIGIN })).rejects.toThrow('status 401');
  });

  it('pushes deadline changes to the active device and change pings to the tenant’s proctors only', async () => {
    const id = await makeTest({ title: 'WS test' }, { userIds: [org.users.studentA2.id] });
    const s = await start(c.studentA2, id);
    const student = await open({ origin: ORIGIN, cookie: cookieOf(c.studentA2) });
    student.ws.send(JSON.stringify({ op: 'sub', channel: 'attempt', attemptId: s.attemptId, token: 'wrong' }));
    await until(student.msgs, (m) => m.type === 'error');
    student.ws.send(JSON.stringify({ op: 'sub', channel: 'attempt', attemptId: s.attemptId, token: s.token }));
    await until(student.msgs, (m) => m.type === 'subscribed');
    // Students cannot watch the monitor channel.
    student.ws.send(JSON.stringify({ op: 'sub', channel: 'monitor', testId: id }));
    await until(student.msgs, (m) => m.type === 'error' && student.msgs.filter((x) => (x as { type: string }).type === 'error').length === 2);

    const proctor = await open({ origin: ORIGIN, cookie: cookieOf(c.teacherA) });
    proctor.ws.send(JSON.stringify({ op: 'sub', channel: 'monitor', testId: id }));
    await until(proctor.msgs, (m) => m.type === 'subscribed');
    const outsider = await open({ origin: ORIGIN, cookie: cookieOf(c.teacherB) });
    outsider.ws.send(JSON.stringify({ op: 'sub', channel: 'monitor', testId: id }));
    await until(outsider.msgs, (m) => m.type === 'error');

    await c.teacherA.post(`/api/v1/attempts/${s.attemptId}/extend`, { minutes: 5 });
    await until(student.msgs, (m) => m.type === 'deadline');
    await until(proctor.msgs, (m) => m.type === 'attempt_changed' && m.attemptId === s.attemptId);
    await withToken(c.studentA2, 'POST', `/api/v1/attempts/${s.attemptId}/events`, s.token, events(['copy']));
    await until(student.msgs, (m) => m.type === 'violations');
    expect(outsider.msgs.filter((m) => (m as { type: string }).type === 'attempt_changed')).toEqual([]);
    for (const x of [student, proctor, outsider]) x.ws.close();
  });
});

describe('audit', () => {
  it('records test and attempt lifecycle actions', async () => {
    const actions = (await systemQuery<{ action: string }>(t, 'SELECT DISTINCT action FROM hbe.audit_logs')).map((r) => r.action);
    for (const a of ['test.create', 'test.assign', 'test.publish', 'test.delete', 'test.close', 'attempt.start', 'attempt.device_request', 'attempt.device_approve', 'attempt.device_deny', 'attempt.submit', 'attempt.auto_submit', 'attempt.terminate']) {
      expect(actions).toContain(a);
    }
  });
});
