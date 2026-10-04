/**
 * Phase 6: rollups (incremental = rebuilt), report numbers, scopes, exports, plagiarism.
 */
import { randomUUID } from 'node:crypto';
import { readWorkbook } from '@hbe/question-format';
import type { CodingJob } from '@hbe/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sumArray } from '../../../packages/db/src/seed/questions/sum-array.js';
import { enrollMfa, PASSWORD, seedOrg, systemQuery, type Org } from './fixtures.js';
import { Client, executor, startApp, type TestApp } from './harness.js';

let t: TestApp;
let org: Org;
const c: Record<string, Client> = {};
let questionId: string;
let testId: string;
let batchId: string;
const extra: { id: string; email: string }[] = [];
const H = 'x-attempt-token';

const COPY_A = 'def sum_array(a):\n    total = 0\n    for value in a:\n        if value is not None:\n            total = total + value\n        else:\n            total = total + 0\n    return total\n';
const COPY_B = 'def sum_array(numbers):\n    # my solution\n    s = 0\n    for x in numbers:\n        if x is not None:\n            s = s + x\n        else:\n            s = s + 0\n    return s\n';
const OWN = 'def sum_array(a):\n    import functools\n    return functools.reduce(lambda p, q: p + q, a, 0)\n';

/** Fake executor: answers the next claimed job; hidden tests pass according to `pass(i)`. */
async function grade(pass: (i: number) => boolean = () => true) {
  const r = await executor(t).claim();
  expect(r.statusCode).toBe(200);
  const job = r.json() as CodingJob;
  await executor(t).result({ jobId: job.jobId, compile: { ok: true, output: '', wallMs: 1 }, tests: job.tests.map((x, i) => ({ id: x.id, verdict: pass(i) ? 'AC' : 'WA', cpuMs: 1, wallMs: 1, memKb: 1, stdout: '', stderr: '' })) });
  return job;
}
const rollups = async () => ({
  q: await systemQuery(t, 'SELECT tenant_id, question_id, day, runtime, runs, submits, accepted, score_sum::text, verdicts FROM hbe.rpt_question_daily ORDER BY 1, 2, 3, 4'),
  s: await systemQuery(t, 'SELECT tenant_id, user_id, question_id, runs, submits, best_score::text, solved, first_solved_at, last_at FROM hbe.rpt_student_question ORDER BY 1, 2, 3'),
  d: await systemQuery(t, 'SELECT tenant_id, day, runs, submits, accepted, active_users FROM hbe.rpt_tenant_daily ORDER BY 1, 2'),
  a: await systemQuery(t, 'SELECT tenant_id, user_id, last_at FROM hbe.rpt_user_activity ORDER BY 1, 2'),
  tq: await systemQuery(t, 'SELECT tenant_id, question_id, students, solved FROM hbe.rpt_question_totals ORDER BY 1, 2'),
  u: await systemQuery(t, 'SELECT tenant_id, day, user_id FROM hbe.rpt_tenant_daily_users ORDER BY 1, 2, 3'),
  p: await systemQuery(t, 'SELECT day, runs, submits, accepted, internal_errors, guest_runs FROM hbe.rpt_platform_daily ORDER BY 1'),
});

