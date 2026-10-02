import {
  DB_DIALECTS,
  QuestionInput,
  questionProblems,
  RUNTIME_IDS,
  type DbQuestionInput,
  type WebQuestionInput,
} from '@hbe/shared';
import type { z } from 'zod';
import { emptyRecords, SHEET, SHEETS, type Issue, type Records, type Row, type SheetName } from './columns.js';
import { chunk } from './text.js';

export interface ExportItem {
  id?: string;
  question: QuestionInput;
}

export interface ParsedQuestion {
  key: string;
  loc: string;
  id?: string;
  title: string;
  type: string;
  /** Present when the question passed schema validation. */
  input?: QuestionInput;
  errors: Issue[];
  /** Publish-rule gaps (imported as a draft) and ignored cells. */
  warnings: Issue[];
}

const yesNo = (b: boolean) => (b ? 'yes' : 'no');
const str = (n: number | undefined) => (n === undefined ? '' : String(n));

// ------------------------------------------------------------------ question → rows
/** Flatten questions into table rows. `split` breaks long values into ≤ 32,000-character parts (Excel). */
export function toRecords(items: ExportItem[], split: boolean): Records {
  const rec = emptyRecords();
  const add = (sheet: SheetName, cells: Record<string, string>) => {
    const spec = SHEET[sheet];
    const long = spec.columns.filter((c) => c.long).map((c) => c.name);
    const parts = split ? Math.max(1, ...long.map((c) => chunk(cells[c] ?? '').length)) : 1;
    for (let p = 0; p < parts; p++) {
      const row: Record<string, string> = {};
      for (const c of spec.columns) {
        if (c.name === 'part') row.part = parts > 1 ? String(p + 1) : '';
        else if (c.long) row[c.name] = split ? (chunk(cells[c.name] ?? '')[p] ?? '') : (cells[c.name] ?? '');
        else row[c.name] = p === 0 || c.name === 'key' || spec.identity.includes(c.name) ? (cells[c.name] ?? '') : '';
      }
      rec[sheet].push({ cells: row, loc: '' });
    }
  };
  items.forEach((it, i) => {
    const key = `Q${i + 1}`;
    const q = it.question;
    const base = { key, id: it.id ?? '', type: q.type, title: q.title, difficulty: q.difficulty, tags: q.tags.join(', '), is_practice: yesNo(q.isPractice), statement: q.statement };
    if (q.type === 'coding') {
      add('Questions', {
        ...base, constraints: q.constraints, input_format: q.inputFormat, output_format: q.outputFormat, time_complexity: q.timeComplexity,
        space_complexity: q.spaceComplexity, time_limit_ms: str(q.baseTimeLimitMs), memory_limit_mb: str(q.memoryLimitMb),
        compare_mode: q.compare.mode, compare_epsilon: str(q.compare.epsilon),
      });
      q.samples.forEach((t, n) => add('Coding tests', { key, kind: 'sample', no: String(n + 1), explanation: t.explanation, input: t.input, output: t.output }));
      q.hidden.forEach((t, n) => add('Coding tests', { key, kind: 'hidden', no: String(n + 1), weight: String(t.weight), stress: yesNo(t.isStress), input: t.input, output: t.output }));
      for (const rt of RUNTIME_IDS) {
        const tpl = q.templates[rt];
        if (tpl) add('Code', { key, language: rt, starter: tpl.stub, driver: tpl.driver, solution: tpl.solution });
      }
    } else if (q.type === 'web') {
      add('Questions', { ...base, framework: q.framework, check_timeout_ms: str(q.checkTimeoutMs) });
      const check = (kind: string) => (c: WebQuestionInput['samples'][number], n: number) =>
        add('Web checks', { key, kind, no: String(n + 1), title: c.title, weight: String(c.weight), viewport: c.viewport ? `${c.viewport.width}x${c.viewport.height}` : '', check: JSON.stringify(c.spec) });
      q.samples.forEach(check('sample'));
      q.hidden.forEach(check('hidden'));
      for (const f of q.starterFiles) add('Web files', { key, set: 'starter', path: f.path, content: f.content });
      for (const f of q.referenceFiles) add('Web files', { key, set: 'reference', path: f.path, content: f.content });
    } else {
      add('Questions', {
        ...base, time_limit_ms: str(q.timeLimitMs), dialects: q.dialects.join(', '), db_mode: q.mode, schema_display: q.schemaDisplay,
        state_query_sql: q.stateQuery?.sql ?? '', state_query_postgres: q.stateQuery?.postgres ?? '', state_query_mysql: q.stateQuery?.mysql ?? '',
        order_sensitive: yesNo(q.compare.orderSensitive), column_names: q.compare.columnNames, float_epsilon: str(q.compare.floatEpsilon), ignore_mongo_id: yesNo(q.compare.ignoreMongoId),
      });
      const ds = (kind: string) => (d: DbQuestionInput['samples'][number], n: number) =>
        add('DB datasets', {
          key, kind, no: String(n + 1), weight: String(d.weight), explanation: d.explanation, setup_sql: d.setup.sql ?? '', setup_postgres: d.setup.postgres ?? '',
          setup_mysql: d.setup.mysql ?? '', setup_mongodb: d.setup.mongodb ?? '', setup_pandas: d.setup.pandas ? JSON.stringify(d.setup.pandas) : '',
        });
      q.samples.forEach(ds('sample'));
      q.hidden.forEach(ds('hidden'));
      for (const d of DB_DIALECTS) {
        if (q.starters[d] !== undefined || q.solutions[d] !== undefined) add('Code', { key, language: d, starter: q.starters[d] ?? '', solution: q.solutions[d] ?? '' });
      }
    }
  });
  return rec;
}

