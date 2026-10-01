import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import type { ExecutorConfig } from './config.js';

/**
 * Prepare cgroups for nsjail.
 * v1: nsjail needs a writable NSJAIL parent in each controller hierarchy.
 * v2: controllers can only be delegated to children of a cgroup that has no processes of its own,
 *     so the agent moves itself into a leaf (`agent`) and enables memory/pids/cpu for siblings.
 */
export async function prepareCgroups(cfg: ExecutorConfig): Promise<void> {
  if (!cfg.cgroupV2) {
    for (const c of ['memory', 'pids', 'cpu']) await mkdir(`${cfg.cgroupRoot}/${c}/NSJAIL`, { recursive: true });
    return;
  }
  const root = cfg.cgroupRoot;
  await mkdir(`${root}/agent`, { recursive: true });
  const procs = (await readFile(`${root}/cgroup.procs`, 'utf8')).split('\n').filter(Boolean);
  for (const pid of procs) {
    try {
      await appendFile(`${root}/agent/cgroup.procs`, pid);
    } catch {
      /* kernel threads / exited processes */
    }
  }
  await writeFile(`${root}/cgroup.subtree_control`, '+memory +pids +cpu');
}