beforeAll(async () => {
  t = await startApp(process.env.DEBUG_LOG ? { LOG_LEVEL: 'error' } : {});
  org = await seedOrg(t);
  // A third student in A, for the plagiarism check and flags.
  for (const name of ['third', 'fourth']) {
    const id = randomUUID();
    const email = `${name}@alpha.edu`;
    const hash = (await systemQuery<{ password_hash: string }>(t, 'SELECT password_hash FROM hbe.users WHERE id = $1', [org.users.studentA.id]))[0]!.password_hash;
    await systemQuery(t, `INSERT INTO hbe.users (id, email, name, password_hash, status) VALUES ($1, $2, $3, $4, 'active')`, [id, email, name, hash]);
    await systemQuery(t, `INSERT INTO hbe.memberships (user_id, tenant_id, role) VALUES ($1, $2, 'student')`, [id, org.tenantA]);
    extra.push({ id, email });
  }
  const login = async (k: string, email: string) => {
    c[k] = new Client(t);
    await c[k]!.login(email, PASSWORD);
  };
  await login('teacherA', org.users.teacherA.email);
  await login('associateA', org.users.associateA.email);
  await login('adminA', org.users.clientAdminA.email);
  await enrollMfa(c.adminA!);
  await login('teacherB', org.users.teacherB.email);
  await login('s1', org.users.studentA.email);
  await login('s2', org.users.studentA2.email);
  await login('s3', extra[0]!.email);
  await login('root', org.users.admin.email);
  await enrollMfa(c.root!);

  questionId = (await c.teacherA!.post('/api/v1/questions', { ...sumArray, title: 'Report probe', isPractice: true, hidden: sumArray.hidden.slice(0, 10) })).json().id;
  await c.teacherA!.post(`/api/v1/questions/${questionId}/validate`, { publishIfValid: true });
  for (let i = 0; i < Object.keys(sumArray.templates).length; i++) await grade();
  batchId = (await c.teacherA!.post('/api/v1/batches', { name: 'Reports batch' })).json().id;
  await c.teacherA!.post(`/api/v1/batches/${batchId}/members`, { userIds: [org.users.studentA.id, org.users.studentA2.id, extra[0]!.id] });
});
afterAll(async () => {
  await t?.close();
});

describe('rollups', () => {
  it('practice and test activity is counted incrementally, and equals a full rebuild', async () => {
    // Practice: s1 runs once (AC), submits once with half the hidden tests passing.
    await c.s1!.post('/api/v1/submissions', { questionId, runtime: 'python', code: 'x', kind: 'run' });
    await grade();
    await c.s1!.post('/api/v1/submissions', { questionId, runtime: 'python', code: 'x', kind: 'submit' });
    await grade((i) => i < 2 || i % 2 === 0);
    // A test with three students.
    const now = Date.now();
    testId = (await c.teacherA!.post('/api/v1/tests', { title: 'Report test', startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 3600_000).toISOString(), durationMin: 30, questions: [{ questionId, points: 50 }] })).json().id;
    await c.teacherA!.post(`/api/v1/tests/${testId}/assign`, { batchIds: [batchId] });
    expect((await c.teacherA!.post(`/api/v1/tests/${testId}/publish`)).statusCode).toBe(200);
    const take = async (cl: Client, code: string, pass: (i: number) => boolean) => {
      const s = (await cl.post(`/api/v1/tests/${testId}/attempt`, {})).json() as { attemptId: string; token: string };
      await cl.req('POST', '/api/v1/submissions', { questionId, runtime: 'python', code, kind: 'submit', attemptId: s.attemptId }, { [H]: s.token });
      await grade(pass);
      await cl.req('POST', `/api/v1/attempts/${s.attemptId}/submit`, {}, { [H]: s.token });
    };
    await take(c.s1!, COPY_A, () => true); // 100%
    await take(c.s2!, COPY_B, (i) => i < 2 || i < 5); // 3 of 10 hidden → 30%
    await take(c.s3!, OWN, (i) => i < 2 || i < 9); // 7 of 10 → 70%

    const s1 = await systemQuery<{ submits: number; runs: number; best_score: string; solved: boolean }>(t, 'SELECT submits, runs, best_score, solved FROM hbe.rpt_student_question WHERE user_id = $1', [org.users.studentA.id]);
    expect(s1[0]).toMatchObject({ runs: 1, submits: 2, solved: true });
    const totals = await systemQuery<{ students: number; solved: number }>(t, 'SELECT students, solved FROM hbe.rpt_question_totals WHERE question_id = $1', [questionId]);
    expect(totals[0]).toEqual({ students: 3, solved: 1 });
    expect(Number(s1[0]!.best_score)).toBe(100);
    const before = await rollups();
    expect(before.q.length).toBeGreaterThan(0);
    const r = await c.root!.post('/api/v1/reports/rebuild');
    expect(r.statusCode).toBe(200);
    expect(await rollups()).toEqual(before);
  });
});

