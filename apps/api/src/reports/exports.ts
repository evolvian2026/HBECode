import { writeWorkbook } from '@hbe/question-format';

/**
 * CSV for spreadsheets. Cells that a spreadsheet would treat as a formula (= + - @, tab, CR) are
 * prefixed with an apostrophe (OWASP "CSV injection"): a student named `=HYPERLINK(...)` must not
 * become a live formula on a teacher's machine. XLSX exports write inline strings, never formulas.
 */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): Buffer {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header, ...rows].map((r) => r.map(cell).join(','));
  // BOM so Excel opens UTF-8 (names in Indian scripts) correctly.
  return Buffer.from('﻿' + lines.join('\r\n') + '\r\n', 'utf8');
}

export function toXlsx(sheet: string, header: string[], rows: (string | number | null | undefined)[][]): Promise<Buffer> {
  return writeWorkbook([{ name: sheet.slice(0, 31), header, rows: rows.map((r) => r.map((v) => (v === null || v === undefined ? '' : String(v)))), widths: header.map((h) => Math.max(10, Math.min(40, h.length + 4))) }]);
}
