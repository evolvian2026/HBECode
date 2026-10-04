import type { RuntimeId } from '@hbe/shared';

/**
 * Code generation for seed coding questions. A question declares a typed function signature;
 * from it we generate, for all 8 languages, the student stub, the driver that parses stdin and
 * prints the result, and the input/output format text. Solutions are written by hand per
 * language (function body + optional helpers) and wrapped with the generated signature, so the
 * signature, the driver and the I/O format can never disagree.
 *
 * Wire format (whitespace-separated tokens, one value per line):
 *   int | long | double | string   → the value (strings never contain whitespace)
 *   T[]                            → length n, then the n items on one line
 *   int[][]                        → "rows cols", then one line per row
 *   list (singly linked list)      → like int[]; the driver builds the ListNode chain
 * Output: scalars on one line (bool as true/false, double with 6 decimals), arrays and lists as
 * one space-separated line, int[][] as one line per row.
 */

export type ParamType = 'int' | 'long' | 'double' | 'string' | 'int[]' | 'long[]' | 'double[]' | 'string[]' | 'int[][]' | 'list';
export type ReturnType = ParamType | 'bool';
export interface Param {
  name: string;
  type: ParamType;
}
export type Value = number | bigint | string | boolean | Value[];

export interface Solution {
  body: string;
  /** Code placed before the function (module level) or, for Java/C#, inside the class. */
  helpers?: string;
  /** Go only: packages the solution imports. */
  imports?: string[];
}

const isArray = (t: ReturnType) => t.endsWith('[]') && t !== 'int[][]';
/** On the wire a linked list is an int array. */
const wire = (t: ReturnType): ReturnType => (t === 'list' ? 'int[]' : t);
const usesList = (params: readonly Param[], ret: ReturnType) => ret === 'list' || params.some((p) => p.type === 'list');
const elem = (t: ReturnType) => t.replace('[]', '') as 'int' | 'long' | 'double' | 'string';

export const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
export const pascal = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const indent = (code: string, n: number) =>
  code
    .replace(/\s+$/, '')
    .split('\n')
    .map((l) => (l.trim() ? ' '.repeat(n) + l : ''))
    .join('\n');

// ------------------------------------------------------------------------------- wire format

function check(type: ParamType | ReturnType, v: Value, where: string): void {
  const t = wire(type);
  const fail = (why: string) => {
    throw new Error(`${where}: ${why}`);
  };
  if (t === 'int' && (typeof v !== 'number' || !Number.isInteger(v) || v < -(2 ** 31) || v >= 2 ** 31)) fail(`not a 32-bit int: ${String(v)}`);
  if (t === 'long' && !(typeof v === 'bigint' || (typeof v === 'number' && Number.isSafeInteger(v)))) fail(`not a safe long: ${String(v)}`);
  if (t === 'double' && (typeof v !== 'number' || !Number.isFinite(v))) fail(`not a double: ${String(v)}`);
  if (t === 'bool' && typeof v !== 'boolean') fail('not a bool');
  if (t === 'string' && typeof v !== 'string') fail('not a string');
  if (isArray(t) || t === 'int[][]') {
    if (!Array.isArray(v)) fail('not an array');
    if (t === 'int[][]') {
      const rows = v as Value[][];
      const cols = rows[0]?.length ?? 0;
      rows.forEach((r, i) => {
        if (!Array.isArray(r) || r.length !== cols) fail(`row ${i} has a different length`);
        r.forEach((x) => check('int', x, where));
      });
    } else (v as Value[]).forEach((x) => check(elem(t), x, where));
  }
}

function token(t: 'int' | 'long' | 'double' | 'string', v: Value, where: string): string {
  if (t === 'string' && (/\s/.test(v as string) || (v as string) === '')) throw new Error(`${where}: input strings must be non-empty without whitespace`);
  return String(v);
}

/** stdin text for one test case. */
export function encodeInput(params: readonly Param[], args: readonly Value[]): string {
  if (args.length !== params.length) throw new Error(`expected ${params.length} arguments, got ${args.length}`);
  let out = '';
  params.forEach((p, i) => {
    const v = args[i]!;
    const t = wire(p.type);
    check(t, v, `argument ${p.name}`);
    if (t === 'int[][]') {
      const rows = v as Value[][];
      out += `${rows.length} ${rows[0]?.length ?? 0}\n` + rows.map((r) => r.join(' ') + '\n').join('');
    } else if (isArray(t)) {
      const a = v as Value[];
      out += `${a.length}\n${a.map((x) => token(elem(t), x, p.name)).join(' ')}\n`;
    } else out += `${token(t as 'int', v, p.name)}\n`;
  });
  return out;
}

const fmtScalar = (t: ReturnType, v: Value) => (t === 'double' ? (v as number).toFixed(6) : t === 'bool' ? String(v) : String(v));

/** Expected stdout for a return value. */
export function encodeOutput(type: ReturnType, v: Value): string {
  const t = wire(type);
  check(t, v, 'return value');
  if (t === 'int[][]') return (v as Value[][]).map((r) => r.join(' ') + '\n').join('');
  if (isArray(t)) return (v as Value[]).map((x) => fmtScalar(elem(t), x)).join(' ') + '\n';
  return fmtScalar(t, v) + '\n';
}

