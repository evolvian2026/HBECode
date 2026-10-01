import { RUNTIME_IDS, RUNTIMES, type ExecResult } from '@hbe/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sumArray } from '../../../../packages/db/src/seed/questions/sum-array.js';
import { job, Sandbox } from './harness.js';

let sb: Sandbox;
const timings: Record<string, { compileMs: number; maxTestWallMs: number; maxCpuMs: number; limitMs: number }> = {};

beforeAll(async () => {
  sb = await Sandbox.start();
});
afterAll(async () => {
  await sb?.stop();
  await import('node:fs').then((fs) => fs.writeFileSync(process.env.TIMINGS_OUT ?? '/tmp/hbe-exec-timings.json', JSON.stringify(timings, null, 2)));
});

const allTests = [
  ...sumArray.samples.map((s) => ({ input: s.input, expected: s.output, hidden: false })),
  ...sumArray.hidden.map((h) => ({ input: h.input, expected: h.output, hidden: true })),
];

describe.each(RUNTIME_IDS)('%s', (rt) => {
  const tpl = sumArray.templates[rt]!;
  const limitMs = Math.round(sumArray.baseTimeLimitMs * RUNTIMES[rt].timeMultiplier);

  it('reference solution passes every sample and hidden test within the time limit', async () => {
    const r: ExecResult = await sb.run(job(rt, tpl.solution, tpl.driver, allTests, { limits: { cpuMs: limitMs, memMb: 256, outputBytes: 1 << 20 } }));
    expect(r.internalError).toBeUndefined();
    expect(r.compile.ok, r.compile.output).toBe(true);
    expect(r.tests.map((t) => t.verdict)).toEqual(allTests.map(() => 'AC'));
    timings[rt] = {
      compileMs: r.compile.wallMs,
      maxTestWallMs: Math.max(...r.tests.map((t) => t.wallMs)),
      maxCpuMs: Math.max(...r.tests.map((t) => t.cpuMs)),
      limitMs,
    };
    // Validator rule: >= 30% headroom on the slowest test.
    expect(timings[rt]!.maxCpuMs).toBeLessThan(limitMs * 0.7);
    // Hidden tests return no output to the API.
    for (const t of r.tests.slice(2)) expect([t.stdout, t.stderr]).toEqual(['', '']);
  });

  it('the starter stub compiles but gives wrong answers', async () => {
    const r = await sb.run(job(rt, tpl.stub, tpl.driver, allTests.slice(0, 2), { limits: { cpuMs: limitMs, memMb: 256, outputBytes: 1 << 20 } }));
    expect(r.compile.ok, r.compile.output).toBe(true);
    expect(r.tests.map((t) => t.verdict)).toEqual(['WA', 'WA']);
  });

  it('a syntax error is reported as a compile/runtime error without leaking driver code', async () => {
    const broken = `${tpl.solution}\n@@@ this is not valid code @@@\n`;
    const r = await sb.run(job(rt, broken, tpl.driver, allTests.slice(0, 1)));
    const text = r.compile.output + (r.tests[0]?.stderr ?? '');
    if (r.compile.ok) expect(r.tests[0]!.verdict).toBe('RE');
    expect(text.length).toBeGreaterThan(0);
    // Driver-only identifiers must never appear in what the student sees.
    for (const secret of ['readLong', '__data', '_main', 'ReadToEnd', 'read_to_string', 'NewReaderSize', 'sync_with_stdio', 'malloc(sizeof']) {
      if (tpl.driver.includes(secret)) expect(text).not.toContain(secret);
    }
    expect(text).not.toContain('/box/');
  });
});

it('every pinned toolchain version matches what is installed', async () => {
  const out = await sb.sh('/opt/node/bin/node -e "import(\'/opt/hbe/agent/cli-versions.mjs\')"');
  const v = JSON.parse(out) as { available: string[]; problems: string[] };
  expect(v.problems).toEqual([]);
  expect(v.available.sort()).toEqual([...RUNTIME_IDS].sort());
});