// ------------------------------------------------------------------ rows → question
interface Logical {
  cells: Record<string, string>;
  loc: string;
}

/** Merge continuation rows (part 2, 3, …) into one logical row per identity. */
function mergeParts(sheet: SheetName, rows: Row[], issues: Issue[]): Logical[] {
  const spec = SHEET[sheet];
  if (!spec.columns.some((c) => c.name === 'part')) return rows.map((r) => ({ cells: { ...r.cells }, loc: r.loc }));
  const long = spec.columns.filter((c) => c.long).map((c) => c.name);
  const groups = new Map<string, { parts: { n: number; row: Row }[] }>();
  const order: string[] = [];
  for (const r of rows) {
    const id = [r.cells.key ?? '', ...spec.identity.map((c) => (r.cells[c] ?? '').trim().toLowerCase())].join('\u0000');
    const partRaw = (r.cells.part ?? '').trim();
    const n = partRaw === '' ? 1 : Number(partRaw);
    if (!Number.isInteger(n) || n < 1) {
      issues.push({ loc: r.loc, field: 'part', message: `part must be 1, 2, 3, … (got "${partRaw}")` });
      continue;
    }
    if (!groups.has(id)) {
      groups.set(id, { parts: [] });
      order.push(id);
    }
    groups.get(id)!.parts.push({ n, row: r });
  }
  const out: Logical[] = [];
  for (const id of order) {
    const parts = groups.get(id)!.parts.sort((a, b) => a.n - b.n);
    const first = parts[0]!;
    const bad = parts.findIndex((p, i) => p.n !== i + 1);
    if (bad >= 0) {
      issues.push({ loc: parts[bad]!.row.loc, field: 'part', message: parts[bad]!.n === parts[bad - 1]?.n ? `duplicate row: part ${parts[bad]!.n} appears twice` : `missing part ${bad + 1}` });
      continue;
    }
    const cells = { ...first.row.cells };
    for (const c of long) cells[c] = parts.map((p) => p.row.cells[c] ?? '').join('');
    out.push({ cells, loc: parts.length > 1 ? `${first.row.loc}–${parts[parts.length - 1]!.row.loc.replace(/^.*row /, 'row ')}` : first.row.loc });
  }
  return out;
}