export function formatText(params: readonly Param[], ret: ReturnType): { inputFormat: string; outputFormat: string } {
  const lines: string[] = [];
  const word = (t: string) => ({ int: 'integer', long: 'integer', double: 'real number', string: 'word (no spaces)' })[t] ?? t;
  for (const p of params) {
    if (p.type === 'list') lines.push(`- A line with the length of the linked list \`${p.name}\`, then a line with its node values from head to tail (length 0 means an empty list).`);
    else if (p.type === 'int[][]') lines.push(`- A line with two integers **r c** (rows and columns of \`${p.name}\`), then **r** lines of **c** space-separated integers.`);
    else if (isArray(p.type)) lines.push(`- A line with the length of \`${p.name}\`, then a line with its ${word(elem(p.type))}s separated by spaces.`);
    else lines.push(`- A line with \`${p.name}\` (a ${word(p.type)}).`);
  }
  const output =
    ret === 'list'
      ? 'Print the values of the returned list from head to tail on one line, separated by spaces (an empty line for an empty list).'
      : ret === 'int[][]'
      ? 'Print each row of the returned matrix on its own line, values separated by spaces (nothing for an empty result).'
      : isArray(ret)
        ? `Print the returned ${elem(ret) === 'string' ? 'words' : 'values'} on one line, separated by spaces${ret === 'double[]' ? ', each with 6 digits after the decimal point' : ''} (an empty line for an empty result).`
        : ret === 'bool'
          ? 'Print `true` or `false`.'
          : ret === 'double'
            ? 'Print the returned number with 6 digits after the decimal point (answers within 10⁻⁶ are accepted).'
            : ret === 'string'
              ? 'Print the returned string.'
              : 'Print the returned integer.';
  return { inputFormat: `The driver reads the arguments in this order and calls your function:\n\n${lines.join('\n')}`, outputFormat: `${output} The starter code already does the reading and printing.` };
}

// ------------------------------------------------------------------------------- languages

type Lang = { type: (t: ReturnType, param: boolean) => string; empty: (t: ReturnType) => string };

const LANGS: Record<RuntimeId, Lang> = {
  python: {
    type: (t) => ({ int: 'int', long: 'int', double: 'float', bool: 'bool', string: 'str', 'int[]': 'list[int]', 'long[]': 'list[int]', 'double[]': 'list[float]', 'string[]': 'list[str]', 'int[][]': 'list[list[int]]', list: "'ListNode | None'" })[t],
    empty: (t) => (t === 'list' ? 'None' : (({ int: '0', long: '0', double: '0.0', bool: 'False', string: "''" })[t as 'int'] ?? '[]')),
  },
  javascript: { type: () => '', empty: (t) => (t === 'list' ? 'null' : (({ int: '0', long: '0', double: '0', bool: 'false', string: "''" })[t as 'int'] ?? '[]')) },
  java: {
    type: (t) => ({ int: 'int', long: 'long', double: 'double', bool: 'boolean', string: 'String', 'int[]': 'int[]', 'long[]': 'long[]', 'double[]': 'double[]', 'string[]': 'String[]', 'int[][]': 'int[][]', list: 'ListNode' })[t],
    empty: (t) => ({ int: '0', long: '0L', double: '0.0', bool: 'false', string: '""', 'int[]': 'new int[0]', 'long[]': 'new long[0]', 'double[]': 'new double[0]', 'string[]': 'new String[0]', 'int[][]': 'new int[0][0]', list: 'null' })[t],
  },
  csharp: {
    type: (t) => ({ int: 'int', long: 'long', double: 'double', bool: 'bool', string: 'string', 'int[]': 'int[]', 'long[]': 'long[]', 'double[]': 'double[]', 'string[]': 'string[]', 'int[][]': 'int[][]', list: 'ListNode' })[t],
    empty: (t) => ({ int: '0', long: '0', double: '0.0', bool: 'false', string: '""', 'int[]': 'new int[0]', 'long[]': 'new long[0]', 'double[]': 'new double[0]', 'string[]': 'new string[0]', 'int[][]': 'new int[0][]', list: 'null' })[t],
  },
  go: {
    type: (t) => ({ int: 'int', long: 'int64', double: 'float64', bool: 'bool', string: 'string', 'int[]': '[]int', 'long[]': '[]int64', 'double[]': '[]float64', 'string[]': '[]string', 'int[][]': '[][]int', list: '*ListNode' })[t],
    empty: (t) => ({ int: '0', long: '0', double: '0', bool: 'false', string: '""' })[t as 'int'] ?? 'nil',
  },
  rust: {
    type: (t, param) =>
      param
        ? { int: 'i32', long: 'i64', double: 'f64', bool: 'bool', string: '&str', 'int[]': '&[i32]', 'long[]': '&[i64]', 'double[]': '&[f64]', 'string[]': '&[String]', 'int[][]': '&[Vec<i32>]', list: 'Option<Box<ListNode>>' }[t]
        : { int: 'i32', long: 'i64', double: 'f64', bool: 'bool', string: 'String', 'int[]': 'Vec<i32>', 'long[]': 'Vec<i64>', 'double[]': 'Vec<f64>', 'string[]': 'Vec<String>', 'int[][]': 'Vec<Vec<i32>>', list: 'Option<Box<ListNode>>' }[t],
    empty: (t) => (t === 'list' ? 'None' : (({ int: '0', long: '0', double: '0.0', bool: 'false', string: 'String::new()' })[t as 'int'] ?? 'vec![]')),
  },
  cpp: {
    type: (t, param) => {
      const base = { int: 'int', long: 'long long', double: 'double', bool: 'bool', string: 'string', 'int[]': 'vector<int>', 'long[]': 'vector<long long>', 'double[]': 'vector<double>', 'string[]': 'vector<string>', 'int[][]': 'vector<vector<int>>', list: 'ListNode*' }[t];
      return param && (t === 'string' || t.includes('[]')) ? `const ${base}&` : base;
    },
    empty: (t) => (t === 'list' ? 'nullptr' : (({ int: '0', long: '0', double: '0.0', bool: 'false', string: '""' })[t as 'int'] ?? '{}')),
  },
  c: { type: () => '', empty: () => '' },
};

