import { compareResults, type DbJob, type ExecResult, type ExecTestResult, type Verdict } from '@hbe/shared';
import type { ExecutorConfig } from '../config.js';
import { MongoRunner } from './mongo.js';
import { MysqlRunner } from './mysql.js';
import { runPandas } from './pandas.js';
import { PostgresRunner, type SqlOutcome } from './postgres.js';

let pg: PostgresRunner | null = null;
let my: MysqlRunner | null = null;
let mongo: MongoRunner | null = null;

export function dbRunners(cfg: ExecutorConfig) {
  if (cfg.pgRunnerUrl) pg ??= new PostgresRunner(cfg.pgRunnerUrl, cfg.pgTemplateCache);
  if (cfg.mysqlRunnerUrl) my ??= new MysqlRunner(cfg.mysqlRunnerUrl);
  if (cfg.mongoRunnerUrl) mongo ??= new MongoRunner(cfg.mongoRunnerUrl);
  return { pg, my, mongo };
}

const VISIBLE_ROWS = 50;

function toTest(job: DbJob, ds: DbJob['datasets'][number], o: SqlOutcome & { stdout?: string; cpuMs?: number }): ExecTestResult {
  let verdict: Verdict;
  let detail: string | undefined;
  if (!o.ok) {
    verdict = o.timedOut ? 'TLE' : o.error?.startsWith('dataset setup failed') ? 'IE' : 'RE';
    detail = o.error;
  } else if (!ds.expected) {
    verdict = 'AC'; // validation run: the reference output becomes the expected result
  } else {
    const c = compareResults(o.result!, ds.expected, job.compare);
    verdict = c.ok ? 'AC' : 'WA';
    detail = c.reason;
  }
  const keepResult = job.kind === 'validate' || !ds.hidden;
  const result = keepResult && o.result ? (job.kind === 'validate' ? o.result : { ...o.result, rows: o.result.rows.slice(0, VISIBLE_ROWS), truncated: o.result.truncated || o.result.rows.length > VISIBLE_ROWS }) : undefined;
  return {
    id: ds.id,
    verdict,
    cpuMs: o.cpuMs ?? 0,
    wallMs: o.wallMs,
    memKb: 0,
    stdout: ds.hidden ? '' : (o.stdout ?? ''),
    stderr: '',
    // Authors see why a hidden dataset failed during validation; students never do.
    detail: ds.hidden && job.kind !== 'validate' ? undefined : detail,
    result,
  };
}

export async function runDbJob(cfg: ExecutorConfig, job: DbJob): Promise<ExecResult> {
  const base = { jobId: job.jobId, executorId: cfg.executorId };
  const t0 = Date.now();
  const r = dbRunners(cfg);
  const tests: ExecTestResult[] = [];
  if (job.dialect === 'pandas') {
    const sets = job.datasets.map((d) => (typeof d.setup === 'string' ? {} : d.setup));
    const out = await runPandas(cfg, job.code, sets, job.timeLimitMs);
    if (out.internal) return { ...base, compile: { ok: false, output: '', wallMs: out.wallMs }, tests: [], internalError: out.internal };
    if (out.compileError) return { ...base, compile: { ok: false, output: out.compileError, wallMs: out.wallMs }, tests: [] };
    job.datasets.forEach((ds, i) => {
      const o = out.outcomes[i]!;
      tests.push(toTest(job, ds, { ok: o.ok, result: o.result, error: o.error, timedOut: o.timedOut, wallMs: 0, stdout: o.stdout, cpuMs: o.cpuMs }));
    });
    return { ...base, compile: { ok: true, output: '', wallMs: Date.now() - t0 }, tests };
  }
  const runner = job.dialect === 'postgres' ? r.pg : job.dialect === 'mysql' ? r.my : r.mongo;
  if (!runner) return { ...base, compile: { ok: false, output: '', wallMs: 0 }, tests: [], internalError: `no ${job.dialect} runner configured` };
  for (const ds of job.datasets) {
    const setup = typeof ds.setup === 'string' ? ds.setup : '';
    const o =
      runner instanceof MongoRunner
        ? await runner.run({ setup, code: job.code, timeLimitMs: job.timeLimitMs, ignoreId: job.compare.ignoreMongoId })
        : await runner.run({ setup, code: job.code, mode: job.mode, stateQuery: ds.stateQuery, timeLimitMs: job.timeLimitMs });
    tests.push(toTest(job, ds, o));
  }
  return { ...base, compile: { ok: true, output: '', wallMs: Date.now() - t0 }, tests };
}
