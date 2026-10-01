import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { promisify } from 'node:util';
import { RUNTIME_IDS, type Capability } from '@hbe/shared';
import type { ExecutorConfig } from './config.js';
import { dbRunners } from './db/index.js';
import { RUNTIME_SPECS } from './runtimes.js';

const run = promisify(execFile);

/**
 * Check what this executor can really run. A runtime whose version drifted, a missing browser,
 * or an unreachable DB runner is not offered to the API, so jobs never land on an executor that
 * cannot serve them, and the version labels students see match what actually runs their code.
 */
export type RunnerCapability = 'db:postgres' | 'db:mysql' | 'db:mongodb';

/** Probe one configured DB runner; resolves to its version label or rejects. */
export function probeRunner(cfg: ExecutorConfig, cap: RunnerCapability): Promise<string> {
  const r = dbRunners(cfg);
  const runner = cap === 'db:postgres' ? r.pg : cap === 'db:mysql' ? r.my : r.mongo;
  if (!runner) return Promise.reject(new Error('not configured'));
  return runner.version();
}

export async function detectRuntimes(cfg?: ExecutorConfig): Promise<{ available: Capability[]; versions: Record<string, string>; problems: string[]; pendingRunners: RunnerCapability[] }> {
  const available: Capability[] = [];
  const versions: Record<string, string> = {};
  const problems: string[] = [];
  /** Configured runners that did not answer yet (e.g. still starting); main.ts keeps probing them. */
  const pendingRunners: RunnerCapability[] = [];
  for (const id of RUNTIME_IDS) {
    const spec = RUNTIME_SPECS[id];
    try {
      const { stdout, stderr } = await run(spec.versionCmd[0]!, spec.versionCmd.slice(1), { timeout: 15_000 });
      const text = `${stdout}\n${stderr}`;
      const line = text.split('\n').find((l) => spec.versionPattern.test(l));
      if (line) {
        available.push(id);
        versions[id] = line.trim();
      } else {
        problems.push(`${id}: version mismatch (${text.split('\n')[0]?.trim()})`);
      }
    } catch (e) {
      problems.push(`${id}: not installed (${(e as Error).message.split('\n')[0]})`);
    }
  }
  if (!cfg) return { available, versions, problems, pendingRunners };

  try {
    accessSync(cfg.chromiumPath, constants.X_OK);
    const { stdout } = await run(cfg.chromiumPath, ['--version'], { timeout: 15_000 });
    available.push('web:html', 'web:react');
    versions.web = stdout.trim();
  } catch (e) {
    problems.push(`web: chromium unavailable (${(e as Error).message.split('\n')[0]})`);
  }
  try {
    const { stdout } = await run('/usr/bin/python3', ['-c', 'import pandas; print(pandas.__version__)'], { timeout: 30_000 });
    if (/^2\./.test(stdout.trim())) {
      available.push('db:pandas');
      versions.pandas = `pandas ${stdout.trim()}`;
    } else problems.push(`pandas: unexpected version ${stdout.trim()}`);
  } catch {
    problems.push('pandas: not installed');
  }
  const urls: Record<RunnerCapability, string | undefined> = { 'db:postgres': cfg.pgRunnerUrl, 'db:mysql': cfg.mysqlRunnerUrl, 'db:mongodb': cfg.mongoRunnerUrl };
  const envName: Record<RunnerCapability, string> = { 'db:postgres': 'PG_RUNNER_URL', 'db:mysql': 'MYSQL_RUNNER_URL', 'db:mongodb': 'MONGO_RUNNER_URL' };
  for (const cap of Object.keys(urls) as RunnerCapability[]) {
    if (!urls[cap]) {
      problems.push(`${cap}: ${envName[cap]} not set`);
      continue;
    }
    try {
      versions[cap] = await probeRunner(cfg, cap);
      available.push(cap);
    } catch (e) {
      problems.push(`${cap}: runner unreachable (${(e as Error).message.split('\n')[0]})`);
      pendingRunners.push(cap);
    }
  }
  return { available, versions, problems, pendingRunners };
}