/** C signature: arrays come with their length, returned arrays report theirs via out-parameters. */
function cSignature(fn: string, params: readonly Param[], ret: ReturnType): string {
  const ps: string[] = [];
  for (const p of params) {
    const n = snake(p.name);
    if (p.type === 'list') ps.push(`struct ListNode *${n}`);
    else if (p.type === 'int[][]') ps.push(`int **${n}, int ${n}_rows, int ${n}_cols`);
    else if (isArray(p.type)) ps.push(`${{ int: 'const int', long: 'const long long', double: 'const double', string: 'char' }[elem(p.type)]} *${elem(p.type) === 'string' ? '*' : ''}${n}, int ${n}_size`);
    else ps.push(`${{ int: 'int', long: 'long long', double: 'double', string: 'const char' }[p.type as 'int']} ${p.type === 'string' ? '*' : ''}${n}`);
  }
  if (ret === 'int[][]') ps.push('int *return_rows', 'int *return_cols');
  else if (isArray(ret)) ps.push('int *return_size');
  const r = { int: 'int', long: 'long long', double: 'double', bool: 'bool', string: 'char *', 'int[]': 'int *', 'long[]': 'long long *', 'double[]': 'double *', 'string[]': 'char **', 'int[][]': 'int **', list: 'struct ListNode *' }[ret];
  return `${r}${r.endsWith('*') ? '' : ' '}${snake(fn)}(${ps.join(', ')})`;
}
function cEmpty(ret: ReturnType): string {
  if (ret === 'list') return 'return NULL;';
  if (ret === 'int[][]') return '*return_rows = 0;\n*return_cols = 0;\nreturn NULL;';
  if (isArray(ret)) return '*return_size = 0;\nreturn NULL;';
  if (ret === 'string') return 'char *res = malloc(1);\nres[0] = 0;\nreturn res;';
  return `return ${ret === 'double' ? '0.0' : ret === 'bool' ? 'false' : '0'};`;
}

/** Names that are keywords or common built-ins in at least one of the 8 languages. */
const RESERVED = new Set(
  'base bool byte case chan char checked class const continue default delegate do double else enum event explicit extern false final fixed float fn for func go goto if impl implicit in int interface internal is len let list lock long loop map match mod namespace new nil none null object operator out override package params private protected public range readonly ref return sbyte sealed select self short sizeof static str string struct super switch this throw trait true try type typeof uint ulong unchecked unsafe use ushort using var virtual void volatile where while yield'.split(' '),
);

export function signature(lang: RuntimeId, fn: string, params: readonly Param[], ret: ReturnType): string {
  for (const n of [fn, ...params.map((p) => p.name)]) if (RESERVED.has(n.toLowerCase()) || RESERVED.has(snake(n))) throw new Error(`"${n}" is reserved in at least one language`);
  const L = LANGS[lang];
  const ps = params.map((p) => ({ n: p.name, s: snake(p.name), t: L.type(p.type, true) }));
  switch (lang) {
    case 'python':
      return `def ${snake(fn)}(${ps.map((p) => `${p.s}: ${p.t}`).join(', ')}) -> ${L.type(ret, false)}:`;
    case 'javascript':
      return `function ${fn}(${ps.map((p) => p.n).join(', ')}) {`;
    case 'java':
      return `${L.type(ret, false)} ${fn}(${ps.map((p) => `${p.t} ${p.n}`).join(', ')}) {`;
    case 'csharp':
      return `public ${L.type(ret, false)} ${pascal(fn)}(${ps.map((p) => `${p.t} ${p.n}`).join(', ')})`;
    case 'go':
      return `func ${fn}(${ps.map((p) => `${p.n} ${p.t}`).join(', ')}) ${L.type(ret, false)} {`;
    case 'rust':
      return `fn ${snake(fn)}(${ps.map((p) => `${p.s}: ${p.t}`).join(', ')}) -> ${L.type(ret, false)} {`;
    case 'cpp':
      return `${L.type(ret, false)} ${fn}(${ps.map((p) => `${p.t} ${p.n}`).join(', ')}) {`;
    case 'c':
      return `${cSignature(fn, params, ret)} {`;
  }
}

/** Linked-list node. Single-file languages get the definition in the student's file. */
const NODE: Partial<Record<RuntimeId, string>> = {
  python: '# Provided: singly linked list node. Do not change.\nclass ListNode:\n    def __init__(self, val=0, next=None):\n        self.val = val\n        self.next = next',
  javascript: '// Provided: singly linked list node. Do not change.\nclass ListNode {\n  constructor(val = 0, next = null) {\n    this.val = val;\n    this.next = next;\n  }\n}',
  rust: '// Provided: singly linked list node. Do not change.\n#[derive(PartialEq, Eq, Clone, Debug)]\npub struct ListNode {\n    pub val: i32,\n    pub next: Option<Box<ListNode>>,\n}\n\nimpl ListNode {\n    #[allow(dead_code)]\n    pub fn new(val: i32) -> Self {\n        ListNode { val, next: None }\n    }\n}',
  cpp: '// Provided: singly linked list node. Do not change.\nstruct ListNode {\n    int val;\n    ListNode *next;\n    ListNode(int x = 0, ListNode *n = nullptr) : val(x), next(n) {}\n};',
  c: '/* Provided: singly linked list node. Do not change. */\nstruct ListNode {\n    int val;\n    struct ListNode *next;\n};',
};
/** Languages with a separate driver file declare the node there; the student sees it as a comment. */
const NODE_NOTE: Partial<Record<RuntimeId, string>> = {
  java: '// Provided by the platform (do not declare it again):\n// class ListNode { int val; ListNode next; ListNode(int val) {...} ListNode(int val, ListNode next) {...} }',
  csharp: '// Provided by the platform (do not declare it again):\n// public class ListNode { public int val; public ListNode next; public ListNode(int val = 0, ListNode next = null) {...} }',
  go: '// Provided by the platform (do not declare it again):\n// type ListNode struct {\n//     Val  int\n//     Next *ListNode\n// }',
};

