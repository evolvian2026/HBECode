import type { CodingQuestionInput } from '@hbe/shared';
import { coding, rng, word } from './define.js';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const rev = (s: string) => s.split('').reverse().join('');

const reverseString = coding({
  title: 'Reverse a String',
  statement: 'Return the string `s` reversed.',
  constraints: '- 1 ≤ |s| ≤ 2·10^5\n- s contains only letters and digits.',
  difficulty: 'easy',
  tags: ['strings', 'two-pointers'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'reverseString',
  params: [{ name: 's', type: 'string' }],
  returns: 'string',
  solve: (s: string) => rev(s),
  samples: [
    { args: ['hello'], explanation: 'The characters in the opposite order.' },
    { args: ['Ab12'], explanation: 'Case and digits are kept: "21bA".' },
  ],
  hidden: [
    { args: ['x'] },
    { args: ['ab'] },
    { args: ['racecar'] },
    { args: ['0123456789'] },
    { args: [word(rng(201), 100, LOWER + UPPER)] },
    { args: [word(rng(202), 1000, '01')] },
    { args: [word(rng(203), 5000, LOWER + UPPER + '0123456789')] },
    { args: ['Z'.repeat(64) + 'a'] },
    { args: [word(rng(204), 200000, LOWER + UPPER + '0123456789')], stress: true },
    { args: ['ab'.repeat(100000)], stress: true },
  ],
  solutions: {
    python: 'return s[::-1]',
    javascript: "return s.split('').reverse().join('');",
    java: 'return new StringBuilder(s).reverse().toString();',
    csharp: 'var a = s.ToCharArray();\nArray.Reverse(a);\nreturn new string(a);',
    go: 'b := []byte(s)\nfor i, j := 0, len(b)-1; i < j; i, j = i+1, j-1 {\n    b[i], b[j] = b[j], b[i]\n}\nreturn string(b)',
    rust: 's.chars().rev().collect()',
    cpp: 'return string(s.rbegin(), s.rend());',
    c: 'size_t n = strlen(s);\nchar *r = malloc(n + 1);\nfor (size_t i = 0; i < n; i++) r[i] = s[n - 1 - i];\nr[n] = 0;\nreturn r;',
  },
});

const PUNCT = ".,!?:;'-_";
const isPalindrome = coding({
  title: 'Valid Palindrome',
  statement:
    'A phrase is a palindrome if, after converting all letters to lowercase and removing every character that is not a letter or a digit, it reads the same forwards and backwards.\n\nReturn **true** if `s` is a palindrome. A string with no letters or digits is a palindrome.',
  constraints: "- 1 ≤ |s| ≤ 2·10^5\n- s contains letters, digits and the punctuation characters `.,!?:;'-_` (no spaces).",
  difficulty: 'easy',
  tags: ['strings', 'two-pointers'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'isPalindrome',
  params: [{ name: 's', type: 'string' }],
  returns: 'bool',
  solve: (s: string) => {
    const t = s.toLowerCase().replace(/[^a-z0-9]/g, '');
    return t === rev(t);
  },
  samples: [
    { args: ['A-man,a-plan,a-canal:Panama'], explanation: 'Letters only, lowercased: "amanaplanacanalpanama", which is a palindrome.' },
    { args: ['race-a-car'], explanation: '"raceacar" reversed is "racaecar".' },
  ],
  hidden: [
    { args: ['!!'] },
    { args: ['a'] },
    { args: ['ab'] },
    { args: ['0P'] },
    { args: ["No-'x'-in-Nixon"] },
    { args: ['Was_it_a_car_or_a_cat_I_saw?'] },
    { args: [(() => { const h = word(rng(211), 500, LOWER + UPPER + '0123456789' + PUNCT); return h + rev(h); })()] },
    { args: [word(rng(212), 3000, 'aA' + PUNCT)] },
    { args: [(() => { const h = word(rng(213), 100000, LOWER + '0123456789' + PUNCT); return h + rev(h).toUpperCase(); })()], stress: true },
    { args: [(() => { const h = word(rng(214), 99999, LOWER); return `${h}x${rev(h).slice(0, -1)}y`; })()], stress: true },
  ],
  solutions: {
    python: 't = [c.lower() for c in s if c.isalnum()]\nreturn t == t[::-1]',
    javascript: "const t = s.toLowerCase().replace(/[^a-z0-9]/g, '');\nreturn t === t.split('').reverse().join('');",
    java: 'int i = 0, j = s.length() - 1;\nwhile (i < j) {\n    char a = s.charAt(i), b = s.charAt(j);\n    if (!Character.isLetterOrDigit(a)) { i++; continue; }\n    if (!Character.isLetterOrDigit(b)) { j--; continue; }\n    if (Character.toLowerCase(a) != Character.toLowerCase(b)) return false;\n    i++;\n    j--;\n}\nreturn true;',
    csharp: 'int i = 0, j = s.Length - 1;\nwhile (i < j)\n{\n    if (!char.IsLetterOrDigit(s[i])) { i++; continue; }\n    if (!char.IsLetterOrDigit(s[j])) { j--; continue; }\n    if (char.ToLowerInvariant(s[i]) != char.ToLowerInvariant(s[j])) return false;\n    i++;\n    j--;\n}\nreturn true;',
    go: {
      helpers: 'func alnum(c byte) bool {\n    return (c >= \'a\' && c <= \'z\') || (c >= \'A\' && c <= \'Z\') || (c >= \'0\' && c <= \'9\')\n}\n\nfunc lower(c byte) byte {\n    if c >= \'A\' && c <= \'Z\' {\n        return c + 32\n    }\n    return c\n}',
      body: 'i, j := 0, len(s)-1\nfor i < j {\n    if !alnum(s[i]) {\n        i++\n    } else if !alnum(s[j]) {\n        j--\n    } else if lower(s[i]) != lower(s[j]) {\n        return false\n    } else {\n        i++\n        j--\n    }\n}\nreturn true',
    },
    rust: 'let t: Vec<u8> = s.bytes().filter(|c| c.is_ascii_alphanumeric()).map(|c| c.to_ascii_lowercase()).collect();\nt.iter().eq(t.iter().rev())',
    cpp: 'int i = 0, j = (int)s.size() - 1;\nwhile (i < j) {\n    unsigned char a = s[i], b = s[j];\n    if (!isalnum(a)) { i++; continue; }\n    if (!isalnum(b)) { j--; continue; }\n    if (tolower(a) != tolower(b)) return false;\n    i++;\n    j--;\n}\nreturn true;',
    c: 'int i = 0, j = (int)strlen(s) - 1;\nwhile (i < j) {\n    unsigned char a = (unsigned char)s[i], b = (unsigned char)s[j];\n    if (!isalnum(a)) { i++; continue; }\n    if (!isalnum(b)) { j--; continue; }\n    if (tolower(a) != tolower(b)) return false;\n    i++;\n    j--;\n}\nreturn true;',
  },
});

const firstUniqChar = coding({
  title: 'First Unique Character',
  statement: 'Return the index (0-based) of the first character in `s` that appears exactly once, or **−1** if every character repeats.',
  constraints: '- 1 ≤ |s| ≤ 2·10^5\n- s contains only lowercase English letters.',
  difficulty: 'easy',
  tags: ['strings', 'counting'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'firstUniqChar',
  params: [{ name: 's', type: 'string' }],
  returns: 'int',
  solve: (s: string) => {
    const c = new Map<string, number>();
    for (const ch of s) c.set(ch, (c.get(ch) ?? 0) + 1);
    for (let i = 0; i < s.length; i++) if (c.get(s[i]!) === 1) return i;
    return -1;
  },
  samples: [
    { args: ['leetcode'], explanation: '"l" at index 0 appears once.' },
    { args: ['aabbcdc'], explanation: 'a, b and c repeat; "d" at index 5 is the first unique character.' },
  ],
  hidden: [
    { args: ['z'] },
    { args: ['zz'] },
    { args: ['abcabc'] },
    { args: ['abcdefghijklmnopqrstuvwxyz'] },
    { args: ['aabbccddeeffgghhiijjkkllmmnnooppqqrrssttuuvvwwxxyyz'] },
    { args: [word(rng(221), 1000, 'abc')] },
    { args: [word(rng(222), 5000, LOWER)] },
    { args: [`${'ab'.repeat(500)}q${'ab'.repeat(500)}`] },
    { args: [`${LOWER.repeat(7692)}${'x'.repeat(7)}`], stress: true },
    { args: [`${word(rng(223), 199990, 'abcdefghijklmnopqrstuvwxy')}abz`], stress: true },
  ],
  solutions: {
    python: 'cnt = [0] * 26\nfor c in s:\n    cnt[ord(c) - 97] += 1\nfor i, c in enumerate(s):\n    if cnt[ord(c) - 97] == 1:\n        return i\nreturn -1',
    javascript: 'const cnt = new Array(26).fill(0);\nfor (let i = 0; i < s.length; i++) cnt[s.charCodeAt(i) - 97]++;\nfor (let i = 0; i < s.length; i++) if (cnt[s.charCodeAt(i) - 97] === 1) return i;\nreturn -1;',
    java: 'int[] cnt = new int[26];\nfor (int i = 0; i < s.length(); i++) cnt[s.charAt(i) - \'a\']++;\nfor (int i = 0; i < s.length(); i++) if (cnt[s.charAt(i) - \'a\'] == 1) return i;\nreturn -1;',
    csharp: 'var cnt = new int[26];\nforeach (var c in s) cnt[c - \'a\']++;\nfor (int i = 0; i < s.Length; i++) if (cnt[s[i] - \'a\'] == 1) return i;\nreturn -1;',
    go: 'var cnt [26]int\nfor i := 0; i < len(s); i++ {\n    cnt[s[i]-\'a\']++\n}\nfor i := 0; i < len(s); i++ {\n    if cnt[s[i]-\'a\'] == 1 {\n        return i\n    }\n}\nreturn -1',
    rust: 'let b = s.as_bytes();\nlet mut cnt = [0usize; 26];\nfor &c in b {\n    cnt[(c - b\'a\') as usize] += 1;\n}\nfor (i, &c) in b.iter().enumerate() {\n    if cnt[(c - b\'a\') as usize] == 1 {\n        return i as i32;\n    }\n}\n-1',
    cpp: 'int cnt[26] = {0};\nfor (char c : s) cnt[c - \'a\']++;\nfor (int i = 0; i < (int)s.size(); i++) if (cnt[s[i] - \'a\'] == 1) return i;\nreturn -1;',
    c: 'int cnt[26] = {0};\nint n = (int)strlen(s);\nfor (int i = 0; i < n; i++) cnt[s[i] - \'a\']++;\nfor (int i = 0; i < n; i++) if (cnt[s[i] - \'a\'] == 1) return i;\nreturn -1;',
  },
});

const isAnagram = coding({
  title: 'Valid Anagram',
  statement: 'Return **true** if `b` is an anagram of `a`: both strings contain exactly the same letters with the same counts, possibly in a different order.',
  constraints: '- 1 ≤ |a|, |b| ≤ 10^5\n- a and b contain only lowercase English letters.',
  difficulty: 'easy',
  tags: ['strings', 'counting'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'isAnagram',
  params: [{ name: 'a', type: 'string' }, { name: 'b', type: 'string' }],
  returns: 'bool',
  solve: (a: string, b: string) => a.length === b.length && [...a].sort().join('') === [...b].sort().join(''),
  samples: [
    { args: ['anagram', 'nagaram'], explanation: 'Same letters with the same counts.' },
    { args: ['rat', 'car'], explanation: '"t" is not in "car".' },
  ],
  hidden: [
    { args: ['a', 'a'] },
    { args: ['a', 'b'] },
    { args: ['ab', 'a'] },
    { args: ['aab', 'abb'] },
    { args: ['listen', 'silent'] },
    { args: (() => { const s = word(rng(231), 1000, 'abc'); return [s, rev(s)]; })() },
    { args: (() => { const s = word(rng(232), 1000, LOWER); return [s, `${s.slice(1)}z`]; })() },
    { args: [word(rng(233), 5000, LOWER), word(rng(234), 5000, LOWER)] },
    { args: (() => { const s = word(rng(235), 100000, LOWER); return [s, s.split('').sort().join('')]; })(), stress: true },
    { args: (() => { const s = word(rng(236), 100000, LOWER); return [s, `${s.slice(0, -1)}${s.endsWith('a') ? 'b' : 'a'}`]; })(), stress: true },
  ],
  solutions: {
    python: 'if len(a) != len(b):\n    return False\ncnt = [0] * 26\nfor c in a:\n    cnt[ord(c) - 97] += 1\nfor c in b:\n    cnt[ord(c) - 97] -= 1\nreturn all(x == 0 for x in cnt)',
    javascript: 'if (a.length !== b.length) return false;\nconst cnt = new Array(26).fill(0);\nfor (let i = 0; i < a.length; i++) {\n  cnt[a.charCodeAt(i) - 97]++;\n  cnt[b.charCodeAt(i) - 97]--;\n}\nreturn cnt.every((x) => x === 0);',
    java: 'if (a.length() != b.length()) return false;\nint[] cnt = new int[26];\nfor (int i = 0; i < a.length(); i++) { cnt[a.charAt(i) - \'a\']++; cnt[b.charAt(i) - \'a\']--; }\nfor (int x : cnt) if (x != 0) return false;\nreturn true;',
    csharp: 'if (a.Length != b.Length) return false;\nvar cnt = new int[26];\nfor (int i = 0; i < a.Length; i++) { cnt[a[i] - \'a\']++; cnt[b[i] - \'a\']--; }\nreturn cnt.All(x => x == 0);',
    go: 'if len(a) != len(b) {\n    return false\n}\nvar cnt [26]int\nfor i := 0; i < len(a); i++ {\n    cnt[a[i]-\'a\']++\n    cnt[b[i]-\'a\']--\n}\nfor _, x := range cnt {\n    if x != 0 {\n        return false\n    }\n}\nreturn true',
    rust: 'if a.len() != b.len() {\n    return false;\n}\nlet mut cnt = [0i32; 26];\nfor (x, y) in a.bytes().zip(b.bytes()) {\n    cnt[(x - b\'a\') as usize] += 1;\n    cnt[(y - b\'a\') as usize] -= 1;\n}\ncnt.iter().all(|&c| c == 0)',
    cpp: 'if (a.size() != b.size()) return false;\nint cnt[26] = {0};\nfor (size_t i = 0; i < a.size(); i++) { cnt[a[i] - \'a\']++; cnt[b[i] - \'a\']--; }\nfor (int x : cnt) if (x) return false;\nreturn true;',
    c: 'size_t n = strlen(a);\nif (n != strlen(b)) return false;\nint cnt[26] = {0};\nfor (size_t i = 0; i < n; i++) { cnt[a[i] - \'a\']++; cnt[b[i] - \'a\']--; }\nfor (int i = 0; i < 26; i++) if (cnt[i]) return false;\nreturn true;',
  },
});

const PRINTABLE = Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i)).join('');
const longestUnique = coding({
  title: 'Longest Substring Without Repeats',
  statement: 'Return the length of the longest substring of `s` in which no character appears twice.',
  constraints: '- 1 ≤ |s| ≤ 2·10^5\n- s contains printable ASCII characters without spaces (codes 33–126).',
  difficulty: 'moderate',
  tags: ['strings', 'sliding-window'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'lengthOfLongestSubstring',
  params: [{ name: 's', type: 'string' }],
  returns: 'int',
  solve: (s: string) => {
    const last = new Map<string, number>();
    let left = 0;
    let best = 0;
    for (let i = 0; i < s.length; i++) {
      const p = last.get(s[i]!);
      if (p !== undefined && p >= left) left = p + 1;
      last.set(s[i]!, i);
      best = Math.max(best, i - left + 1);
    }
    return best;
  },
  samples: [
    { args: ['abcabcbb'], explanation: '"abc" has length 3; every longer substring repeats a letter.' },
    { args: ['pwwkew'], explanation: '"wke" has length 3. "pwke" is not a substring (the letters are not contiguous).' },
  ],
  hidden: [
    { args: ['a'] },
    { args: ['bbbbb'] },
    { args: ['abba'] },
    { args: ['dvdf'] },
    { args: ['abcdefghijklmnopqrstuvwxyz'] },
    { args: [PRINTABLE] },
    { args: [word(rng(241), 2000, 'abcdef')] },
    { args: [word(rng(242), 5000, PRINTABLE)] },
    { args: [PRINTABLE.repeat(2127)], stress: true },
    { args: [word(rng(243), 200000, LOWER + UPPER)], stress: true },
  ],
  solutions: {
    python: 'last = {}\nleft = 0\nbest = 0\nfor i, c in enumerate(s):\n    p = last.get(c, -1)\n    if p >= left:\n        left = p + 1\n    last[c] = i\n    if i - left + 1 > best:\n        best = i - left + 1\nreturn best',
    javascript: 'const last = new Int32Array(128).fill(-1);\nlet left = 0, best = 0;\nfor (let i = 0; i < s.length; i++) {\n  const c = s.charCodeAt(i);\n  if (last[c] >= left) left = last[c] + 1;\n  last[c] = i;\n  best = Math.max(best, i - left + 1);\n}\nreturn best;',
    java: 'int[] last = new int[128];\nArrays.fill(last, -1);\nint left = 0, best = 0;\nfor (int i = 0; i < s.length(); i++) {\n    char c = s.charAt(i);\n    if (last[c] >= left) left = last[c] + 1;\n    last[c] = i;\n    best = Math.max(best, i - left + 1);\n}\nreturn best;',
    csharp: 'var last = new int[128];\nArray.Fill(last, -1);\nint left = 0, best = 0;\nfor (int i = 0; i < s.Length; i++)\n{\n    char c = s[i];\n    if (last[c] >= left) left = last[c] + 1;\n    last[c] = i;\n    best = Math.Max(best, i - left + 1);\n}\nreturn best;',
    go: 'var last [128]int\nfor i := range last {\n    last[i] = -1\n}\nleft, best := 0, 0\nfor i := 0; i < len(s); i++ {\n    c := s[i]\n    if last[c] >= left {\n        left = last[c] + 1\n    }\n    last[c] = i\n    if i-left+1 > best {\n        best = i - left + 1\n    }\n}\nreturn best',
    rust: 'let mut last = [-1i64; 128];\nlet (mut left, mut best) = (0i64, 0i64);\nfor (i, &c) in s.as_bytes().iter().enumerate() {\n    let i = i as i64;\n    if last[c as usize] >= left {\n        left = last[c as usize] + 1;\n    }\n    last[c as usize] = i;\n    best = best.max(i - left + 1);\n}\nbest as i32',
    cpp: 'vector<int> last(128, -1);\nint left = 0, best = 0;\nfor (int i = 0; i < (int)s.size(); i++) {\n    unsigned char c = s[i];\n    if (last[c] >= left) left = last[c] + 1;\n    last[c] = i;\n    best = max(best, i - left + 1);\n}\nreturn best;',
    c: 'int last[128];\nfor (int i = 0; i < 128; i++) last[i] = -1;\nint left = 0, best = 0, n = (int)strlen(s);\nfor (int i = 0; i < n; i++) {\n    unsigned char c = (unsigned char)s[i];\n    if (last[c] >= left) left = last[c] + 1;\n    last[c] = i;\n    if (i - left + 1 > best) best = i - left + 1;\n}\nreturn best;',
  },
});

const compress = coding({
  title: 'Run-Length Compression',
  statement:
    'Compress `s` by replacing every run of the same letter with the letter followed by the run length. Runs of length 1 are written as the letter alone.\n\nFor example, `aabcccccaaa` becomes `a2bc5a3`.',
  constraints: '- 1 ≤ |s| ≤ 2·10^5\n- s contains only lowercase English letters.',
  difficulty: 'moderate',
  tags: ['strings', 'two-pointers'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'compress',
  params: [{ name: 's', type: 'string' }],
  returns: 'string',
  solve: (s: string) => s.replace(/(.)\1*/g, (m, c: string) => (m.length > 1 ? `${c}${m.length}` : c)),
  samples: [
    { args: ['aabcccccaaa'], explanation: 'Runs: aa, b, ccccc, aaa → a2, b, c5, a3.' },
    { args: ['abc'], explanation: 'Every run has length 1, so nothing changes.' },
  ],
  hidden: [
    { args: ['a'] },
    { args: ['zz'] },
    { args: ['a'.repeat(10)] },
    { args: ['ab'.repeat(20)] },
    { args: ['aaabbbcccd'] },
    { args: [word(rng(251), 1000, 'ab')] },
    { args: [Array.from({ length: 200 }, (_, i) => LOWER[i % 26]!.repeat((i % 13) + 1)).join('')] },
    { args: [word(rng(252), 5000, 'aaab')] },
    { args: ['q'.repeat(200000)], stress: true },
    { args: [word(rng(253), 200000, 'xy')], stress: true },
  ],
  solutions: {
    python: 'res = []\nn = len(s)\ni = 0\nwhile i < n:\n    j = i\n    while j < n and s[j] == s[i]:\n        j += 1\n    res.append(s[i])\n    if j - i > 1:\n        res.append(str(j - i))\n    i = j\nreturn "".join(res)',
    javascript: "const res = [];\nlet i = 0;\nwhile (i < s.length) {\n  let j = i;\n  while (j < s.length && s[j] === s[i]) j++;\n  res.push(s[i]);\n  if (j - i > 1) res.push(String(j - i));\n  i = j;\n}\nreturn res.join('');",
    java: 'StringBuilder res = new StringBuilder();\nint i = 0, n = s.length();\nwhile (i < n) {\n    int j = i;\n    while (j < n && s.charAt(j) == s.charAt(i)) j++;\n    res.append(s.charAt(i));\n    if (j - i > 1) res.append(j - i);\n    i = j;\n}\nreturn res.toString();',
    csharp: 'var res = new System.Text.StringBuilder();\nint i = 0, n = s.Length;\nwhile (i < n)\n{\n    int j = i;\n    while (j < n && s[j] == s[i]) j++;\n    res.Append(s[i]);\n    if (j - i > 1) res.Append(j - i);\n    i = j;\n}\nreturn res.ToString();',
    go: {
      imports: ['strconv', 'strings'],
      body: 'var b strings.Builder\ni, n := 0, len(s)\nfor i < n {\n    j := i\n    for j < n && s[j] == s[i] {\n        j++\n    }\n    b.WriteByte(s[i])\n    if j-i > 1 {\n        b.WriteString(strconv.Itoa(j - i))\n    }\n    i = j\n}\nreturn b.String()',
    },
    rust: 'let b = s.as_bytes();\nlet mut res = String::with_capacity(b.len());\nlet mut i = 0;\nwhile i < b.len() {\n    let mut j = i;\n    while j < b.len() && b[j] == b[i] {\n        j += 1;\n    }\n    res.push(b[i] as char);\n    if j - i > 1 {\n        res.push_str(&(j - i).to_string());\n    }\n    i = j;\n}\nres',
    cpp: 'string res;\nsize_t i = 0, n = s.size();\nwhile (i < n) {\n    size_t j = i;\n    while (j < n && s[j] == s[i]) j++;\n    res += s[i];\n    if (j - i > 1) res += to_string(j - i);\n    i = j;\n}\nreturn res;',
    c: 'size_t n = strlen(s), i = 0, k = 0;\nchar *res = malloc(n + 1);\nwhile (i < n) {\n    size_t j = i;\n    while (j < n && s[j] == s[i]) j++;\n    res[k++] = s[i];\n    if (j - i > 1) k += (size_t)sprintf(res + k, "%zu", j - i);\n    i = j;\n}\nres[k] = 0;\nreturn res;',
  },
});

const characterReplacement = coding({
  title: 'Longest Repeating Run After Replacements',
  statement: 'You may replace at most `k` characters of `s` with any uppercase letter. Return the length of the longest substring that can be made of a single repeated letter.',
  constraints: '- 1 ≤ |s| ≤ 2·10^5\n- s contains only uppercase English letters.\n- 0 ≤ k ≤ |s|',
  difficulty: 'moderate',
  tags: ['strings', 'sliding-window'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'characterReplacement',
  params: [{ name: 's', type: 'string' }, { name: 'k', type: 'int' }],
  returns: 'int',
  solve: (s: string, k: number) => {
    let best = 0;
    for (const ch of new Set(s)) {
      let left = 0;
      let other = 0;
      for (let right = 0; right < s.length; right++) {
        if (s[right] !== ch) other++;
        while (other > k) if (s[left++] !== ch) other--;
        best = Math.max(best, right - left + 1);
      }
    }
    return best;
  },
  samples: [
    { args: ['ABAB', 2], explanation: 'Replace both A with B (or both B with A): "BBBB".' },
    { args: ['AABABBA', 1], explanation: 'Replace the A at index 4 with B: "AABBBBA" contains "BBBB", length 4. No single replacement gives 5.' },
  ],
  hidden: [
    { args: ['A', 0] },
    { args: ['A', 1] },
    { args: ['AB', 0] },
    { args: ['ABCDE', 1] },
    { args: ['AAAA', 2] },
    { args: [word(rng(261), 1000, 'AB'), 10] },
    { args: [word(rng(262), 3000, UPPER), 50] },
    { args: [word(rng(263), 2000, 'ABC'), 0] },
    { args: [word(rng(264), 200000, UPPER), 5000], stress: true },
    { args: [word(rng(265), 200000, 'AB'), 200000], stress: true },
  ],
  solutions: {
    python: 'cnt = [0] * 26\nleft = 0\nmax_count = 0\nbest = 0\nfor right, c in enumerate(s):\n    i = ord(c) - 65\n    cnt[i] += 1\n    if cnt[i] > max_count:\n        max_count = cnt[i]\n    if right - left + 1 - max_count > k:\n        cnt[ord(s[left]) - 65] -= 1\n        left += 1\n    best = max(best, right - left + 1)\nreturn best',
    javascript: 'const cnt = new Array(26).fill(0);\nlet left = 0, maxCount = 0, best = 0;\nfor (let right = 0; right < s.length; right++) {\n  maxCount = Math.max(maxCount, ++cnt[s.charCodeAt(right) - 65]);\n  if (right - left + 1 - maxCount > k) cnt[s.charCodeAt(left++) - 65]--;\n  best = Math.max(best, right - left + 1);\n}\nreturn best;',
    java: 'int[] cnt = new int[26];\nint left = 0, maxCount = 0, best = 0;\nfor (int right = 0; right < s.length(); right++) {\n    maxCount = Math.max(maxCount, ++cnt[s.charAt(right) - \'A\']);\n    if (right - left + 1 - maxCount > k) cnt[s.charAt(left++) - \'A\']--;\n    best = Math.max(best, right - left + 1);\n}\nreturn best;',
    csharp: 'var cnt = new int[26];\nint left = 0, maxCount = 0, best = 0;\nfor (int right = 0; right < s.Length; right++)\n{\n    maxCount = Math.Max(maxCount, ++cnt[s[right] - \'A\']);\n    if (right - left + 1 - maxCount > k) cnt[s[left++] - \'A\']--;\n    best = Math.Max(best, right - left + 1);\n}\nreturn best;',
    go: 'var cnt [26]int\nleft, maxCount, best := 0, 0, 0\nfor right := 0; right < len(s); right++ {\n    cnt[s[right]-\'A\']++\n    if cnt[s[right]-\'A\'] > maxCount {\n        maxCount = cnt[s[right]-\'A\']\n    }\n    if right-left+1-maxCount > k {\n        cnt[s[left]-\'A\']--\n        left++\n    }\n    if right-left+1 > best {\n        best = right - left + 1\n    }\n}\nreturn best',
    rust: 'let b = s.as_bytes();\nlet mut cnt = [0i32; 26];\nlet (mut left, mut max_count, mut best) = (0usize, 0i32, 0usize);\nfor right in 0..b.len() {\n    let i = (b[right] - b\'A\') as usize;\n    cnt[i] += 1;\n    max_count = max_count.max(cnt[i]);\n    if (right - left + 1) as i32 - max_count > k {\n        cnt[(b[left] - b\'A\') as usize] -= 1;\n        left += 1;\n    }\n    best = best.max(right - left + 1);\n}\nbest as i32',
    cpp: 'int cnt[26] = {0};\nint left = 0, maxCount = 0, best = 0;\nfor (int right = 0; right < (int)s.size(); right++) {\n    maxCount = max(maxCount, ++cnt[s[right] - \'A\']);\n    if (right - left + 1 - maxCount > k) cnt[s[left++] - \'A\']--;\n    best = max(best, right - left + 1);\n}\nreturn best;',
    c: 'int cnt[26] = {0};\nint left = 0, maxCount = 0, best = 0, n = (int)strlen(s);\nfor (int right = 0; right < n; right++) {\n    int c = ++cnt[s[right] - \'A\'];\n    if (c > maxCount) maxCount = c;\n    if (right - left + 1 - maxCount > k) cnt[s[left++] - \'A\']--;\n    if (right - left + 1 > best) best = right - left + 1;\n}\nreturn best;',
  },
});

const findAnagrams = coding({
  title: 'Find All Anagram Positions',
  statement: 'Return every start index `i` (in increasing order) such that the substring of `s` of length |p| starting at `i` is an anagram of `p`. Return an empty list if there is none.',
  constraints: '- 1 ≤ |s|, |p| ≤ 5·10^4\n- s and p contain only lowercase English letters.',
  difficulty: 'moderate',
  tags: ['strings', 'sliding-window', 'counting'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'findAnagrams',
  params: [{ name: 's', type: 'string' }, { name: 'p', type: 'string' }],
  returns: 'int[]',
  solve: (s: string, p: string) => {
    const res: number[] = [];
    if (p.length > s.length) return res;
    const need = new Array(26).fill(0);
    const win = new Array(26).fill(0);
    for (const c of p) need[c.charCodeAt(0) - 97]++;
    for (let i = 0; i < s.length; i++) {
      win[s.charCodeAt(i) - 97]++;
      if (i >= p.length) win[s.charCodeAt(i - p.length) - 97]--;
      if (i >= p.length - 1 && win.every((v, j) => v === need[j])) res.push(i - p.length + 1);
    }
    return res;
  },
  samples: [
    { args: ['cbaebabacd', 'abc'], explanation: '"cba" at 0 and "bac" at 6.' },
    { args: ['abab', 'ab'], explanation: '"ab" at 0, "ba" at 1 and "ab" at 2.' },
  ],
  hidden: [
    { args: ['a', 'a'] },
    { args: ['a', 'b'] },
    { args: ['ab', 'abc'] },
    { args: ['aaaa', 'aa'] },
    { args: ['baa', 'aa'] },
    { args: [word(rng(271), 1000, 'abc'), 'abca'] },
    { args: [word(rng(272), 5000, 'ab'), 'aabba'] },
    { args: [word(rng(273), 3000, LOWER), 'xyz'] },
    { args: ['a'.repeat(50000), 'a'.repeat(100)], stress: true },
    { args: [word(rng(274), 50000, 'abcd'), word(rng(275), 1000, 'abcd')], stress: true },
  ],
  solutions: {
    python: 'res = []\nm = len(p)\nif m > len(s):\n    return res\nneed = [0] * 26\nwin = [0] * 26\nfor c in p:\n    need[ord(c) - 97] += 1\nfor i, c in enumerate(s):\n    win[ord(c) - 97] += 1\n    if i >= m:\n        win[ord(s[i - m]) - 97] -= 1\n    if i >= m - 1 and win == need:\n        res.append(i - m + 1)\nreturn res',
    javascript: 'const res = [];\nconst m = p.length;\nif (m > s.length) return res;\nconst need = new Array(26).fill(0), win = new Array(26).fill(0);\nfor (let i = 0; i < m; i++) need[p.charCodeAt(i) - 97]++;\nlet diff = need.filter((x) => x !== 0).length;\nconst bump = (c, d) => {\n  if (win[c] === need[c]) diff++;\n  win[c] += d;\n  if (win[c] === need[c]) diff--;\n};\nfor (let i = 0; i < s.length; i++) {\n  bump(s.charCodeAt(i) - 97, 1);\n  if (i >= m) bump(s.charCodeAt(i - m) - 97, -1);\n  if (i >= m - 1 && diff === 0) res.push(i - m + 1);\n}\nreturn res;',
    java: 'int m = p.length(), n = s.length();\nif (m > n) return new int[0];\nint[] need = new int[26], win = new int[26];\nfor (int i = 0; i < m; i++) need[p.charAt(i) - \'a\']++;\nint[] buf = new int[n];\nint cnt = 0;\nfor (int i = 0; i < n; i++) {\n    win[s.charAt(i) - \'a\']++;\n    if (i >= m) win[s.charAt(i - m) - \'a\']--;\n    if (i >= m - 1 && Arrays.equals(win, need)) buf[cnt++] = i - m + 1;\n}\nreturn Arrays.copyOf(buf, cnt);',
    csharp: 'int m = p.Length, n = s.Length;\nvar res = new List<int>();\nif (m > n) return res.ToArray();\nvar need = new int[26];\nvar win = new int[26];\nforeach (var c in p) need[c - \'a\']++;\nfor (int i = 0; i < n; i++)\n{\n    win[s[i] - \'a\']++;\n    if (i >= m) win[s[i - m] - \'a\']--;\n    if (i >= m - 1 && win.SequenceEqual(need)) res.Add(i - m + 1);\n}\nreturn res.ToArray();',
    go: 'm, n := len(p), len(s)\nres := []int{}\nif m > n {\n    return res\n}\nvar need, win [26]int\nfor i := 0; i < m; i++ {\n    need[p[i]-\'a\']++\n}\nfor i := 0; i < n; i++ {\n    win[s[i]-\'a\']++\n    if i >= m {\n        win[s[i-m]-\'a\']--\n    }\n    if i >= m-1 && win == need {\n        res = append(res, i-m+1)\n    }\n}\nreturn res',
    rust: 'let (sb, pb) = (s.as_bytes(), p.as_bytes());\nlet (m, n) = (pb.len(), sb.len());\nlet mut res = Vec::new();\nif m > n {\n    return res;\n}\nlet (mut need, mut win) = ([0i32; 26], [0i32; 26]);\nfor &c in pb {\n    need[(c - b\'a\') as usize] += 1;\n}\nfor i in 0..n {\n    win[(sb[i] - b\'a\') as usize] += 1;\n    if i >= m {\n        win[(sb[i - m] - b\'a\') as usize] -= 1;\n    }\n    if i + 1 >= m && win == need {\n        res.push((i + 1 - m) as i32);\n    }\n}\nres',
    cpp: 'int m = p.size(), n = s.size();\nvector<int> res;\nif (m > n) return res;\narray<int, 26> need{}, win{};\nfor (char c : p) need[c - \'a\']++;\nfor (int i = 0; i < n; i++) {\n    win[s[i] - \'a\']++;\n    if (i >= m) win[s[i - m] - \'a\']--;\n    if (i >= m - 1 && win == need) res.push_back(i - m + 1);\n}\nreturn res;',
    c: 'int m = (int)strlen(p), n = (int)strlen(s);\nint *res = malloc(sizeof(int) * (size_t)(n > 0 ? n : 1));\n*return_size = 0;\nif (m > n) return res;\nint need[26] = {0}, win[26] = {0};\nfor (int i = 0; i < m; i++) need[p[i] - \'a\']++;\nfor (int i = 0; i < n; i++) {\n    win[s[i] - \'a\']++;\n    if (i >= m) win[s[i - m] - \'a\']--;\n    if (i >= m - 1 && memcmp(win, need, sizeof need) == 0) res[(*return_size)++] = i - m + 1;\n}\nreturn res;',
  },
});

const minWindow = coding({
  title: 'Minimum Window Substring',
  statement:
    'Return the shortest substring of `s` that contains every character of `t`, including repeats (if `t` has two "a", the window needs two "a"). If several windows have the same length, return the **leftmost**. If there is no such window, return an empty string (an empty line).',
  constraints: '- 1 ≤ |s|, |t| ≤ 10^5\n- s and t contain only English letters (case-sensitive).',
  difficulty: 'hard',
  tags: ['strings', 'sliding-window', 'counting'],
  timeComplexity: 'O(|s| + |t|)',
  spaceComplexity: 'O(1)',
  fn: 'minWindow',
  params: [{ name: 's', type: 'string' }, { name: 't', type: 'string' }],
  returns: 'string',
  solve: (s: string, t: string) => {
    const need = new Map<string, number>();
    for (const c of t) need.set(c, (need.get(c) ?? 0) + 1);
    let missing = t.length;
    let left = 0;
    let best: [number, number] = [Infinity, 0];
    for (let right = 0; right < s.length; right++) {
      const c = s[right]!;
      if ((need.get(c) ?? 0) > 0) missing--;
      need.set(c, (need.get(c) ?? 0) - 1);
      while (missing === 0) {
        if (right - left + 1 < best[0]) best = [right - left + 1, left];
        const d = s[left++]!;
        need.set(d, need.get(d)! + 1);
        if (need.get(d)! > 0) missing++;
      }
    }
    return best[0] === Infinity ? '' : s.slice(best[1], best[1] + best[0]);
  },
  samples: [
    { args: ['ADOBECODEBANC', 'ABC'], explanation: '"BANC" is the shortest window containing A, B and C.' },
    { args: ['aa', 'aaa'], explanation: '`t` needs three "a" but `s` has only two: no window, so the output is an empty line.' },
  ],
  hidden: [
    { args: ['a', 'a'] },
    { args: ['a', 'b'] },
    { args: ['ab', 'b'] },
    { args: ['abcabc', 'cba'] },
    { args: ['aAbB', 'Ab'] },
    { args: ['bbaa', 'aba'] },
    { args: [word(rng(281), 2000, 'abcde'), 'eedcba'] },
    { args: [word(rng(282), 5000, LOWER + UPPER), 'Zebra'] },
    { args: [`${'a'.repeat(50000)}${UPPER}${'b'.repeat(50000)}`, UPPER], stress: true },
    { args: [word(rng(283), 100000, LOWER), word(rng(284), 300, LOWER)], stress: true },
  ],
  solutions: {
    python: 'need = [0] * 128\nfor c in t:\n    need[ord(c)] += 1\nmissing = len(t)\nleft = 0\nbest_len, best_start = len(s) + 1, 0\nfor right, c in enumerate(s):\n    o = ord(c)\n    if need[o] > 0:\n        missing -= 1\n    need[o] -= 1\n    while missing == 0:\n        if right - left + 1 < best_len:\n            best_len, best_start = right - left + 1, left\n        d = ord(s[left])\n        need[d] += 1\n        if need[d] > 0:\n            missing += 1\n        left += 1\nreturn "" if best_len > len(s) else s[best_start:best_start + best_len]',
    javascript: "const need = new Int32Array(128);\nfor (let i = 0; i < t.length; i++) need[t.charCodeAt(i)]++;\nlet missing = t.length, left = 0, bestLen = Infinity, bestStart = 0;\nfor (let right = 0; right < s.length; right++) {\n  const c = s.charCodeAt(right);\n  if (need[c]-- > 0) missing--;\n  while (missing === 0) {\n    if (right - left + 1 < bestLen) { bestLen = right - left + 1; bestStart = left; }\n    if (++need[s.charCodeAt(left++)] > 0) missing++;\n  }\n}\nreturn bestLen === Infinity ? '' : s.slice(bestStart, bestStart + bestLen);",
    java: 'int[] need = new int[128];\nfor (int i = 0; i < t.length(); i++) need[t.charAt(i)]++;\nint missing = t.length(), left = 0, bestLen = Integer.MAX_VALUE, bestStart = 0;\nfor (int right = 0; right < s.length(); right++) {\n    if (need[s.charAt(right)]-- > 0) missing--;\n    while (missing == 0) {\n        if (right - left + 1 < bestLen) { bestLen = right - left + 1; bestStart = left; }\n        if (++need[s.charAt(left++)] > 0) missing++;\n    }\n}\nreturn bestLen == Integer.MAX_VALUE ? "" : s.substring(bestStart, bestStart + bestLen);',
    csharp: 'var need = new int[128];\nforeach (var c in t) need[c]++;\nint missing = t.Length, left = 0, bestLen = int.MaxValue, bestStart = 0;\nfor (int right = 0; right < s.Length; right++)\n{\n    if (need[s[right]]-- > 0) missing--;\n    while (missing == 0)\n    {\n        if (right - left + 1 < bestLen) { bestLen = right - left + 1; bestStart = left; }\n        if (++need[s[left++]] > 0) missing++;\n    }\n}\nreturn bestLen == int.MaxValue ? "" : s.Substring(bestStart, bestLen);',
    go: 'var need [128]int\nfor i := 0; i < len(t); i++ {\n    need[t[i]]++\n}\nmissing, left, bestLen, bestStart := len(t), 0, len(s)+1, 0\nfor right := 0; right < len(s); right++ {\n    if need[s[right]] > 0 {\n        missing--\n    }\n    need[s[right]]--\n    for missing == 0 {\n        if right-left+1 < bestLen {\n            bestLen, bestStart = right-left+1, left\n        }\n        need[s[left]]++\n        if need[s[left]] > 0 {\n            missing++\n        }\n        left++\n    }\n}\nif bestLen > len(s) {\n    return ""\n}\nreturn s[bestStart : bestStart+bestLen]',
    rust: 'let (sb, tb) = (s.as_bytes(), t.as_bytes());\nlet mut need = [0i32; 128];\nfor &c in tb {\n    need[c as usize] += 1;\n}\nlet (mut missing, mut left, mut best_len, mut best_start) = (tb.len(), 0usize, usize::MAX, 0usize);\nfor right in 0..sb.len() {\n    let c = sb[right] as usize;\n    if need[c] > 0 {\n        missing -= 1;\n    }\n    need[c] -= 1;\n    while missing == 0 {\n        if right - left + 1 < best_len {\n            best_len = right - left + 1;\n            best_start = left;\n        }\n        let d = sb[left] as usize;\n        need[d] += 1;\n        if need[d] > 0 {\n            missing += 1;\n        }\n        left += 1;\n    }\n}\nif best_len == usize::MAX { String::new() } else { s[best_start..best_start + best_len].to_string() }',
    cpp: 'int need[128] = {0};\nfor (char c : t) need[(int)c]++;\nint missing = t.size(), left = 0, bestLen = INT_MAX, bestStart = 0;\nfor (int right = 0; right < (int)s.size(); right++) {\n    if (need[(int)s[right]]-- > 0) missing--;\n    while (missing == 0) {\n        if (right - left + 1 < bestLen) { bestLen = right - left + 1; bestStart = left; }\n        if (++need[(int)s[left++]] > 0) missing++;\n    }\n}\nreturn bestLen == INT_MAX ? "" : s.substr(bestStart, bestLen);',
    c: 'int need[128] = {0};\nint n = (int)strlen(s), m = (int)strlen(t);\nfor (int i = 0; i < m; i++) need[(int)t[i]]++;\nint missing = m, left = 0, bestLen = INT_MAX, bestStart = 0;\nfor (int right = 0; right < n; right++) {\n    if (need[(int)s[right]]-- > 0) missing--;\n    while (missing == 0) {\n        if (right - left + 1 < bestLen) { bestLen = right - left + 1; bestStart = left; }\n        if (++need[(int)s[left++]] > 0) missing++;\n    }\n}\nint len = bestLen == INT_MAX ? 0 : bestLen;\nchar *res = malloc((size_t)len + 1);\nmemcpy(res, s + bestStart, (size_t)len);\nres[len] = 0;\nreturn res;',
  },
});

const shortestPalindrome = coding({
  title: 'Shortest Palindrome by Prepending',
  statement:
    'Add the fewest possible characters to the **front** of `s` to turn it into a palindrome, and return that palindrome.\n\nHint: you need the longest prefix of `s` that is itself a palindrome; a prefix function (KMP) finds it in linear time.',
  constraints: '- 1 ≤ |s| ≤ 10^5\n- s contains only lowercase English letters.',
  difficulty: 'hard',
  tags: ['strings', 'kmp'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'shortestPalindrome',
  params: [{ name: 's', type: 'string' }],
  returns: 'string',
  solve: (s: string) => {
    const t = `${s}#${rev(s)}`;
    const pi = new Array<number>(t.length).fill(0);
    for (let i = 1; i < t.length; i++) {
      let j = pi[i - 1]!;
      while (j > 0 && t[i] !== t[j]) j = pi[j - 1]!;
      if (t[i] === t[j]) j++;
      pi[i] = j;
    }
    return rev(s.slice(pi[t.length - 1])) + s;
  },
  samples: [
    { args: ['aacecaaa'], explanation: '"aacecaa" is already a palindrome prefix; prepend the remaining "a": "aaacecaaa".' },
    { args: ['abcd'], explanation: 'Only "a" is a palindrome prefix, so prepend "dcb": "dcbabcd".' },
  ],
  hidden: [
    { args: ['a'] },
    { args: ['ab'] },
    { args: ['aa'] },
    { args: ['aba'] },
    { args: ['abb'] },
    { args: [`${'ab'.repeat(30)}a${'c'.repeat(5)}`] },
    { args: [word(rng(291), 1000, 'ab')] },
    { args: [word(rng(292), 5000, LOWER)] },
    { args: [`${'a'.repeat(50000)}b${'a'.repeat(49999)}`], stress: true },
    { args: [`${'a'.repeat(99999)}b`], stress: true },
  ],
  solutions: {
    python: 'r = s[::-1]\nt = s + "#" + r\npi = [0] * len(t)\nfor i in range(1, len(t)):\n    j = pi[i - 1]\n    while j and t[i] != t[j]:\n        j = pi[j - 1]\n    if t[i] == t[j]:\n        j += 1\n    pi[i] = j\nreturn r[:len(s) - pi[-1]] + s',
    javascript: "const r = s.split('').reverse().join('');\nconst t = s + '#' + r;\nconst pi = new Int32Array(t.length);\nfor (let i = 1; i < t.length; i++) {\n  let j = pi[i - 1];\n  while (j > 0 && t[i] !== t[j]) j = pi[j - 1];\n  if (t[i] === t[j]) j++;\n  pi[i] = j;\n}\nreturn r.slice(0, s.length - pi[t.length - 1]) + s;",
    java: 'String r = new StringBuilder(s).reverse().toString();\nString t = s + "#" + r;\nint[] pi = new int[t.length()];\nfor (int i = 1; i < t.length(); i++) {\n    int j = pi[i - 1];\n    while (j > 0 && t.charAt(i) != t.charAt(j)) j = pi[j - 1];\n    if (t.charAt(i) == t.charAt(j)) j++;\n    pi[i] = j;\n}\nreturn r.substring(0, s.length() - pi[t.length() - 1]) + s;',
    csharp: 'var ra = s.ToCharArray();\nArray.Reverse(ra);\nvar r = new string(ra);\nvar t = s + "#" + r;\nvar pi = new int[t.Length];\nfor (int i = 1; i < t.Length; i++)\n{\n    int j = pi[i - 1];\n    while (j > 0 && t[i] != t[j]) j = pi[j - 1];\n    if (t[i] == t[j]) j++;\n    pi[i] = j;\n}\nreturn r.Substring(0, s.Length - pi[t.Length - 1]) + s;',
    go: 'n := len(s)\nr := make([]byte, n)\nfor i := 0; i < n; i++ {\n    r[i] = s[n-1-i]\n}\nt := s + "#" + string(r)\npi := make([]int, len(t))\nfor i := 1; i < len(t); i++ {\n    j := pi[i-1]\n    for j > 0 && t[i] != t[j] {\n        j = pi[j-1]\n    }\n    if t[i] == t[j] {\n        j++\n    }\n    pi[i] = j\n}\nreturn string(r[:n-pi[len(t)-1]]) + s',
    rust: 'let r: String = s.chars().rev().collect();\nlet t: Vec<u8> = format!("{}#{}", s, r).into_bytes();\nlet mut pi = vec![0usize; t.len()];\nfor i in 1..t.len() {\n    let mut j = pi[i - 1];\n    while j > 0 && t[i] != t[j] {\n        j = pi[j - 1];\n    }\n    if t[i] == t[j] {\n        j += 1;\n    }\n    pi[i] = j;\n}\nformat!("{}{}", &r[..s.len() - pi[t.len() - 1]], s)',
    cpp: 'string r(s.rbegin(), s.rend());\nstring t = s + "#" + r;\nvector<int> pi(t.size());\nfor (size_t i = 1; i < t.size(); i++) {\n    int j = pi[i - 1];\n    while (j > 0 && t[i] != t[j]) j = pi[j - 1];\n    if (t[i] == t[j]) j++;\n    pi[i] = j;\n}\nreturn r.substr(0, s.size() - pi.back()) + s;',
    c: 'int n = (int)strlen(s), m = 2 * n + 1;\nchar *t = malloc((size_t)m + 1);\nmemcpy(t, s, (size_t)n);\nt[n] = \'#\';\nfor (int i = 0; i < n; i++) t[n + 1 + i] = s[n - 1 - i];\nt[m] = 0;\nint *pi = calloc((size_t)m, sizeof(int));\nfor (int i = 1; i < m; i++) {\n    int j = pi[i - 1];\n    while (j > 0 && t[i] != t[j]) j = pi[j - 1];\n    if (t[i] == t[j]) j++;\n    pi[i] = j;\n}\nint add = n - pi[m - 1];\nchar *res = malloc((size_t)(add + n) + 1);\nmemcpy(res, t + n + 1, (size_t)add);\nmemcpy(res + add, s, (size_t)n);\nres[add + n] = 0;\nfree(t);\nfree(pi);\nreturn res;',
  },
});

export const STRINGS: CodingQuestionInput[] = [reverseString, isPalindrome, firstUniqChar, isAnagram, longestUnique, compress, characterReplacement, findAnagrams, minWindow, shortestPalindrome];
