/**
 * Phase 7 exit criterion: every question in the seed bank passes the validator in the real
 * sandbox (hbe-executor + PostgreSQL/MySQL/MongoDB runners) — the same validation a teacher's
 * question goes through before it can be published.
 *
 *   BANK_STACKS=arrays,strings   validate only these stacks (default: all)
 *   BANK_SLOTS=3                 executor slots
 * Writes /tmp/hbe-seed-bank.json (per question: status, slowest test per runtime, problems).
 */
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BANK_QUESTIONS } from '../../../../packages/db/src/seed/index.js';
import { DOCKER_FLAGS, IMAGE, RUNNER_IMAGES } from '../../../executor/test/sandbox/harness.js';
import { PASSWORD, seedOrg, type Org } from '../fixtures.js';
import { Client, EXECUTOR_TOKEN, startApp, type TestApp } from '../harness.js';

const exec = promisify(execFile);
const PORT = 4779;
const RUNNERS = ['hbe-bank-pg', 'hbe-bank-mysql', 'hbe-bank-mongo'];
const only = process.env.BANK_STACKS?.split(',').map((s) => s.trim()).filter(Boolean);
const ITEMS = BANK_QUESTIONS.filter((x) => !only?.length || only.includes(x.stack));

let t: TestApp;
let org: Org;
let container = '';
let teacher: Client;

async function waitFor<T>(fn: () => Promise<T | undefined>, ms: number, step = 100): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, step));
  }
}

