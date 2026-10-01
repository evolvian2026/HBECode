/**
 * Full path with the real sandbox: API (listening on a port) + the hbe-executor container
 * pulling jobs over HTTP. Measures submission latency end to end (POST → verdict).
 */
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { RUNTIME_IDS, type ClientSubmission } from '@hbe/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sumArray } from '../../../../packages/db/src/seed/questions/sum-array.js';
import { DOCKER_FLAGS, IMAGE } from '../../../executor/test/sandbox/harness.js';
import { PASSWORD, seedOrg, type Org } from '../fixtures.js';
import { Client, EXECUTOR_TOKEN, startApp, type TestApp } from '../harness.js';

const exec = promisify(execFile);
let t: TestApp;
let org: Org;
let container = '';
let teacher: Client;
let student: Client;
let questionId = '';
const PORT = 4777;

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
  const r = await c.post('/api/v1/submissions', { questionId, ...body });
  expect(r.statusCode, r.body).toBe(202);
  const id = r.json().id as string;
  const s = await waitFor(async () => {
    const x = (await c.get(`/api/v1/submissions/${id}`)).json() as ClientSubmission;
    return x.status === 'done' || x.status === 'failed' ? x : undefined;
  }, 60_000, 25);
  return { s, ms: performance.now() - t0 };
}

beforeAll(async () => {
  t = await startApp({ SWEEPER_INTERVAL_MS: '5000', RATE_LIMIT_RUN_PER_MIN: '1000', RATE_LIMIT_SUBMIT_PER_MIN: '1000' });
  await t.app.listen({ port: PORT, host: '127.0.0.1' });
  org = await seedOrg(t);
  const { stdout } = await exec('docker', [
    'run', '-d', '--rm', ...DOCKER_FLAGS, '--network', 'host',
    '-e', `EXECUTOR_API_URL=http://127.0.0.1:${PORT}`, '-e', `EXECUTOR_TOKEN=${EXECUTOR_TOKEN}`, '-e', 'EXECUTOR_ID=e2e', '-e', 'EXECUTOR_SLOTS=2',
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
    writeFileSync('/tmp/hbe-e2e-executor.log', logs.stdout);
    await exec('docker', ['rm', '-f', container]).catch(() => undefined);
  }
  await t?.close();
});

describe('real sandbox', () => {
  it('validates all 8 reference solutions (incl. 200k-element stress tests) and publishes', async () => {
    questionId = (await teacher.post('/api/v1/questions', { ...sumArray, isPractice: true })).json().id;
    expect((await teacher.post(`/api/v1/questions/${questionId}/validate`, { publishIfValid: true })).statusCode).toBe(202);
    const d = await waitFor(async () => {
      const x = (await teacher.get(`/api/v1/questions/${questionId}`)).json();
      return x.validation && !x.validation.pending ? x : undefined;
    }, 240_000, 500);
    expect(d.validation.problems).toEqual([]);
    expect(d.validation.ok).toBe(true);
    expect(Object.keys(d.validation.runtimes).sort()).toEqual([...RUNTIME_IDS].sort());
    expect(d.status).toBe('published');
    writeFileSync('/tmp/hbe-e2e-validation.json', JSON.stringify(d.validation, null, 2));
  });

  it('accepts a correct student solution in every language', async () => {
    for (const rt of RUNTIME_IDS) {
      const { s } = await submitAndWait(student, { runtime: rt, code: sumArray.templates[rt]!.solution, kind: 'submit' });
      expect([rt, s.verdict, s.score]).toEqual([rt, 'AC', 100]);
    }
  });

  it('reports wrong answers, compile errors and timeouts', async () => {
    const wa = await submitAndWait(student, { runtime: 'python', code: 'def sum_array(a):\n    return sum(a) + 1\n', kind: 'submit' });
    expect(wa.s.verdict).toBe('WA');
    expect(wa.s.score).toBe(0);
    const ce = await submitAndWait(student, { runtime: 'c', code: 'long long sum_array(int n, const long long *a) { return undeclared; }', kind: 'run' });
    expect(ce.s.verdict).toBe('CE');
    expect(ce.s.compileOutput).toMatch(/solution\.c:1:\d+: error: .undeclared/);
    expect(ce.s.compileOutput).not.toContain('scanf');
    const tle = await submitAndWait(student, { runtime: 'cpp', code: 'long long sumArray(const vector<long long>& a) { volatile long long x = 0; for(;;) x++; }', kind: 'run' });
    expect(tle.s.verdict).toBe('TLE');
  });

  it('custom input shows the program output', async () => {
    const { s } = await submitAndWait(student, { runtime: 'python', code: sumArray.templates.python!.solution, kind: 'run', customInput: '3\n10 20 30\n' });
    expect(s.tests[0]).toMatchObject({ verdict: 'AC', stdout: '60\n' });
  });

  it('measures end-to-end latency for simple submissions (POST → final verdict)', async () => {
    const results: Record<string, { runP50: number; runP95: number; submitP50: number; submitP95: number }> = {};
    const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)]!;
    for (const rt of RUNTIME_IDS) {
      const run: number[] = [];
      const submit: number[] = [];
      for (let i = 0; i < 5; i++) {
        // Vary the code so the timing includes a real compile each time.
        const code = `${sumArray.templates[rt]!.solution}\n${rt === 'python' ? '#' : '//'} v${i}-${Date.now()}\n`;
        run.push((await submitAndWait(student, { runtime: rt, code, kind: 'run' })).ms);
        submit.push((await submitAndWait(student, { runtime: rt, code, kind: 'submit' })).ms);
      }
      results[rt] = { runP50: Math.round(pct(run, 50)), runP95: Math.round(pct(run, 95)), submitP50: Math.round(pct(submit, 50)), submitP95: Math.round(pct(submit, 95)) };
    }
    writeFileSync('/tmp/hbe-e2e-latency.json', JSON.stringify(results, null, 2));
    for (const r of Object.values(results)) expect(r.runP95).toBeLessThan(10_000);
  });
});
