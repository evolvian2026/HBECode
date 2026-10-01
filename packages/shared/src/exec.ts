import { z } from 'zod';
import { RUNTIME_IDS } from './runtimes.js';
import { COMPARE_MODES } from './schemas/questions.js';
import { VERDICTS } from './schemas/submissions.js';

/**
 * Contract between the API (dispatcher) and executor agents. The executor pulls jobs over
 * HTTPS; it never talks to Postgres or Redis. Expected outputs travel to the agent but never
 * enter the sandbox: comparison happens in the agent, outside the jail.
 */
export const ExecTest = z.object({
  id: z.string(),
  ordinal: z.number().int(),
  hidden: z.boolean(),
  input: z.string(),
  /** Absent for custom-input runs (no expected output). */
  expected: z.string().optional(),
});

export const ExecJob = z.object({
  jobId: z.string(),
  kind: z.enum(['run', 'submit', 'validate']),
  runtime: z.enum(RUNTIME_IDS),
  studentCode: z.string(),
  driverCode: z.string(),
  tests: z.array(ExecTest).max(64),
  limits: z.object({
    cpuMs: z.number().int().positive(),
    memMb: z.number().int().positive(),
    /** Max stdout bytes captured per test before OLE. */
    outputBytes: z.number().int().positive(),
  }),
  compare: z.object({ mode: z.enum(COMPARE_MODES), epsilon: z.number().optional() }),
  /** Stop after the first failing hidden test (saves CPU on submit). */
  stopOnFirstFailure: z.boolean().default(false),
});
export type ExecJob = z.infer<typeof ExecJob>;

export const ExecTestResult = z.object({
  id: z.string(),
  verdict: z.enum(VERDICTS),
  cpuMs: z.number().int().nonnegative(),
  wallMs: z.number().int().nonnegative(),
  memKb: z.number().int().nonnegative(),
  /** Truncated stdout/stderr; the API drops these for hidden tests. */
  stdout: z.string(),
  stderr: z.string(),
});
export type ExecTestResult = z.infer<typeof ExecTestResult>;

export const ExecResult = z.object({
  jobId: z.string(),
  /** CE when compilation failed (tests empty), IE on executor failure, otherwise per-test. */
  compile: z.object({ ok: z.boolean(), output: z.string(), wallMs: z.number().int().nonnegative() }),
  tests: z.array(ExecTestResult),
  internalError: z.string().optional(),
  executorId: z.string(),
});
export type ExecResult = z.infer<typeof ExecResult>;

export const ClaimRequest = z.object({
  executorId: z.string().min(1).max(100),
  runtimes: z.array(z.enum(RUNTIME_IDS)).min(1),
  versions: z.record(z.string(), z.string()).optional(),
});
