import { chown, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { outputsMatch, type ExecJob, type ExecResult, type ExecTestResult, type Verdict } from '@hbe/shared';
import type { ExecutorConfig } from './config.js';
import { runInJail, type JailResult } from './jail.js';
import { RUNTIME_SPECS, type RuntimeSpec } from './runtimes.js';
import { sanitizeOutput, type SourceMap } from './sanitize.js';

const NOBODY = 65534;
const MARKER = '@@STUDENT_CODE@@';
const SIGKILL = 9;
const SIGXCPU = 24;
const SIGSYS = 31;

const COMPILE_LIMITS = { cpuMs: 15_000, wallMs: 20_000, memMb: 1536, pids: 256, tmpfsMb: 512, fileSizeMb: 256, cpuMsPerSec: 2000 };
const VISIBLE_OUTPUT_BYTES = 8 * 1024;

/** Build the files for the jail and remember where the student's code sits (for error remapping). */
export function layoutSources(spec: RuntimeSpec, studentCode: string, driverCode: string): { files: Record<string, string>; map: SourceMap } {
  const student = studentCode.replace(/\r\n?/g, '\n');
  const driver = driverCode.replace(/\r\n?/g, '\n');
  const studentLines = student.split('\n').length;
  if (spec.layout === 'separate') {
    return {
      files: { [spec.mainFile]: driver, [spec.studentFile!]: student },
      map: { spec, studentStart: 1, studentLines, driverCode: driver },
    };
  }
  const driverLines = driver.split('\n');
  const markerIdx = driverLines.findIndex((l) => l.includes(MARKER));
  if (markerIdx >= 0) {
    const before = driverLines.slice(0, markerIdx);
    const after = driverLines.slice(markerIdx + 1);
    const content = [...before, student, ...after].join('\n');
    return { files: { [spec.mainFile]: content }, map: { spec, studentStart: before.length + 1, studentLines, driverCode: driver } };
  }
  return {
    files: { [spec.mainFile]: `${student}\n${driver}` },
    map: { spec, studentStart: 1, studentLines, driverCode: driver },
  };
}

function verdictFor(job: ExecJob, spec: RuntimeSpec, r: JailResult, expected: string | undefined, cgroupMb: number): Verdict {
  if (r.outputExceeded) return 'OLE';
  const s = r.stats;
  if (!s) return 'IE';
  if (s.wallTimeout || s.signal === SIGXCPU || s.cpuMs > job.limits.cpuMs) return 'TLE';
  if (s.signal === SIGKILL && s.memKb >= cgroupMb * 1024 * 0.85) return 'MLE';
  if ((s.exitCode !== 0 || s.signal !== 0) && spec.oomPatterns.some((p) => p.test(r.stderr))) return 'MLE';
  if (s.signal === SIGKILL) return 'MLE'; // only the OOM killer sends SIGKILL inside the jail besides our timeouts
  if (s.exitCode !== 0 || s.signal !== 0) return 'RE';
  if (expected === undefined) return 'AC';
  return outputsMatch(r.stdout, expected, job.compare) ? 'AC' : 'WA';
}

function runtimeErrorNote(r: JailResult): string {
  const s = r.stats;
  if (!s) return '';
  if (s.signal === SIGSYS) return '\n[killed: forbidden system call]';
  if (s.signal === 11) return '\n[killed: segmentation fault]';
  if (s.signal === 6) return '\n[killed: aborted]';
  if (s.signal === 8) return '\n[killed: arithmetic exception]';
  if (s.signal) return `\n[killed by signal ${s.signal}]`;
  return '';
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>, stop: () => boolean): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    for (;;) {
      if (stop()) return;
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function runJob(cfg: ExecutorConfig, job: ExecJob): Promise<ExecResult> {
  const spec = RUNTIME_SPECS[job.runtime];
  await mkdir(cfg.workRoot, { recursive: true });
  const dir = await mkdtemp(join(cfg.workRoot, 'job-'));
  const base = { jobId: job.jobId, executorId: cfg.executorId };
  try {
    const { files, map } = layoutSources(spec, job.studentCode, job.driverCode);
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(dir, name), content, { mode: 0o644 });
    }
    // The compiler (running as nobody) writes its output into /box.
    await chown(dir, NOBODY, NOBODY);

    let compileWall = 0;
    if (spec.compile) {
      const c = await runInJail(cfg, {
        argv: spec.compile({ memMb: job.limits.memMb }),
        env: spec.env,
        workdir: dir,
        writableBox: true,
        stdin: '',
        cpuMs: COMPILE_LIMITS.cpuMs,
        wallMs: COMPILE_LIMITS.wallMs,
        memMb: COMPILE_LIMITS.memMb,
        pids: COMPILE_LIMITS.pids,
        tmpfsMb: COMPILE_LIMITS.tmpfsMb,
        fileSizeMb: COMPILE_LIMITS.fileSizeMb,
        stdoutLimit: 64 * 1024,
        stderrLimit: 64 * 1024,
        extraMounts: spec.mounts,
        cpuMsPerSec: COMPILE_LIMITS.cpuMsPerSec,
      });
      compileWall = c.wallMs;
      if (!c.stats) {
        return { ...base, compile: { ok: false, output: '', wallMs: compileWall }, tests: [], internalError: c.jailError ?? 'compile jail failed' };
      }
      if (c.stats.wallTimeout || c.stats.signal !== 0 || c.stats.exitCode !== 0) {
        const raw = c.stats.wallTimeout || c.stats.signal === SIGXCPU ? 'Compilation timed out.' : `${c.stderr}\n${c.stdout}`;
        return { ...base, compile: { ok: false, output: sanitizeOutput(raw, map), wallMs: compileWall }, tests: [] };
      }
    }

    const cgroupMb = job.limits.memMb + spec.memOverheadMb;
    let failed = false;
    const results = await pool(
      job.tests,
      cfg.testParallelism,
      async (t): Promise<ExecTestResult> => {
        const r = await runInJail(cfg, {
          argv: spec.run({ memMb: job.limits.memMb }),
          env: { ...spec.env, ...(spec.runEnv?.({ memMb: job.limits.memMb }) ?? {}) },
          workdir: dir,
          writableBox: false,
          stdin: t.input,
          cpuMs: job.limits.cpuMs,
          wallMs: Math.max(2000, job.limits.cpuMs * 2 + 1000),
          memMb: cgroupMb,
          pids: spec.pids,
          tmpfsMb: 64,
          fileSizeMb: 16,
          stdoutLimit: job.limits.outputBytes,
          stderrLimit: 16 * 1024,
          extraMounts: spec.mounts,
          cpuMsPerSec: 1000,
        });
        const verdict = verdictFor(job, spec, r, t.expected, cgroupMb);
        if (verdict !== 'AC' && t.hidden && job.stopOnFirstFailure) failed = true;
        const visible = !t.hidden;
        const trim = (s: string) => (s.length > VISIBLE_OUTPUT_BYTES ? `${s.slice(0, VISIBLE_OUTPUT_BYTES)}\n… (truncated)` : s);
        return {
          id: t.id,
          verdict,
          cpuMs: r.stats?.cpuMs ?? 0,
          wallMs: r.wallMs,
          memKb: r.stats?.memKb ?? 0,
          stdout: visible ? trim(r.stdout) : '',
          stderr: visible ? sanitizeOutput(r.stderr + (verdict === 'RE' ? runtimeErrorNote(r) : ''), map, 4096) : '',
        };
      },
      () => failed,
    );
    return {
      ...base,
      compile: { ok: true, output: '', wallMs: compileWall },
      tests: results.filter((x): x is ExecTestResult => x !== undefined),
    };
  } catch (e) {
    return { ...base, compile: { ok: false, output: '', wallMs: 0 }, tests: [], internalError: (e as Error).message };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