/** The student's file: signature wrapped around `body` (stub or reference solution). */
export function studentFile(lang: RuntimeId, fn: string, params: readonly Param[], ret: ReturnType, sol: Solution): string {
  const sig = signature(lang, fn, params, ret);
  const h = sol.helpers?.replace(/\s+$/, '');
  const list = usesList(params, ret);
  const node = list && NODE[lang] ? `${NODE[lang]}\n\n${lang === 'python' ? '\n' : ''}` : '';
  const note = list && NODE_NOTE[lang] ? `${NODE_NOTE[lang]}\n\n` : '';
  switch (lang) {
    case 'python':
      return `${node}${h ? `${h}\n\n\n` : ''}${sig}\n${indent(sol.body, 4)}\n`;
    case 'javascript':
    case 'cpp':
    case 'c':
    case 'rust':
      return `${node}${h ? `${h}\n\n` : ''}${sig}\n${indent(sol.body, lang === 'rust' || lang === 'javascript' ? (lang === 'javascript' ? 2 : 4) : 4)}\n}\n`;
    case 'go': {
      const imports = sol.imports?.length ? `import (\n${sol.imports.map((i) => `\t"${i}"`).join('\n')}\n)\n\n` : '';
      const tabs = (s: string) => s.replace(/^( {4})+/gm, (m) => '\t'.repeat(m.length / 4));
      return `package main\n\n${imports}${note}${h ? `${tabs(h)}\n\n` : ''}${sig}\n${tabs(indent(sol.body, 4))}\n}\n`;
    }
    case 'java':
      return `import java.util.*;\n\n${note}class Solution {\n${h ? `${indent(h, 4)}\n\n` : ''}    ${sig}\n${indent(sol.body, 8)}\n    }\n}\n`;
    case 'csharp':
      return `using System;\nusing System.Collections.Generic;\nusing System.Linq;\n\n${note}public class Solution\n{\n${h ? `${indent(h, 4)}\n\n` : ''}    ${sig}\n    {\n${indent(sol.body, 8)}\n    }\n}\n`;
  }
}

export function stub(lang: RuntimeId, fn: string, params: readonly Param[], ret: ReturnType): string {
  const comment = lang === 'python' ? '# write your code here' : '// write your code here';
  const empty = lang === 'c' ? cEmpty(ret) : lang === 'python' || lang === 'rust' ? (lang === 'python' ? `return ${LANGS.python.empty(ret)}` : LANGS.rust.empty(ret)) : `return ${LANGS[lang].empty(ret)};`;
  return studentFile(lang, fn, params, ret, { body: `${comment}\n${empty}` });
}

// ------------------------------------------------------------------------------- drivers

export function driver(lang: RuntimeId, fn: string, params: readonly Param[], ret: ReturnType): string {
  switch (lang) {
    case 'python':
      return pyDriver(fn, params, ret);
    case 'javascript':
      return jsDriver(fn, params, ret);
    case 'java':
      return javaDriver(fn, params, ret);
    case 'csharp':
      return csDriver(fn, params, ret);
    case 'go':
      return goDriver(fn, params, ret);
    case 'rust':
      return rustDriver(fn, params, ret);
    case 'cpp':
      return cppDriver(fn, params, ret);
    case 'c':
      return cDriver(fn, params, ret);
  }
}

function pyDriver(fn: string, params: readonly Param[], ret: ReturnType): string {
  const conv = (t: string) => (t === 'int' || t === 'long' ? 'int' : t === 'double' ? 'float' : 'bytes.decode');
  const reads = params.map((p, i) => {
    const v = `_a${i}`;
    if (p.type === 'list') return `    _n = int(_t[_p])\n    _p += 1\n    ${v} = _to_list(list(map(int, _t[_p:_p + _n])))\n    _p += _n`;
    if (p.type === 'int[][]') return `    _r, _c = int(_t[_p]), int(_t[_p + 1])\n    _p += 2\n    ${v} = [list(map(int, _t[_p + i * _c:_p + (i + 1) * _c])) for i in range(_r)]\n    _p += _r * _c`;
    if (isArray(p.type)) return `    _n = int(_t[_p])\n    _p += 1\n    ${v} = list(map(${conv(elem(p.type))}, _t[_p:_p + _n]))\n    _p += _n`;
    return `    ${v} = ${conv(p.type)}(_t[_p])\n    _p += 1`;
  });
  const call = `${snake(fn)}(${params.map((_, i) => `_a${i}`).join(', ')})`;
  const out =
    ret === 'list'
      ? '    print(" ".join(map(str, _from_list(_res))))'
      : ret === 'int[][]'
      ? '    sys.stdout.write("".join(" ".join(map(str, row)) + "\\n" for row in _res))'
      : ret === 'double[]'
        ? '    print(" ".join(f"{x:.6f}" for x in _res))'
        : isArray(ret)
          ? '    print(" ".join(map(str, _res)))'
          : ret === 'double'
            ? '    print(f"{_res:.6f}")'
            : ret === 'bool'
              ? '    print("true" if _res else "false")'
              : '    print(_res)';
  const helpers = usesList(params, ret)
    ? '\n\ndef _to_list(a):\n    head = None\n    for v in reversed(a):\n        head = ListNode(v, head)\n    return head\n\n\ndef _from_list(h):\n    out = []\n    while h is not None:\n        out.append(h.val)\n        h = h.next\n    return out\n'
    : '';
  return `\nimport sys\n${helpers}\n\ndef _main():\n    _t = sys.stdin.buffer.read().split()\n    _p = 0\n${reads.join('\n')}\n    _res = ${call}\n${out}\n\n\n_main()\n`;
}

