import type { DbCompare, ResultSet } from './schemas/db.js';

/**
 * Compare two result sets under the question's rules. Returns a short, student-safe reason when
 * they differ (it describes the shape of the difference, never hidden data values).
 */
export function compareResults(actual: ResultSet, expected: ResultSet, cfg: DbCompare): { ok: boolean; reason?: string } {
  const norm = (c: string) => (cfg.columnNames === 'ignore_case' ? c.toLowerCase() : c);
  if (cfg.columnNames !== 'ignore') {
    const a = actual.columns.map(norm);
    const e = expected.columns.map(norm);
    if (a.length !== e.length || a.some((c, i) => c !== e[i])) {
      return { ok: false, reason: `columns differ: expected ${expected.columns.length} column(s)${cfg.columnNames === 'ignore_case' ? '' : ' (case-sensitive)'}, got [${actual.columns.join(', ')}]` };
    }
  } else if (actual.columns.length !== expected.columns.length) {
    return { ok: false, reason: `expected ${expected.columns.length} column(s), got ${actual.columns.length}` };
  }
  if (actual.truncated) return { ok: false, reason: 'result has too many rows' };
  if (actual.rows.length !== expected.rows.length) return { ok: false, reason: `expected ${expected.rows.length} row(s), got ${actual.rows.length}` };

  const a = actual.rows.map((r) => r.map(canon));
  const e = expected.rows.map((r) => r.map(canon));
  if (!cfg.orderSensitive) {
    a.sort(rowOrder);
    e.sort(rowOrder);
  }
  for (let i = 0; i < e.length; i++) {
    const ra = a[i]!;
    const re = e[i]!;
    for (let j = 0; j < re.length; j++) {
      if (!valueEqual(ra[j], re[j], cfg.floatEpsilon)) {
        return { ok: false, reason: cfg.orderSensitive ? `row ${i + 1} differs (order matters for this question)` : 'some rows differ' };
      }
    }
  }
  return { ok: true };
}

type Canon = null | number | string | boolean;

/** Normalise driver-specific types: numeric strings, bigint, Date, Buffer, nested JSON. */
export function canon(v: unknown): Canon {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'boolean') return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') {
    const t = v.trim();
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(t)) return Number(t);
    return v;
  }
  if (typeof v === 'object') return stableStringify(v);
  return String(v);
}

function valueEqual(a: Canon | undefined, b: Canon | undefined, eps: number): boolean {
  if (a === null || b === null || a === undefined || b === undefined) return a === b || (a == null && b == null);
  if (typeof a === 'number' && typeof b === 'number') {
    const d = Math.abs(a - b);
    return d <= eps || d <= eps * Math.max(Math.abs(a), Math.abs(b));
  }
  // MySQL returns booleans as 0/1.
  if (typeof a === 'boolean' && typeof b === 'number') return Number(a) === b;
  if (typeof b === 'boolean' && typeof a === 'number') return Number(b) === a;
  return a === b;
}

function rowOrder(x: Canon[], y: Canon[]): number {
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const a = x[i];
    const b = y[i];
    if (a === b) continue;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a) < String(b) ? -1 : 1;
  }
  return 0;
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

/** MongoDB documents → result set (one column per top-level key, union of keys, sorted). */
export function documentsToResult(docs: Record<string, unknown>[], ignoreId: boolean): ResultSet {
  const clean = docs.map((d) => {
    if (!ignoreId) return d;
    const { _id: _ignored, ...rest } = d;
    return rest;
  });
  const columns = [...new Set(clean.flatMap((d) => Object.keys(d)))].sort();
  return { columns, rows: clean.map((d) => columns.map((c) => (c in d ? d[c] : null))) };
}
