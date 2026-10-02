import { QuestionInput } from '@hbe/shared';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { customerTotals, monthlyRevenue, profileCard, shoppingCart, sumArray, todoList, topEarner } from '../../db/src/seed/index.js';
import { emptyRecords, exportFile, fromRecords, parseFile, readWorkbook, templateFile, toRecords, writeWorkbook, type FileFormat } from './index.js';
import { recordsToXlsx } from './xlsx.js';

const SEEDS = { sumArray, profileCard, todoList, shoppingCart, topEarner, customerTotals, monthlyRevenue };
const canon = (q: unknown) => QuestionInput.parse(q);

/** A coding question full of values that break naive spreadsheet/Word handling. */
const nasty = canon({
  ...sumArray,
  title: 'Edge cases: whitespace, CR/LF, control chars',
  statement: '  Leading spaces, a\ttab, Windows\r\nline ends, a lone \r, control \u0001\u001f, emoji 🧪, _x000D_ literal, [[base64]]marker, =SUM(A1)\n\n',
  tags: ['edge', 'unicode'],
  samples: [
    { input: '   \n', output: '\t\n', explanation: '' },
    { input: '1\r\n2\r\n', output: '-0\n', explanation: 'trailing\n\n\n' },
  ],
  hidden: [
    ...sumArray.hidden.slice(0, 9),
    // 100k characters: more than three Excel cells.
    { input: `100000\n${'7 '.repeat(50_000)}\n`, output: '350000\n', weight: 3, isStress: true },
  ],
});

async function roundTrip(qs: unknown[], format: FileFormat) {
  const items = qs.map((q, i) => ({ id: i === 0 ? '0b0b0b0b-0000-4000-8000-000000000001' : undefined, question: canon(q) }));
  const file = await exportFile(items, format);
  const back = await parseFile(file, format);
  return { items, back, file };
}

describe.each(['xlsx', 'docx', 'json'] as const)('%s export → import is lossless', (format) => {
  it('for all 7 seed questions (coding, HTML, JS, React, SQL, MongoDB, pandas)', async () => {
    const { items, back } = await roundTrip(Object.values(SEEDS), format);
    expect(back.issues).toEqual([]);
    expect(back.questions.flatMap((q) => q.errors)).toEqual([]);
    expect(back.questions.map((q) => q.input)).toEqual(items.map((i) => i.question));
    expect(back.questions[0]!.id).toBe(items[0]!.id);
  });
  it('for whitespace, CR/LF, control characters, Unicode and values longer than a cell', async () => {
    const { items, back } = await roundTrip([nasty], format);
    expect(back.questions[0]!.errors).toEqual([]);
    expect(back.questions[0]!.input).toEqual(items[0]!.question);
  });
});

describe('xlsx layout', () => {
  it('splits long values into ≤ 32,000-character parts and merges them back', async () => {
    const rec = toRecords([{ question: nasty }], true);
    const parts = rec['Coding tests'].filter((r) => r.cells.kind === 'hidden' && r.cells.no === '10');
    expect(parts.map((p) => p.cells.part)).toEqual(['1', '2', '3', '4']);
    expect(Math.max(...parts.map((p) => p.cells.input!.length))).toBeLessThanOrEqual(32_000);
  });
  it('reads workbooks as Excel saves them: shared strings, rich text, numbers, _x000D_, formulas', async () => {
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="r"><sheets><sheet name="Questions" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.file('xl/sharedStrings.xml', '<sst><si><t>key</t></si><si><t>title</t></si><si><r><t>Rich </t></r><r><rPr/><t xml:space="preserve">text &amp; more</t></r></si><si><t>line1_x000D_&#10;line2</t></si></sst>');
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>time_limit_ms</t></is></c></row><row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3" t="s"><v>3</v></c><c r="D3"><f>SUM(1,1)</f><v>2</v></c></row></sheetData></worksheet>');
    const raw = await readWorkbook(await zip.generateAsync({ type: 'nodebuffer' }));
    expect(raw[0]!.rows[1]).toEqual({ r: 3, cells: ['Rich text & more', 'line1\r\nline2', undefined, '2'] });
    expect(raw[0]!.warnings[0]!.message).toMatch(/formula/);
  });
});

