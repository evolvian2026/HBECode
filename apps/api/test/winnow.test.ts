import { describe, expect, it } from 'vitest';
import { comparePairs, fingerprints, sourceOf, subtract, tokenize } from '../dist/plagiarism/winnow.js';

const ORIGINAL = `
def longest_run(a):
    # count the longest run of equal neighbours
    best = cur = 1
    for i in range(1, len(a)):
        if a[i] == a[i - 1]:
            cur += 1
            if cur > best:
                best = cur
        else:
            cur = 1
    return best if a else 0
`;
// Same program: renamed variables, different comments and spacing.
const DISGUISED = `
def longest_run(values):
    """my own work"""
    answer = streak = 1
    for k in range(1, len(values)):
        if values[k] == values[k-1]:
            streak += 1   # grow
            if streak > answer:
                answer = streak
        else:
            streak = 1
    return answer if values else 0
`;
// A different, honest solution to the same problem.
const INDEPENDENT = `
from itertools import groupby

def longest_run(a):
    return max((sum(1 for _ in g) for _, g in groupby(a)), default=0)
`;
const STUB = `def longest_run(a):\n    # write your code here\n    pass\n`;

const doc = (id: string, src: string) => ({ id, fp: subtract(fingerprints(tokenize(src, 'python')), fingerprints(tokenize(STUB, 'python'))) });

describe('tokenizer', () => {
  it('normalises identifiers, numbers and strings and drops comments', () => {
    expect(tokenize('int total = 42; // sum\nprintf("%d", total);', 'c').map((t) => t.t)).toEqual(['int', 'I', '=', 'N', ';', 'I', '(', 'S', ',', 'I', ')', ';']);
    expect(tokenize('x = 1 # c\ns = """multi\nline"""\ny', 'python').map((t) => `${t.t}@${t.line}`)).toEqual(['I@1', '=@1', 'N@1', 'I@2', '=@2', 'S@2', 'I@4']);
    expect(tokenize('SELECT a -- note\nFROM t', 'postgres').map((t) => t.t)).toEqual(['select', 'I', 'from', 'I']);
  });
});

describe('similarity', () => {
  const opts = { threshold: 0.7, minFingerprints: 8, k: 5 };
  it('flags a copy with renamed variables, new comments and different spacing', () => {
    const pairs = comparePairs([doc('orig', ORIGINAL), doc('copy', DISGUISED), doc('own', INDEPENDENT)], opts);
    expect(pairs.map((p) => [p.a, p.b])).toEqual([['orig', 'copy']]);
    expect(pairs[0]!.similarity).toBeGreaterThan(0.9);
    // Matched regions cover the body of both functions.
    expect(pairs[0]!.regions.a[0]![0]).toBeLessThanOrEqual(5);
    expect(pairs[0]!.regions.b.at(-1)![1]).toBeGreaterThanOrEqual(11);
  });
  it('never pairs a student with themselves, and context documents only with focus documents', () => {
    const d = (id: string, src: string, owner: string, focus: boolean) => ({ ...doc(id, src), owner, focus });
    const pairs = comparePairs([d('mine-t1', ORIGINAL, 'u1', false), d('mine-t2', ORIGINAL, 'u1', true), d('other-t1', DISGUISED, 'u2', false), d('third-t1', ORIGINAL, 'u3', false)], opts);
    // u1's two answers are not a pair; u2/u3 (both context) are not compared with each other.
    expect(pairs.map((p) => [p.a, p.b].sort().join('+')).sort()).toEqual(['mine-t2+other-t1', 'mine-t2+third-t1']);
  });
  it('does not flag independent solutions, or code that is only the starter', () => {
    const all = comparePairs([doc('own', INDEPENDENT), doc('orig', ORIGINAL), doc('stub1', STUB), doc('stub2', STUB + '\n')], { ...opts, threshold: 0.3 });
    expect(all.find((p) => p.a.startsWith('stub') || p.b.startsWith('stub'))).toBeUndefined();
    expect(all.find((p) => [p.a, p.b].sort().join() === 'orig,own')).toBeUndefined();
  });
  it('containment: pasting a solution into a longer file still counts', () => {
    const padded = ORIGINAL + '\n' + Array.from({ length: 30 }, (_, i) => `def helper_${i}(x):\n    return x * ${i} + len(str(x))\n`).join('\n');
    const [p] = comparePairs([doc('orig', ORIGINAL), doc('padded', padded)], opts);
    expect(p?.similarity).toBeGreaterThan(0.9);
  });
  it('web submissions are compared on their files in path order', () => {
    expect(sourceOf(JSON.stringify([{ path: 'b.css', content: 'B' }, { path: 'a.html', content: 'A' }]), 'web')).toBe('A\nB');
  });
});