function jsDriver(fn: string, params: readonly Param[], ret: ReturnType): string {
  const conv = (t: string) => (t === 'string' ? '' : '.map(Number)');
  const reads = params.map((p, i) => {
    const v = `__a${i}`;
    if (p.type === 'list') return `const ${v} = (() => { const n = Number(__t[__p++]); let h = null; for (let i = __p + n - 1; i >= __p; i--) h = new ListNode(Number(__t[i]), h); __p += n; return h; })();`;
    if (p.type === 'int[][]') return `const ${v} = (() => { const r = Number(__t[__p++]); const c = Number(__t[__p++]); const g = []; for (let i = 0; i < r; i++) { g.push(__t.slice(__p, __p + c).map(Number)); __p += c; } return g; })();`;
    if (isArray(p.type)) return `const ${v} = (() => { const n = Number(__t[__p++]); const a = __t.slice(__p, __p + n)${conv(elem(p.type))}; __p += n; return a; })();`;
    return `const ${v} = ${p.type === 'string' ? '__t[__p++]' : 'Number(__t[__p++])'};`;
  });
  const out =
    ret === 'list'
      ? "const __vals = [];\nfor (let h = __res; h !== null && h !== undefined; h = h.next) __vals.push(h.val);\nconsole.log(__vals.join(' '));"
      : ret === 'int[][]'
      ? "process.stdout.write(__res.map((r) => r.join(' ') + '\\n').join(''));"
      : ret === 'double[]'
        ? "console.log(__res.map((x) => x.toFixed(6)).join(' '));"
        : isArray(ret)
          ? "console.log(__res.join(' '));"
          : ret === 'double'
            ? 'console.log(__res.toFixed(6));'
            : ret === 'bool'
              ? "console.log(__res ? 'true' : 'false');"
              : 'console.log(String(__res));';
  return `\nconst __t = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean);\nlet __p = 0;\n${reads.join('\n')}\nconst __res = ${fn}(${params.map((_, i) => `__a${i}`).join(', ')});\n${out}\n`;
}

function javaDriver(fn: string, params: readonly Param[], ret: ReturnType): string {
  const parse = (t: string, x: string) => ({ int: `Integer.parseInt(${x})`, long: `Long.parseLong(${x})`, double: `Double.parseDouble(${x})`, string: x })[t]!;
  const jt = (t: string) => ({ int: 'int', long: 'long', double: 'double', string: 'String' })[t]!;
  const reads = params.map((p, i) => {
    const v = `a${i}`;
    if (p.type === 'list') return `        int n${i} = Integer.parseInt(next());\n        int[] l${i} = new int[n${i}];\n        for (int i = 0; i < n${i}; i++) l${i}[i] = Integer.parseInt(next());\n        ListNode ${v} = toList(l${i});`;
    if (p.type === 'int[][]') return `        int r${i} = Integer.parseInt(next()), c${i} = Integer.parseInt(next());\n        int[][] ${v} = new int[r${i}][c${i}];\n        for (int i = 0; i < r${i}; i++) for (int j = 0; j < c${i}; j++) ${v}[i][j] = Integer.parseInt(next());`;
    if (isArray(p.type)) return `        int n${i} = Integer.parseInt(next());\n        ${jt(elem(p.type))}[] ${v} = new ${jt(elem(p.type))}[n${i}];\n        for (int i = 0; i < n${i}; i++) ${v}[i] = ${parse(elem(p.type), 'next()')};`;
    return `        ${jt(p.type)} ${v} = ${parse(p.type, 'next()')};`;
  });
  const list = ret === 'list';
  const rt = list ? 'int[]' : LANGS.java.type(ret, false);
  const outRet = list ? 'int[]' : ret;
  const out =
    outRet === 'int[][]'
      ? '        for (int[] row : res) { for (int j = 0; j < row.length; j++) { if (j > 0) sb.append(\' \'); sb.append(row[j]); } sb.append(\'\\n\'); }'
      : isArray(outRet)
        ? `        for (int i = 0; i < res.length; i++) { if (i > 0) sb.append(' '); sb.append(${outRet === 'double[]' ? 'String.format(Locale.ROOT, "%.6f", res[i])' : 'res[i]'}); }\n        sb.append('\\n');`
        : outRet === 'double'
          ? '        sb.append(String.format(Locale.ROOT, "%.6f", res)).append(\'\\n\');'
          : '        sb.append(res).append(\'\\n\');';
  return `import java.io.*;
import java.util.*;

public class Main {
    private static final DataInputStream IN = new DataInputStream(new BufferedInputStream(System.in, 1 << 16));

    private static String next() throws IOException {
        StringBuilder b = new StringBuilder();
        int c = IN.read();
        while (c != -1 && c <= ' ') c = IN.read();
        while (c != -1 && c > ' ') { b.append((char) c); c = IN.read(); }
        return b.toString();
    }

    public static void main(String[] args) throws IOException {
${reads.join('\n')}
        ${rt} res = ${list ? 'fromList(' : ''}new Solution().${fn}(${params.map((_, i) => `a${i}`).join(', ')})${list ? ')' : ''};
        StringBuilder sb = new StringBuilder();
${out}
        PrintStream ps = new PrintStream(new BufferedOutputStream(System.out, 1 << 16), false);
        ps.print(sb);
        ps.flush();
    }
${usesList(params, ret) ? JAVA_LIST : ''}}
${usesList(params, ret) ? JAVA_NODE : ''}`;
}

const JAVA_LIST = `
    private static ListNode toList(int[] a) {
        ListNode h = null;
        for (int i = a.length - 1; i >= 0; i--) h = new ListNode(a[i], h);
        return h;
    }

    private static int[] fromList(ListNode h) {
        ArrayList<Integer> l = new ArrayList<>();
        for (; h != null; h = h.next) l.add(h.val);
        int[] r = new int[l.size()];
        for (int i = 0; i < r.length; i++) r[i] = l.get(i);
        return r;
    }
`;
const JAVA_NODE = `
class ListNode {
    int val;
    ListNode next;

    ListNode() {}

    ListNode(int val) { this.val = val; }

    ListNode(int val, ListNode next) {
        this.val = val;
        this.next = next;
    }
}
`;

