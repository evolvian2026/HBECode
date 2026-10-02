import { XMLParser } from 'fast-xml-parser';
import { emptyRecords, normHeader, SHEET, SHEETS, type Issue, type Records, type SheetName } from './columns.js';
import { docxDecode, docxEncode, xmlDecode, xmlEscape } from './text.js';
import { FormatError, openPackage, writePackage } from './zip.js';

/**
 * Word (.docx) layout: per question a two-column "Field | Value" table (the Questions row), then
 * one table per kind of row (tests, code, files) whose header row uses the same column names as
 * the Excel sheets. Paragraphs between tables are free text and are ignored on import, so
 * authors can add notes. Inside a cell, each paragraph is one line; tabs are kept.
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MONO = new Set(['input', 'output', 'starter', 'driver', 'solution', 'content', 'check', 'setup_sql', 'setup_postgres', 'setup_mysql', 'setup_mongodb', 'setup_pandas', 'state_query_sql', 'state_query_postgres', 'state_query_mysql']);

function para(text: string, opts: { bold?: boolean; mono?: boolean; size?: number } = {}): string {
  const rpr = `${opts.bold ? '<w:b/>' : ''}${opts.mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : ''}${opts.size ? `<w:sz w:val="${opts.size}"/>` : opts.mono ? '<w:sz w:val="18"/>' : ''}`;
  const runs = text.split('\t').map((seg, i) => `${i ? `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:tab/></w:r>` : ''}${seg ? `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(seg)}</w:t></w:r>` : ''}`).join('');
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${runs}</w:p>`;
}

function cellXml(value: string, opts: { bold?: boolean; mono?: boolean; width?: number } = {}): string {
  const enc = docxEncode(value);
  return `<w:tc><w:tcPr>${opts.width ? `<w:tcW w:w="${opts.width}" w:type="dxa"/>` : ''}</w:tcPr>${enc.split('\n').map((line) => para(line, opts)).join('')}</w:tc>`;
}

function table(rows: string[][], opts: { header?: boolean; mono?: (col: number) => boolean; widths?: number[] } = {}): string {
  const border = '<w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/>';
  const trs = rows.map((r, i) =>
    `<w:tr>${r.map((v, c) => cellXml(v, { bold: opts.header && i === 0, mono: !(opts.header && i === 0) && (opts.mono?.(c) ?? false), width: opts.widths?.[c] })).join('')}</w:tr>`,
  );
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="autofit"/></w:tblPr>${trs.join('')}</w:tbl><w:p/>`;
}

export async function recordsToDocx(rec: Records, intro: string[] = []): Promise<Buffer> {
  const body: string[] = intro.map((l, i) => para(l, { bold: i === 0, size: i === 0 ? 32 : undefined }));
  for (const q of rec.Questions) {
    const key = q.cells.key ?? '';
    body.push(para(`${key} — ${q.cells.title ?? ''}`, { bold: true, size: 28 }));
    const type = q.cells.type;
    const fields = SHEET.Questions.columns.filter((c) => !c.types || c.types.includes(type as never));
    body.push(table([['Field', 'Value'], ...fields.map((c) => [c.name, q.cells[c.name] ?? ''])], { header: true, widths: [2400, 7600] }));
    for (const spec of SHEETS.slice(1)) {
      const rows = rec[spec.name].filter((r) => r.cells.key === key);
      if (!rows.length) continue;
      const cols = spec.columns.filter((c) => c.name !== 'part');
      body.push(para(spec.name, { bold: true }));
      body.push(table([cols.map((c) => c.name), ...rows.map((r) => cols.map((c) => r.cells[c.name] ?? ''))], { header: true, mono: (c) => MONO.has(cols[c]!.name) }));
    }
  }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return writePackage({
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': doc,
  });
}

// ------------------------------------------------------------------ reading
type Node = Record<string, unknown>;
const parser = new XMLParser({ ignoreAttributes: true, trimValues: false, parseTagValue: false, processEntities: false, preserveOrder: true, removeNSPrefix: true });

const tag = (n: Node) => Object.keys(n).find((k) => k !== ':@') ?? '';
const kids = (n: Node) => (n[tag(n)] as Node[]) ?? [];

/** Text of a run container, in document order; deleted text (tracked changes) is skipped. */
function runText(nodes: Node[]): string {
  let s = '';
  for (const n of nodes) {
    const t = tag(n);
    if (t === '#text') continue;
    if (t === 't') s += kids(n).map((k) => (typeof k['#text'] === 'string' ? (k['#text'] as string) : '')).join('');
    else if (t === 'tab') s += '\t';
    else if (t === 'br' || t === 'cr') s += '\n';
    else if (t === 'noBreakHyphen') s += '-';
    else if (t === 'del' || t === 'delText' || t === 'rPr' || t === 'pPr' || t === 'instrText') continue;
    else s += runText(kids(n));
  }
  return s;
}

