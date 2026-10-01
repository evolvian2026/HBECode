import { z } from 'zod';
import { DIFFICULTIES } from './questions.js';

/**
 * Database / data questions: PostgreSQL, MySQL, MongoDB, Pandas (T-SQL is postponed).
 *
 * Each dataset carries its own hidden setup (DDL + seed rows, documents, or CSV tables). The
 * expected result for each dataset is computed by running the reference solution at validation
 * time, so it can never drift from the data. Hidden datasets must differ from the samples.
 */
export const DB_DIALECTS = ['postgres', 'mysql', 'mongodb', 'pandas'] as const;
export type DbDialect = (typeof DB_DIALECTS)[number];
export const SQL_DIALECTS: readonly DbDialect[] = ['postgres', 'mysql'];

export const DIALECT_INFO: Record<DbDialect, { label: string; version: string; monaco: string; studentFile: string }> = {
  postgres: { label: 'PostgreSQL', version: 'PostgreSQL 16', monaco: 'sql', studentFile: 'query.sql' },
  mysql: { label: 'MySQL', version: 'MySQL 8.4', monaco: 'mysql', studentFile: 'query.sql' },
  mongodb: { label: 'MongoDB', version: 'MongoDB 8.0', monaco: 'json', studentFile: 'query.json' },
  pandas: { label: 'Pandas', version: 'pandas 2.1 · Python 3.12', monaco: 'python', studentFile: 'solution.py' },
};

const Script = z.string().max(2 * 1024 * 1024);
/** Table name → CSV text (header row first). */
const CsvTables = z.record(z.string().regex(/^[a-z_][a-z0-9_]{0,40}$/), Script);

export const DbSetup = z.object({
  /** Shared by PostgreSQL and MySQL when no dialect-specific script is given. */
  sql: Script.optional(),
  postgres: Script.optional(),
  mysql: Script.optional(),
  /** EJSON text: { "collection": [ {doc}, ... ], ... } */
  mongodb: Script.optional(),
  pandas: CsvTables.optional(),
});
export type DbSetup = z.infer<typeof DbSetup>;

export const DbDataset = z.object({
  setup: DbSetup,
  explanation: z.string().max(5000).default(''),
  weight: z.number().int().min(1).max(100).default(1),
});
export type DbDataset = z.infer<typeof DbDataset>;

export const DbCompare = z.object({
  orderSensitive: z.boolean().default(false),
  columnNames: z.enum(['exact', 'ignore_case', 'ignore']).default('ignore_case'),
  floatEpsilon: z.number().min(0).max(1).default(1e-6),
  /** MongoDB: drop `_id` from documents before comparing. */
  ignoreMongoId: z.boolean().default(true),
});
export type DbCompare = z.infer<typeof DbCompare>;

export const DbQuestionInput = z.object({
  type: z.literal('db'),
  title: z.string().trim().min(3).max(200),
  statement: z.string().max(20000),
  difficulty: z.enum(DIFFICULTIES),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(10).default([]),
  isPractice: z.boolean().default(false),
  dialects: z.array(z.enum(DB_DIALECTS)).min(1).max(4),
  /** `query`: compare the result set. `dml`: run statements, then compare `stateQuery` output. */
  mode: z.enum(['query', 'dml']).default('query'),
  /** Shown to students: tables/collections and a few sample rows (Markdown). */
  schemaDisplay: z.string().max(20000),
  samples: z.array(DbDataset).max(2).default([]),
  hidden: z.array(DbDataset).max(15).default([]),
  stateQuery: z.object({ sql: z.string().max(5000).optional(), postgres: z.string().max(5000).optional(), mysql: z.string().max(5000).optional() }).optional(),
  compare: DbCompare.default({ orderSensitive: false, columnNames: 'ignore_case', floatEpsilon: 1e-6, ignoreMongoId: true }),
  starters: z.partialRecord(z.enum(DB_DIALECTS), z.string().max(64 * 1024)).default({}),
  solutions: z.partialRecord(z.enum(DB_DIALECTS), z.string().max(64 * 1024)).default({}),
  timeLimitMs: z.number().int().min(200).max(10000).default(2000),
  global: z.boolean().optional(),
});
export type DbQuestionInput = z.infer<typeof DbQuestionInput>;

export function setupFor(setup: DbSetup, dialect: DbDialect): string | Record<string, string> | undefined {
  if (dialect === 'postgres') return setup.postgres ?? setup.sql;
  if (dialect === 'mysql') return setup.mysql ?? setup.sql;
  if (dialect === 'mongodb') return setup.mongodb;
  return setup.pandas;
}

export function stateQueryFor(q: Pick<DbQuestionInput, 'stateQuery'>, dialect: DbDialect): string | undefined {
  if (dialect === 'postgres') return q.stateQuery?.postgres ?? q.stateQuery?.sql;
  if (dialect === 'mysql') return q.stateQuery?.mysql ?? q.stateQuery?.sql;
  return undefined;
}

export function dbPublishProblems(q: DbQuestionInput): string[] {
  const p: string[] = [];
  if (q.statement.trim().length < 20) p.push('statement is too short');
  if (!q.schemaDisplay.trim()) p.push('schema description for students is required');
  if (q.samples.length !== 2) p.push('exactly 2 sample datasets are required');
  if (q.hidden.length < 8 || q.hidden.length > 15) p.push('8–15 hidden datasets are required');
  if (q.mode === 'dml') {
    if (q.dialects.some((d) => d === 'mongodb' || d === 'pandas')) p.push('DML questions support PostgreSQL and MySQL only');
    for (const d of q.dialects) if (!stateQueryFor(q, d)) p.push(`${d}: a state query is required for DML questions`);
  }
  for (const d of q.dialects) {
    if (!q.solutions[d]?.trim()) p.push(`${d}: reference solution is required`);
    [...q.samples, ...q.hidden].forEach((ds, i) => {
      const s = setupFor(ds.setup, d);
      if (!s || (typeof s === 'string' && !s.trim()) || (typeof s === 'object' && Object.keys(s).length === 0)) p.push(`${d}: dataset ${i + 1} has no setup`);
    });
  }
  const keys = [...q.samples, ...q.hidden].map((d) => JSON.stringify(d.setup));
  if (new Set(keys).size !== keys.length) p.push('two datasets are identical');
  return p;
}

/** A result set in canonical form (SQL rows, pandas DataFrames, Mongo documents). */
export interface ResultSet {
  columns: string[];
  rows: unknown[][];
  truncated?: boolean;
}
