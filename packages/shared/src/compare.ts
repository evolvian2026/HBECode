import type { CompareConfig } from './schemas/questions.js';

function normaliseNewlines(s: string): string {
  return s.replace(/\r\n?/g, '\n');
}

/** Strip trailing whitespace on each line and trailing blank lines. */
function trimTrailing(s: string): string[] {
  const lines = normaliseNewlines(s)
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function floatEqual(a: string, b: string, eps: number): boolean {
  if (NUMBER.test(a) && NUMBER.test(b)) {
    const x = Number(a);
    const y = Number(b);
    const diff = Math.abs(x - y);
    return diff <= eps || diff <= eps * Math.max(Math.abs(x), Math.abs(y));
  }
  return a === b;
}

export function outputsMatch(actual: string, expected: string, cfg: Pick<CompareConfig, 'mode' | 'epsilon'>): boolean {
  switch (cfg.mode) {
    case 'exact':
      return normaliseNewlines(actual) === normaliseNewlines(expected);
    case 'trim_trailing': {
      const a = trimTrailing(actual);
      const e = trimTrailing(expected);
      return a.length === e.length && a.every((l, i) => l === e[i]);
    }
    case 'unordered_lines': {
      const a = trimTrailing(actual).sort();
      const e = trimTrailing(expected).sort();
      return a.length === e.length && a.every((l, i) => l === e[i]);
    }
    case 'float': {
      const eps = cfg.epsilon ?? 1e-6;
      const a = normaliseNewlines(actual).trim().split(/\s+/).filter(Boolean);
      const e = normaliseNewlines(expected).trim().split(/\s+/).filter(Boolean);
      return a.length === e.length && a.every((t, i) => floatEqual(t, e[i]!, eps));
    }
  }
}
