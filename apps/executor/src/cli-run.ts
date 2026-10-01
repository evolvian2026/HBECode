/** Run one job from stdin and print the result: `node dist/cli-run.js < job.json` (tests, validator). */
import { ExecJob } from '@hbe/shared';
import { prepareCgroups } from './cgroups.js';
import { loadConfig } from './config.js';
import { runJob } from './runner.js';

const chunks: Buffer[] = [];
for await (const c of process.stdin) chunks.push(c as Buffer);
const cfg = loadConfig();
await prepareCgroups(cfg);
const job = ExecJob.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
const out = JSON.stringify(await runJob(cfg, job));
// DB runner pools keep the event loop alive: exit once the result is flushed.
process.stdout.write(out, () => process.exit(0));
