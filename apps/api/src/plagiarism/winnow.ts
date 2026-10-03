/**
 * Code similarity by winnowing (Schleimer, Wilkerson & Aiken 2003 — the algorithm behind MOSS).
 *
 * 1. Tokenise; drop comments and whitespace; replace identifiers with `I`, numbers with `N` and
 *    strings with `S` (keywords and operators are kept). Renaming variables or reformatting
 *    therefore changes nothing.
 * 2. Hash every k consecutive tokens (k-grams).
 * 3. In every window of w consecutive hashes keep the minimum: the document's fingerprints.
 *    Any match of at least w + k − 1 tokens is guaranteed to share a fingerprint.
 * 4. Fingerprints that also occur in the starter code are removed (everyone starts from it).
 * 5. Similarity of A and B = shared fingerprints / fingerprints of the smaller one (containment):
 *    copying a whole solution into a longer one still scores high.
 */

export interface Token {
  t: string;
  line: number;
}

// Structural keywords only: words that are often variable names (list, map, set, type, values, …)
// must be normalised like any identifier, or renaming them would hide a copy.
const CODE_KEYWORDS = new Set(
  (
    'if else for while do switch case default break continue return goto try catch finally throw throws new delete ' +
    'class struct enum union interface extends implements public private protected static const final void int long ' +
    'short char float double bool boolean byte unsigned signed auto var let function def lambda yield async await ' +
    'import from as package namespace using include define typedef template typename this self super null nil none ' +
    'true false and or not in is pass elif with global nonlocal fn mut impl trait match loop pub use mod crate func ' +
    'go chan select defer range'
  ).split(/\s+/),
);
const SQL_KEYWORDS = new Set(
  (
    'select from where group by order having join left right inner outer full cross on limit offset insert into update ' +
    'delete set values distinct as and or not in is null case when then else end union all exists between like count ' +
    'sum avg min max coalesce over partition asc desc'
  ).split(/\s+/),
);

/** Tokens with line numbers. Comments: //, /* *\/, # (Python/shell), <!-- --> (HTML), -- (SQL). */
export function tokenize(src: string, lang: string): Token[] {
  const out: Token[] = [];
  const hashComments = lang === 'python' || lang === 'pandas';
  const dashComments = lang === 'postgres' || lang === 'mysql' || lang === 'sql';
  const KEYWORDS = dashComments ? SQL_KEYWORDS : CODE_KEYWORDS;
  let i = 0;
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      i++;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '//' || (hashComments && c === '#') || (dashComments && two === '--')) {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (two === '/*' || src.startsWith('<!--', i)) {
      const end = two === '/*' ? src.indexOf('*/', i + 2) : src.indexOf('-->', i + 4);
      const stop = end < 0 ? n : end + (two === '/*' ? 2 : 3);
      for (let j = i; j < stop; j++) if (src[j] === '\n') line++;
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      // Python triple quotes
      const triple = (lang === 'python' || lang === 'pandas') && src.startsWith(c.repeat(3), i);
      const q = triple ? c.repeat(3) : c;
      const start = line;
      i += q.length;
      while (i < n && !src.startsWith(q, i)) {
        if (src[i] === '\\') i++;
        else if (src[i] === '\n') {
          line++;
          if (!triple && q !== '`') break; // unterminated single-line string
        }
        i++;
      }
      i += q.length;
      out.push({ t: 'S', line: start });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(?:0[xX][0-9a-fA-F_]+|[0-9][0-9_]*\.?[0-9_]*(?:[eE][+-]?[0-9]+)?|\.[0-9]+(?:[eE][+-]?[0-9]+)?)[a-zA-Z]*/.exec(src.slice(i, i + 64));
      out.push({ t: 'N', line });
      i += m ? m[0].length : 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j]!)) j++;
      const w = src.slice(i, j);
      out.push({ t: KEYWORDS.has(w.toLowerCase()) ? w.toLowerCase() : 'I', line });
      i = j;
      continue;
    }
    out.push({ t: c, line });
    i++;
  }
  return out;
}