describe('error reports point at the row and column', () => {
  it('reports schema, type and linkage problems per row', async () => {
    const rec = toRecords([{ question: canon(sumArray) }, { question: canon(profileCard) }], true);
    rec.Questions[0]!.cells.difficulty = 'impossible';
    rec['Coding tests'][3]!.cells.weight = 'abc';
    rec['Coding tests'].push({ cells: { key: 'Q9', kind: 'hidden', no: '1', input: 'x', output: 'y' }, loc: '' });
    rec['Coding tests'].push({ cells: { key: 'Q2', kind: 'hidden', no: '1', input: 'x', output: 'y' }, loc: '' });
    rec['Web checks'][0]!.cells.check = '{"kind":"exists","selector":';
    const file = await recordsToXlsx(rec);
    const r = await parseFile(file, 'xlsx');
    const [q1, q2] = r.questions;
    expect(q1!.errors).toContainEqual({ loc: 'Coding tests, row 5', field: 'weight', message: '"abc" is not a number' });
    expect(q2!.errors.map((e) => e.message)).toEqual(expect.arrayContaining([expect.stringMatching(/invalid JSON/), expect.stringMatching(/web question; rows in "Coding tests" do not apply/)]));
    expect(r.issues).toContainEqual(expect.objectContaining({ field: 'key', message: 'no question with key "Q9" in Questions' }));
    // Fix the number: then the schema error for difficulty is reported on the Questions row.
    rec['Coding tests'][3]!.cells.weight = '2';
    const r2 = await parseFile(await recordsToXlsx(rec), 'xlsx');
    expect(r2.questions[0]!.errors).toEqual([expect.objectContaining({ loc: 'Questions, row 2', field: 'difficulty' })]);
  });
  it('warns about publish gaps but still accepts a draft', async () => {
    const rec = toRecords([{ question: canon({ ...sumArray, hidden: sumArray.hidden.slice(0, 4) }) }], true);
    const r = await parseFile(await recordsToXlsx(rec), 'xlsx');
    expect(r.questions[0]!.input).toBeDefined();
    expect(r.questions[0]!.warnings.map((w) => w.message)).toContain('not ready to publish: 10–15 hidden test cases are required');
  });
  it('flags duplicate keys, duplicate numbers and missing parts', () => {
    const rec = emptyRecords();
    rec.Questions.push({ cells: { key: 'A', type: 'coding', title: 'One', difficulty: 'easy', statement: 's' }, loc: 'Questions, row 2' });
    rec.Questions.push({ cells: { key: 'A', type: 'coding', title: 'Two', difficulty: 'easy', statement: 's' }, loc: 'Questions, row 3' });
    rec['Coding tests'].push({ cells: { key: 'A', kind: 'sample', no: '1', input: 'a', output: 'b' }, loc: 'Coding tests, row 2' });
    rec['Coding tests'].push({ cells: { key: 'A', kind: 'sample', no: '1', input: 'a', output: 'b' }, loc: 'Coding tests, row 3' });
    rec['Coding tests'].push({ cells: { key: 'A', kind: 'hidden', no: '1', part: '2', input: 'tail', output: '' }, loc: 'Coding tests, row 4' });
    const r = fromRecords(rec);
    expect(r.questions[1]!.errors[0]!.message).toMatch(/also used by Questions, row 2/);
    expect(r.issues.map((i) => i.message)).toEqual(expect.arrayContaining(['duplicate row: part 1 appears twice', 'missing part 1']));
  });
  it('the Word reader ignores free text and unknown tables, and reports a missing question table', async () => {
    const r = await parseFile(await writeWorkbook([{ name: 'x', header: ['a'], rows: [] }]), 'docx');
    expect(r.issues[0]!.message).toMatch(/not a Word document/);
  });
});

describe('hostile files', () => {
  it('rejects non-zip data, a DTD (entity expansion / XXE) and a zip bomb', async () => {
    expect((await parseFile(Buffer.from('hello'), 'xlsx')).issues[0]!.message).toMatch(/not a zip archive/);
    const dtd = new JSZip();
    dtd.file('xl/workbook.xml', '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]><workbook>&lol2;</workbook>');
    expect((await parseFile(await dtd.generateAsync({ type: 'nodebuffer' }), 'xlsx')).issues[0]!.message).toMatch(/DTDs are not allowed/);
    const xxe = new JSZip();
    xxe.file('word/document.xml', '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:document>&x;</w:document>');
    expect((await parseFile(await xxe.generateAsync({ type: 'nodebuffer' }), 'docx')).issues[0]!.message).toMatch(/DTDs are not allowed/);
    const bomb = new JSZip();
    bomb.file('xl/worksheets/sheet1.xml', Buffer.alloc(70 * 1024 * 1024, 0x20));
    bomb.file('xl/workbook.xml', '<workbook/>');
    const small = await bomb.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    expect(small.length).toBeLessThan(200 * 1024);
    expect((await parseFile(small, 'xlsx')).issues[0]!.message).toMatch(/larger than 64 MB when unpacked/);
  }, 60_000);
  it('caps the number of questions per file', async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ title: `Question ${i}`, statement: 'x', difficulty: 'easy' }));
    expect((await parseFile(Buffer.from(JSON.stringify(many)), 'json')).issues[0]!.message).toMatch(/limit is 500/);
  });
});

describe('templates', () => {
  it.each(['xlsx', 'docx'] as const)('the %s template parses back into its example questions', async (format) => {
    const examples = [canon(sumArray), canon(profileCard), canon(topEarner)];
    const r = await parseFile(await templateFile(format, examples), format);
    expect(r.issues).toEqual([]);
    expect(r.questions.map((q) => q.input)).toEqual(examples);
  });
});
