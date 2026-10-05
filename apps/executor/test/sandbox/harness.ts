import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { CodingJob, ExecJob, ExecResult, RuntimeId } from '@hbe/shared';

const exec = promisify(execFile);
export const IMAGE = process.env.EXECUTOR_IMAGE ?? 'hbe-executor:dev';

/** The flags documented for production (docs/deployment-executor.md) — tests use exactly these. */
export const DOCKER_FLAGS = [
  '--cap-drop', 'ALL',
  '--cap-add', 'SYS_ADMIN', '--cap-add', 'SETUID', '--cap-add', 'SETGID', '--cap-add', 'CHOWN',
  '--cap-add', 'DAC_OVERRIDE', '--cap-add', 'FOWNER', '--cap-add', 'KILL',
  '--security-opt', 'seccomp=unconfined', '--security-opt', 'apparmor=unconfined', '--security-opt', 'systempaths=unconfined',
  // Own cgroup namespace; the agent remounts its (container-scoped) cgroup tree read-write.
  '--cgroupns', 'private',
  // Read-only image, as in production; job directories on tmpfs (exec: compiled programs run there).
  '--read-only', '--tmpfs', '/var/lib/hbe-exec:exec,size=2g,mode=0711', '--tmpfs', '/tmp:size=256m',
];

/** DB runner servers as in production: no published ports, reachable only on a private network. */
export const RUNNER_IMAGES = {
  pg: process.env.PG_RUNNER_IMAGE ?? 'mirror.gcr.io/library/postgres:16-alpine',
  mysql: process.env.MYSQL_RUNNER_IMAGE ?? 'mirror.gcr.io/library/mysql:8.4',
  mongo: process.env.MONGO_RUNNER_IMAGE ?? 'mirror.gcr.io/library/mongo:8.0',
};
export const RUNNER_ENV = [
  '-e', 'PG_RUNNER_URL=postgres://runner_admin:runner-pg-pw@hbe-test-pg:5432/postgres',
  '-e', 'MYSQL_RUNNER_URL=mysql://root:runner-my-pw@hbe-test-mysql:3306',
  '-e', 'MONGO_RUNNER_URL=mongodb://root:runner-mongo-pw@hbe-test-mongo:27017/?authSource=admin',
];
const NET = 'hbe-test-net';

export async function startRunners(): Promise<void> {
  await exec('docker', ['network', 'create', '--internal', NET]).catch(() => undefined);
  const up = async (name: string, args: string[]) => {
    await exec('docker', ['rm', '-f', name]).catch(() => undefined);
    await exec('docker', ['run', '-d', '--rm', '--name', name, '--network', NET, ...args]);
  };
  await up('hbe-test-pg', ['-e', 'POSTGRES_USER=runner_admin', '-e', 'POSTGRES_PASSWORD=runner-pg-pw', RUNNER_IMAGES.pg]);
  await up('hbe-test-mysql', ['-e', 'MYSQL_ROOT_PASSWORD=runner-my-pw', RUNNER_IMAGES.mysql,
    '--local-infile=0', '--secure-file-priv=NULL', '--skip-name-resolve', '--performance-schema=0', '--innodb-buffer-pool-size=64M', '--max-connections=100']);
  await up('hbe-test-mongo', ['-e', 'MONGO_INITDB_ROOT_USERNAME=root', '-e', 'MONGO_INITDB_ROOT_PASSWORD=runner-mongo-pw', RUNNER_IMAGES.mongo, '--noscripting', '--wiredTigerCacheSizeGB', '0.25']);
  // Wait until all three accept connections.
  const wait = async (cmd: string[]) => {
    for (let i = 0; i < 120; i++) {
      if (await exec('docker', cmd).then(() => true, () => false)) return;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`runner not ready: ${cmd.join(' ')}`);
  };
  await wait(['exec', 'hbe-test-pg', 'pg_isready', '-U', 'runner_admin']);
  await wait(['exec', 'hbe-test-mysql', 'mysql', '-uroot', '-prunner-my-pw', '-e', 'SELECT 1']);
  await wait(['exec', 'hbe-test-mongo', 'mongosh', '--quiet', '-u', 'root', '-p', 'runner-mongo-pw', '--eval', 'db.runCommand({ping:1})']);
}

export async function stopRunners(): Promise<void> {
  for (const n of ['hbe-test-pg', 'hbe-test-mysql', 'hbe-test-mongo']) await exec('docker', ['rm', '-f', n]).catch(() => undefined);
}

export class Sandbox {
  private constructor(readonly container: string) {}

  static async start(opts: { runners?: boolean } = {}): Promise<Sandbox> {
    const { stdout } = await exec('docker', [
      'run', '-d', '--rm', ...DOCKER_FLAGS,
      ...(opts.runners ? ['--network', NET, ...RUNNER_ENV] : []),
      '-e', 'CANARY_SECRET=do-not-leak-7f3a', '-e', 'EXECUTOR_TEST_PARALLELISM=4',
      // tini as PID 1, as in production: reaps anything re-parented to the container init.
      '--entrypoint', '/usr/bin/tini', IMAGE, '--', '/bin/sleep', 'infinity',
    ]);
    return new Sandbox(stdout.trim());
  }

  async stop(): Promise<void> {
    await exec('docker', ['rm', '-f', this.container]).catch(() => undefined);
  }

  run(job: ExecJob): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const p = spawn('docker', ['exec', '-i', this.container, '/opt/node/bin/node', '/opt/hbe/agent/dist/cli-run.js']);
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      p.stdout.on('data', (b) => out.push(b));
      p.stderr.on('data', (b) => err.push(b));
      p.on('close', (code) => {
        const text = Buffer.concat(out).toString('utf8');
        if (code !== 0) return reject(new Error(`cli-run exited ${code}: ${Buffer.concat(err).toString('utf8')}`));
        resolve(JSON.parse(text) as ExecResult);
      });
      p.stdin.end(JSON.stringify(job));
    });
  }

  async sh(cmd: string): Promise<string> {
    const { stdout } = await exec('docker', ['exec', this.container, '/bin/sh', '-c', cmd]);
    return stdout;
  }
}

let n = 0;
export const nextId = () => `test-${++n}`;

export function job(runtime: RuntimeId, studentCode: string, driverCode: string, tests: { input: string; expected?: string; hidden?: boolean }[], over: Partial<CodingJob> = {}): CodingJob {
  return {
    type: 'coding',
    jobId: `test-${++n}`,
    kind: 'run',
    runtime,
    studentCode,
    driverCode,
    tests: tests.map((t, i) => ({ id: `t${i + 1}`, ordinal: i + 1, hidden: t.hidden ?? false, input: t.input, expected: t.expected })),
    limits: { cpuMs: 1000, memMb: 256, outputBytes: 1024 * 1024 },
    compare: { mode: 'trim_trailing' },
    stopOnFirstFailure: false,
    ...over,
  };
}
