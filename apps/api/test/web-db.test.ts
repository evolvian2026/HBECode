import type { DbJob, DbQuestionInput, ExecJob, WebJob, WebQuestionInput } from '@hbe/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, seedOrg, systemQuery, type Org } from './fixtures.js';
import { Client, executor, startApp, type TestApp } from './harness.js';

let t: TestApp;
let org: Org;
let teacher: Client;
let student: Client;
let associate: Client;
const ex = () => executor(t);

const check = (title: string, spec: WebQuestionInput['samples'][number]['spec'], weight = 1) => ({ title, weight, spec });
const webQ: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Style the heading',
  statement: 'Make the page heading red and add a navigation bar with a link.',
  difficulty: 'easy',
  tags: ['css'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: '<!doctype html><html lang="en"><body><h1>Hello</h1></body></html>' }],
  referenceFiles: [
    { path: 'index.html', content: '<!doctype html><html lang="en"><head><link rel="stylesheet" href="styles.css"></head><body><nav><a href="#">Home</a></nav><h1>Hello</h1></body></html>' },
    { path: 'styles.css', content: 'h1{color:red}' },
  ],
  samples: [check('There is a heading', { kind: 'exists', selector: 'h1' }), check('The heading says Hello', { kind: 'text', selector: 'h1', match: { equals: 'Hello' } })],
  hidden: Array.from({ length: 8 }, (_, i) => check(`HIDDEN-CHECK-${i}`, i % 2 ? { kind: 'style', selector: 'h1', property: 'color', match: { equals: `rgb(255, 0, ${i})` } } : { kind: 'exists', selector: `nav a:nth-child(${i + 1})`, count: { min: 0 } })),
  checkTimeoutMs: 4000,
};

const ds = (rows: string) => ({ setup: { sql: `CREATE TABLE t (n INT); INSERT INTO t VALUES ${rows};` }, explanation: 'e', weight: 1 });
const dbQ: DbQuestionInput = {
  type: 'db',
  title: 'Count the rows',
  statement: 'Return the number of rows in table t as a column named cnt.',
  difficulty: 'easy',
  tags: ['sql'],
  isPractice: true,
  dialects: ['postgres', 'mysql'],
  mode: 'query',
  schemaDisplay: '`t(n INT)`',
  samples: [ds('(1)'), ds('(1),(2)')],
  hidden: Array.from({ length: 8 }, (_, i) => ds(Array.from({ length: i + 3 }, (_, j) => `(${j})`).join(','))),
  compare: { orderSensitive: false, columnNames: 'ignore_case', floatEpsilon: 1e-6, ignoreMongoId: true },
  starters: { postgres: '-- count rows\n', mysql: '-- count rows\n' },
  solutions: { postgres: 'SELECT COUNT(*) AS cnt FROM t', mysql: 'SELECT COUNT(*) AS cnt FROM t' },
  timeLimitMs: 2000,
};

/** Fake executor answering each job with a function of (job, index). */
async function serve(fn: (job: ExecJob) => { tests: Record<string, unknown>[]; compile?: { ok: boolean; output: string; wallMs: number } }) {
  const r = await ex().claim(['c', 'python', 'web:html', 'web:react', 'db:postgres', 'db:mysql', 'db:mongodb', 'db:pandas']);
  expect(r.statusCode).toBe(200);
  const job = r.json() as ExecJob;
  const out = fn(job);
  const res = await ex().result({ jobId: job.jobId, compile: out.compile ?? { ok: true, output: '', wallMs: 1 }, tests: out.tests });
  expect(res.statusCode, res.body).toBe(200);
  return job;
}
const testRes = (id: string, verdict = 'AC', extra: Record<string, unknown> = {}) => ({ id, verdict, cpuMs: 1, wallMs: 1, memKb: 0, stdout: '', stderr: '', ...extra });

beforeAll(async () => {
  t = await startApp();
  org = await seedOrg(t);
  teacher = new Client(t);
  await teacher.login(org.users.teacherA.email, PASSWORD);
  student = new Client(t);
  await student.login(org.users.studentA.email, PASSWORD);
  associate = new Client(t);
  await associate.login(org.users.associateA.email, PASSWORD);
});
afterAll(async () => {
  await t?.close();
});

