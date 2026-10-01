import { existsSync } from 'node:fs';
import { availableParallelism, hostname } from 'node:os';

export interface ExecutorConfig {
  apiUrl: string;
  token: string;
  executorId: string;
  slots: number;
  /** Max tests of one job run in parallel. */
  testParallelism: number;
  nsjailPath: string;
  hbeRunPath: string;
  seccompPolicy: string;
  workRoot: string;
  cgroupV2: boolean;
  cgroupRoot: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ExecutorConfig {
  const cgroupRoot = env.CGROUP_ROOT ?? '/sys/fs/cgroup';
  const cpus = availableParallelism();
  return {
    apiUrl: (env.EXECUTOR_API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, ''),
    token: env.EXECUTOR_TOKEN ?? '',
    executorId: env.EXECUTOR_ID ?? hostname(),
    slots: Number(env.EXECUTOR_SLOTS ?? Math.max(1, cpus - 1)),
    testParallelism: Number(env.EXECUTOR_TEST_PARALLELISM ?? Math.min(4, cpus)),
    nsjailPath: env.NSJAIL_PATH ?? '/usr/local/bin/nsjail',
    hbeRunPath: env.HBE_RUN_PATH ?? '/opt/hbe/hbe-run',
    seccompPolicy: env.SECCOMP_POLICY ?? '/opt/hbe/policy.kafel',
    workRoot: env.WORK_ROOT ?? '/var/lib/hbe-exec',
    cgroupV2: env.CGROUP_V2 ? env.CGROUP_V2 === '1' : existsSync(`${cgroupRoot}/cgroup.controllers`),
    cgroupRoot,
  };
}
