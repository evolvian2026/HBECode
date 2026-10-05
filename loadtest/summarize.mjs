// Turn a loadtest/run.sh output directory into one markdown table.   node loadtest/summarize.mjs <dir>
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node loadtest/summarize.mjs <results dir>');
const steps = readdirSync(dir)
  .map((f) => /^k6-(\d+)\.json$/.exec(f)?.[1])
  .filter(Boolean)
  .map(Number)
  .sort((a, b) => a - b);

const ms = (v) => (v === undefined || v === null ? '–' : v >= 10_000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
const pct = (v) => (v === undefined ? '–' : `${(v * 100).toFixed(v < 0.01 && v > 0 ? 2 : 1)} %`);

function stats(n) {
  const f = join(dir, `stats-${n}.csv`);
  const peak = {};
  if (!existsSync(f)) return peak;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const [, name, cpu, mem] = line.split(',');
    if (!name) continue;
    const svc = name.replace(/^hbecode-/, '').replace(/-1$/, '');
    const c = parseFloat(cpu);
    const m = /^([\d.]+)(KiB|MiB|GiB)/.exec(mem ?? '');
    const mib = m ? Number(m[1]) * { KiB: 1 / 1024, MiB: 1, GiB: 1024 }[m[2]] : 0;
    peak[svc] ??= { cpu: 0, mem: 0 };
    peak[svc].cpu = Math.max(peak[svc].cpu, c || 0);
    peak[svc].mem = Math.max(peak[svc].mem, mib);
  }
  return peak;
}

const rows = [];
for (const n of steps) {
  const d = JSON.parse(readFileSync(join(dir, `k6-${n}.json`), 'utf8')).metrics;
  // A metric with no samples (count 0) is missing, not 0 ms.
  const v = (k, s) => (d[k]?.values && (d[k].values.count ?? 1) > 0 ? d[k].values[s] : undefined);
  const p = stats(n);
  rows.push({
    n,
    login: v('login_ms', 'p(95)'),
    start: v('http_req_duration{name:start_attempt}', 'p(95)'),
    heartbeat: v('http_req_duration{name:heartbeat}', 'p(95)'),
    draft: v('http_req_duration{name:draft}', 'p(95)'),
    events: v('http_req_duration{name:events}', 'p(95)'),
    live: v('http_req_duration{name:live_monitor}', 'p(95)'),
    run50: v('run_to_verdict_ms', 'med'),
    run95: v('run_to_verdict_ms', 'p(95)'),
    runs: v('run_to_verdict_ms', 'count'),
    sub50: v('submit_to_verdict_ms', 'med'),
    sub95: v('submit_to_verdict_ms', 'p(95)'),
    subMax: v('submit_to_verdict_ms', 'max'),
    errors: v('http_req_failed{kind:student}', 'rate'),
    ok: v('verdict_ok', 'rate'),
    ws: v('ws_open_ok', 'rate'),
    reqs: v('http_reqs', 'count'),
    api: p.api,
    pg: p.postgres,
    ex: p.executor,
  });
}

const peak = (x) => (x ? `${Math.round(x.cpu)} % / ${Math.round(x.mem)} MiB` : '–');
let out = `# Load test results: ${dir}\n\n`;
out += '| Students | login p95 | start attempt p95 | heartbeat p95 | draft save p95 | events p95 | live monitor p95 | Run → verdict p50 / p95 (n) | Submit → verdict p50 / p95 / max | HTTP errors | AC verdicts | WS opened |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) {
  out += `| ${r.n} | ${ms(r.login)} | ${ms(r.start)} | ${ms(r.heartbeat)} | ${ms(r.draft)} | ${ms(r.events)} | ${ms(r.live)} | ${ms(r.run50)} / ${ms(r.run95)} (${r.runs ?? 0}) | ${ms(r.sub50)} / ${ms(r.sub95)} / ${ms(r.subMax)} | ${pct(r.errors)} | ${pct(r.ok)} | ${pct(r.ws)} |\n`;
}
out += '\nPeak container CPU (100 % = one core) / memory, sampled every ~5 s:\n\n| Students | API | Postgres | Executor | requests |\n|---|---|---|---|---|\n';
for (const r of rows) out += `| ${r.n} | ${peak(r.api)} | ${peak(r.pg)} | ${peak(r.ex)} | ${r.reqs ?? '–'} |\n`;
process.stdout.write(out);