describe('web questions', () => {
  let id = '';
  it('rejects a payload of one type pretending to be another', async () => {
    const r = await teacher.post('/api/v1/questions', { ...webQ, type: 'coding' });
    expect(r.statusCode).toBe(400);
  });

  it('validation needs the reference to pass every check and the starter to fail a hidden one', async () => {
    id = (await teacher.post('/api/v1/questions', webQ)).json().id;
    expect((await teacher.post(`/api/v1/questions/${id}/validate`, { publishIfValid: true })).statusCode).toBe(202);
    const jobs: WebJob[] = [];
    for (let i = 0; i < 2; i++) {
      jobs.push(
        (await serve((j) => {
          const w = j as WebJob;
          const starter = !w.files.some((f) => f.path === 'styles.css');
          // Starter passes the samples but fails the first hidden check.
          return { tests: w.checks.map((c, k) => testRes(c.id, starter && c.hidden && k === 3 ? 'WA' : 'AC')) };
        })) as WebJob,
      );
    }
    expect(jobs.every((j) => j.type === 'web' && j.checks.length === 10)).toBe(true);
    expect(jobs[0]!.checks.slice(0, 2).every((c) => !c.hidden)).toBe(true);
    const d = (await teacher.get(`/api/v1/questions/${id}`)).json();
    expect(d.validation.problems).toEqual([]);
    expect(d.status).toBe('published');
    expect(Object.keys(d.validation.runtimes).sort()).toEqual(['html', 'html:starter']);
  });

  it('a starter that already passes everything makes the question invalid', async () => {
    const qid = (await teacher.post('/api/v1/questions', { ...webQ, title: 'Starter passes' })).json().id;
    await teacher.post(`/api/v1/questions/${qid}/validate`, {});
    for (let i = 0; i < 2; i++) await serve((j) => ({ tests: (j as WebJob).checks.map((c) => testRes(c.id)) }));
    const d = (await teacher.get(`/api/v1/questions/${qid}`)).json();
    expect(d.validation.problems).toContain('html:starter: the starter files already pass every hidden check');
    expect(d.status).toBe('invalid');
  });

  it('students get starter files and sample check titles only', async () => {
    const r = await student.get(`/api/v1/practice/questions/${id}`);
    const v = r.json();
    expect(v).toMatchObject({ type: 'web', framework: 'html', samples: [{ title: 'There is a heading' }, { title: 'The heading says Hello' }], hiddenCount: 0 });
    expect(r.body).not.toContain('HIDDEN-CHECK');
    expect(r.body).not.toContain('styles.css');
    // Associates see hidden checks (staff) but never the reference files.
    const a = (await associate.get(`/api/v1/questions/${id}`)).json();
    expect(a.question.hidden).toHaveLength(8);
    expect(a.question.referenceFiles).toEqual([]);
  });

  it('submissions carry files; failures on visible checks are explained, hidden ones are not', async () => {
    const files = JSON.stringify([{ path: 'index.html', content: '<h1>Hi</h1>' }]);
    expect((await student.post('/api/v1/submissions', { questionId: id, runtime: 'react', code: files, kind: 'run' })).statusCode).toBe(400);
    expect((await student.post('/api/v1/submissions', { questionId: id, runtime: 'html', code: '{"not":"files"}', kind: 'run' })).statusCode).toBe(400);
    const sub = (await student.post('/api/v1/submissions', { questionId: id, runtime: 'html', code: files, kind: 'submit' })).json();
    await serve((j) => ({ tests: (j as WebJob).checks.map((c) => testRes(c.id, c.hidden ? 'WA' : c.title.includes('Hello') ? 'WA' : 'AC', { detail: `why ${c.title}` })) }));
    const s = (await student.get(`/api/v1/submissions/${sub.id}`)).json();
    expect(s.tests[1]).toMatchObject({ title: 'The heading says Hello', verdict: 'WA', detail: 'why The heading says Hello' });
    for (const h of s.tests.filter((x: { hidden: boolean }) => x.hidden)) expect(Object.keys(h).sort()).toEqual(['hidden', 'ordinal', 'verdict']);
    expect(JSON.stringify(s)).not.toContain('HIDDEN-CHECK');
  });
});

