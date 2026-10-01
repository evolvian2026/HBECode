import { z } from 'zod';
import { RUNTIME_IDS } from './runtimes.js';
import { DB_DIALECTS, DbCompare } from './schemas/db.js';
import { COMPARE_MODES } from './schemas/questions.js';
import { VERDICTS } from './schemas/submissions.js';
import { CheckSpec, WEB_FRAMEWORKS, WebFile } from './schemas/web.js';

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

export const CodingJob = z.object({
  type: z.literal('coding'),
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
export type CodingJob = z.infer<typeof CodingJob>;

/** Web job: render files in jailed Chromium, evaluate each check from the grader side. */
export const WebJob = z.object({
  type: z.literal('web'),
  jobId: z.string(),
  kind: z.enum(['run', 'submit', 'validate']),
  framework: z.enum(WEB_FRAMEWORKS),
  files: z.array(WebFile).max(20),
  checks: z
    .array(
      z.object({
        id: z.string(),
        ordinal: z.number().int(),
        hidden: z.boolean(),
        title: z.string(),
        viewport: z.object({ width: z.number().int(), height: z.number().int() }).optional(),
        spec: CheckSpec,
      }),
    )
    .max(32),
  checkTimeoutMs: z.number().int().positive(),
});
export type WebJob = z.infer<typeof WebJob>;

const ResultSetSchema = z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.unknown())), truncated: z.boolean().optional() });

/** DB job: one fresh database per dataset; student code runs as a restricted user. */
export const DbJob = z.object({
  type: z.literal('db'),
  jobId: z.string(),
  kind: z.enum(['run', 'submit', 'validate']),
  dialect: z.enum(DB_DIALECTS),
  mode: z.enum(['query', 'dml']),
  code: z.string(),
  datasets: z
    .array(
      z.object({
        id: z.string(),
        ordinal: z.number().int(),
        hidden: z.boolean(),
        /** SQL / EJSON text, or table name → CSV for pandas. */
        setup: z.union([z.string(), z.record(z.string(), z.string())]),
        stateQuery: z.string().optional(),
        /** Absent on validation runs: the reference output becomes the expected result. */
        expected: ResultSetSchema.optional(),
      }),
    )
    .max(32),
  compare: DbCompare,
  timeLimitMs: z.number().int().positive(),
});
export type DbJob = z.infer<typeof DbJob>;

export const ExecJob = z.discriminatedUnion('type', [CodingJob, WebJob, DbJob]);
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
  /** Student-safe explanation for visible tests/checks (e.g. which property differed). */
  detail: z.string().optional(),
  /** DB jobs: the actual result (visible datasets, and all datasets on validation runs). */
  result: ResultSetSchema.optional(),
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

/** What an executor can run: coding runtimes plus `web:<framework>` and `db:<dialect>`. */
export const CAPABILITIES = [...RUNTIME_IDS, ...WEB_FRAMEWORKS.map((f) => `web:${f}` as const), ...DB_DIALECTS.map((d) => `db:${d}` as const)] as const;
export type Capability = (typeof CAPABILITIES)[number];

export function jobCapability(job: ExecJob): Capability {
  if (job.type === 'web') return `web:${job.framework}`;
  if (job.type === 'db') return `db:${job.dialect}`;
  return job.runtime;
}

export const ClaimRequest = z.object({
  executorId: z.string().min(1).max(100),
  runtimes: z.array(z.enum(CAPABILITIES)).min(1),
  versions: z.record(z.string(), z.string()).optional(),
});
