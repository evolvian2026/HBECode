import { XMLParser } from 'fast-xml-parser';
import { emptyRecords, normHeader, SHEETS, type Issue, type Records, type SheetName } from './columns.js';
import { ooxmlDecode, ooxmlEncode, xmlDecode, xmlEscape } from './text.js';
import { FormatError, openPackage, writePackage } from './zip.js';

/**
 * Minimal SpreadsheetML (.xlsx) writer and reader. Written by hand on purpose: we control every
 * byte (inline strings, `_xHHHH_` escapes, no formulas) and the reader only touches the parts it
 * needs, through the guarded unzip.
 */

const colName = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export interface SheetData {
  name: string;
  header: string[];
  rows: string[][];
  /** Column widths in characters. */
  widths?: number[];
  wrap?: boolean;
}

function sheetXml(s: SheetData): string {
  const cell = (r: number, c: number, v: string, style: number) =>
    v === '' ? '' : `<c r="${colName(c)}${r}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xmlEscape(ooxmlEncode(v))}</t></is></c>`;
  const rows = [
    `<row r="1">${s.header.map((h, c) => cell(1, c, h, 1)).join('')}</row>`,
    ...s.rows.map((row, i) => `<row r="${i + 2}">${row.map((v, c) => cell(i + 2, c, v, s.wrap ? 2 : 0)).join('')}</row>`),
  ];
  const cols = s.widths?.length ? `<cols>${s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows.join('')}</sheetData></worksheet>`;
}

export async function writeWorkbook(sheets: SheetData[]): Promise<Buffer> {
  const parts: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    // 0 = default, 1 = bold header, 2 = wrapped text aligned to the top.
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`,
  };
  sheets.forEach((s, i) => (parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s)));
  return writePackage(parts);
}

// ------------------------------------------------------------------ reading
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
  removeNSPrefix: true,
  isArray: (name) => ['sheet', 'Relationship', 'row', 'c', 'si', 'r', 't'].includes(name),
});

type X = Record<string, unknown>;
const arr = <T = X>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v === undefined ? [] : [v as T]);
const text = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(text).join('');
  const t = (v as X)['#text'];
  return typeof t === 'string' ? t : '';
};
/** Text of a shared-string item or inline string: plain <t> or rich-text runs <r><t>. */
const richText = (si: X | undefined): string => {
  if (!si) return '';
  if (si.t !== undefined) return arr(si.t).map(text).join('');
  return arr<X>(si.r).map((r) => arr(r.t).map(text).join('')).join('');
};
const decode = (s: string) => ooxmlDecode(xmlDecode(s));

export interface RawSheet {
  name: string;
  /** Row number (1-based) → cell values by column index. */
  rows: { r: number; cells: string[] }[];
  warnings: Issue[];
}

export async function readWorkbook(buf: Buffer): Promise<RawSheet[]> {
  const parts = await openPackage(buf, (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  const wb = parts.get('xl/workbook.xml');
  if (!wb) throw new FormatError('not an Excel workbook (xl/workbook.xml is missing)');
  const rels = new Map(arr<X>((parser.parse(parts.get('xl/_rels/workbook.xml.rels') ?? '') as X).Relationships ? ((parser.parse(parts.get('xl/_rels/workbook.xml.rels') ?? '') as X).Relationships as X).Relationship : []).map((r) => [String(r['@_Id']), String(r['@_Target'])]));
  const shared = arr<X>(((parser.parse(parts.get('xl/sharedStrings.xml') ?? '<sst/>') as X).sst as X | undefined)?.si).map((si) => decode(richText(si)));
  const sheets = arr<X>(((((parser.parse(wb) as X).workbook as X)?.sheets as X) ?? {}).sheet);
  const out: RawSheet[] = [];
  for (const s of sheets) {
    const name = xmlDecode(String(s['@_name'] ?? ''));
    const target = rels.get(String(s['@_id'] ?? s['@_r:id'] ?? ''));
    const path = target ? `xl/${target.replace(/^\/?xl\//, '').replace(/^\//, '')}` : undefined;
    const xml = path ? parts.get(path) : undefined;
    if (!xml) continue;
    const warnings: Issue[] = [];
    const data = (((parser.parse(xml) as X).worksheet as X)?.sheetData as X) ?? {};
    const rows: RawSheet['rows'] = [];
    let auto = 0;
    for (const row of arr<X>(data.row)) {
      const r = Number(row['@_r'] ?? auto + 1);
      auto = r;
      const cells: string[] = [];
      let ci = 0;
      for (const c of arr<X>(row.c)) {
        const ref = String(c['@_r'] ?? '');
        const i = ref ? colIndex(ref) : ci;
        ci = i + 1;
        const t = String(c['@_t'] ?? 'n');
        let v: string;
        if (t === 's') v = shared[Number(text(c.v))] ?? '';
        else if (t === 'inlineStr') v = decode(richText(c.is as X));
        else if (t === 'b') v = text(c.v) === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'e') {
          v = '';
          warnings.push({ loc: `${name}, row ${r}`, field: ref, message: `cell error ${text(c.v)} ignored` });
        } else if (t === 'str') v = decode(text(c.v));
        else {
          const raw = text(c.v);
          v = raw === '' ? '' : String(Number(raw));
        }
        if (c.f !== undefined) warnings.push({ loc: `${name}, row ${r}`, field: ref, message: 'formula: its last calculated value was used' });
        cells[i] = v;
      }
      rows.push({ r, cells });
    }
    out.push({ name, rows, warnings });
  }
  return out;
}

