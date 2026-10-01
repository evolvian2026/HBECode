import { z } from 'zod';
import { RUNTIME_IDS, REQUIRED_RUNTIMES, type RuntimeId } from '../runtimes.js';

export const DIFFICULTIES = ['easy', 'moderate', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const QUESTION_STATUSES = ['draft', 'validating', 'invalid', 'published', 'archived'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const COMPARE_MODES = ['exact', 'trim_trailing', 'unordered_lines', 'float'] as const;
export const CompareConfig = z
  .object({
    mode: z.enum(COMPARE_MODES),
    /** Absolute-or-relative tolerance for `float` mode. */
    epsilon: z.number().positive().max(1).optional(),
  })
  .refine((c) => c.mode !== 'float' || c.epsilon !== undefined, { message: 'epsilon is required for float mode' });
export type CompareConfig = z.infer<typeof CompareConfig>;

const MAX_TEST_BYTES = 4 * 1024 * 1024;
const TestText = z.string().max(MAX_TEST_BYTES);

export const SampleCase = z.object({
  input: TestText,
  output: TestText,
  explanation: z.string().max(5000).default(''),
});
export const HiddenCase = z.object({
  input: TestText,
  output: TestText,
  weight: z.number().int().min(1).max(100).default(1),
  isStress: z.boolean().default(false),
});

const Code = z.string().max(64 * 1024);
export const LanguageTemplate = z.object({
  stub: Code,
  driver: Code,
  solution: Code,
});
export type LanguageTemplate = z.infer<typeof LanguageTemplate>;

/** Draft-tolerant shape: publish-time rules are checked by `publishProblems`. */
export const CodingQuestionInput = z.object({
  title: z.string().trim().min(3).max(200),
  statement: z.string().max(20000),
  constraints: z.string().max(5000).default(''),
  inputFormat: z.string().max(5000).default(''),
  outputFormat: z.string().max(5000).default(''),
  difficulty: z.enum(DIFFICULTIES),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(10).default([]),
  timeComplexity: z.string().max(50).default(''),
  spaceComplexity: z.string().max(50).default(''),
  baseTimeLimitMs: z.number().int().min(100).max(10000).default(1000),
  memoryLimitMb: z.number().int().min(32).max(1024).default(256),
  compare: CompareConfig.default({ mode: 'trim_trailing' }),
  isPractice: z.boolean().default(false),
  samples: z.array(SampleCase).max(2).default([]),
  hidden: z.array(HiddenCase).max(15).default([]),
  templates: z.partialRecord(z.enum(RUNTIME_IDS), LanguageTemplate).default({}),
  /** Super admin only: put the question in the global bank (tenant_id NULL). */
  global: z.boolean().optional(),
});
export type CodingQuestionInput = z.infer<typeof CodingQuestionInput>;

export const QuestionListQuery = z.object({
  q: z.string().max(100).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  status: z.enum(QUESTION_STATUSES).optional(),
  tag: z.string().max(40).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** Structural publish rules (execution-based validation runs separately on the executor). */
export function publishProblems(q: CodingQuestionInput): string[] {
  const problems: string[] = [];
  if (q.statement.trim().length < 20) problems.push('statement is too short');
  if (!q.constraints.trim()) problems.push('constraints are required');
  if (!q.inputFormat.trim()) problems.push('input format is required');
  if (!q.outputFormat.trim()) problems.push('output format is required');
  if (!q.timeComplexity.trim() || !q.spaceComplexity.trim()) problems.push('time and space complexity are required');
  if (q.samples.length !== 2) problems.push('exactly 2 sample test cases are required');
  q.samples.forEach((s, i) => {
    if (!s.explanation.trim()) problems.push(`sample ${i + 1} needs an explanation`);
  });
  if (q.hidden.length < 10 || q.hidden.length > 15) problems.push('10–15 hidden test cases are required');
  if (q.difficulty !== 'easy' && !q.hidden.some((h) => h.isStress)) {
    problems.push('moderate/hard questions need at least one max-constraint stress test');
  }
  const seen = new Set<string>();
  for (const [i, t] of [...q.samples, ...q.hidden].entries()) {
    const key = t.input.replace(/\s+$/g, '');
    if (seen.has(key)) problems.push(`test case ${i + 1} duplicates an earlier input`);
    seen.add(key);
  }
  for (const rt of REQUIRED_RUNTIMES) {
    if (!q.templates[rt]) problems.push(`template for ${rt} is required`);
  }
  for (const [rt, t] of Object.entries(q.templates) as [RuntimeId, LanguageTemplate][]) {
    if (!t.stub.trim() || !t.driver.trim() || !t.solution.trim()) {
      problems.push(`${rt}: stub, driver and solution are all required`);
    }
  }
  return problems;
}