function csDriver(fn: string, params: readonly Param[], ret: ReturnType): string {
  const parse = (t: string, x: string) => ({ int: `int.Parse(${x})`, long: `long.Parse(${x})`, double: `double.Parse(${x}, CultureInfo.InvariantCulture)`, string: x })[t]!;
  const ct = (t: string) => ({ int: 'int', long: 'long', double: 'double', string: 'string' })[t]!;
  const reads = params.map((p, i) => {
    const v = `a${i}`;
    if (p.type === 'list') return `        int n${i} = int.Parse(t[p++]);\n        ListNode ${v} = null;\n        for (int i = p + n${i} - 1; i >= p; i--) ${v} = new ListNode(int.Parse(t[i]), ${v});\n        p += n${i};`;
    if (p.type === 'int[][]') return `        int r${i} = int.Parse(t[p++]), c${i} = int.Parse(t[p++]);\n        var ${v} = new int[r${i}][];\n        for (int i = 0; i < r${i}; i++) { ${v}[i] = new int[c${i}]; for (int j = 0; j < c${i}; j++) ${v}[i][j] = int.Parse(t[p++]); }`;
    if (isArray(p.type)) return `        int n${i} = int.Parse(t[p++]);\n        var ${v} = new ${ct(elem(p.type))}[n${i}];\n        for (int i = 0; i < n${i}; i++) ${v}[i] = ${parse(elem(p.type), 't[p++]')};`;
    return `        ${ct(p.type)} ${v} = ${parse(p.type, 't[p++]')};`;
  });
  const fmt = (x: string, t: string) => (t === 'double' ? `${x}.ToString("F6", CultureInfo.InvariantCulture)` : t === 'bool' ? `(${x} ? "true" : "false")` : x);
  const out =
    ret === 'list'
      ? "        for (var h = res; h != null; h = h.next) { if (h != res) sb.Append(' '); sb.Append(h.val); }\n        sb.Append('\\n');"
      : ret === 'int[][]'
      ? "        foreach (var row in res) { for (int j = 0; j < row.Length; j++) { if (j > 0) sb.Append(' '); sb.Append(row[j]); } sb.Append('\\n'); }"
      : isArray(ret)
        ? `        for (int i = 0; i < res.Length; i++) { if (i > 0) sb.Append(' '); sb.Append(${fmt('res[i]', elem(ret))}); }\n        sb.Append('\\n');`
        : `        sb.Append(${fmt('res', ret)}).Append('\\n');`;
  return `using System;
using System.Globalization;
using System.Text;

public static class Program
{
    public static void Main()
    {
        var t = Console.In.ReadToEnd().Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
        int p = 0;
${reads.join('\n')}
        var res = new Solution().${pascal(fn)}(${params.map((_, i) => `a${i}`).join(', ')});
        var sb = new StringBuilder();
${out}
        Console.Out.Write(sb.ToString());
        Console.Out.Flush();
    }
}
${usesList(params, ret) ? '\npublic class ListNode\n{\n    public int val;\n    public ListNode next;\n\n    public ListNode(int val = 0, ListNode next = null)\n    {\n        this.val = val;\n        this.next = next;\n    }\n}\n' : ''}`;
}

function goDriver(fn: string, params: readonly Param[], ret: ReturnType): string {
  const parse = (t: string) => ({ int: 'atoi(next())', long: 'atoi64(next())', double: 'atof(next())', string: 'next()' })[t]!;
  const gt = (t: string) => ({ int: 'int', long: 'int64', double: 'float64', string: 'string' })[t]!;
  const reads = params.map((p, i) => {
    const v = `a${i}`;
    if (p.type === 'list') return `\tn${i} := atoi(next())\n\tl${i} := make([]int, n${i})\n\tfor i := range l${i} {\n\t\tl${i}[i] = atoi(next())\n\t}\n\tvar ${v} *ListNode\n\tfor i := n${i} - 1; i >= 0; i-- {\n\t\t${v} = &ListNode{Val: l${i}[i], Next: ${v}}\n\t}`;
    if (p.type === 'int[][]') return `\tr${i}, c${i} := atoi(next()), atoi(next())\n\t${v} := make([][]int, r${i})\n\tfor i := range ${v} {\n\t\t${v}[i] = make([]int, c${i})\n\t\tfor j := range ${v}[i] {\n\t\t\t${v}[i][j] = atoi(next())\n\t\t}\n\t}`;
    if (isArray(p.type)) return `\tn${i} := atoi(next())\n\t${v} := make([]${gt(elem(p.type))}, n${i})\n\tfor i := range ${v} {\n\t\t${v}[i] = ${parse(elem(p.type))}\n\t}`;
    return `\t${v} := ${parse(p.type)}`;
  });
  const fmtOne = (x: string, t: string) =>
    ({ int: `strconv.Itoa(${x})`, long: `strconv.FormatInt(${x}, 10)`, double: `strconv.FormatFloat(${x}, 'f', 6, 64)`, string: x, bool: `strconv.FormatBool(${x})` })[t]!;
  const out =
    ret === 'list'
      ? "\tfor h := res; h != nil; h = h.Next {\n\t\tif h != res {\n\t\t\tw.WriteByte(' ')\n\t\t}\n\t\tw.WriteString(strconv.Itoa(h.Val))\n\t}\n\tw.WriteByte('\\n')"
      : ret === 'int[][]'
      ? '\tfor _, row := range res {\n\t\tfor j, x := range row {\n\t\t\tif j > 0 {\n\t\t\t\tw.WriteByte(\' \')\n\t\t\t}\n\t\t\tw.WriteString(strconv.Itoa(x))\n\t\t}\n\t\tw.WriteByte(\'\\n\')\n\t}'
      : isArray(ret)
        ? `\tfor i, x := range res {\n\t\tif i > 0 {\n\t\t\tw.WriteByte(' ')\n\t\t}\n\t\tw.WriteString(${fmtOne('x', elem(ret))})\n\t}\n\tw.WriteByte('\\n')`
        : `\tw.WriteString(${fmtOne('res', ret)})\n\tw.WriteByte('\\n')`;
  return `package main

import (
\t"bufio"
\t"os"
\t"strconv"
)

func main() {
\tsc := bufio.NewScanner(os.Stdin)
\tsc.Buffer(make([]byte, 1<<20), 64<<20)
\tsc.Split(bufio.ScanWords)
\tnext := func() string {
\t\tsc.Scan()
\t\treturn sc.Text()
\t}
\tatoi := func(s string) int { v, _ := strconv.Atoi(s); return v }
\tatoi64 := func(s string) int64 { v, _ := strconv.ParseInt(s, 10, 64); return v }
\tatof := func(s string) float64 { v, _ := strconv.ParseFloat(s, 64); return v }
\t_, _, _ = atoi, atoi64, atof
${reads.join('\n')}
\tres := ${fn}(${params.map((_, i) => `a${i}`).join(', ')})
\tw := bufio.NewWriterSize(os.Stdout, 1<<16)
\tdefer w.Flush()
${out}
}
${usesList(params, ret) ? '\ntype ListNode struct {\n\tVal  int\n\tNext *ListNode\n}\n' : ''}`;
}

