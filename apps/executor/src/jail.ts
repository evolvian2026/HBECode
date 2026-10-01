import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { ExecutorConfig } from './config.js';

export interface JailOptions {
  argv: string[];
  env: Record<string, string>;
  workdir: string;
  /** Compile steps get a writable /box; test runs get it read-only. */
  writableBox: boolean;
  stdin: string;
  cpuMs: number;
  wallMs: number;
  memMb: number;
  pids: number;
  tmpfsMb: number;
  /** Max bytes written to any file (RLIMIT_FSIZE). */
  fileSizeMb: number;
  /** Max captured stdout bytes; exceeding it kills the run (OLE). */
  stdoutLimit: number;
  stderrLimit: number;
  extraMounts: string[];
  /** CPU bandwidth for the jail in ms per second (1000 = one core). */
  cpuMsPerSec: number;
}

export interface JailStats {
  cpuMs: number;
  memKb: number;
  exitCode: number;
  signal: number;
  wallTimeout: boolean;
}

export interface JailResult {
  stdout: string;
  stderr: string;
  outputExceeded: boolean;
  wallMs: number;
  /** Null when the jail itself failed (setup error) — treated as an internal error. */
  stats: JailStats | null;
  jailError?: string;
}

const BASE_MOUNTS = ['/usr', '/lib', '/lib64', '/bin', '/etc/ld.so.cache', '/etc/alternatives', '/dev/null', '/dev/zero', '/dev/urandom', '/dev/random'];

export function buildNsjailArgs(cfg: ExecutorConfig, o: JailOptions): string[] {
  const args = [
    '-Mo',
    '--quiet',
    '--hostname', 'jail',
    // Map the jailed uid/gid 65534 to the host's 65534 ("nobody"); nothing runs as root inside.
    '-u', '65534:65534:1',
    '-g', '65534:65534:1',
    '--time_limit', String(Math.ceil(o.wallMs / 1000) + 2),
    '--rlimit_as', 'inf',
    '--rlimit_cpu', String(Math.ceil(o.cpuMs / 1000) + 2),
    '--rlimit_fsize', String(o.fileSizeMb),
    '--rlimit_nofile', '128',
    '--rlimit_stack', '256', // MB; 'inf' makes glibc unable to create threads
    '--rlimit_core', '0',
    '--cgroup_mem_max', String((o.memMb * 1024 * 1024) | 0),
    '--cgroup_pids_max', String(o.pids),
    '--cgroup_cpu_ms_per_sec', String(o.cpuMsPerSec),
    '--iface_no_lo', // net namespace without even loopback
    '--seccomp_policy', cfg.seccompPolicy,
    '--pass_fd', '3',
    '--cwd', '/box',
    '--env', 'LANG=C.UTF-8',
    '--env', 'HOME=/tmp',
  ];
  if (cfg.cgroupV2) {
    args.push('--use_cgroupv2', '--cgroupv2_mount', cfg.cgroupRoot, '--cgroup_mem_swap_max', '0');
  }
  for (const [k, v] of Object.entries(o.env)) args.push('--env', `${k}=${v}`);
  for (const m of [...BASE_MOUNTS, ...o.extraMounts]) {
    if (existsSync(m)) args.push('-R', m);
  }
  args.push('-R', `${cfg.hbeRunPath}:/opt/hbe-run/hbe-run`);
  args.push(o.writableBox ? '-B' : '-R', `${o.workdir}:/box`);
  args.push('-m', `none:/tmp:tmpfs:size=${o.tmpfsMb * 1024 * 1024}`);
  args.push('--', '/opt/hbe-run/hbe-run', String(o.cpuMs), String(o.wallMs), '--', ...o.argv);
  return args;
}

function parseStats(line: string): JailStats | null {
  const m = /^(\d+) (\d+) (-?\d+) (\d+) ([01])\s*$/.exec(line);
  if (!m) return null;
  return {
    cpuMs: Math.round(Number(m[1]) / 1000),
    memKb: Number(m[2]),
    exitCode: Number(m[3]),
    signal: Number(m[4]),
    wallTimeout: m[5] === '1',
  };
}

export function runInJail(cfg: ExecutorConfig, o: JailOptions): Promise<JailResult> {
  const args = buildNsjailArgs(cfg, o);
  const started = process.hrtime.bigint();
  return new Promise((resolve) => {
    const child = spawn(cfg.nsjailPath, args, { stdio: ['pipe', 'pipe', 'pipe', 'pipe'], env: {} });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let statsLine = '';
    let outputExceeded = false;
    let settled = false;

    // Hard backstop in case nsjail itself hangs.
    const killer = setTimeout(() => child.kill('SIGKILL'), o.wallMs + 5000);

    child.stdout.on('data', (b: Buffer) => {
      if (outputExceeded) return;
      outBytes += b.length;
      if (outBytes > o.stdoutLimit) {
        outputExceeded = true;
        out.push(b.subarray(0, Math.max(0, b.length - (outBytes - o.stdoutLimit))));
        // Close our end: the writer gets SIGPIPE/EPIPE and exits, and nsjail reaps it normally.
        // A program that ignores SIGPIPE keeps spinning until the wall-clock limit kills it.
        child.stdout.destroy();
        return;
      }
      out.push(b);
    });
    child.stderr.on('data', (b: Buffer) => {
      if (errBytes >= o.stderrLimit) return;
      errBytes += b.length;
      err.push(errBytes > o.stderrLimit ? b.subarray(0, b.length - (errBytes - o.stderrLimit)) : b);
    });
    const statsStream = child.stdio[3] as NodeJS.ReadableStream;
    statsStream.on('data', (b: Buffer) => {
      if (statsLine.length < 200) statsLine += b.toString('utf8');
    });
    child.stdin.on('error', () => {
      /* EPIPE when the program exits without reading all input: expected */
    });
    child.stdin.end(o.stdin);

    const finish = (jailError?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(killer);
      const wallMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
      resolve({
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        outputExceeded,
        wallMs,
        stats: outputExceeded ? null : parseStats(statsLine),
        jailError,
      });
    };
    child.on('error', (e) => finish(`spawn failed: ${e.message}`));
    child.on('close', (code) => {
      if (!outputExceeded && !parseStats(statsLine)) {
        finish(`jail exited with ${code} without stats`);
        return;
      }
      finish();
    });
  });
}
