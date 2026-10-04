import type { DbDataset, DbQuestionInput } from '@hbe/shared';
import { mulberry32 } from '../../questions/rng.js';

export type Rng = () => number;
export const rng = (seed: number): Rng => mulberry32(seed);
export const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
export const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

export const NAMES = ['Aarav', 'Bhavna', 'Chirag', 'Divya', 'Eshan', 'Farah', 'Gaurav', 'Heena', 'Ishaan', 'Jaya', 'Kabir', 'Lata', 'Manav', 'Nisha', 'Omkar', 'Pooja', 'Rohan', 'Sana', 'Tarun', 'Uma', 'Varun', 'Waqar', 'Yamini', 'Zoya'];
export const CITIES = ['Agra', 'Bhopal', 'Chennai', 'Delhi', 'Indore', 'Jaipur', 'Kochi', 'Mumbai', 'Nagpur', 'Pune'];
/** Distinct names: first names, then first names with a numeric suffix. */
export const nameOf = (i: number) => (i < NAMES.length ? NAMES[i]! : `${NAMES[i % NAMES.length]!}${Math.floor(i / NAMES.length) + 1}`);

type Cell = string | number | null;
const lit = (v: Cell) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);

/** CREATE TABLE + INSERT (portable PostgreSQL / MySQL). */
export function table(name: string, ddl: string, columns: string[], rows: Cell[][]): string {
  let s = `CREATE TABLE ${name} (${ddl});\n`;
  for (let i = 0; i < rows.length; i += 500) {
    s += `INSERT INTO ${name} (${columns.join(', ')}) VALUES\n  ${rows.slice(i, i + 500).map((r) => `(${r.map(lit).join(', ')})`).join(',\n  ')};\n`;
  }
  return s;
}

export const ds = (sql: string, explanation = ''): DbDataset => ({ setup: { sql }, explanation, weight: 1 });

/** A portable SQL question (PostgreSQL + MySQL) with sensible defaults. */
export function sqlQuestion(q: Omit<DbQuestionInput, 'type' | 'dialects' | 'compare' | 'starters' | 'solutions' | 'isPractice' | 'timeLimitMs'> & {
  timeLimitMs?: number;
  solution: string;
  mysql?: string;
  starter: string;
  orderSensitive?: boolean;
}): DbQuestionInput {
  const { solution, mysql, starter, orderSensitive, ...rest } = q;
  return {
    type: 'db',
    dialects: ['postgres', 'mysql'],
    isPractice: true,
    ...rest,
    compare: { orderSensitive: orderSensitive ?? true, columnNames: 'ignore_case', floatEpsilon: 1e-6, ignoreMongoId: true },
    starters: { postgres: starter, mysql: starter },
    solutions: { postgres: solution, mysql: mysql ?? solution },
    timeLimitMs: q.timeLimitMs ?? 2000,
  };
}

export const md = (name: string, cols: [string, string][]) => `**${name}**\n\n| column | type |\n|---|---|\n${cols.map(([c, t]) => `| ${c} | ${t} |`).join('\n')}`;