class Cell {
  constructor(
    private readonly l: Logical,
    private readonly errors: Issue[],
  ) {}
  s(col: string): string {
    return this.l.cells[col] ?? '';
  }
  opt(col: string): string | undefined {
    const v = this.s(col);
    return v === '' ? undefined : v;
  }
  num(col: string): number | undefined {
    const v = this.s(col).trim();
    if (v === '') return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      this.errors.push({ loc: this.l.loc, field: col, message: `"${v.slice(0, 40)}" is not a number` });
      return undefined;
    }
    return n;
  }
  bool(col: string): boolean | undefined {
    const v = this.s(col).trim().toLowerCase();
    if (v === '') return undefined;
    if (['yes', 'y', 'true', '1'].includes(v)) return true;
    if (['no', 'n', 'false', '0'].includes(v)) return false;
    this.errors.push({ loc: this.l.loc, field: col, message: `use yes or no (got "${v.slice(0, 20)}")` });
    return undefined;
  }
  list(col: string): string[] | undefined {
    const v = this.s(col).trim();
    return v === '' ? undefined : v.split(',').map((x) => x.trim()).filter(Boolean);
  }
  json(col: string): unknown {
    const v = this.s(col).trim();
    if (v === '') return undefined;
    try {
      return JSON.parse(v);
    } catch (e) {
      this.errors.push({ loc: this.l.loc, field: col, message: `invalid JSON: ${(e as Error).message.slice(0, 120)}` });
      return undefined;
    }
  }
}

/** Removes keys whose value is undefined so zod defaults apply. */
function clean<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Where each part of the canonical object came from, for error messages. */
type Origin = { loc: string; column?: string; fields?: Record<string, string> };

const CODING_TEST_FIELDS = { input: 'input', output: 'output', explanation: 'explanation', weight: 'weight', isStress: 'stress' };
const WEB_CHECK_FIELDS = { title: 'title', weight: 'weight', viewport: 'viewport', spec: 'check' };
const DB_DS_FIELDS = { explanation: 'explanation', weight: 'weight', 'setup.sql': 'setup_sql', 'setup.postgres': 'setup_postgres', 'setup.mysql': 'setup_mysql', 'setup.mongodb': 'setup_mongodb', 'setup.pandas': 'setup_pandas' };
const Q_FIELDS: Record<string, string> = {
  title: 'title', difficulty: 'difficulty', tags: 'tags', isPractice: 'is_practice', statement: 'statement', constraints: 'constraints', inputFormat: 'input_format',
  outputFormat: 'output_format', timeComplexity: 'time_complexity', spaceComplexity: 'space_complexity', baseTimeLimitMs: 'time_limit_ms', memoryLimitMb: 'memory_limit_mb',
  'compare.mode': 'compare_mode', 'compare.epsilon': 'compare_epsilon', compare: 'compare_mode', framework: 'framework', checkTimeoutMs: 'check_timeout_ms', dialects: 'dialects',
  mode: 'db_mode', schemaDisplay: 'schema_display', 'stateQuery.sql': 'state_query_sql', 'stateQuery.postgres': 'state_query_postgres', 'stateQuery.mysql': 'state_query_mysql',
  'compare.orderSensitive': 'order_sensitive', 'compare.columnNames': 'column_names', 'compare.floatEpsilon': 'float_epsilon', 'compare.ignoreMongoId': 'ignore_mongo_id',
  timeLimitMs: 'time_limit_ms', type: 'type',
};

function locate(origins: Map<string, Origin>, path: PropertyKey[]): Issue {
  const parts = path.map(String);
  for (let n = parts.length; n >= 0; n--) {
    const o = origins.get(parts.slice(0, n).join('.'));
    if (!o) continue;
    const rest = parts.slice(n).join('.');
    const field = o.column ?? (rest && o.fields ? (o.fields[rest] ?? o.fields[parts[n] ?? ''] ?? rest) : rest || undefined);
    return { loc: o.loc, field, message: '' };
  }
  return { loc: '', field: parts.join('.'), message: '' };
}