describe('test report', () => {
  it('summarises scores, ranks, distribution and per-question results from the attempts', async () => {
    const r = (await c.teacherA!.get(`/api/v1/reports/tests/${testId}`)).json();
    expect(r.summary).toMatchObject({ assigned: 3, started: 3, submitted: 3, notStarted: 0 });
    expect(r.summary.score).toMatchObject({ count: 3, mean: 66.7, median: 70, min: 30, max: 100 });
    expect(r.distribution.map((b: { count: number }) => b.count)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 1]);
    const by = Object.fromEntries(r.students.map((s: { email: string }) => [s.email, s]));
    expect(by[org.users.studentA.email]).toMatchObject({ rank: 1, percent: 100, score: 50, maxScore: 50 });
    expect(by[extra[0]!.email]).toMatchObject({ rank: 2, percent: 70 });
    expect(by[org.users.studentA2.email]).toMatchObject({ rank: 3, percent: 30 });
    expect(r.questions[0]).toMatchObject({ attempted: 3, avgScore: 66.7, fullScorePercent: 33.3, avgSubmissions: 1, flag: null });
  });
  it('is visible to the institution’s staff only', async () => {
    for (const who of ['teacherA', 'associateA', 'adminA']) expect((await c[who]!.get(`/api/v1/reports/tests/${testId}`)).statusCode).toBe(200);
    expect((await c.teacherB!.get(`/api/v1/reports/tests/${testId}`)).statusCode).toBe(404);
    expect((await c.s1!.get(`/api/v1/reports/tests/${testId}`)).statusCode).toBe(403);
    expect((await c.root!.get(`/api/v1/reports/tests/${testId}`)).statusCode).toBe(403);
  });
  it('exports CSV and Excel; formula-like names are neutralised in CSV; exports are audited', async () => {
    await systemQuery(t, `UPDATE hbe.users SET name = '=HYPERLINK("http://evil","click")' WHERE id = $1`, [org.users.studentA2.id]);
    const csv = await c.teacherA!.get(`/api/v1/reports/tests/${testId}/export?format=csv`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain(`"'=HYPERLINK(""http://evil"",""click"")"`);
    expect(csv.body).not.toMatch(/(^|,)=HYPERLINK/m);
    const xlsx = await c.teacherA!.get(`/api/v1/reports/tests/${testId}/export?format=xlsx`);
    const sheet = (await readWorkbook(xlsx.rawPayload))[0]!;
    expect(sheet.rows[0]!.cells.slice(0, 4)).toEqual(['Name', 'Email', 'Status', 'Score']);
    expect(sheet.rows).toHaveLength(4);
    expect((await c.teacherB!.get(`/api/v1/reports/tests/${testId}/export?format=csv`)).statusCode).toBe(404);
    // Associates view reports on screen but cannot take personal data out.
    expect((await c.associateA!.get(`/api/v1/reports/tests/${testId}/export?format=csv`)).statusCode).toBe(403);
    expect((await c.adminA!.get(`/api/v1/reports/tests/${testId}/export?format=csv`)).statusCode).toBe(200);
    const audit = await systemQuery<{ n: number }>(t, `SELECT count(*)::int AS n FROM hbe.audit_logs WHERE action = 'report.export'`);
    expect(audit[0]!.n).toBe(3);
  });
});

