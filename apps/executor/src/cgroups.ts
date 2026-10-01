import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import type { ExecutorConfig } from './config.js';

/**
 * Prepare cgroups for nsjail. The container must run with `--cgroupns private` (no bind mount of
 * the host's /sys/fs/cgroup): the cgroup tree it sees is then its own subtree, which Docker mounts
 * read-only; with CAP_SYS_ADMIN we remount it read-write so nsjail can create per-run children.
 *
 * v1: nsjail needs a writable NSJAIL parent in each controller hierarchy.
 * v2: controllers can only be delegated to children of a cgroup with no processes of its own, so
 *     the agent moves its processes into a leaf (`agent`) and enables memory/pids/cpu.
 */
export async function prepareCgroups(cfg: ExecutorConfig): Promise<void> {
  remountWritable();
  if (!cfg.cgroupV2) {
    for (const c of ['memory', 'pids', 'cpu']) await mkdir(`${cfg.cgroupRoot}/${c}/NSJAIL`, { recursive: true });
    return;
  }
  const root = cfg.cgroupRoot;
  const procs = readFileSync(`${root}/cgroup.procs`, 'utf8').split('\n').filter(Boolean);
  // Safety: refuse to touch a cgroup tree that contains processes outside our PID namespace
  // (that would mean the host's cgroup tree was mounted in, e.g. `-v /sys/fs/cgroup:...`).
  const foreign = procs.filter((p) => p !== '0' && !existsSync(`/proc/${p}`));
  if (foreign.length > 0) {
    throw new Error(
      `cgroup root ${root} contains ${foreign.length} processes outside this container. Run the executor with --cgroupns private and without mounting the host's /sys/fs/cgroup.`,
    );
  }
  await mkdir(`${root}/agent`, { recursive: true });
  for (const pid of procs) {
    try {
      await appendFile(`${root}/agent/cgroup.procs`, pid);
    } catch {
      /* exited processes */
    }
  }
  await writeFile(`${root}/cgroup.subtree_control`, '+memory +pids +cpu');
}

function remountWritable() {
  const mounts = readFileSync('/proc/mounts', 'utf8')
    .split('\n')
    .map((l) => l.split(' '))
    .filter((f) => f[2] === 'cgroup' || f[2] === 'cgroup2')
    .map((f) => ({ path: f[1]!, ro: (f[3] ?? '').split(',').includes('ro') }));
  for (const m of mounts) {
    if (!m.ro) continue;
    // Docker bind-mounts the container's cgroup subtree read-only; a bind remount flips it.
    for (const opts of ['remount,bind,rw', 'remount,rw']) {
      try {
        execFileSync('mount', ['-o', opts, m.path], { stdio: 'ignore' });
        break;
      } catch {
        /* try the next form; mkdir/writeFile below report a clear error if both fail */
      }
    }
  }
}
