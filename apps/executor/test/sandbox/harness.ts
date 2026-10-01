import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { ExecJob, ExecResult, RuntimeId } from '@hbe/shared';

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
];

export class Sandbox {
  private constructor(readonly container: string) {}

  static async start(): Promise<Sandbox> {
    const { stdout } = await exec('docker', [
      'run', '-d', '--rm', ...DOCKER_FLAGS,
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
      const p = spawn('docker', ['exec', '-i', this.container, '/opt/node/bin/node', '/opt/hbe/agent/cli-run.mjs']);
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
export function job(runtime: RuntimeId, studentCode: string, driverCode: string, tests: { input: string; expected?: string; hidden?: boolean }[], over: Partial<ExecJob> = {}): ExecJob {
  return {
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
