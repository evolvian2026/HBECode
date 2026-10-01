import { Agent } from './agent.js';
import { prepareCgroups } from './cgroups.js';
import { loadConfig } from './config.js';
import { detectRuntimes } from './versions.js';

const log = (msg: string, extra: Record<string, unknown> = {}) =>
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'info', svc: 'executor', msg, ...extra })}\n`);

const cfg = loadConfig();
if (!cfg.token || cfg.token.length < 32) {
  log('EXECUTOR_TOKEN must be set (>= 32 chars)');
  process.exit(1);
}
await prepareCgroups(cfg);
const { available, versions, problems } = await detectRuntimes();
for (const p of problems) log('runtime unavailable', { problem: p });
if (available.length === 0) {
  log('no runtimes available; exiting');
  process.exit(1);
}
log('executor starting', { executorId: cfg.executorId, slots: cfg.slots, cgroupV2: cfg.cgroupV2, runtimes: available, versions });

const agent = new Agent(cfg, available, versions, log);
const shutdown = async (sig: string) => {
  log('shutting down', { sig });
  await agent.stop();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
await agent.start();
