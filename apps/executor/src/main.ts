import { Agent } from './agent.js';
import { prepareCgroups } from './cgroups.js';
import { loadConfig } from './config.js';
import { detectRuntimes, probeRunner } from './versions.js';
import { warmUp } from './warmup.js';

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'info', svc: 'executor', msg, ...extra })}\n`);

const cfg = loadConfig();
if (!cfg.token || cfg.token.length < 32) {
  log('EXECUTOR_TOKEN must be set (>= 32 chars)');
  process.exit(1);
}
await prepareCgroups(cfg);
const { available, versions, problems, pendingRunners } = await detectRuntimes(cfg);
for (const p of problems) log('runtime unavailable', { problem: p });
if (available.length === 0) {
  log('no runtimes available; exiting');
  process.exit(1);
}
log('executor starting', { executorId: cfg.executorId, slots: cfg.slots, cgroupV2: cfg.cgroupV2, runtimes: available, versions });

await warmUp(cfg, available, log);
const agent = new Agent(cfg, available, versions, log);

// DB runners that were not reachable yet (e.g. MySQL still initialising after a reboot) are
// re-probed until they answer, then offered; no executor restart needed.
let pending = [...pendingRunners];
const reprobe = setInterval(() => {
  void Promise.all(
    pending.map(async (cap) => {
      try {
        const v = await probeRunner(cfg, cap);
        agent.addCapability(cap, v);
        pending = pending.filter((c) => c !== cap);
        log('runtime now available', { runtime: cap, version: v });
      } catch {
        /* still down; try again next tick */
      }
    }),
  ).then(() => {
    if (pending.length === 0) clearInterval(reprobe);
  });
}, 10_000);
if (pending.length === 0) clearInterval(reprobe);
const shutdown = async (sig: string) => {
  log('shutting down', { sig });
  await agent.stop();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
await agent.start();
