import { QuestionInput as QI, questionProblems, type QuestionInput } from '@hbe/shared';
import { SHEETS, type Issue, type Records } from './columns.js';
import { recordsToDocx, docxToRecords } from './docx.js';
import { fromRecords, toRecords, type ExportItem, type ParsedQuestion } from './flatten.js';
import { recordsToXlsx, writeWorkbook, xlsxToRecords, type SheetData } from './xlsx.js';
import { FormatError } from './zip.js';

export * from './columns.js';
export * from './flatten.js';
export { FormatError, ZIP_LIMITS } from './zip.js';
export { writeWorkbook, readWorkbook, recordsToXlsx, xlsxToRecords } from './xlsx.js';
export { recordsToDocx, docxToRecords } from './docx.js';
export * from './text.js';

export const FORMATS = ['xlsx', 'docx', 'json'] as const;
export type FileFormat = (typeof FORMATS)[number];
export const MIME: Record<FileFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  json: 'application/json',
};
export const JSON_FORMAT_ID = 'hbecode-questions';
/** Upper bound on questions in one file. */
export const MAX_QUESTIONS_PER_FILE = 500;

export interface ParseResult {
  questions: ParsedQuestion[];
  /** Problems that are not tied to one question (bad sheet, orphan rows, damaged file). */
  issues: Issue[];
  warnings: Issue[];
}

/** Parse an uploaded file into questions, each validated against the canonical schema. */
export async function parseFile(buf: Buffer, format: FileFormat): Promise<ParseResult> {
  try {
    if (format === 'json') return parseJson(buf);
    const r = format === 'xlsx' ? await xlsxToRecords(buf) : await docxToRecords(buf);
    if (r.records.Questions.length > MAX_QUESTIONS_PER_FILE) {
      return { questions: [], issues: [{ loc: 'file', message: `${r.records.Questions.length} questions in one file; the limit is ${MAX_QUESTIONS_PER_FILE}` }], warnings: [] };
    }
    const f = fromRecords(r.records);
    return { questions: f.questions, issues: [...r.issues, ...f.issues], warnings: r.warnings };
  } catch (e) {
    if (e instanceof FormatError) return { questions: [], issues: [{ loc: 'file', message: e.message }], warnings: [] };
    throw e;
  }
}

function parseJson(buf: Buffer): ParseResult {
  let doc: unknown;
  try {
    doc = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    return { questions: [], issues: [{ loc: 'file', message: `invalid JSON: ${(e as Error).message.slice(0, 200)}` }], warnings: [] };
  }
  const list = Array.isArray(doc) ? doc : doc && typeof doc === 'object' && Array.isArray((doc as { questions?: unknown }).questions) ? (doc as { questions: unknown[] }).questions : [doc];
  if (list.length > MAX_QUESTIONS_PER_FILE) return { questions: [], issues: [{ loc: 'file', message: `${list.length} questions in one file; the limit is ${MAX_QUESTIONS_PER_FILE}` }], warnings: [] };
  // Reuse the table path's validation and error wording by validating each object directly.
  return { questions: list.map((q, i) => validateJsonQuestion(q, i)), issues: [], warnings: [] };
}

function validateJsonQuestion(raw: unknown, i: number): ParsedQuestion {
  const loc = `questions[${i}]`;
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const { id, key, ...rest } = o;
  const pq: ParsedQuestion = { key: typeof key === 'string' && key ? key : `Q${i + 1}`, loc, id: typeof id === 'string' && id ? id : undefined, title: String(o.title ?? ''), type: String(o.type ?? 'coding'), errors: [], warnings: [] };
  delete (rest as Record<string, unknown>).global;
  const r = QI.safeParse(rest);
  if (!r.success) {
    for (const iss of r.error.issues.slice(0, 50)) pq.errors.push({ loc, field: iss.path.join('.'), message: iss.message });
    return pq;
  }
  pq.input = r.data;
  for (const p of questionProblems(r.data)) pq.warnings.push({ loc, message: `not ready to publish: ${p}` });
  return pq;
}

/** Export questions (with hidden tests, drivers and reference solutions) to a file. */
export async function exportFile(items: ExportItem[], format: FileFormat): Promise<Buffer> {
  if (format === 'json') {
    const questions = items.map((it) => {
      const { global: _g, ...q } = it.question as QuestionInput & { global?: boolean };
      return it.id ? { id: it.id, ...q } : q;
    });
    return Buffer.from(JSON.stringify({ format: JSON_FORMAT_ID, version: 1, questions }, null, 2));
  }
  const rec = toRecords(items.map((it) => ({ id: it.id, question: it.question })), format === 'xlsx');
  return format === 'xlsx' ? recordsToXlsx(rec) : recordsToDocx(rec, [`HBECode questions (${items.length})`, 'Exported with hidden tests, drivers and reference solutions. Keep this file private.', '']);
}

/** Blank template with an instructions sheet/section and one example of each question type. */
export async function templateFile(format: 'xlsx' | 'docx', examples: QuestionInput[]): Promise<Buffer> {
  const rec: Records = toRecords(examples.map((question) => ({ question })), format === 'xlsx');
  if (format === 'xlsx') {
    const help: SheetData = {
      name: 'Instructions',
      header: ['Table', 'Column', 'What to enter'],
      rows: [
        ['', '', 'One workbook can hold up to 500 questions. Each question has a key (e.g. Q1) in the Questions sheet; rows in the other sheets refer to it.'],
        ['', '', 'Values longer than 32,000 characters (big test inputs) continue on the next row with the same key/kind/no and part = 2, 3, …'],
        ['', '', 'The example questions show every type. Delete them (all their rows) before importing your own, or keep them as a pattern.'],
        ['', '', 'Import first shows a preview with every problem per row; nothing is created until you confirm.'],
        ...SHEETS.flatMap((s) => [[s.name, '', s.help], ...s.columns.map((c) => [s.name, c.name, c.help + (c.types ? ` (${c.types.join('/')} only)` : '')])]),
      ],
      widths: [16, 22, 110],
      wrap: true,
    };
    return recordsToXlsx(rec, [help]);
  }
  return recordsToDocx(rec, [
    'HBECode question template',
    'Each question is a two-column table (Field | Value), followed by tables for its tests, code and files. Keep the header rows as they are; text outside tables is ignored.',
    'Inside a cell, every paragraph is one line. Turn off "smart quotes" and other AutoCorrect options before typing code or test data. The example questions show every type.',
    '',
  ]);
}

/** Excel report of every problem found in an upload. */
export function errorReport(rows: { key: string; title: string; severity: 'error' | 'warning'; loc: string; field?: string; message: string }[]): Promise<Buffer> {
  return writeWorkbook([
    {
      name: 'Problems',
      header: ['severity', 'question key', 'title', 'where', 'column', 'problem'],
      rows: rows.map((r) => [r.severity, r.key, r.title, r.loc, r.field ?? '', r.message]),
      widths: [10, 12, 30, 30, 18, 90],
      wrap: true,
    },
  ]);
}

export type { ExportItem, ParsedQuestion };
