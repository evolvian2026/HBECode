/**
 * Web and DB questions through the whole stack: API (listening on a port) + the real
 * hbe-executor container + real PostgreSQL/MySQL/MongoDB runner containers. Validates every
 * seed question, grades reference and starter code as a student, checks nothing hidden leaks,
 * and measures run latency.
 */
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { type ClientSubmission, type DbQuestionInput, type QuestionInput, type WebQuestionInput } from '@hbe/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { customerTotals, monthlyRevenue, profileCard, shoppingCart, todoList, topEarner } from '../../../../packages/db/src/seed/index.js';
import { DOCKER_FLAGS, IMAGE, RUNNER_IMAGES } from '../../../executor/test/sandbox/harness.js';
import { PASSWORD, seedOrg, type Org } from '../fixtures.js';
import { Client, EXECUTOR_TOKEN, startApp, type TestApp } from '../harness.js';

const exec = promisify(execFile);
const PORT = 4778;
const SEEDS: QuestionInput[] = [profileCard, todoList, shoppingCart, topEarner, customerTotals, monthlyRevenue];
const RUNNERS = ['hbe-e2e-pg', 'hbe-e2e-mysql', 'hbe-e2e-mongo'];

let t: TestApp;
let org: Org;
let container = '';
let teacher: Client;
let student: Client;
const ids = new Map<string, string>();

async function waitFor<T>(fn: () => Promise<T | undefined>, ms: number, step = 100): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, step));
  }
}

async function submitAndWait(c: Client, body: Record<string, unknown>): Promise<{ s: ClientSubmission; ms: number }> {
  const t0 = performance.now();
  const r = await c.post('/api/v1/submissions', body);
  expect(r.statusCode, r.body).toBe(202);
  const id = r.json().id as string;
  const s = await waitFor(async () => {
    const x = (await c.get(`/api/v1/submissions/${id}`)).json() as ClientSubmission;
    return x.status === 'done' || x.status === 'failed' ? x : undefined;
  }, 90_000, 25);
  return { s, ms: performance.now() - t0 };
}