describe('plagiarism', () => {
  it('flags the disguised copy, not the independent solution; staff only; teachers start it', async () => {
    expect((await c.associateA!.post(`/api/v1/tests/${testId}/plagiarism`)).statusCode).toBe(403);
    expect((await c.s1!.post(`/api/v1/tests/${testId}/plagiarism`)).statusCode).toBe(403);
    expect((await c.teacherB!.post(`/api/v1/tests/${testId}/plagiarism`)).statusCode).toBe(404);
    expect((await c.teacherA!.post(`/api/v1/tests/${testId}/plagiarism`)).statusCode).toBe(202);
    let res: { run: { status: string; counts: Record<string, number> }; pairs: { a: { email: string }; b: { email: string }; similarity: number; subA: string; subB: string; questionId: string }[] } | undefined;
    for (let i = 0; i < 100; i++) {
      res = (await c.associateA!.get(`/api/v1/tests/${testId}/plagiarism`)).json();
      if (res!.run.status === 'done' || res!.run.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(res!.run).toMatchObject({ status: 'done', counts: { submissions: 3, groups: 1, flagged: 1 } });
    expect(res!.pairs).toHaveLength(1);
    expect([res!.pairs[0]!.a.email, res!.pairs[0]!.b.email].sort()).toEqual([org.users.studentA.email, org.users.studentA2.email].sort());
    expect(res!.pairs[0]!.similarity).toBeGreaterThanOrEqual(90);
    const p = res!.pairs[0]!;
    const detail = (await c.teacherA!.get(`/api/v1/plagiarism/${(res!.run as unknown as { id: string }).id}/pairs/${p.questionId}/${p.subA}/${p.subB}`)).json();
    expect([detail.a.source, detail.b.source].sort()).toEqual([COPY_A, COPY_B].sort());
    expect(detail.a.regions.length).toBeGreaterThan(0);
    expect((await c.teacherB!.get(`/api/v1/tests/${testId}/plagiarism`)).statusCode).toBe(404);
    expect((await c.s1!.get(`/api/v1/tests/${testId}/plagiarism`)).statusCode).toBe(403);
    // The test report shows each student's highest similarity.
    const r = (await c.teacherA!.get(`/api/v1/reports/tests/${testId}`)).json();
    const by = Object.fromEntries(r.students.map((s: { email: string; plagiarismMax: number | null }) => [s.email, s.plagiarismMax]));
    expect(by[extra[0]!.email]).toBeNull();
    expect(by[org.users.studentA.email]).toBeGreaterThanOrEqual(90);
  });
});

describe('question, student, batch and institution reports', () => {
  it('question report: totals, languages, verdicts, solve rate, tests', async () => {
    const r = (await c.associateA!.get(`/api/v1/reports/questions/${questionId}`)).json();
    expect(r.totals).toMatchObject({ runs: 1, submits: 4, accepted: 1, acceptance: 25 });
    expect(r.students).toMatchObject({ attempted: 3, solved: 1, solveRate: 33.3 });
    expect(r.verdicts).toEqual(expect.arrayContaining([{ verdict: 'WA', n: 3 }, { verdict: 'AC', n: 1 }]));
    expect(r.tests[0]).toMatchObject({ testId, attempted: 3, avgScore: 66.7 });
    expect((await c.teacherB!.get(`/api/v1/reports/questions/${questionId}`)).statusCode).toBe(404);
  });
  it('a student sees only their own report; scores of tests that hide results stay hidden', async () => {
    const me = (await c.s1!.get('/api/v1/reports/me')).json();
    expect(me.tests[0]).toMatchObject({ testId, percent: 100 });
    expect(me.tests[0].violations).toBeUndefined();
    expect(me.practice).toMatchObject({ attempted: 1, solved: 1 });
    expect((await c.s1!.get(`/api/v1/reports/students/${org.users.studentA2.id}`)).statusCode).toBe(403);
    await systemQuery(t, `UPDATE hbe.tests SET settings = settings || '{"showResults": false}' WHERE id = $1`, [testId]);
    expect((await c.s1!.get('/api/v1/reports/me')).json().tests[0]).toMatchObject({ score: null, percent: null });
    // Staff still see it.
    expect((await c.teacherA!.get(`/api/v1/reports/students/${org.users.studentA.id}`)).json().tests[0].percent).toBe(100);
    expect((await c.teacherB!.get(`/api/v1/reports/students/${org.users.studentA.id}`)).statusCode).toBe(404);
  });
  it('batch report: students × tests matrix with averages', async () => {
    const r = (await c.teacherA!.get(`/api/v1/reports/batches/${batchId}`)).json();
    expect(r.tests).toEqual([expect.objectContaining({ id: testId, taken: 3, average: 66.7 })]);
    expect(r.students.find((s: { userId: string }) => s.userId === org.users.studentA.id).cells[0]).toEqual({ status: 'submitted', percent: 100 });
    expect((await c.teacherB!.get(`/api/v1/reports/batches/${batchId}`)).statusCode).toBe(404);
    const xlsx = await c.teacherA!.get(`/api/v1/reports/batches/${batchId}/export?format=xlsx`);
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
    expect((await c.associateA!.get(`/api/v1/reports/batches/${batchId}/export?format=csv`)).statusCode).toBe(403);
  });
  it('institution overview, with too-easy / too-hard flags at 30+ students', async () => {
    let r = (await c.adminA!.get('/api/v1/reports/overview')).json();
    expect(r.people).toMatchObject({ students: 4, teachers: 1, associates: 1 });
    expect(r.totals30).toMatchObject({ runs: 1, submits: 4, accepted: 1 });
    expect(r.active.d30).toBe(3);
    expect(r.flagged).toEqual([]);
    // 30 more students who all solved it: the question becomes "too easy".
    for (let i = 0; i < 30; i++) {
      const id = randomUUID();
      await systemQuery(t, `INSERT INTO hbe.users (id, email, name, status) VALUES ($1, $2, 'x', 'active')`, [id, `flag${i}@alpha.edu`]);
      await systemQuery(t, `INSERT INTO hbe.rpt_student_question (tenant_id, user_id, question_id, submits, best_score, solved, last_at) VALUES ($1, $2, $3, 1, 100, true, now())`, [org.tenantA, id, questionId]);
    }
    await systemQuery(t, `UPDATE hbe.rpt_question_totals SET students = students + 30, solved = solved + 30 WHERE question_id = $1`, [questionId]);
    r = (await c.teacherA!.get('/api/v1/reports/overview')).json();
    expect(r.flagged).toEqual([expect.objectContaining({ questionId, students: 33, flag: 'too_easy' })]);
    expect((await c.s1!.get('/api/v1/reports/overview')).statusCode).toBe(403);
    expect((await c.teacherB!.get('/api/v1/reports/overview')).json().totals30).toEqual({ runs: 0, submits: 0, accepted: 0 });
  });
  it('platform view is super-admin only and shows institutions, queues and executors', async () => {
    expect((await c.adminA!.get('/api/v1/reports/platform')).statusCode).toBe(403);
    const r = (await c.root!.get('/api/v1/reports/platform')).json();
    expect(r.tenants.map((x: { name: string }) => x.name).sort()).toEqual(['Alpha University', 'Beta College']);
    expect(r.queue.lists).toMatchObject({ run: 0, submit: 0, practice: 0, validate: 0 });
    expect(r.executors.map((e: { id: string }) => e.id)).toContain('fake-1');
    expect(r.daily).toHaveLength(30);
  });
});

describe('plagiarism across tests', () => {
  it('institution scope compares with the same question in other tests; never a student with themselves', async () => {
    // Section B sits the same question a day later: one student copies a section-A answer, and a
    // student who took both tests re-submits their own earlier answer.
    const COPY_C = 'def sum_array(arr):\n    acc = 0\n    for el in arr:\n        if el is not None:\n            acc = acc + el\n        else:\n            acc = acc + 0\n    return acc\n';
    const now = Date.now();
    const test2 = (await c.teacherA!.post('/api/v1/tests', { title: 'Section B test', startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 3600_000).toISOString(), durationMin: 30, questions: [{ questionId, points: 50 }] })).json().id as string;
    await c.teacherA!.post(`/api/v1/tests/${test2}/assign`, { userIds: [extra[1]!.id, org.users.studentA.id] });
    await c.teacherA!.post(`/api/v1/tests/${test2}/publish`);
    c.s4 = new Client(t);
    await c.s4.login(extra[1]!.email, PASSWORD);
    for (const [cl, code] of [[c.s4, COPY_C], [c.s1!, COPY_A]] as const) {
      const s = (await cl.post(`/api/v1/tests/${test2}/attempt`, {})).json() as { attemptId: string; token: string };
      await cl.req('POST', '/api/v1/submissions', { questionId, runtime: 'python', code, kind: 'submit', attemptId: s.attemptId }, { [H]: s.token });
      await grade();
      await cl.req('POST', `/api/v1/attempts/${s.attemptId}/submit`, {}, { [H]: s.token });
    }
    type Res = { run: { id: string; status: string; params: { scope: string }; counts: Record<string, number> }; pairs: { a: { email: string; test: { id: string; title: string } }; b: { email: string; test: { id: string; title: string } }; subA: string; subB: string; questionId: string }[] };
    const check = async (body?: unknown): Promise<Res> => {
      expect((await c.teacherA!.post(`/api/v1/tests/${test2}/plagiarism`, body)).statusCode).toBe(202);
      let res: Res | undefined;
      for (let i = 0; i < 100; i++) {
        res = (await c.teacherA!.get(`/api/v1/tests/${test2}/plagiarism`)).json();
        if (res!.run.status === 'done' || res!.run.status === 'failed') break;
        await new Promise((r) => setTimeout(r, 50));
      }
      return res!;
    };
    // This test only (the default): the one copy inside section B.
    const own = await check();
    expect(own.run).toMatchObject({ status: 'done', params: { scope: 'test' }, counts: { submissions: 2, otherTests: 0, flagged: 1 } });
    expect(await c.teacherA!.post(`/api/v1/tests/${test2}/plagiarism`, { scope: 'everything' }).then((r) => r.statusCode)).toBe(400);

    const wide = await check({ scope: 'institution' });
    expect(wide.run).toMatchObject({ status: 'done', params: { scope: 'institution' }, counts: { submissions: 2, otherTests: 3 } });
    const key = (p: Res['pairs'][number]) => [`${p.a.email}@${p.a.test.title}`, `${p.b.email}@${p.b.test.title}`].sort().join(' ~ ');
    const A = org.users.studentA.email;
    const A2 = org.users.studentA2.email;
    const D = extra[1]!.email;
    expect(wide.pairs.map(key).sort()).toEqual(
      [
        [`${A}@Section B test`, `${D}@Section B test`],
        [`${A}@Report test`, `${D}@Section B test`],
        [`${A2}@Report test`, `${D}@Section B test`],
        [`${A2}@Report test`, `${A}@Section B test`],
      ].map((x) => x.sort().join(' ~ ')).sort(),
    );
    // Never a student with their own earlier answer; never two section-A answers with each other.
    for (const p of wide.pairs) {
      expect(p.a.email).not.toBe(p.b.email);
      expect([p.a.test.id, p.b.test.id]).toContain(test2);
    }
    // The compare view names the other test.
    const cross = wide.pairs.find((p) => p.a.test.id !== p.b.test.id)!;
    const detail = (await c.teacherA!.get(`/api/v1/plagiarism/${wide.run.id}/pairs/${cross.questionId}/${cross.subA}/${cross.subB}`)).json();
    expect([detail.a.test.title, detail.b.test.title].sort()).toEqual(['Report test', 'Section B test']);
  });
});