async function ip(name: string): Promise<string> {
  const { stdout } = await exec('docker', ['inspect', '-f', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', name]);
  return stdout.trim();
}

async function startDbRunners(): Promise<string[]> {
  for (const n of RUNNERS) await exec('docker', ['rm', '-f', n]).catch(() => undefined);
  await exec('docker', ['run', '-d', '--rm', '--name', 'hbe-bank-pg', '-e', 'POSTGRES_USER=runner_admin', '-e', 'POSTGRES_PASSWORD=bank-pg-pw', RUNNER_IMAGES.pg]);
  await exec('docker', ['run', '-d', '--rm', '--name', 'hbe-bank-mysql', '-e', 'MYSQL_ROOT_PASSWORD=bank-my-pw', RUNNER_IMAGES.mysql, '--local-infile=0', '--secure-file-priv=NULL', '--skip-name-resolve', '--performance-schema=0', '--innodb-buffer-pool-size=64M']);
  await exec('docker', ['run', '-d', '--rm', '--name', 'hbe-bank-mongo', '-e', 'MONGO_INITDB_ROOT_USERNAME=root', '-e', 'MONGO_INITDB_ROOT_PASSWORD=bank-mongo-pw', RUNNER_IMAGES.mongo, '--noscripting', '--wiredTigerCacheSizeGB', '0.25']);
  const ready = (cmd: string[]) => waitFor(() => exec('docker', cmd).then(() => true, () => undefined), 180_000, 1000);
  await ready(['exec', 'hbe-bank-pg', 'pg_isready', '-U', 'runner_admin']);
  await ready(['exec', 'hbe-bank-mysql', 'mysql', '-uroot', '-pbank-my-pw', '-e', 'SELECT 1']);
  await ready(['exec', 'hbe-bank-mongo', 'mongosh', '--quiet', '-u', 'root', '-p', 'bank-mongo-pw', '--eval', 'db.runCommand({ping:1})']);
  return [
    `PG_RUNNER_URL=postgres://runner_admin:bank-pg-pw@${await ip('hbe-bank-pg')}:5432/postgres`,
    `MYSQL_RUNNER_URL=mysql://root:bank-my-pw@${await ip('hbe-bank-mysql')}:3306`,
    `MONGO_RUNNER_URL=mongodb://root:bank-mongo-pw@${await ip('hbe-bank-mongo')}:27017/?authSource=admin`,
  ];
}

const needsDb = ITEMS.some((x) => x.question.type === 'db');

beforeAll(async () => {
  const runnerEnv = needsDb ? await startDbRunners() : [];
  t = await startApp({ SWEEPER_INTERVAL_MS: '5000', LOG_LEVEL: 'error' });
  await t.app.listen({ port: PORT, host: '127.0.0.1' });
  org = await seedOrg(t);
  const { stdout } = await exec('docker', [
    'run', '-d', '--rm', ...DOCKER_FLAGS, '--network', 'host',
    '-e', `EXECUTOR_API_URL=http://127.0.0.1:${PORT}`, '-e', `EXECUTOR_TOKEN=${EXECUTOR_TOKEN}`, '-e', 'EXECUTOR_ID=seed-bank', '-e', `EXECUTOR_SLOTS=${process.env.BANK_SLOTS ?? '3'}`,
    ...runnerEnv.flatMap((e) => ['-e', e]),
    IMAGE,
  ]);
  container = stdout.trim();
  teacher = new Client(t);
  await teacher.login(org.users.teacherA.email, PASSWORD);
});
afterAll(async () => {
  if (container) {
    if (process.env.BANK_EXECUTOR_LOG) await exec('sh', ['-c', `docker logs ${container} > ${process.env.BANK_EXECUTOR_LOG} 2>&1`]).catch(() => undefined);
    await exec('docker', ['rm', '-f', container]).catch(() => undefined);
  }
  if (needsDb) for (const n of RUNNERS) await exec('docker', ['rm', '-f', n]).catch(() => undefined);
  await t?.close();
});

interface Report { ok: boolean; pending: boolean; problems: string[]; runtimes: Record<string, { ok: boolean; maxCpuMs: number; limitMs: number }> }

describe('seed bank in the real sandbox', () => {
  it(`all ${ITEMS.length} questions pass the validator`, { timeout: 3 * 60 * 60_000 }, async () => {
    const t0 = Date.now();
    const created: { stack: string; title: string; id: string }[] = [];
    for (const { stack, question } of ITEMS) {
      const r = await teacher.post('/api/v1/questions', question);
      expect(r.statusCode, `${question.title}: ${r.body}`).toBe(201);
      const id = r.json().id as string;
      const v = await teacher.post(`/api/v1/questions/${id}/validate`, { publishIfValid: true });
      expect(v.statusCode, `${question.title}: ${v.body}`).toBeLessThan(300);
      created.push({ stack, title: question.title, id });
    }
    const results: { stack: string; title: string; status: string; problems: string[]; slowest: Record<string, string> }[] = [];
    for (const c of created) {
      const q = await waitFor(async () => {
        const x = (await teacher.get(`/api/v1/questions/${c.id}`)).json() as { status: string; validation?: Report };
        return x.status === 'published' || x.status === 'invalid' || (x.validation && !x.validation.pending) ? x : undefined;
      }, 60 * 60_000, 1000);
      const rt = q.validation?.runtimes ?? {};
      results.push({
        stack: c.stack, title: c.title, status: q.status, problems: q.validation?.problems ?? [],
        slowest: Object.fromEntries(Object.entries(rt).map(([k, x]) => [k, `${x.maxCpuMs}/${x.limitMs} ms`])),
      });
    }
    const failed = results.filter((r) => r.status !== 'published');
    const summary = { total: results.length, published: results.length - failed.length, minutes: Math.round((Date.now() - t0) / 6000) / 10, failed, results };
    writeFileSync('/tmp/hbe-seed-bank.json', JSON.stringify(summary, null, 2));
    console.log(`seed bank: ${summary.published}/${summary.total} published in ${summary.minutes} min`);
    for (const f of failed) console.log(`  ✗ ${f.stack} / ${f.title}: ${f.problems.join(' | ')}`);
    expect(failed.map((f) => `${f.stack} / ${f.title}: ${f.problems.join(' | ')}`)).toEqual([]);
  });
});