describe('db questions', () => {
  let id = '';
  const count = (job: DbJob, k: number) => ({ columns: ['cnt'], rows: [[k]] });
  const sizes = [1, 2, ...Array.from({ length: 8 }, (_, i) => i + 3)];

  it('validation runs each dialect and stores the reference output as the expected result', async () => {
    id = (await teacher.post('/api/v1/questions', dbQ)).json().id;
    await teacher.post(`/api/v1/questions/${id}/validate`, { publishIfValid: true });
    const jobs: DbJob[] = [];
    for (let i = 0; i < 2; i++) {
      jobs.push((await serve((j) => ({ tests: (j as DbJob).datasets.map((d, k) => testRes(d.id, 'AC', { result: count(j as DbJob, sizes[k]!) })) }))) as DbJob);
    }
    expect(jobs.map((j) => j.dialect).sort()).toEqual(['mysql', 'postgres']);
    expect(jobs[0]!.datasets.every((d) => d.expected === undefined && typeof d.setup === 'string' && d.setup.startsWith('CREATE TABLE'))).toBe(true);
    const d = (await teacher.get(`/api/v1/questions/${id}`)).json();
    expect(d.validation.problems).toEqual([]);
    expect(d.status).toBe('published');
    const rows = await systemQuery<{ expected: string }>(t, `SELECT expected FROM hbe.test_cases tc JOIN hbe.questions q ON q.latest_version_id = tc.version_id WHERE q.id = $1 AND visibility = 'sample' ORDER BY ordinal`, [id]);
    expect(JSON.parse(rows[0]!.expected)).toEqual({ postgres: { columns: ['cnt'], rows: [[1]] }, mysql: { columns: ['cnt'], rows: [[1]] } });
  });

  it('dialects that disagree, or hidden datasets that repeat the sample answers, invalidate the question', async () => {
    const qid = (await teacher.post('/api/v1/questions', { ...dbQ, title: 'Disagreeing dialects' })).json().id;
    await teacher.post(`/api/v1/questions/${qid}/validate`, {});
    await serve((j) => ({ tests: (j as DbJob).datasets.map((d, k) => testRes(d.id, 'AC', { result: count(j as DbJob, (j as DbJob).dialect === 'mysql' && k === 4 ? 99 : sizes[k]!) })) }));
    await serve((j) => ({ tests: (j as DbJob).datasets.map((d, k) => testRes(d.id, 'AC', { result: count(j as DbJob, (j as DbJob).dialect === 'mysql' && k === 4 ? 99 : sizes[k]!) })) }));
    const bad = (await teacher.get(`/api/v1/questions/${qid}`)).json();
    expect(bad.validation.problems.join('\n')).toMatch(/hidden dataset 3: PostgreSQL and MySQL references give different results/);

    const q2 = (await teacher.post('/api/v1/questions', { ...dbQ, title: 'Hard-codable' })).json().id;
    await teacher.post(`/api/v1/questions/${q2}/validate`, {});
    for (let i = 0; i < 2; i++) await serve((j) => ({ tests: (j as DbJob).datasets.map((d) => testRes(d.id, 'AC', { result: count(j as DbJob, 1) })) }));
    const hc = (await teacher.get(`/api/v1/questions/${q2}`)).json();
    expect(hc.validation.problems.join('\n')).toMatch(/hard-coded sample answers would pass/);
  });

  it('students see the schema, starters and sample expected results, never hidden datasets or solutions', async () => {
    const r = await student.get(`/api/v1/practice/questions/${id}`);
    const v = r.json();
    expect(v).toMatchObject({ type: 'db', mode: 'query', schemaDisplay: '`t(n INT)`', hiddenCount: 0 });
    expect(v.dialects.map((x: { id: string }) => x.id)).toEqual(['postgres', 'mysql']);
    expect(v.samples[1].expected.postgres).toEqual({ columns: ['cnt'], rows: [[2]] });
    expect(r.body).not.toContain('COUNT(*)');
    expect(r.body).not.toContain('VALUES (0),(1),(2)');
  });

  it('submissions get datasets with expected results; visible results come back with the expected table', async () => {
    expect((await student.post('/api/v1/submissions', { questionId: id, runtime: 'mongodb', code: '{}', kind: 'run' })).statusCode).toBe(400);
    const sub = (await student.post('/api/v1/submissions', { questionId: id, runtime: 'postgres', code: 'SELECT 1 AS cnt', kind: 'submit' })).json();
    const job = (await serve((j) => ({ tests: (j as DbJob).datasets.map((d) => testRes(d.id, d.ordinal === 1 ? 'AC' : 'WA', { result: { columns: ['cnt'], rows: [[1]] }, detail: 'some rows differ' })) }))) as DbJob;
    expect(job.datasets).toHaveLength(10);
    expect(job.datasets[2]!.expected).toEqual({ columns: ['cnt'], rows: [[3]] });
    const s = (await student.get(`/api/v1/submissions/${sub.id}`)).json();
    expect(s.tests[0]).toMatchObject({ verdict: 'AC', result: { columns: ['cnt'], rows: [[1]] }, expectedResult: { columns: ['cnt'], rows: [[1]] } });
    expect(s.tests[1]).toMatchObject({ verdict: 'WA', detail: 'some rows differ' });
    const stored = await systemQuery<{ n: number }>(t, `SELECT count(*)::int AS n FROM hbe.submission_results WHERE hidden AND (result IS NOT NULL OR detail IS NOT NULL)`);
    expect(stored[0]!.n).toBe(0);
  });
});
