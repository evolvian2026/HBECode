/**
 * Phase 7: structural checks on the seed bank (no database). Execution-based validation of
 * every reference solution runs in the real sandbox: apps/api/test/e2e/seed-bank.test.ts.
 */
import { QuestionInput, questionProblems, RUNTIME_IDS } from '@hbe/shared';
import { describe, expect, it } from 'vitest';
import { BANK, BANK_QUESTIONS } from '../src/seed/bank/index.js';

const OUTPUT_CAP = 512 * 1024; // the executor captures at most 1 MB per test

describe('seed bank', () => {
  it('has 17 stacks of 10 questions, 4 easy / 4 moderate / 2 hard each', () => {
    expect(BANK).toHaveLength(17);
    for (const s of BANK) {
      const by = (d: string) => s.questions.filter((q) => q.difficulty === d).length;
      expect({ stack: s.id, n: s.questions.length, easy: by('easy'), moderate: by('moderate'), hard: by('hard') }).toEqual({ stack: s.id, n: 10, easy: 4, moderate: 4, hard: 2 });
    }
    expect(new Set(BANK.map((s) => s.id)).size).toBe(BANK.length);
  });

  it('titles are unique', () => {
    const titles = BANK_QUESTIONS.map((x) => x.question.title.toLowerCase());
    expect(titles.filter((t, i) => titles.indexOf(t) !== i)).toEqual([]);
  });

  it.each(BANK_QUESTIONS.map((x) => [x.stack, x.question.title, x.question] as const))('%s / %s: valid and publishable', (_stack, _title, q) => {
    const parsed = QuestionInput.parse(q);
    expect(questionProblems(parsed)).toEqual([]);
    expect(parsed.isPractice).toBe(true);
    if (parsed.type === 'coding') {
      expect(Object.keys(parsed.templates).sort()).toEqual([...RUNTIME_IDS].sort());
      for (const t of [...parsed.samples, ...parsed.hidden]) expect(t.output.length).toBeLessThanOrEqual(OUTPUT_CAP);
      expect(parsed.hidden.some((h) => h.isStress)).toBe(true);
    }
    if (parsed.type === 'db' && parsed.dialects.some((d) => d === 'postgres' || d === 'mysql')) expect([...parsed.dialects].sort()).toEqual(['mysql', 'postgres']);
  });
});