function cellText(tc: Node): string {
  const lines: string[] = [];
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      const t = tag(n);
      if (t === 'p') lines.push(xmlDecode(runText(kids(n))));
      else if (t === 'tbl') continue; // nested tables are not part of the format
      else if (t !== '#text' && t !== 'tcPr') walk(kids(n));
    }
  };
  walk(kids(tc));
  return docxDecode(lines.join('\n'));
}

function tables(body: Node[]): string[][][] {
  const out: string[][][] = [];
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      const t = tag(n);
      if (t === 'tbl') {
        const rows: string[][] = [];
        for (const tr of kids(n)) {
          if (tag(tr) !== 'tr') continue;
          rows.push(kids(tr).filter((tc) => tag(tc) === 'tc').map(cellText));
        }
        out.push(rows);
      } else if (t === 'sdt' || t === 'sdtContent' || t === 'customXml') walk(kids(n));
    }
  };
  walk(body);
  return out;
}

export async function docxToRecords(buf: Buffer): Promise<{ records: Records; issues: Issue[]; warnings: Issue[] }> {
  const parts = await openPackage(buf, (n) => n === 'word/document.xml');
  const xml = parts.get('word/document.xml');
  if (!xml) throw new FormatError('not a Word document (word/document.xml is missing)');
  const doc = parser.parse(xml) as Node[];
  const root = doc.find((n) => tag(n) === 'document');
  const body = root ? kids(root).find((n) => tag(n) === 'body') : undefined;
  if (!body) throw new FormatError('not a Word document (no body)');
  const rec = emptyRecords();
  const issues: Issue[] = [];
  const warnings: Issue[] = [];
  const specs = SHEETS.slice(1);
  tables(kids(body)).forEach((rows, ti) => {
    const where = (r: number) => `Word table ${ti + 1}, row ${r + 1}`;
    const head = (rows[0] ?? []).map((h) => normHeader(h));
    if (head[0] === 'field' && head[1] === 'value') {
      const cells: Record<string, string> = {};
      const known = new Set(SHEET.Questions.columns.map((c) => c.name));
      rows.slice(1).forEach((r, i) => {
        const f = normHeader(r[0] ?? '');
        if (!f) return;
        if (!known.has(f)) warnings.push({ loc: where(i + 1), field: f, message: 'unknown field ignored' });
        else cells[f] = r[1] ?? '';
      });
      rec.Questions.push({ cells, loc: `Word table ${ti + 1} (question ${cells.key || '?'})` });
      return;
    }
    // Other tables: identify the kind by its header (the same columns as the Excel sheet).
    const spec = specs.find((s) => {
      const cols = s.columns.map((c) => c.name).filter((c) => c !== 'part');
      return head.includes('key') && head.every((h) => !h || cols.includes(h) || h === 'part') && cols.filter((c) => head.includes(c)).length >= Math.min(cols.length, 3) && (s.identity.every((c) => head.includes(c)));
    });
    if (!spec) {
      warnings.push({ loc: `Word table ${ti + 1}`, message: 'table ignored: its header does not match any table of the format' });
      return;
    }
    rows.slice(1).forEach((r, i) => {
      if (r.every((v) => v === '')) return;
      const cells: Record<string, string> = {};
      head.forEach((h, c) => {
        if (h) cells[h] = r[c] ?? '';
      });
      rec[spec.name as SheetName].push({ cells, loc: where(i + 1) });
    });
  });
  if (!rec.Questions.length) issues.push({ loc: 'document', message: 'no question table found (a two-column table whose header is "Field | Value") — start from the template' });
  return { records: rec, issues, warnings };
}
