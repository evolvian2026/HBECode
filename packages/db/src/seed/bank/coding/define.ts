import { RUNTIME_IDS, type CodingQuestionInput, type Difficulty, type RuntimeId } from '@hbe/shared';
import { mulberry32 } from '../../questions/rng.js';
import { driver, encodeInput, encodeOutput, formatText, studentFile, stub, type Param, type ReturnType, type Solution, type Value } from './codegen.js';

export interface CodingSpec {
  title: string;
  statement: string;
  constraints: string;
  difficulty: Difficulty;
  tags: string[];
  timeComplexity: string;
  spaceComplexity: string;
  /** camelCase; snake_case / PascalCase variants are derived per language. */
  fn: string;
  params: Param[];
  returns: ReturnType;
  /** Reference implementation: computes every expected output. */
  solve: (...args: never[]) => Value;
  samples: [{ args: Value[]; explanation: string }, { args: Value[]; explanation: string }];
  /** 10–13 hidden cases; mark the max-constraint ones as stress. */
  hidden: { args: Value[]; stress?: boolean; weight?: number }[];
  solutions: Record<RuntimeId, Solution | string>;
  baseTimeLimitMs?: number;
  memoryLimitMb?: number;
}

/** Build a canonical coding question: templates for all 8 languages, I/O formats and expected outputs. */
export function coding(spec: CodingSpec): CodingQuestionInput {
  const solve = spec.solve as (...args: Value[]) => Value;
  const run = (args: Value[]) => ({ input: encodeInput(spec.params, args), output: encodeOutput(spec.returns, solve(...args.map(clone))) });
  const { inputFormat, outputFormat } = formatText(spec.params, spec.returns);
  const templates = Object.fromEntries(
    RUNTIME_IDS.map((rt) => {
      const s = spec.solutions[rt];
      const sol = typeof s === 'string' ? { body: s } : s;
      return [rt, { stub: stub(rt, spec.fn, spec.params, spec.returns), driver: driver(rt, spec.fn, spec.params, spec.returns), solution: studentFile(rt, spec.fn, spec.params, spec.returns, sol) }];
    }),
  ) as CodingQuestionInput['templates'];
  const usesDouble = spec.returns === 'double' || spec.returns === 'double[]';
  return {
    type: 'coding',
    title: spec.title,
    statement: spec.statement,
    constraints: spec.constraints,
    inputFormat,
    outputFormat,
    difficulty: spec.difficulty,
    tags: spec.tags,
    timeComplexity: spec.timeComplexity,
    spaceComplexity: spec.spaceComplexity,
    baseTimeLimitMs: spec.baseTimeLimitMs ?? 1000,
    memoryLimitMb: spec.memoryLimitMb ?? 256,
    compare: usesDouble ? { mode: 'float', epsilon: 1e-6 } : { mode: 'trim_trailing' },
    isPractice: true,
    samples: spec.samples.map((s) => ({ ...run(s.args), explanation: s.explanation })),
    hidden: spec.hidden.map((h) => ({ ...run(h.args), weight: h.weight ?? 1, isStress: Boolean(h.stress) })),
    templates,
  };
}

const clone = <T extends Value>(v: T): T => (Array.isArray(v) ? (v.map(clone) as T) : v);

// ------------------------------------------------------------------------------- test data

export type Rng = () => number;
export const rng = (seed: number): Rng => mulberry32(seed);
/** Integer in [lo, hi]. */
export const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
export const ints = (r: Rng, n: number, lo: number, hi: number) => Array.from({ length: n }, () => int(r, lo, hi));
export const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
export const shuffle = <T>(r: Rng, xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};
export const word = (r: Rng, len: number, alphabet = 'abcdefghijklmnopqrstuvwxyz') => Array.from({ length: len }, () => alphabet[Math.floor(r() * alphabet.length)]).join('');
export const range = (n: number, from = 0) => Array.from({ length: n }, (_, i) => i + from);
