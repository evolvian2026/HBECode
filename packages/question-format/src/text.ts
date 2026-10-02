/**
 * Text encoding for cells. Everything here exists so that export → import is lossless:
 * whitespace, tabs, CR/LF, control characters, Unicode and very long values must come back
 * byte for byte.
 */

/** Excel's hard limit is 32,767 characters per cell; longer values continue on extra rows. */
export const CELL_CHUNK = 32_000;

/** Characters XML 1.0 cannot carry at all (plus CR, which XML parsers turn into LF). */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const XML_UNSAFE = /[\u0000-\u0008\u000B\u000C\u000D\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Decode the five predefined entities and numeric character references (no DTD entities). */
export function xmlDecode(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_m, e: string) => {
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    const cp = e.startsWith('#x') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
  });
}

/**
 * SpreadsheetML escapes characters XML cannot hold as `_xHHHH_` (Excel itself writes a carriage
 * return as `_x000D_`). A literal `_xHHHH_` in the text has its underscore escaped as `_x005F_`.
 */
export function ooxmlEncode(s: string): string {
  return s
    .replace(/_(x[0-9A-Fa-f]{4}_)/g, '_x005F_$1')
    .replace(
      // eslint-disable-next-line no-control-regex -- matching control characters is the point
      /[\u0000-\u0008\u000B\u000C\u000D\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      (c) => `_x${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}_`,
    );
}

export function ooxmlDecode(s: string): string {
  return s.replace(/_x([0-9A-Fa-f]{4})_/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
}

/** Word has no escape for control characters: such values are written as base64 with a marker. */
export const B64_MARK = '[[base64]]';

export function docxEncode(s: string): string {
  if (XML_UNSAFE.test(s) || s.startsWith(B64_MARK)) return B64_MARK + Buffer.from(s, 'utf8').toString('base64');
  return s;
}

export function docxDecode(s: string): string {
  if (!s.startsWith(B64_MARK)) return s;
  const b = s.slice(B64_MARK.length).replace(/\s+/g, '');
  return Buffer.from(b, 'base64').toString('utf8');
}

/** Split into chunks of at most `size` UTF-16 units without cutting a surrogate pair. */
export function chunk(s: string, size = CELL_CHUNK): string[] {
  if (s.length <= size) return [s];
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + size, s.length);
    const c = s.charCodeAt(end - 1);
    if (end < s.length && c >= 0xd800 && c <= 0xdbff) end--;
    out.push(s.slice(i, end));
    i = end;
  }
  return out;
}