function rustDriver(fn: string, params: readonly Param[], ret: ReturnType): string {
  const rt = (t: string) => ({ int: 'i32', long: 'i64', double: 'f64' })[t]!;
  const reads = params.map((p, i) => {
    const v = `a${i}`;
    if (p.type === 'list') return `    let n${i}: usize = it.next().unwrap().parse().unwrap();\n    let l${i}: Vec<i32> = (0..n${i}).map(|_| it.next().unwrap().parse().unwrap()).collect();\n    let mut ${v}: Option<Box<ListNode>> = None;\n    for &x in l${i}.iter().rev() {\n        ${v} = Some(Box::new(ListNode { val: x, next: ${v} }));\n    }`;
    if (p.type === 'int[][]') return `    let r${i}: usize = it.next().unwrap().parse().unwrap();\n    let c${i}: usize = it.next().unwrap().parse().unwrap();\n    let ${v}: Vec<Vec<i32>> = (0..r${i}).map(|_| (0..c${i}).map(|_| it.next().unwrap().parse().unwrap()).collect()).collect();`;
    if (isArray(p.type)) {
      const e = elem(p.type);
      return `    let n${i}: usize = it.next().unwrap().parse().unwrap();\n    let ${v}: Vec<${e === 'string' ? 'String' : rt(e)}> = (0..n${i}).map(|_| it.next().unwrap()${e === 'string' ? '.to_string()' : '.parse().unwrap()'}).collect();`;
    }
    if (p.type === 'string') return `    let ${v}: String = it.next().unwrap().to_string();`;
    return `    let ${v}: ${rt(p.type)} = it.next().unwrap().parse().unwrap();`;
  });
  const arg = (p: Param, i: number) => (p.type === 'string' || p.type.includes('[]') ? `&a${i}` : `a${i}`);
  const listOut = '    let mut vals: Vec<String> = Vec::new();\n    let mut cur = &res;\n    while let Some(node) = cur {\n        vals.push(node.val.to_string());\n        cur = &node.next;\n    }\n    writeln!(o, "{}", vals.join(" ")).unwrap();';
  const fmtOne = (t: string) => (t === 'double' ? '{:.6}' : '{}');
  const out =
    ret === 'list'
      ? listOut
      : ret === 'int[][]'
      ? '    for row in &res {\n        let line: Vec<String> = row.iter().map(|x| x.to_string()).collect();\n        writeln!(o, "{}", line.join(" ")).unwrap();\n    }'
      : isArray(ret)
        ? `    let line: Vec<String> = res.iter().map(|x| format!("${fmtOne(elem(ret))}", x)).collect();\n    writeln!(o, "{}", line.join(" ")).unwrap();`
        : `    writeln!(o, "${fmtOne(ret)}", res).unwrap();`;
  return `
fn main() {
    use std::io::{Read, Write};
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();
    let mut it = input.split_ascii_whitespace();
${reads.join('\n')}
    let res = ${snake(fn)}(${params.map(arg).join(', ')});
    let stdout = std::io::stdout();
    let mut o = std::io::BufWriter::new(stdout.lock());
${out}
}
`;
}

function cppDriver(fn: string, params: readonly Param[], ret: ReturnType): string {
  const ct = (t: string) => ({ int: 'int', long: 'long long', double: 'double', string: 'string' })[t]!;
  const reads = params.map((p, i) => {
    const v = `a${i}`;
    if (p.type === 'list') return `    int n${i};\n    cin >> n${i};\n    vector<int> l${i}(n${i});\n    for (auto& x : l${i}) cin >> x;\n    ListNode *${v} = nullptr;\n    for (int i = n${i} - 1; i >= 0; i--) ${v} = new ListNode(l${i}[i], ${v});`;
    if (p.type === 'int[][]') return `    int r${i}, c${i};\n    cin >> r${i} >> c${i};\n    vector<vector<int>> ${v}(r${i}, vector<int>(c${i}));\n    for (auto& row : ${v}) for (auto& x : row) cin >> x;`;
    if (isArray(p.type)) return `    int n${i};\n    cin >> n${i};\n    vector<${ct(elem(p.type))}> ${v}(n${i});\n    for (auto& x : ${v}) cin >> x;`;
    return `    ${ct(p.type)} ${v};\n    cin >> ${v};`;
  });
  const out =
    ret === 'list'
      ? "    for (ListNode *h = res; h; h = h->next) { if (h != res) cout << ' '; cout << h->val; }\n    cout << '\\n';"
      : ret === 'int[][]'
      ? "    for (const auto& row : res) {\n        for (size_t j = 0; j < row.size(); j++) { if (j) cout << ' '; cout << row[j]; }\n        cout << '\\n';\n    }"
      : isArray(ret)
        ? `    for (size_t i = 0; i < res.size(); i++) { if (i) cout << ' '; cout << res[i]; }\n    cout << '\\n';`
        : ret === 'bool'
          ? '    cout << (res ? "true" : "false") << \'\\n\';'
          : "    cout << res << '\\n';";
  return `#include <bits/stdc++.h>
using namespace std;
// @@STUDENT_CODE@@
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
${reads.join('\n')}
    auto res = ${fn}(${params.map((_, i) => `a${i}`).join(', ')});
${ret === 'double' || ret === 'double[]' ? '    cout << fixed << setprecision(6);\n' : ''}${out}
    return 0;
}
`;
}

