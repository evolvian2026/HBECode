/**
 * The tabular question format, shared by Excel (one worksheet per table) and Word (one table per
 * block). Every question has a `key` (any short label, unique in the file) that links its rows
 * across tables. The canonical form is the JSON `QuestionInput` from @hbe/shared; these tables are
 * a lossless view of it.
 */
export interface Column {
  name: string;
  help: string;
  /** Types the column applies to (default: all). */
  types?: ('coding' | 'web' | 'db')[];
  /** Long text that may continue over several rows (`part` 1, 2, …). */
  long?: boolean;
}

export interface SheetSpec {
  name: SheetName;
  help: string;
  columns: Column[];
  /** Columns that identify one logical row (together with `key`); `part` is added for long text. */
  identity: string[];
}

export type SheetName = 'Questions' | 'Coding tests' | 'Web checks' | 'DB datasets' | 'Code' | 'Web files';

const C = (name: string, help: string, extra: Partial<Column> = {}): Column => ({ name, help, ...extra });

export const SHEETS: SheetSpec[] = [
  {
    name: 'Questions',
    help: 'One row per question. Columns that do not apply to the question type stay empty.',
    identity: [],
    columns: [
      C('key', 'Short label that links this question to its rows in the other tables, e.g. Q1. Unique in the file.'),
      C('id', 'Leave empty for new questions. Filled by export: re-importing a row with an id updates that question (a published question gets a new version).'),
      C('type', 'coding, web or db.'),
      C('title', '3–200 characters.'),
      C('difficulty', 'easy, moderate or hard.'),
      C('tags', 'Comma-separated, e.g. arrays, hashing (at most 10).'),
      C('is_practice', 'yes = also visible in Practice; no = tests only.'),
      C('statement', 'Problem statement (Markdown).'),
      C('constraints', 'Markdown.', { types: ['coding'] }),
      C('input_format', 'Markdown.', { types: ['coding'] }),
      C('output_format', 'Markdown.', { types: ['coding'] }),
      C('time_complexity', 'Expected time complexity, e.g. O(n).', { types: ['coding'] }),
      C('space_complexity', 'Expected space complexity, e.g. O(1).', { types: ['coding'] }),
      C('time_limit_ms', 'Coding: base time limit (× language multiplier), 100–10000. DB: per-dataset limit, 200–10000.', { types: ['coding', 'db'] }),
      C('memory_limit_mb', '32–1024.', { types: ['coding'] }),
      C('compare_mode', 'exact, trim_trailing, unordered_lines or float.', { types: ['coding'] }),
      C('compare_epsilon', 'Tolerance for float mode, e.g. 0.000001.', { types: ['coding'] }),
      C('framework', 'html or react.', { types: ['web'] }),
      C('check_timeout_ms', 'Time budget per check, 1000–15000.', { types: ['web'] }),
      C('dialects', 'Comma-separated: postgres, mysql, mongodb, pandas.', { types: ['db'] }),
      C('db_mode', 'query (compare the result) or dml (compare the state query output).', { types: ['db'] }),
      C('schema_display', 'Tables/collections shown to students (Markdown).', { types: ['db'] }),
      C('state_query_sql', 'DML only: query whose output is compared (PostgreSQL and MySQL).', { types: ['db'] }),
      C('state_query_postgres', 'DML only: PostgreSQL-specific state query.', { types: ['db'] }),
      C('state_query_mysql', 'DML only: MySQL-specific state query.', { types: ['db'] }),
      C('order_sensitive', 'yes if row order matters.', { types: ['db'] }),
      C('column_names', 'exact, ignore_case or ignore.', { types: ['db'] }),
      C('float_epsilon', 'Numeric tolerance, e.g. 0.000001.', { types: ['db'] }),
      C('ignore_mongo_id', 'MongoDB: yes to drop _id before comparing.', { types: ['db'] }),
    ],
  },
  {
    name: 'Coding tests',
    help: 'Coding questions: exactly 2 samples (with explanations) and 10–15 hidden tests. Long inputs continue on the next row with the same key/kind/no and part 2, 3, …',
    identity: ['kind', 'no'],
    columns: [
      C('key', 'Question key.'),
      C('kind', 'sample or hidden.'),
      C('no', '1, 2, 3, … within the kind.'),
      C('part', 'Leave empty (or 1). 2, 3, … continue a long value from the previous row.'),
      C('weight', 'Hidden tests: 1–100 (default 1).'),
      C('stress', 'Hidden tests: yes for a max-constraint stress test.'),
      C('explanation', 'Samples: why the output is correct (Markdown).'),
      C('input', 'Exact stdin.', { long: true }),
      C('output', 'Exact expected stdout.', { long: true }),
    ],
  },
  {
    name: 'Web checks',
    help: 'Web questions: exactly 2 sample checks and 8–15 hidden checks. `check` is the check definition in JSON (see the format guide).',
    identity: ['kind', 'no'],
    columns: [
      C('key', 'Question key.'),
      C('kind', 'sample or hidden.'),
      C('no', '1, 2, 3, … within the kind.'),
      C('title', 'What is checked (shown to students for samples).'),
      C('weight', '1–100 (default 1).'),
      C('viewport', 'Optional WIDTHxHEIGHT, e.g. 375x800, for responsive checks.'),
      C('check', 'JSON, e.g. {"kind":"text","selector":"h1","match":{"equals":"Hello"}}.'),
    ],
  },
  {
    name: 'DB datasets',
    help: 'DB questions: exactly 2 sample and 8–15 hidden datasets. Expected results are not typed: validation runs the reference solution on each dataset.',
    identity: ['kind', 'no'],
    columns: [
      C('key', 'Question key.'),
      C('kind', 'sample or hidden.'),
      C('no', '1, 2, 3, … within the kind.'),
      C('part', 'Continuation of long setup scripts (2, 3, …).'),
      C('weight', '1–100 (default 1).'),
      C('explanation', 'Samples: shown with the expected output.'),
      C('setup_sql', 'SQL run before the student query (PostgreSQL and MySQL).', { long: true }),
      C('setup_postgres', 'PostgreSQL-specific setup (overrides setup_sql).', { long: true }),
      C('setup_mysql', 'MySQL-specific setup (overrides setup_sql).', { long: true }),
      C('setup_mongodb', 'EJSON: {"collection": [ {document}, … ]}.', { long: true }),
      C('setup_pandas', 'JSON: {"table_name": "csv text with header", …}.', { long: true }),
    ],
  },
  {
    name: 'Code',
    help: 'Coding: one row per language with starter (stub), hidden driver and reference solution; C, C++, Java, Python and JavaScript are required. DB: one row per dialect with starter and reference solution (driver empty).',
    identity: ['language'],
    columns: [
      C('key', 'Question key.'),
      C('language', 'Coding: c, cpp, java, python, javascript, go, rust, csharp. DB: postgres, mysql, mongodb, pandas.'),
      C('part', 'Continuation of long code (2, 3, …).'),
      C('starter', 'Code students start from.', { long: true }),
      C('driver', 'Coding only: hidden driver that reads input and calls the student code.', { long: true }),
      C('solution', 'Reference solution (never shown to students).', { long: true }),
    ],
  },
  {
    name: 'Web files',
    help: 'Web questions: starter files (what students get) and reference files (a correct solution). index.html (HTML) or App.jsx (React) is required in both sets.',
    identity: ['set', 'path'],
    columns: [
      C('key', 'Question key.'),
      C('set', 'starter or reference.'),
      C('path', 'File name, e.g. index.html, styles.css, App.jsx.'),
      C('part', 'Continuation of long files (2, 3, …).'),
      C('content', 'File content.', { long: true }),
    ],
  },
];

export const SHEET = Object.fromEntries(SHEETS.map((s) => [s.name, s])) as Record<SheetName, SheetSpec>;

/** Normalise a header as typed by a person: "Input Format" → input_format. */
export const normHeader = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_');

export interface Row {
  cells: Record<string, string>;
  /** Human location for error reports, e.g. "Coding tests, row 14" or "Word table 3, row 2". */
  loc: string;
}
export type Records = Record<SheetName, Row[]>;
export const emptyRecords = (): Records => Object.fromEntries(SHEETS.map((s) => [s.name, []])) as unknown as Records;

export interface Issue {
  loc: string;
  field?: string;
  message: string;
}