// ------------------------------------------------------------------ questions ⇄ workbook
export async function recordsToXlsx(rec: Records, extra: SheetData[] = []): Promise<Buffer> {
  const sheets: SheetData[] = SHEETS.map((spec) => ({
    name: spec.name,
    header: spec.columns.map((c) => c.name),
    rows: rec[spec.name].map((r) => spec.columns.map((c) => r.cells[c.name] ?? '')),
    widths: spec.columns.map((c) => (c.long || ['statement', 'schema_display', 'check', 'explanation'].includes(c.name) ? 60 : Math.max(10, c.name.length + 2))),
    wrap: true,
  }));
  return writeWorkbook([...extra, ...sheets]);
}

export async function xlsxToRecords(buf: Buffer): Promise<{ records: Records; issues: Issue[]; warnings: Issue[] }> {
  const raw = await readWorkbook(buf);
  const rec = emptyRecords();
  const issues: Issue[] = [];
  const warnings: Issue[] = raw.flatMap((s) => s.warnings);
  const byName = new Map(SHEETS.map((s) => [s.name.toLowerCase(), s]));
  let found = 0;
  for (const sheet of raw) {
    const spec = byName.get(sheet.name.trim().toLowerCase());
    if (!spec) continue; // Instructions, notes, … are ignored
    found++;
    const headerRow = sheet.rows.find((r) => r.cells.some((v) => (v ?? '').trim() !== ''));
    if (!headerRow) continue;
    const header = headerRow.cells.map((h) => normHeader(h ?? ''));
    const known = new Set(spec.columns.map((c) => c.name));
    header.forEach((h, i) => {
      if (h && !known.has(h)) warnings.push({ loc: `${sheet.name}, row ${headerRow.r}`, field: h, message: `unknown column ignored (column ${colName(i)})` });
    });
    if (!header.includes('key')) {
      issues.push({ loc: `${sheet.name}, row ${headerRow.r}`, message: 'the header row needs a "key" column' });
      continue;
    }
    for (const row of sheet.rows) {
      if (row.r <= headerRow.r || row.cells.every((v) => (v ?? '') === '')) continue;
      const cells: Record<string, string> = {};
      header.forEach((h, i) => {
        if (known.has(h)) cells[h] = row.cells[i] ?? '';
      });
      rec[spec.name as SheetName].push({ cells, loc: `${sheet.name}, row ${row.r}` });
    }
  }
  if (!found) issues.push({ loc: 'workbook', message: `no sheet named ${SHEETS.map((s) => `"${s.name}"`).join(', ')} — start from the template` });
  return { records: rec, issues, warnings };
}
