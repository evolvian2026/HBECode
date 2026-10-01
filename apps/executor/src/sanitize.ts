import type { RuntimeSpec } from './runtimes.js';

/**
 * Compiler and runtime diagnostics can quote the hidden driver (gcc and rustc print source
 * excerpts, Python tracebacks print the failing line). Before any output reaches a student:
 *  - references into the student's region are rewritten to the student's file and line;
 *  - diagnostic blocks that point into the driver are dropped;
 *  - any remaining line that reproduces a driver source line is replaced.
 */
export interface SourceMap {
  spec: RuntimeSpec;
  /** 1-based line in mainFile where the student's code starts (concat layout). */
  studentStart: number;
  studentLines: number;
  driverCode: string;
}

const HARNESS_HINT =
  'The hidden test harness could not use your code. Check that the function name, parameters and return type match the starter code.';

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeOutput(raw: string, map: SourceMap, maxBytes = 16 * 1024): string {
  if (!raw) return '';
  const { spec } = map;
  const files = [spec.mainFile, spec.studentFile].filter((f): f is string => Boolean(f)).map(escapeRe).join('|');
  // file:line (gcc, rustc, go, javac, node), File "file", line N (python), file(line,col) (csc)
  const refRe = new RegExp(
    `(?:/box/|\\./)?\\b(${files}):(\\d+)|File "(?:/box/)?(${files})", line (\\d+)|\\b(${files})\\((\\d+),(\\d+)\\)`,
    'g',
  );
  const headerRe = new RegExp(
    [
      `^\\S*(?:${files}):\\d+(?::\\d+)?:`, // gcc / go / javac / node header
      `^(?:${files})\\(\\d+,\\d+\\)`, // csc
      `^(?:error|warning)(?:\\[[A-Z]\\d+\\])?:`, // rustc
      `^\\s*File "`, // python frame
      `^\\s+at `, // node stack frame
    ].join('|'),
  );

  /** Classify a reference: student line (remapped) or driver. */
  const classify = (file: string, line: number): { driver: boolean; file: string; line: number } => {
    if (spec.layout === 'separate') {
      return file === spec.studentFile ? { driver: false, file: spec.displayFile, line } : { driver: true, file, line };
    }
    const rel = line - map.studentStart + 1;
    if (file === spec.mainFile && rel >= 1 && rel <= map.studentLines) return { driver: false, file: spec.displayFile, line: rel };
    return { driver: true, file, line };
  };

  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  type Block = { lines: string[]; driver: boolean };
  const blocks: Block[] = [];
  let cur: Block = { lines: [], driver: false };
  for (const line of lines) {
    if (headerRe.test(line) && cur.lines.length > 0) {
      blocks.push(cur);
      cur = { lines: [], driver: false };
    }
    let touchesDriver = false;
    let rewritten = line.replace(refRe, (m, f1, l1, f2, l2, f3, l3, c3) => {
      const file = f1 ?? f2 ?? f3;
      const ln = Number(l1 ?? l2 ?? l3);
      const r = classify(file, ln);
      if (r.driver) {
        touchesDriver = true;
        return m;
      }
      if (f2) return `File "${r.file}", line ${r.line}`;
      if (f3) return `${r.file}(${r.line},${c3})`;
      return `${r.file}:${r.line}`;
    });
    // Source-excerpt gutters ("  12 | code" in gcc/rustc) carry merged-file line numbers.
    if (spec.layout === 'concat') {
      rewritten = rewritten.replace(/^(\s*)(\d+)(\s+\|)/, (m, pre: string, n: string, bar: string) => {
        const rel = Number(n) - map.studentStart + 1;
        if (rel < 1 || rel > map.studentLines) {
          touchesDriver = true;
          return m;
        }
        return `${pre}${String(rel).padStart(n.length)}${bar}`;
      });
    }
    // Bare mentions such as "main.c: In function ‘f’:" name the merged file.
    rewritten = rewritten.replace(new RegExp(`(?:/box/)?\\b${escapeRe(spec.mainFile)}\\b(?!:\\d)`, 'g'), spec.layout === 'concat' ? spec.displayFile : spec.mainFile);
    if (touchesDriver) cur.driver = true;
    cur.lines.push(rewritten);
  }
  blocks.push(cur);

  const driverLines = new Set(
    map.driverCode
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length >= 6),
  );
  const kept: string[] = [];
  let dropped = false;
  for (const b of blocks) {
    if (b.driver) {
      dropped = true;
      continue;
    }
    for (const l of b.lines) {
      const t = l.replace(/^\s*\d+\s*\|\s?/, '').trim(); // gcc/rustc excerpt gutter "  12 | code"
      kept.push(t.length >= 6 && driverLines.has(t) ? '    <hidden harness line>' : l.replaceAll('/box/', ''));
    }
  }
  let text = kept.join('\n').trim();
  if (!text && dropped) text = HARNESS_HINT;
  else if (dropped) text += `\n\n(${HARNESS_HINT})`;
  const buf = Buffer.from(text, 'utf8');
  return buf.length > maxBytes ? `${buf.subarray(0, maxBytes).toString('utf8')}\n… (truncated)` : text;
}