function cDriver(fn: string, params: readonly Param[], ret: ReturnType): string {
  const parse = (t: string, x: string) => ({ int: `atoi(${x})`, long: `atoll(${x})`, double: `atof(${x})`, string: x })[t]!;
  const ct = (t: string) => ({ int: 'int', long: 'long long', double: 'double', string: 'char *' })[t]!;
  const args: string[] = [];
  const reads = params.map((p, i) => {
    const v = `a${i}`;
    if (p.type === 'list') {
      args.push(v);
      return `    int n${i} = atoi(hbe_next());\n    int *l${i} = malloc(sizeof(int) * (size_t)(n${i} > 0 ? n${i} : 1));\n    for (int i = 0; i < n${i}; i++) l${i}[i] = atoi(hbe_next());\n    struct ListNode *${v} = NULL;\n    for (int i = n${i} - 1; i >= 0; i--) { struct ListNode *x = malloc(sizeof *x); x->val = l${i}[i]; x->next = ${v}; ${v} = x; }`;
    }
    if (p.type === 'int[][]') {
      args.push(v, `r${i}`, `c${i}`);
      return `    int r${i} = atoi(hbe_next()), c${i} = atoi(hbe_next());\n    int **${v} = malloc(sizeof(int *) * (size_t)(r${i} > 0 ? r${i} : 1));\n    for (int i = 0; i < r${i}; i++) { ${v}[i] = malloc(sizeof(int) * (size_t)(c${i} > 0 ? c${i} : 1)); for (int j = 0; j < c${i}; j++) ${v}[i][j] = atoi(hbe_next()); }`;
    }
    if (isArray(p.type)) {
      args.push(v, `n${i}`);
      const e = elem(p.type);
      return `    int n${i} = atoi(hbe_next());\n    ${ct(e)}${e === 'string' ? '' : ' '}*${v} = malloc(sizeof(${ct(e)}) * (size_t)(n${i} > 0 ? n${i} : 1));\n    for (int i = 0; i < n${i}; i++) ${v}[i] = ${parse(e, 'hbe_next()')};`;
    }
    args.push(v);
    return `    ${ct(p.type)}${p.type === 'string' ? '' : ' '}${v} = ${parse(p.type, 'hbe_next()')};`;
  });
  const fmt = (t: string) => ({ int: '%d', long: '%lld', double: '%.6f', string: '%s' })[t]!;
  let call: string;
  let out: string;
  if (ret === 'list') {
    call = `    struct ListNode *res = ${snake(fn)}(${args.join(', ')});`;
    out = "    for (struct ListNode *h = res; h; h = h->next) { if (h != res) putchar(' '); printf(\"%d\", h->val); }\n    putchar('\\n');";
  } else if (ret === 'int[][]') {
    call = `    int rr = 0, rc = 0;\n    int **res = ${snake(fn)}(${[...args, '&rr', '&rc'].join(', ')});`;
    out = "    for (int i = 0; i < rr; i++) {\n        for (int j = 0; j < rc; j++) { if (j) putchar(' '); printf(\"%d\", res[i][j]); }\n        putchar('\\n');\n    }";
  } else if (isArray(ret)) {
    const e = elem(ret);
    call = `    int rn = 0;\n    ${ct(e)}${e === 'string' ? '' : ' '}*res = ${snake(fn)}(${[...args, '&rn'].join(', ')});`;
    out = `    for (int i = 0; i < rn; i++) { if (i) putchar(' '); printf("${fmt(e)}", res[i]); }\n    putchar('\\n');`;
  } else {
    const r = { int: 'int', long: 'long long', double: 'double', bool: 'bool', string: 'char *' }[ret as 'int'];
    call = `    ${r}${r.endsWith('*') ? '' : ' '}res = ${snake(fn)}(${args.join(', ')});`;
    out = ret === 'bool' ? '    puts(res ? "true" : "false");' : `    printf("${fmt(ret)}\\n", res);`;
  }
  return `#include <ctype.h>
#include <limits.h>
#include <math.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
// @@STUDENT_CODE@@
static char *hbe_in;
static size_t hbe_pos;
static void hbe_load(void) {
    size_t cap = 1 << 16, len = 0, k;
    hbe_in = malloc(cap);
    while ((k = fread(hbe_in + len, 1, cap - len - 1, stdin)) > 0) {
        len += k;
        if (cap - len - 1 == 0) { cap *= 2; hbe_in = realloc(hbe_in, cap); }
    }
    hbe_in[len] = 0;
}
static char *hbe_next(void) {
    while (hbe_in[hbe_pos] && isspace((unsigned char)hbe_in[hbe_pos])) hbe_pos++;
    char *s = hbe_in + hbe_pos;
    while (hbe_in[hbe_pos] && !isspace((unsigned char)hbe_in[hbe_pos])) hbe_pos++;
    if (hbe_in[hbe_pos]) hbe_in[hbe_pos++] = 0;
    return s;
}
int main(void) {
    hbe_load();
${reads.join('\n')}
${call}
${out}
    return 0;
}
`;
}
