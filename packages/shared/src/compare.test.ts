import { describe, expect, it } from 'vitest';
import { outputsMatch } from './compare.js';
import { hasPermission } from './roles.js';
import { CodingQuestionInput, publishProblems } from './schemas/questions.js';

describe('outputsMatch', () => {
  it('exact mode treats CRLF as LF but nothing else', () => {
    expect(outputsMatch('1\r\n2\r\n', '1\n2\n', { mode: 'exact' })).toBe(true);
    expect(outputsMatch('1\n2', '1\n2\n', { mode: 'exact' })).toBe(false);
  });
  it('trim_trailing ignores trailing spaces and blank lines only', () => {
    expect(outputsMatch('a b  \n\n\n', 'a b', { mode: 'trim_trailing' })).toBe(true);
    expect(outputsMatch(' a b', 'a b', { mode: 'trim_trailing' })).toBe(false);
    expect(outputsMatch('a\n\nb', 'a\nb', { mode: 'trim_trailing' })).toBe(false);
  });
  it('unordered_lines compares line multisets', () => {
    expect(outputsMatch('b\na\na', 'a\na\nb', { mode: 'unordered_lines' })).toBe(true);
    expect(outputsMatch('b\na', 'a\na\nb', { mode: 'unordered_lines' })).toBe(false);
  });
  it('float mode uses absolute or relative epsilon and exact for words', () => {
    expect(outputsMatch('0.3333334 YES', '0.333333 YES', { mode: 'float', epsilon: 1e-6 })).toBe(true);
    expect(outputsMatch('1000000.5', '1000000.4', { mode: 'float', epsilon: 1e-6 })).toBe(true);
    expect(outputsMatch('0.34', '0.333333', { mode: 'float', epsilon: 1e-6 })).toBe(false);
    expect(outputsMatch('yes', 'YES', { mode: 'float', epsilon: 1e-6 })).toBe(false);
    expect(outputsMatch('1 2', '1 2 3', { mode: 'float', epsilon: 1e-6 })).toBe(false);
  });
});

describe('roles', () => {
  it('only super admin and teacher may write questions', () => {
    const writers = (['super_admin', 'client_admin', 'teacher', 'associate', 'student', 'guest'] as const).filter((r) =>
      hasPermission(r, 'question:write'),
    );
    expect(writers).toEqual(['super_admin', 'teacher']);
  });
});

describe('publishProblems', () => {
  it('reports missing pieces on an empty draft', () => {
    const q = CodingQuestionInput.parse({ title: 'Sum', statement: 'x', difficulty: 'moderate' });
    const p = publishProblems(q);
    expect(p).toContain('exactly 2 sample test cases are required');
    expect(p).toContain('10–15 hidden test cases are required');
    expect(p).toContain('template for python is required');
    expect(p).toContain('moderate/hard questions need at least one max-constraint stress test');
  });
  it('flags duplicate inputs', () => {
    const q = CodingQuestionInput.parse({
      title: 'Sum',
      statement: 'x',
      difficulty: 'easy',
      samples: [
        { input: '1 2\n', output: '3', explanation: 'e' },
        { input: '1 2', output: '3', explanation: 'e' },
      ],
    });
    expect(publishProblems(q).some((m) => m.includes('duplicates'))).toBe(true);
  });
});