/** 32-bit FNV-1a over the k token strings. */
function hashGram(tokens: Token[], at: number, k: number): number {
  let h = 0x811c9dc5;
  for (let j = at; j < at + k; j++) {
    const s = tokens[j]!.t;
    for (let x = 0; x < s.length; x++) {
      h ^= s.charCodeAt(x);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x20;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export interface Fingerprints {
  /** hash -> start positions (token index of the k-gram) */
  map: Map<number, number[]>;
  tokens: Token[];
}

export function fingerprints(tokens: Token[], k = 5, w = 4): Fingerprints {
  const map = new Map<number, number[]>();
  if (tokens.length < k) return { map, tokens };
  const hashes: number[] = [];
  for (let i = 0; i + k <= tokens.length; i++) hashes.push(hashGram(tokens, i, k));
  let lastPos = -1;
  const take = (pos: number) => {
    if (pos === lastPos) return;
    lastPos = pos;
    const h = hashes[pos]!;
    const list = map.get(h);
    if (list) list.push(pos);
    else map.set(h, [pos]);
  };
  if (hashes.length <= w) {
    let m = 0;
    for (let i = 1; i < hashes.length; i++) if (hashes[i]! <= hashes[m]!) m = i;
    take(m);
    return { map, tokens };
  }
  for (let start = 0; start + w <= hashes.length; start++) {
    let m = start;
    for (let i = start + 1; i < start + w; i++) if (hashes[i]! <= hashes[m]!) m = i; // rightmost minimum
    take(m);
  }
  return { map, tokens };
}

/** Remove fingerprints that also occur in the starter code. */
export function subtract(fp: Fingerprints, starter: Fingerprints): Fingerprints {
  const map = new Map([...fp.map].filter(([h]) => !starter.map.has(h)));
  return { map, tokens: fp.tokens };
}

/** Merge token positions of matched k-grams into line ranges [from, to] (1-based). */
function lineRanges(fp: Fingerprints, hashes: Iterable<number>, k: number): [number, number][] {
  const lines: [number, number][] = [];
  for (const h of hashes) {
    for (const pos of fp.map.get(h) ?? []) {
      const a = fp.tokens[pos]?.line ?? 1;
      const b = fp.tokens[Math.min(fp.tokens.length - 1, pos + k - 1)]?.line ?? a;
      lines.push([a, b]);
    }
  }
  lines.sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const r of lines) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

export interface Doc {
  id: string;
  fp: Fingerprints;
}

export interface PairResult {
  a: string;
  b: string;
  similarity: number;
  matched: number;
  regions: { a: [number, number][]; b: [number, number][] };
}

/**
 * All pairs whose similarity is at least `threshold`. An inverted index means only documents
 * that share a fingerprint are compared, so honest classes stay cheap.
 */
export function comparePairs(docs: Doc[], opts: { threshold: number; minFingerprints: number; k: number }): PairResult[] {
  const index = new Map<number, number[]>();
  docs.forEach((d, i) => {
    for (const h of d.fp.map.keys()) {
      const l = index.get(h);
      if (l) l.push(i);
      else index.set(h, [i]);
    }
  });
  const shared = new Map<number, number>(); // pair key (i * n + j) -> count
  const n = docs.length;
  for (const list of index.values()) {
    if (list.length < 2 || list.length > Math.max(50, n * 0.6)) continue; // ubiquitous fingerprints say nothing
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const key = list[x]! * n + list[y]!;
      shared.set(key, (shared.get(key) ?? 0) + 1);
    }
  }
  const out: PairResult[] = [];
  for (const [key, count] of shared) {
    const i = Math.floor(key / n);
    const j = key % n;
    const A = docs[i]!;
    const B = docs[j]!;
    const smaller = Math.min(A.fp.map.size, B.fp.map.size);
    if (smaller < opts.minFingerprints) continue;
    const sim = count / smaller;
    if (sim < opts.threshold) continue;
    const common = [...A.fp.map.keys()].filter((h) => B.fp.map.has(h));
    out.push({ a: A.id, b: B.id, similarity: Math.round(sim * 10000) / 10000, matched: common.length, regions: { a: lineRanges(A.fp, common, opts.k), b: lineRanges(B.fp, common, opts.k) } });
  }
  return out.sort((x, y) => y.similarity - x.similarity);
}

/** Text that represents a submission for comparison (web: all files in path order). */
export function sourceOf(code: string, type: string): string {
  if (type !== 'web') return code;
  try {
    const files = JSON.parse(code) as { path: string; content: string }[];
    return files.sort((a, b) => a.path.localeCompare(b.path)).map((f) => f.content).join('\n');
  } catch {
    return code;
  }
}
