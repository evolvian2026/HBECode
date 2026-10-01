import { z } from 'zod';
import { Uuid } from './common.js';
import { RUNTIME_IDS } from '../runtimes.js';

export const MAX_SOURCE_BYTES = 64 * 1024;
export const MAX_CUSTOM_INPUT_BYTES = 64 * 1024;

export const CreateSubmissionRequest = z.object({
  questionId: Uuid,
  runtime: z.enum(RUNTIME_IDS),
  code: z.string().min(1).max(MAX_SOURCE_BYTES),
  kind: z.enum(['run', 'submit']),
  /** Only for `run`: replaces the sample tests with one custom input. */
  customInput: z.string().max(MAX_CUSTOM_INPUT_BYTES).optional(),
});
export type CreateSubmissionRequest = z.infer<typeof CreateSubmissionRequest>;

export const SaveDraftRequest = z.object({ code: z.string().max(MAX_SOURCE_BYTES) });

export const VERDICTS = ['AC', 'WA', 'TLE', 'MLE', 'RE', 'OLE', 'CE', 'IE'] as const;
export type Verdict = (typeof VERDICTS)[number];
export const VERDICT_LABELS: Record<Verdict, string> = {
  AC: 'Accepted',
  WA: 'Wrong answer',
  TLE: 'Time limit exceeded',
  MLE: 'Memory limit exceeded',
  RE: 'Runtime error',
  OLE: 'Output limit exceeded',
  CE: 'Compilation error',
  IE: 'Internal error',
};

export type SubmissionStatus = 'queued' | 'running' | 'done' | 'failed';

/** What the student is allowed to see about one test. Hidden tests expose verdict only. */
export interface ClientTestResult {
  ordinal: number;
  hidden: boolean;
  verdict: Verdict;
  /** Visible (sample/custom) tests only. */
  cpuMs?: number;
  memKb?: number;
  input?: string;
  expected?: string;
  stdout?: string;
  stderr?: string;
}

export interface ClientSubmission {
  id: string;
  questionId: string;
  runtime: string;
  kind: 'run' | 'submit';
  status: SubmissionStatus;
  verdict: Verdict | null;
  passed: number;
  total: number;
  score: number | null;
  compileOutput: string | null;
  tests: ClientTestResult[];
  createdAt: string;
  finishedAt: string | null;
}