async function ip(name: string): Promise<string> {
  const { stdout } = await exec('docker', ['inspect', '-f', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', name]);
  return stdout.trim();
}

async function startDbRunners(): Promise<string[]> {
  for (const n of RUNNERS) await exec('docker', ['rm', '-f', '-v', n]).catch(() => undefined);
  await exec('docker', ['run', '-d', '--rm', '--name', 'hbe-e2e-pg', '-e', 'POSTGRES_USER=runner_admin', '-e', 'POSTGRES_PASSWORD=e2e-pg-pw', RUNNER_IMAGES.pg]);
  await exec('docker', ['run', '-d', '--rm', '--name', 'hbe-e2e-mysql', '-e', 'MYSQL_ROOT_PASSWORD=e2e-my-pw', RUNNER_IMAGES.mysql, '--local-infile=0', '--secure-file-priv=NULL', '--skip-name-resolve', '--performance-schema=0', '--innodb-buffer-pool-size=64M']);
  await exec('docker', ['run', '-d', '--rm', '--name', 'hbe-e2e-mongo', '-e', 'MONGO_INITDB_ROOT_USERNAME=root', '-e', 'MONGO_INITDB_ROOT_PASSWORD=e2e-mongo-pw', RUNNER_IMAGES.mongo, '--noscripting', '--wiredTigerCacheSizeGB', '0.25']);
  const ready = (cmd: string[]) => waitFor(() => exec('docker', cmd).then(() => true, () => undefined), 120_000, 1000);
  await ready(['exec', 'hbe-e2e-pg', 'pg_isready', '-U', 'runner_admin']);
  await ready(['exec', 'hbe-e2e-mysql', 'mysql', '-uroot', '-pe2e-my-pw', '-e', 'SELECT 1']);
  await ready(['exec', 'hbe-e2e-mongo', 'mongosh', '--quiet', '-u', 'root', '-p', 'e2e-mongo-pw', '--eval', 'db.runCommand({ping:1})']);
  // The executor uses the host network; the runners' bridge addresses are reachable from it.
  return [
    `PG_RUNNER_URL=postgres://runner_admin:e2e-pg-pw@${await ip('hbe-e2e-pg')}:5432/postgres`,
    `MYSQL_RUNNER_URL=mysql://root:e2e-my-pw@${await ip('hbe-e2e-mysql')}:3306`,
    `MONGO_RUNNER_URL=mongodb://root:e2e-mongo-pw@${await ip('hbe-e2e-mongo')}:27017/?authSource=admin`,
  ];
}

const refCode = (q: QuestionInput, dialect?: string) => (q.type === 'web' ? JSON.stringify(q.referenceFiles) : (q as DbQuestionInput).solutions[dialect as keyof DbQuestionInput['solutions']]!);
const runtimeOf = (q: QuestionInput) => (q.type === 'web' ? q.framework : (q as DbQuestionInput).dialects[0]!);

beforeAll(async () => {
  const runnerEnv = await startDbRunners();
  t = await startApp({ SWEEPER_INTERVAL_MS: '5000', RATE_LIMIT_RUN_PER_MIN: '1000', RATE_LIMIT_SUBMIT_PER_MIN: '1000' });
  await t.app.listen({ port: PORT, host: '127.0.0.1' });
  org = await seedOrg(t);
  const { stdout } = await exec('docker', [
    'run', '-d', '--rm', ...DOCKER_FLAGS, '--network', 'host',
    '-e', `EXECUTOR_API_URL=http://127.0.0.1:${PORT}`, '-e', `EXECUTOR_TOKEN=${EXECUTOR_TOKEN}`, '-e', 'EXECUTOR_ID=e2e-webdb', '-e', 'EXECUTOR_SLOTS=2',
    ...runnerEnv.flatMap((e) => ['-e', e]),
    IMAGE,
  ]);
  container = stdout.trim();
  teacher = new Client(t);
  await teacher.login(org.users.teacherA.email, PASSWORD);
  student = new Client(t);
  await student.login(org.users.studentA.email, PASSWORD);
});

afterAll(async () => {
  if (container) {
    const logs = await exec('docker', ['logs', container]).catch(() => ({ stdout: '' }));
    writeFileSync('/tmp/hbe-e2e-webdb-executor.log', logs.stdout);
    await exec('docker', ['rm', '-f', '-v', container]).catch(() => undefined);
  }
  for (const n of RUNNERS) await exec('docker', ['rm', '-f', '-v', n]).catch(() => undefined);
  await t?.close();
});

describe('web and DB questions with the real sandbox', () => {
  it('validates and publishes every seed question (reference passes, dialects agree, starter fails)', async () => {
    for (const q of SEEDS) {
      const r = await teacher.post('/api/v1/questions', { ...q, isPractice: true });
      expect(r.statusCode, `${q.title}: ${r.body}`).toBe(201);
      ids.set(q.title, r.json().id);
      expect((await teacher.post(`/api/v1/questions/${r.json().id}/validate`, { publishIfValid: true })).statusCode).toBe(202);
    }
    const reports: Record<string, unknown> = {};
    for (const q of SEEDS) {
      const d = await waitFor(async () => {
        const x = (await teacher.get(`/api/v1/questions/${ids.get(q.title)}`)).json();
        return x.validation && !x.validation.pending ? x : undefined;
      }, 300_000, 500);
      reports[q.title] = d.validation;
      expect([q.title, d.validation.problems]).toEqual([q.title, []]);
      expect([q.title, d.status]).toEqual([q.title, 'published']);
    }
    writeFileSync('/tmp/hbe-e2e-webdb-validation.json', JSON.stringify(reports, null, 2));
  });

  it('grades reference solutions as AC with full score, in every dialect', async () => {
    for (const q of SEEDS) {
      const targets = q.type === 'db' ? q.dialects : [runtimeOf(q)];
      for (const rt of targets) {
        const { s } = await submitAndWait(student, { questionId: ids.get(q.title), runtime: rt, code: refCode(q, rt), kind: 'submit' });
        expect([q.title, rt, s.verdict, s.score]).toEqual([q.title, rt, 'AC', 100]);
      }
    }
  });

  it('web: starter code fails with explanations on sample checks only', async () => {
    for (const q of [profileCard, todoList, shoppingCart] as WebQuestionInput[]) {
      const { s } = await submitAndWait(student, { questionId: ids.get(q.title), runtime: q.framework, code: JSON.stringify(q.starterFiles), kind: 'submit' });
      expect(s.verdict, q.title).not.toBe('AC');
      expect(s.score!).toBeLessThan(100);
      const visible = s.tests.filter((x) => !x.hidden);
      expect(visible.map((x) => x.title)).toEqual(q.samples.map((c) => c.title));
      for (const h of s.tests.filter((x) => x.hidden)) {
        expect(Object.keys(h).sort(), q.title).toEqual(['hidden', 'ordinal', 'verdict']);
      }
      const failed = visible.find((x) => x.verdict !== 'AC');
      if (failed) expect(failed.detail).toBeTruthy();
    }
  });

  it('db: wrong queries show actual vs expected tables for samples only', async () => {
    const { s } = await submitAndWait(student, { questionId: ids.get(topEarner.title), runtime: 'postgres', code: 'SELECT d.name AS department, e.name AS employee, e.salary FROM departments d JOIN employees e ON e.dept_id = d.id ORDER BY d.name', kind: 'submit' });
    expect(s.verdict).toBe('WA');
    const visible = s.tests.filter((x) => !x.hidden);
    expect(visible).toHaveLength(2);
    expect(visible[0]!.result?.columns).toEqual(['department', 'employee', 'salary']);
    expect(visible[0]!.expectedResult?.rows).toEqual([['Engineering', 'Ravi', 120000], ['Sales', 'Kiran', 82000]]);
    for (const h of s.tests.filter((x) => x.hidden)) expect(Object.keys(h).sort()).toEqual(['hidden', 'ordinal', 'verdict']);

    const mongoBad = await submitAndWait(student, { questionId: ids.get(customerTotals.title), runtime: 'mongodb', code: '{"collection":"orders","pipeline":[{"$where":"sleep(100)"}]}', kind: 'run' });
    expect(mongoBad.s.verdict).not.toBe('AC');
    expect(JSON.stringify(mongoBad.s)).toMatch(/\$where/);

    const pandasErr = await submitAndWait(student, { questionId: ids.get(monthlyRevenue.title), runtime: 'pandas', code: 'def solve(sales):\n    return 42\n', kind: 'run' });
    expect(pandasErr.s.verdict).toBe('RE');
  });

  it('students never receive reference files, solutions or hidden checks/datasets', async () => {
    const strings = (v: unknown): string[] => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
    for (const q of SEEDS) {
      const res = await student.get(`/api/v1/practice/questions/${ids.get(q.title)}`);
      expect(res.statusCode).toBe(200);
      const text = strings(res.json()).join('\n');
      const pub = [q.statement, ...(q.type === 'web' ? q.starterFiles.map((f) => f.content) : [(q as DbQuestionInput).schemaDisplay, ...Object.values((q as DbQuestionInput).starters)])].join('\n');
      // Every reference-only line (not also in the starter/statement) must be absent.
      const secretSources = q.type === 'web' ? q.referenceFiles.map((f) => f.content) : Object.values((q as DbQuestionInput).solutions).map(String);
      const secretLines = secretSources.flatMap((c) => c.split('\n')).map((l) => l.trim()).filter((l) => l.length >= (q.type === 'web' ? 20 : 12) && !pub.includes(l));
      expect(secretLines.length, q.title).toBeGreaterThan(0);
      for (const l of secretLines) expect(text, `${q.title}: leaked "${l}"`).not.toContain(l);
      const hiddenLabels = q.type === 'web' ? q.hidden.map((h) => h.title) : [];
      for (const h of hiddenLabels.filter((x) => !pub.includes(x))) expect(text, `${q.title}: hidden check title`).not.toContain(h);
      if (q.type === 'db') expect(Object.keys(res.json())).not.toContain('hidden');
      expect((await student.get(`/api/v1/questions/${ids.get(q.title)}`)).statusCode).toBe(403);
    }
  });

  it('measures run latency (POST → final verdict)', async () => {
    const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)]!;
    const out: Record<string, { checks: number; p50: number; p95: number }> = {};
    const cases: [string, QuestionInput, string][] = [
      ['web:html (profile, 2 checks)', profileCard, 'html'],
      ['web:react (cart, 2 checks)', shoppingCart, 'react'],
      ['db:postgres', topEarner, 'postgres'],
      ['db:mysql', topEarner, 'mysql'],
      ['db:mongodb', customerTotals, 'mongodb'],
      ['db:pandas', monthlyRevenue, 'pandas'],
    ];
    for (const [label, q, rt] of cases) {
      const ms: number[] = [];
      for (let i = 0; i < 5; i++) ms.push((await submitAndWait(student, { questionId: ids.get(q.title), runtime: rt, code: refCode(q, rt), kind: 'run' })).ms);
      out[label] = { checks: 2, p50: Math.round(pct(ms, 50)), p95: Math.round(pct(ms, 95)) };
      const full = await submitAndWait(student, { questionId: ids.get(q.title), runtime: rt, code: refCode(q, rt), kind: 'submit' });
      out[`${label.split(' ')[0]} submit (${full.s.total} tests)`] = { checks: full.s.total, p50: Math.round(full.ms), p95: Math.round(full.ms) };
    }
    writeFileSync('/tmp/hbe-e2e-webdb-latency.json', JSON.stringify(out, null, 2));
    for (const [k, v] of Object.entries(out)) if (!k.includes('submit')) expect(v.p95, k).toBeLessThan(15_000);
  });
});