/** Rebuild questions from table rows and validate each one against the canonical schema. */
export function fromRecords(rec: Records): { questions: ParsedQuestion[]; issues: Issue[] } {
  const fileIssues: Issue[] = [];
  const merged = Object.fromEntries(SHEETS.map((s) => [s.name, mergeParts(s.name, rec[s.name] ?? [], fileIssues)])) as Record<SheetName, Logical[]>;
  const questions: ParsedQuestion[] = [];
  const seenKeys = new Map<string, string>();
  const used = new Set<Logical>();

  for (const qrow of merged.Questions) {
    const key = (qrow.cells.key ?? '').trim();
    const errors: Issue[] = [];
    const warnings: Issue[] = [];
    const c = new Cell(qrow, errors);
    const type = c.s('type').trim().toLowerCase() || 'coding';
    const title = c.s('title').trim();
    const pq: ParsedQuestion = { key, loc: qrow.loc, id: c.opt('id')?.trim(), title, type, errors, warnings };
    questions.push(pq);
    if (!key) {
      errors.push({ loc: qrow.loc, field: 'key', message: 'key is required (e.g. Q1)' });
      continue;
    }
    if (seenKeys.has(key)) {
      errors.push({ loc: qrow.loc, field: 'key', message: `key "${key}" is also used by ${seenKeys.get(key)}` });
      continue;
    }
    seenKeys.set(key, qrow.loc);
    if (!['coding', 'web', 'db'].includes(type)) {
      errors.push({ loc: qrow.loc, field: 'type', message: 'type must be coding, web or db' });
      continue;
    }
    const origins = new Map<string, Origin>();
    for (const [f, col] of Object.entries(Q_FIELDS)) origins.set(f, { loc: qrow.loc, column: col });
    origins.set('', { loc: qrow.loc });
    // Cells for other types are ignored, with a warning.
    for (const col of SHEET.Questions.columns) {
      if (col.types && !col.types.includes(type as never) && (qrow.cells[col.name] ?? '').trim() !== '') {
        warnings.push({ loc: qrow.loc, field: col.name, message: `ignored: does not apply to ${type} questions` });
      }
    }
    const mine = (sheet: SheetName) => merged[sheet].filter((r) => (r.cells.key ?? '').trim() === key);
    const byKind = (rows: Logical[], kind: string) => {
      const list = rows.filter((r) => (r.cells.kind ?? '').trim().toLowerCase() === kind);
      const nums = new Map<number, Logical>();
      for (const r of list) {
        const n = Number((r.cells.no ?? '').trim());
        if (!Number.isInteger(n) || n < 1) errors.push({ loc: r.loc, field: 'no', message: 'no must be 1, 2, 3, …' });
        else if (nums.has(n)) errors.push({ loc: r.loc, field: 'no', message: `${kind} ${n} appears twice` });
        else nums.set(n, r);
      }
      return [...nums.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
    };
    const checkKinds = (rows: Logical[]) => {
      for (const r of rows) {
        used.add(r);
        const k = (r.cells.kind ?? '').trim().toLowerCase();
        if (k !== 'sample' && k !== 'hidden') errors.push({ loc: r.loc, field: 'kind', message: 'kind must be sample or hidden' });
      }
    };
    const base = clean({
      type, title, difficulty: c.opt('difficulty')?.trim().toLowerCase(), tags: c.list('tags'), isPractice: c.bool('is_practice'), statement: c.s('statement'),
    });
    let obj: Record<string, unknown>;

    if (type === 'coding') {
      const tests = mine('Coding tests');
      checkKinds(tests);
      const toCase = (r: Logical, i: number, kind: 'samples' | 'hidden') => {
        const t = new Cell(r, errors);
        origins.set(`${kind}.${i}`, { loc: r.loc, fields: CODING_TEST_FIELDS });
        return kind === 'samples'
          ? clean({ input: t.s('input'), output: t.s('output'), explanation: t.s('explanation') })
          : clean({ input: t.s('input'), output: t.s('output'), weight: t.num('weight'), isStress: t.bool('stress') });
      };
      const templates: Record<string, unknown> = {};
      for (const r of mine('Code')) {
        used.add(r);
        const lang = (r.cells.language ?? '').trim().toLowerCase();
        if (!(RUNTIME_IDS as readonly string[]).includes(lang)) {
          errors.push({ loc: r.loc, field: 'language', message: `unknown language "${lang}" (use ${RUNTIME_IDS.join(', ')})` });
          continue;
        }
        if (templates[lang]) errors.push({ loc: r.loc, field: 'language', message: `${lang} appears twice` });
        origins.set(`templates.${lang}`, { loc: r.loc, fields: { stub: 'starter', driver: 'driver', solution: 'solution' } });
        templates[lang] = { stub: r.cells.starter ?? '', driver: r.cells.driver ?? '', solution: r.cells.solution ?? '' };
      }
      const cmpMode = c.opt('compare_mode')?.trim().toLowerCase();
      obj = clean({
        ...base, constraints: c.s('constraints'), inputFormat: c.s('input_format'), outputFormat: c.s('output_format'), timeComplexity: c.s('time_complexity'),
        spaceComplexity: c.s('space_complexity'), baseTimeLimitMs: c.num('time_limit_ms'), memoryLimitMb: c.num('memory_limit_mb'),
        compare: cmpMode ? clean({ mode: cmpMode, epsilon: c.num('compare_epsilon') }) : undefined,
        samples: byKind(tests, 'sample').map((r, i) => toCase(r, i, 'samples')),
        hidden: byKind(tests, 'hidden').map((r, i) => toCase(r, i, 'hidden')),
        templates,
      });
    } else if (type === 'web') {
      const checks = mine('Web checks');
      checkKinds(checks);
      const toCheck = (r: Logical, i: number, kind: string) => {
        const t = new Cell(r, errors);
        origins.set(`${kind}.${i}`, { loc: r.loc, fields: WEB_CHECK_FIELDS });
        const vp = t.s('viewport').trim();
        let viewport: unknown;
        if (vp) {
          const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(vp);
          if (m) viewport = { width: Number(m[1]), height: Number(m[2]) };
          else errors.push({ loc: r.loc, field: 'viewport', message: 'use WIDTHxHEIGHT, e.g. 375x800' });
        }
        return clean({ title: t.s('title'), weight: t.num('weight'), viewport, spec: t.json('check') });
      };
      const files = mine('Web files');
      const fileSet = (set: string, field: string) =>
        files
          .filter((r) => (r.cells.set ?? '').trim().toLowerCase() === set)
          .map((r, i) => {
            origins.set(`${field}.${i}`, { loc: r.loc, fields: { path: 'path', content: 'content' } });
            return { path: (r.cells.path ?? '').trim(), content: r.cells.content ?? '' };
          });
      for (const r of files) {
        used.add(r);
        const set = (r.cells.set ?? '').trim().toLowerCase();
        if (set !== 'starter' && set !== 'reference') errors.push({ loc: r.loc, field: 'set', message: 'set must be starter or reference' });
      }
      origins.set('starterFiles', { loc: qrow.loc, column: 'Web files (starter)' });
      origins.set('referenceFiles', { loc: qrow.loc, column: 'Web files (reference)' });
      obj = clean({
        ...base, framework: c.opt('framework')?.trim().toLowerCase(), checkTimeoutMs: c.num('check_timeout_ms'),
        samples: byKind(checks, 'sample').map((r, i) => toCheck(r, i, 'samples')),
        hidden: byKind(checks, 'hidden').map((r, i) => toCheck(r, i, 'hidden')),
        starterFiles: fileSet('starter', 'starterFiles'), referenceFiles: fileSet('reference', 'referenceFiles'),
      });
    } else {
      const sets = mine('DB datasets');
      checkKinds(sets);
      const toDs = (r: Logical, i: number, kind: string) => {
        const t = new Cell(r, errors);
        origins.set(`${kind}.${i}`, { loc: r.loc, fields: DB_DS_FIELDS });
        return clean({
          explanation: t.s('explanation'), weight: t.num('weight'),
          setup: clean({ sql: t.opt('setup_sql'), postgres: t.opt('setup_postgres'), mysql: t.opt('setup_mysql'), mongodb: t.opt('setup_mongodb'), pandas: t.json('setup_pandas') }),
        });
      };
      const starters: Record<string, string> = {};
      const solutions: Record<string, string> = {};
      for (const r of mine('Code')) {
        used.add(r);
        const d = (r.cells.language ?? '').trim().toLowerCase();
        if (!(DB_DIALECTS as readonly string[]).includes(d)) {
          errors.push({ loc: r.loc, field: 'language', message: `unknown dialect "${d}" (use ${DB_DIALECTS.join(', ')})` });
          continue;
        }
        if ((r.cells.driver ?? '').trim()) warnings.push({ loc: r.loc, field: 'driver', message: 'ignored: DB questions have no driver' });
        origins.set(`starters.${d}`, { loc: r.loc, column: 'starter' });
        origins.set(`solutions.${d}`, { loc: r.loc, column: 'solution' });
        if (r.cells.starter) starters[d] = r.cells.starter;
        if (r.cells.solution) solutions[d] = r.cells.solution;
      }
      const sq = clean({ sql: c.opt('state_query_sql'), postgres: c.opt('state_query_postgres'), mysql: c.opt('state_query_mysql') });
      obj = clean({
        ...base, dialects: c.list('dialects')?.map((d) => d.toLowerCase()), mode: c.opt('db_mode')?.trim().toLowerCase(), schemaDisplay: c.s('schema_display'),
        timeLimitMs: c.num('time_limit_ms'), stateQuery: Object.keys(sq).length ? sq : undefined,
        compare: clean({ orderSensitive: c.bool('order_sensitive'), columnNames: c.opt('column_names')?.trim().toLowerCase(), floatEpsilon: c.num('float_epsilon'), ignoreMongoId: c.bool('ignore_mongo_id') }),
        samples: byKind(sets, 'sample').map((r, i) => toDs(r, i, 'samples')),
        hidden: byKind(sets, 'hidden').map((r, i) => toDs(r, i, 'hidden')),
        starters, solutions,
      });
    }
    // Rows of this key in tables of another type are a mistake worth reporting.
    for (const sheet of ['Coding tests', 'Web checks', 'DB datasets', 'Web files'] as SheetName[]) {
      const fits = (sheet === 'Coding tests' && type === 'coding') || (sheet === 'Web checks' && type === 'web') || (sheet === 'DB datasets' && type === 'db') || (sheet === 'Web files' && type === 'web');
      if (!fits) for (const r of mine(sheet)) {
        used.add(r);
        errors.push({ loc: r.loc, message: `question ${key} is a ${type} question; rows in "${sheet}" do not apply` });
      }
    }
    if (errors.length) continue;
    const parsed = QuestionInput.safeParse(obj);
    if (!parsed.success) {
      for (const iss of (parsed.error as z.ZodError).issues.slice(0, 50)) {
        const at = locate(origins, iss.path);
        errors.push({ loc: at.loc || qrow.loc, field: at.field, message: iss.message });
      }
      continue;
    }
    pq.input = parsed.data;
    for (const p of questionProblems(parsed.data)) warnings.push({ loc: qrow.loc, message: `not ready to publish: ${p}` });
  }
  // Rows whose key matches no question.
  for (const s of SHEETS) {
    if (s.name === 'Questions') continue;
    for (const r of merged[s.name]) {
      if (used.has(r)) continue;
      const k = (r.cells.key ?? '').trim();
      if (Object.values(r.cells).every((v) => v.trim() === '')) continue;
      fileIssues.push({ loc: r.loc, field: 'key', message: k ? `no question with key "${k}" in Questions` : 'key is required' });
    }
  }
  return { questions, issues: fileIssues };
}
