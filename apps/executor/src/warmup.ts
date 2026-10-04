import type { CodingJob, RuntimeId } from '@hbe/shared';
import type { ExecutorConfig } from './config.js';
import { runJob } from './runner.js';

/** Smallest program per runtime (student part + driver), printing 42. */
const PROGRAMS: Record<RuntimeId, { student: string; driver: string }> = {
  c: { student: 'int f(void) { return 42; }\n', driver: '#include <stdio.h>\n// @@STUDENT_CODE@@\nint main(void) { printf("%d\\n", f()); return 0; }\n' },
  cpp: { student: 'int f() { return 42; }\n', driver: '#include <bits/stdc++.h>\nusing namespace std;\n// @@STUDENT_CODE@@\nint main() { cout << f() << "\\n"; }\n' },
  java: { student: 'class Solution {\n    int f() { return 42; }\n}\n', driver: 'public class Main {\n    public static void main(String[] args) { System.out.println(new Solution().f()); }\n}\n' },
  python: { student: 'def f():\n    return 42\n', driver: '\nprint(f())\n' },
  javascript: { student: 'function f() { return 42; }\n', driver: '\nconsole.log(f());\n' },
  go: { student: 'package main\n\nfunc f() int { return 42 }\n', driver: 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println(f()) }\n' },
  rust: { student: 'fn f() -> i32 { 42 }\n', driver: '\nfn main() { println!("{}", f()); }\n' },
  csharp: {
    student: 'public class Solution\n{\n    public int F() { return 42; }\n}\n',
    driver: 'public static class Program\n{\n    public static void Main() { System.Console.WriteLine(new Solution().F()); }\n}\n',
  },
};

/**
 * Compile and run a tiny program in every coding runtime, one at a time, before claiming jobs.
 * After a reboot the toolchains (several GB) are cold on disk; eight compilers starting at once
 * then hit the compile time limit and students would see "Compilation timed out".
 */
export async function warmUp(cfg: ExecutorConfig, runtimes: readonly string[], log: (msg: string, extra?: Record<string, unknown>) => void): Promise<void> {
  for (const rt of Object.keys(PROGRAMS) as RuntimeId[]) {
    if (!runtimes.includes(rt)) continue;
    const job: CodingJob = {
      type: 'coding', jobId: `warmup-${rt}`, kind: 'run', runtime: rt, studentCode: PROGRAMS[rt].student, driverCode: PROGRAMS[rt].driver,
      tests: [{ id: 't', ordinal: 1, hidden: false, input: '', expected: '42\n' }], limits: { cpuMs: 5000, memMb: 256, outputBytes: 1024 }, compare: { mode: 'trim_trailing' }, stopOnFirstFailure: false,
    };
    const t0 = Date.now();
    const r = await runJob(cfg, job);
    const ok = r.compile.ok && r.tests[0]?.verdict === 'AC';
    log(ok ? 'warm-up ok' : 'warm-up failed', { runtime: rt, ms: Date.now() - t0, ...(ok ? {} : { compile: r.compile.output.slice(0, 300), verdict: r.tests[0]?.verdict, internalError: r.internalError }) });
  }
}
