import type { CodingQuestionInput } from '@hbe/shared';
import { coding, int, ints, rng } from './define.js';

const MOD = 1_000_000_007n;
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

const gcdOfArray = coding({
  title: 'GCD of an Array',
  statement: 'Return the greatest common divisor of all the numbers in `nums`: the largest integer that divides every element.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- 1 ≤ nums[i] ≤ 10^9',
  difficulty: 'easy',
  tags: ['math', 'gcd'],
  timeComplexity: 'O(n log max)',
  spaceComplexity: 'O(1)',
  fn: 'gcdOfArray',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  solve: (nums: number[]) => nums.reduce((a, b) => gcd(a, b)),
  samples: [
    { args: [[12, 18, 24]], explanation: '6 divides 12, 18 and 24, and nothing larger does.' },
    { args: [[7, 13]], explanation: '7 and 13 share no factor other than 1.' },
  ],
  hidden: [
    { args: [[1]] },
    { args: [[1000000000]] },
    { args: [[1000000000, 999999999]] },
    { args: [[48, 180, 600]] },
    { args: [ints(rng(301), 100, 1, 50).map((x) => x * 840)] },
    { args: [ints(rng(302), 1000, 1, 1000000000)] },
    { args: [[2, 4, 6, 8, 10, 3]] },
    { args: [Array(500).fill(536870912)] },
    { args: [ints(rng(303), 200000, 1, 1000000).map((x) => x * 997)], stress: true },
    { args: [ints(rng(304), 200000, 1, 1000000000)], stress: true },
  ],
  solutions: {
    python: { helpers: 'from math import gcd\nfrom functools import reduce', body: 'return reduce(gcd, nums)' },
    javascript: 'let g = 0;\nfor (const x of nums) {\n  let a = g, b = x;\n  while (b) [a, b] = [b, a % b];\n  g = a;\n}\nreturn g;',
    java: 'int g = 0;\nfor (int x : nums) {\n    int a = g, b = x;\n    while (b != 0) { int t = a % b; a = b; b = t; }\n    g = a;\n}\nreturn g;',
    csharp: 'int g = 0;\nforeach (var x in nums)\n{\n    int a = g, b = x;\n    while (b != 0) (a, b) = (b, a % b);\n    g = a;\n}\nreturn g;',
    go: 'g := 0\nfor _, x := range nums {\n    a, b := g, x\n    for b != 0 {\n        a, b = b, a%b\n    }\n    g = a\n}\nreturn g',
    rust: 'let mut g = 0;\nfor &x in nums {\n    let (mut a, mut b) = (g, x);\n    while b != 0 {\n        let t = a % b;\n        a = b;\n        b = t;\n    }\n    g = a;\n}\ng',
    cpp: 'int g = 0;\nfor (int x : nums) g = __gcd(g, x);\nreturn g;',
    c: 'int g = 0;\nfor (int i = 0; i < nums_size; i++) {\n    int a = g, b = nums[i];\n    while (b) { int t = a % b; a = b; b = t; }\n    g = a;\n}\nreturn g;',
  },
});

const primeCheck = (n: number) => {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  if (n % 3 === 0) return n === 3;
  for (let i = 5; i * i <= n; i += 6) if (n % i === 0 || n % (i + 2) === 0) return false;
  return true;
};

const isPrime = coding({
  title: 'Is It Prime?',
  statement: 'Return **true** if `n` is a prime number (it has exactly two positive divisors, 1 and itself).',
  constraints: '- 1 ≤ n ≤ 10^12',
  difficulty: 'easy',
  tags: ['math', 'primes'],
  timeComplexity: 'O(√n)',
  spaceComplexity: 'O(1)',
  fn: 'isPrime',
  params: [{ name: 'n', type: 'long' }],
  returns: 'bool',
  solve: (n: number) => primeCheck(n),
  samples: [
    { args: [29], explanation: '29 has no divisor between 2 and √29 ≈ 5.4.' },
    { args: [91], explanation: '91 = 7 × 13.' },
  ],
  hidden: [
    { args: [1] },
    { args: [2] },
    { args: [4] },
    { args: [97] },
    { args: [1000000007] },
    { args: [1000000007 * 3] },
    { args: [999983 * 999979] },
    { args: [2 ** 31 - 1] },
    { args: [999999999989], stress: true },
    { args: [1000000000000], stress: true },
    { args: [999999000001], stress: true },
  ],
  solutions: {
    python: 'if n < 2:\n    return False\nif n % 2 == 0:\n    return n == 2\nif n % 3 == 0:\n    return n == 3\ni = 5\nwhile i * i <= n:\n    if n % i == 0 or n % (i + 2) == 0:\n        return False\n    i += 6\nreturn True',
    javascript: 'if (n < 2) return false;\nif (n % 2 === 0) return n === 2;\nif (n % 3 === 0) return n === 3;\nfor (let i = 5; i * i <= n; i += 6) if (n % i === 0 || n % (i + 2) === 0) return false;\nreturn true;',
    java: 'if (n < 2) return false;\nif (n % 2 == 0) return n == 2;\nif (n % 3 == 0) return n == 3;\nfor (long i = 5; i * i <= n; i += 6) if (n % i == 0 || n % (i + 2) == 0) return false;\nreturn true;',
    csharp: 'if (n < 2) return false;\nif (n % 2 == 0) return n == 2;\nif (n % 3 == 0) return n == 3;\nfor (long i = 5; i * i <= n; i += 6) if (n % i == 0 || n % (i + 2) == 0) return false;\nreturn true;',
    go: 'if n < 2 {\n    return false\n}\nif n%2 == 0 {\n    return n == 2\n}\nif n%3 == 0 {\n    return n == 3\n}\nfor i := int64(5); i*i <= n; i += 6 {\n    if n%i == 0 || n%(i+2) == 0 {\n        return false\n    }\n}\nreturn true',
    rust: 'if n < 2 {\n    return false;\n}\nif n % 2 == 0 {\n    return n == 2;\n}\nif n % 3 == 0 {\n    return n == 3;\n}\nlet mut i: i64 = 5;\nwhile i * i <= n {\n    if n % i == 0 || n % (i + 2) == 0 {\n        return false;\n    }\n    i += 6;\n}\ntrue',
    cpp: 'if (n < 2) return false;\nif (n % 2 == 0) return n == 2;\nif (n % 3 == 0) return n == 3;\nfor (long long i = 5; i * i <= n; i += 6) if (n % i == 0 || n % (i + 2) == 0) return false;\nreturn true;',
    c: 'if (n < 2) return false;\nif (n % 2 == 0) return n == 2;\nif (n % 3 == 0) return n == 3;\nfor (long long i = 5; i * i <= n; i += 6) if (n % i == 0 || n % (i + 2) == 0) return false;\nreturn true;',
  },
});

const reverseIntOf = (x: number) => {
  const r = Number(String(Math.abs(x)).split('').reverse().join('')) * Math.sign(x);
  return r < -(2 ** 31) || r > 2 ** 31 - 1 ? 0 : r;
};

const reverseInteger = coding({
  title: 'Reverse an Integer',
  statement:
    'Reverse the decimal digits of `x`, keeping its sign (so −123 becomes −321 and 120 becomes 21). If the reversed number does not fit in a signed 32-bit integer (−2^31 … 2^31 − 1), return **0**.',
  constraints: '- −2^31 ≤ x ≤ 2^31 − 1',
  difficulty: 'easy',
  tags: ['math', 'overflow'],
  timeComplexity: 'O(log |x|)',
  spaceComplexity: 'O(1)',
  fn: 'reverseInteger',
  params: [{ name: 'x', type: 'int' }],
  returns: 'int',
  solve: (x: number) => reverseIntOf(x),
  samples: [
    { args: [-123], explanation: 'The digits 123 reversed are 321; the sign stays.' },
    { args: [1534236469], explanation: '9646324351 is larger than 2^31 − 1 = 2147483647, so the answer is 0.' },
  ],
  hidden: [
    { args: [0] },
    { args: [7] },
    { args: [120] },
    { args: [-2147483648] },
    { args: [2147483647] },
    { args: [1463847412] },
    { args: [-1463847412] },
    { args: [1000000003] },
    { args: [-100] },
    { args: [int(rng(311), 100000000, 999999999)], stress: true },
  ],
  solutions: {
    python: 'sign = -1 if x < 0 else 1\nr = sign * int(str(abs(x))[::-1])\nreturn r if -2**31 <= r <= 2**31 - 1 else 0',
    javascript: "const r = Math.sign(x) * Number(String(Math.abs(x)).split('').reverse().join(''));\nreturn r < -(2 ** 31) || r > 2 ** 31 - 1 ? 0 : r;",
    java: 'long r = 0, v = x;\nwhile (v != 0) { r = r * 10 + v % 10; v /= 10; }\nreturn r < Integer.MIN_VALUE || r > Integer.MAX_VALUE ? 0 : (int) r;',
    csharp: 'long r = 0, v = x;\nwhile (v != 0) { r = r * 10 + v % 10; v /= 10; }\nreturn r < int.MinValue || r > int.MaxValue ? 0 : (int)r;',
    go: 'var r, v int64 = 0, int64(x)\nfor v != 0 {\n    r = r*10 + v%10\n    v /= 10\n}\nif r < -2147483648 || r > 2147483647 {\n    return 0\n}\nreturn int(r)',
    rust: 'let (mut r, mut v) = (0i64, x as i64);\nwhile v != 0 {\n    r = r * 10 + v % 10;\n    v /= 10;\n}\nif r < i32::MIN as i64 || r > i32::MAX as i64 { 0 } else { r as i32 }',
    cpp: 'long long r = 0, v = x;\nwhile (v) { r = r * 10 + v % 10; v /= 10; }\nreturn r < INT_MIN || r > INT_MAX ? 0 : (int)r;',
    c: 'long long r = 0, v = x;\nwhile (v) { r = r * 10 + v % 10; v /= 10; }\nreturn r < INT_MIN || r > INT_MAX ? 0 : (int)r;',
  },
});

const sieveCount = (n: number) => {
  if (n < 3) return 0;
  const comp = new Uint8Array(n);
  let c = 0;
  for (let i = 2; i < n; i++) {
    if (comp[i]) continue;
    c++;
    for (let j = i * i; j < n; j += i) comp[j] = 1;
  }
  return c;
};

const countPrimes = coding({
  title: 'Count Primes Below N',
  statement: 'Return how many prime numbers are strictly less than `n`.\n\nUse the sieve of Eratosthenes: testing each number separately is too slow for the largest inputs.',
  constraints: '- 0 ≤ n ≤ 5·10^6',
  difficulty: 'easy',
  tags: ['math', 'primes', 'sieve'],
  timeComplexity: 'O(n log log n)',
  spaceComplexity: 'O(n)',
  fn: 'countPrimes',
  params: [{ name: 'n', type: 'int' }],
  returns: 'int',
  solve: (n: number) => sieveCount(n),
  samples: [
    { args: [10], explanation: 'The primes below 10 are 2, 3, 5 and 7.' },
    { args: [2], explanation: '2 itself is not counted (strictly less than n), so there are none.' },
  ],
  hidden: [
    { args: [0] },
    { args: [1] },
    { args: [3] },
    { args: [100] },
    { args: [1000] },
    { args: [65536] },
    { args: [499979] },
    { args: [1000000] },
    { args: [5000000], stress: true },
    { args: [4999999], stress: true },
  ],
  solutions: {
    python: 'if n < 3:\n    return 0\nis_p = bytearray([1]) * n\nis_p[0] = is_p[1] = 0\ni = 2\nwhile i * i < n:\n    if is_p[i]:\n        is_p[i * i::i] = bytearray(len(range(i * i, n, i)))\n    i += 1\nreturn sum(is_p)',
    javascript: 'if (n < 3) return 0;\nconst comp = new Uint8Array(n);\nlet c = 0;\nfor (let i = 2; i < n; i++) {\n  if (comp[i]) continue;\n  c++;\n  for (let j = i * i; j < n; j += i) comp[j] = 1;\n}\nreturn c;',
    java: 'if (n < 3) return 0;\nboolean[] comp = new boolean[n];\nint c = 0;\nfor (int i = 2; i < n; i++) {\n    if (comp[i]) continue;\n    c++;\n    for (long j = (long) i * i; j < n; j += i) comp[(int) j] = true;\n}\nreturn c;',
    csharp: 'if (n < 3) return 0;\nvar comp = new bool[n];\nint c = 0;\nfor (int i = 2; i < n; i++)\n{\n    if (comp[i]) continue;\n    c++;\n    for (long j = (long)i * i; j < n; j += i) comp[j] = true;\n}\nreturn c;',
    go: 'if n < 3 {\n    return 0\n}\ncomp := make([]bool, n)\nc := 0\nfor i := 2; i < n; i++ {\n    if comp[i] {\n        continue\n    }\n    c++\n    for j := i * i; j < n; j += i {\n        comp[j] = true\n    }\n}\nreturn c',
    rust: 'if n < 3 {\n    return 0;\n}\nlet n = n as usize;\nlet mut comp = vec![false; n];\nlet mut c = 0;\nfor i in 2..n {\n    if comp[i] {\n        continue;\n    }\n    c += 1;\n    let mut j = i * i;\n    while j < n {\n        comp[j] = true;\n        j += i;\n    }\n}\nc',
    cpp: 'if (n < 3) return 0;\nvector<bool> comp(n);\nint c = 0;\nfor (int i = 2; i < n; i++) {\n    if (comp[i]) continue;\n    c++;\n    for (long long j = (long long)i * i; j < n; j += i) comp[j] = true;\n}\nreturn c;',
    c: 'if (n < 3) return 0;\nchar *comp = calloc((size_t)n, 1);\nint c = 0;\nfor (int i = 2; i < n; i++) {\n    if (comp[i]) continue;\n    c++;\n    for (long long j = (long long)i * i; j < n; j += i) comp[j] = 1;\n}\nfree(comp);\nreturn c;',
  },
});

const powModOf = (b: number, e: number, m: number) => {
  let r = 1n % BigInt(m);
  let x = BigInt(b) % BigInt(m);
  let k = BigInt(e);
  while (k > 0n) {
    if (k & 1n) r = (r * x) % BigInt(m);
    x = (x * x) % BigInt(m);
    k >>= 1n;
  }
  return Number(r);
};

const powMod = coding({
  title: 'Modular Exponentiation',
  statement: 'Return `x^e mod m`. The exponent is far too large to multiply `e` times: use repeated squaring.\n\nIntermediate products need 64-bit (or arbitrary-precision) arithmetic.',
  constraints: '- 0 ≤ x ≤ 10^15\n- 0 ≤ e ≤ 10^15\n- 1 ≤ m ≤ 10^9 + 7',
  difficulty: 'moderate',
  tags: ['math', 'modular-arithmetic', 'fast-power'],
  timeComplexity: 'O(log e)',
  spaceComplexity: 'O(1)',
  fn: 'powMod',
  params: [{ name: 'x', type: 'long' }, { name: 'e', type: 'long' }, { name: 'm', type: 'int' }],
  returns: 'int',
  solve: (b: number, e: number, m: number) => powModOf(b, e, m),
  samples: [
    { args: [2, 10, 1000], explanation: '2^10 = 1024, and 1024 mod 1000 = 24.' },
    { args: [3, 0, 7], explanation: 'Anything to the power 0 is 1.' },
  ],
  hidden: [
    { args: [0, 0, 5] },
    { args: [0, 5, 13] },
    { args: [5, 3, 1] },
    { args: [7, 1, 1000000007] },
    { args: [2, 1000000006, 1000000007] },
    { args: [123456789, 987654321, 1000000007] },
    { args: [1000000000000000, 1000000000000000, 1000000007] },
    { args: [999999999999999, 2, 998244353] },
    { args: [int(rng(321), 1, 1000000000), 999999999999989, 1000000007], stress: true },
    { args: [10, 123456789012345, 999999937], stress: true },
  ],
  solutions: {
    python: 'return pow(x, e, m)',
    javascript: 'const M = BigInt(m);\nlet r = 1n % M, b = BigInt(x) % M, k = BigInt(e);\nwhile (k > 0n) {\n  if (k & 1n) r = (r * b) % M;\n  b = (b * b) % M;\n  k >>= 1n;\n}\nreturn Number(r);',
    java: 'long r = 1 % m, b = x % m, k = e;\nwhile (k > 0) {\n    if ((k & 1) == 1) r = r * b % m;\n    b = b * b % m;\n    k >>= 1;\n}\nreturn (int) r;',
    csharp: 'long r = 1 % m, b = x % m, k = e;\nwhile (k > 0)\n{\n    if ((k & 1) == 1) r = r * b % m;\n    b = b * b % m;\n    k >>= 1;\n}\nreturn (int)r;',
    go: 'mm := int64(m)\nr, b, k := 1%mm, x%mm, e\nfor k > 0 {\n    if k&1 == 1 {\n        r = r * b % mm\n    }\n    b = b * b % mm\n    k >>= 1\n}\nreturn int(r)',
    rust: 'let m = m as i64;\nlet (mut r, mut b, mut k) = (1 % m, x % m, e);\nwhile k > 0 {\n    if k & 1 == 1 {\n        r = r * b % m;\n    }\n    b = b * b % m;\n    k >>= 1;\n}\nr as i32',
    cpp: 'long long r = 1 % m, b = x % m, k = e;\nwhile (k > 0) {\n    if (k & 1) r = r * b % m;\n    b = b * b % m;\n    k >>= 1;\n}\nreturn (int)r;',
    c: 'long long r = 1 % m, b = x % m, k = e;\nwhile (k > 0) {\n    if (k & 1) r = r * b % m;\n    b = b * b % m;\n    k >>= 1;\n}\nreturn (int)r;',
  },
});

const binom = (n: number, r: number) => {
  let num = 1n;
  let den = 1n;
  for (let i = 0; i < r; i++) {
    num = (num * BigInt(n - i)) % MOD;
    den = (den * BigInt(i + 1)) % MOD;
  }
  return Number((num * BigInt(powModOf(Number(den), Number(MOD) - 2, Number(MOD)))) % MOD);
};

const binomialMod = coding({
  title: 'Binomial Coefficient Modulo a Prime',
  statement: 'Return C(n, r) — the number of ways to choose `r` items out of `n` — modulo **1 000 000 007** (a prime).\n\nHint: n!/(r!(n−r)!) with modular inverses from Fermat\'s little theorem.',
  constraints: '- 0 ≤ r ≤ n ≤ 10^6',
  difficulty: 'moderate',
  tags: ['math', 'combinatorics', 'modular-arithmetic'],
  timeComplexity: 'O(n + log MOD)',
  spaceComplexity: 'O(1)',
  fn: 'binomialMod',
  params: [{ name: 'n', type: 'int' }, { name: 'r', type: 'int' }],
  returns: 'int',
  solve: (n: number, r: number) => binom(n, Math.min(r, n - r)),
  samples: [
    { args: [5, 2], explanation: 'C(5, 2) = 10.' },
    { args: [100, 50], explanation: 'C(100, 50) ≈ 1.0·10^29; modulo 1 000 000 007 it is 538992043.' },
  ],
  hidden: [
    { args: [0, 0] },
    { args: [1, 0] },
    { args: [1, 1] },
    { args: [10, 5] },
    { args: [30, 15] },
    { args: [1000, 1] },
    { args: [100000, 33333] },
    { args: [999999, 500000] },
    { args: [1000000, 500000], stress: true },
    { args: [1000000, 999999], stress: true },
  ],
  solutions: {
    python: 'M = 1_000_000_007\nr = min(r, n - r)\nnum = den = 1\nfor i in range(r):\n    num = num * (n - i) % M\n    den = den * (i + 1) % M\nreturn num * pow(den, M - 2, M) % M',
    javascript: 'const M = 1000000007n;\nconst k = Math.min(r, n - r);\nlet num = 1n, den = 1n;\nfor (let i = 0; i < k; i++) {\n  num = (num * BigInt(n - i)) % M;\n  den = (den * BigInt(i + 1)) % M;\n}\nlet inv = 1n, b = den, e = M - 2n;\nwhile (e > 0n) {\n  if (e & 1n) inv = (inv * b) % M;\n  b = (b * b) % M;\n  e >>= 1n;\n}\nreturn Number((num * inv) % M);',
    java: 'final long M = 1_000_000_007L;\nint k = Math.min(r, n - r);\nlong num = 1, den = 1;\nfor (int i = 0; i < k; i++) { num = num * (n - i) % M; den = den * (i + 1) % M; }\nlong inv = 1, b = den, e = M - 2;\nwhile (e > 0) { if ((e & 1) == 1) inv = inv * b % M; b = b * b % M; e >>= 1; }\nreturn (int) (num * inv % M);',
    csharp: 'const long M = 1_000_000_007L;\nint k = Math.Min(r, n - r);\nlong num = 1, den = 1;\nfor (int i = 0; i < k; i++) { num = num * (n - i) % M; den = den * (i + 1) % M; }\nlong inv = 1, b = den, e = M - 2;\nwhile (e > 0) { if ((e & 1) == 1) inv = inv * b % M; b = b * b % M; e >>= 1; }\nreturn (int)(num * inv % M);',
    go: 'const M = 1_000_000_007\nk := r\nif n-r < k {\n    k = n - r\n}\nnum, den := int64(1), int64(1)\nfor i := 0; i < k; i++ {\n    num = num * int64(n-i) % M\n    den = den * int64(i+1) % M\n}\ninv, b, e := int64(1), den, int64(M-2)\nfor e > 0 {\n    if e&1 == 1 {\n        inv = inv * b % M\n    }\n    b = b * b % M\n    e >>= 1\n}\nreturn int(num * inv % M)',
    rust: 'const M: i64 = 1_000_000_007;\nlet k = r.min(n - r) as i64;\nlet (mut num, mut den) = (1i64, 1i64);\nfor i in 0..k {\n    num = num * (n as i64 - i) % M;\n    den = den * (i + 1) % M;\n}\nlet (mut inv, mut b, mut e) = (1i64, den, M - 2);\nwhile e > 0 {\n    if e & 1 == 1 {\n        inv = inv * b % M;\n    }\n    b = b * b % M;\n    e >>= 1;\n}\n(num * inv % M) as i32',
    cpp: 'const long long M = 1000000007LL;\nint k = min(r, n - r);\nlong long num = 1, den = 1;\nfor (int i = 0; i < k; i++) { num = num * (n - i) % M; den = den * (i + 1) % M; }\nlong long inv = 1, b = den, e = M - 2;\nwhile (e > 0) { if (e & 1) inv = inv * b % M; b = b * b % M; e >>= 1; }\nreturn (int)(num * inv % M);',
    c: 'const long long M = 1000000007LL;\nint k = r < n - r ? r : n - r;\nlong long num = 1, den = 1;\nfor (int i = 0; i < k; i++) { num = num * (n - i) % M; den = den * (i + 1) % M; }\nlong long inv = 1, b = den, e = M - 2;\nwhile (e > 0) { if (e & 1) inv = inv * b % M; b = b * b % M; e >>= 1; }\nreturn (int)(num * inv % M);',
  },
});

const isqrtOf = (n: number) => {
  let r = BigInt(Math.floor(Math.sqrt(n)));
  const N = BigInt(n);
  while (r * r > N) r--;
  while ((r + 1n) * (r + 1n) <= N) r++;
  return Number(r);
};

const isqrt = coding({
  title: 'Integer Square Root',
  statement: 'Return ⌊√n⌋, the largest integer `r` with `r·r ≤ n`, using only integer arithmetic or a floating-point estimate that you then correct.\n\nFloating-point square roots alone can be off by one for large `n`.',
  constraints: '- 0 ≤ n ≤ 10^15',
  difficulty: 'moderate',
  tags: ['math', 'binary-search'],
  timeComplexity: 'O(log n)',
  spaceComplexity: 'O(1)',
  fn: 'isqrt',
  params: [{ name: 'n', type: 'long' }],
  returns: 'long',
  solve: (n: number) => isqrtOf(n),
  samples: [
    { args: [17], explanation: '4·4 = 16 ≤ 17 < 25 = 5·5.' },
    { args: [1000000], explanation: '1000·1000 is exactly 10^6.' },
  ],
  hidden: [
    { args: [0] },
    { args: [1] },
    { args: [2] },
    { args: [99] },
    { args: [100] },
    { args: [999999999999999] },
    { args: [1000000000000000] },
    { args: [31622776 * 31622776 - 1] },
    { args: [31622776 * 31622776] },
    { args: [int(rng(331), 1, 2000000000) * 499999] },
    { args: [987654321987654], stress: true },
  ],
  solutions: {
    python: { helpers: 'from math import isqrt as _isqrt', body: 'return _isqrt(n)' },
    javascript: 'let r = Math.floor(Math.sqrt(n));\nwhile (r * r > n) r--;\nwhile ((r + 1) * (r + 1) <= n) r++;\nreturn r;',
    java: 'long r = (long) Math.sqrt((double) n);\nwhile (r * r > n) r--;\nwhile ((r + 1) * (r + 1) <= n) r++;\nreturn r;',
    csharp: 'long r = (long)Math.Sqrt(n);\nwhile (r * r > n) r--;\nwhile ((r + 1) * (r + 1) <= n) r++;\nreturn r;',
    go: {
      imports: ['math'],
      body: 'r := int64(math.Sqrt(float64(n)))\nfor r*r > n {\n    r--\n}\nfor (r+1)*(r+1) <= n {\n    r++\n}\nreturn r',
    },
    rust: 'let mut r = (n as f64).sqrt() as i64;\nwhile r * r > n {\n    r -= 1;\n}\nwhile (r + 1) * (r + 1) <= n {\n    r += 1;\n}\nr',
    cpp: 'long long r = (long long)sqrtl((long double)n);\nwhile (r * r > n) r--;\nwhile ((r + 1) * (r + 1) <= n) r++;\nreturn r;',
    c: 'long long lo = 0, hi = 31622777;\nwhile (lo < hi) {\n    long long mid = lo + (hi - lo + 1) / 2;\n    if (mid * mid <= n) lo = mid;\n    else hi = mid - 1;\n}\nreturn lo;',
  },
});

const titleOf = (n: number) => {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
};

const columnTitle = coding({
  title: 'Spreadsheet Column Title',
  statement: 'Spreadsheet columns are named A, B, …, Z, AA, AB, …, AZ, BA, …, ZZ, AAA, … Return the name of column number `n` (A is 1).\n\nThis is base 26 without a zero digit, so the usual conversion needs a small adjustment.',
  constraints: '- 1 ≤ n ≤ 2^31 − 1',
  difficulty: 'moderate',
  tags: ['math', 'number-bases'],
  timeComplexity: 'O(log n)',
  spaceComplexity: 'O(log n)',
  fn: 'columnTitle',
  params: [{ name: 'n', type: 'int' }],
  returns: 'string',
  solve: (n: number) => titleOf(n),
  samples: [
    { args: [28], explanation: 'Z is 26, AA is 27, AB is 28.' },
    { args: [701], explanation: '701 = 26·26 + 25: "ZY".' },
  ],
  hidden: [
    { args: [1] },
    { args: [26] },
    { args: [27] },
    { args: [52] },
    { args: [702] },
    { args: [703] },
    { args: [18278] },
    { args: [2147483647] },
    { args: [int(rng(341), 1000, 1000000)] },
    { args: [int(rng(342), 1000000000, 2147483647)], stress: true },
  ],
  solutions: {
    python: 'res = []\nwhile n > 0:\n    n -= 1\n    res.append(chr(65 + n % 26))\n    n //= 26\nreturn "".join(reversed(res))',
    javascript: "let s = '';\nwhile (n > 0) {\n  n--;\n  s = String.fromCharCode(65 + (n % 26)) + s;\n  n = Math.floor(n / 26);\n}\nreturn s;",
    java: 'StringBuilder sb = new StringBuilder();\nwhile (n > 0) {\n    n--;\n    sb.append((char) (\'A\' + n % 26));\n    n /= 26;\n}\nreturn sb.reverse().toString();',
    csharp: 'var sb = new System.Text.StringBuilder();\nwhile (n > 0)\n{\n    n--;\n    sb.Insert(0, (char)(\'A\' + n % 26));\n    n /= 26;\n}\nreturn sb.ToString();',
    go: 'b := []byte{}\nfor n > 0 {\n    n--\n    b = append([]byte{byte(\'A\' + n%26)}, b...)\n    n /= 26\n}\nreturn string(b)',
    rust: 'let mut n = n;\nlet mut b = Vec::new();\nwhile n > 0 {\n    n -= 1;\n    b.push(b\'A\' + (n % 26) as u8);\n    n /= 26;\n}\nb.reverse();\nString::from_utf8(b).unwrap()',
    cpp: 'string s;\nwhile (n > 0) {\n    n--;\n    s += char(\'A\' + n % 26);\n    n /= 26;\n}\nreverse(s.begin(), s.end());\nreturn s;',
    c: 'char buf[16];\nint k = 0;\nwhile (n > 0) {\n    n--;\n    buf[k++] = (char)(\'A\' + n % 26);\n    n /= 26;\n}\nchar *res = malloc((size_t)k + 1);\nfor (int i = 0; i < k; i++) res[i] = buf[k - 1 - i];\nres[k] = 0;\nreturn res;',
  },
});

const floorSumOf = (n: number) => {
  let s = 0;
  for (let i = 1; i <= n; ) {
    const q = Math.floor(n / i);
    const j = Math.floor(n / q);
    s += q * (j - i + 1);
    i = j + 1;
  }
  return s;
};

const sumFloorDiv = coding({
  title: 'Sum of Floor Divisions',
  statement:
    'Return ⌊n/1⌋ + ⌊n/2⌋ + ⌊n/3⌋ + … + ⌊n/n⌋.\n\n`n` can be 10^11, so a loop over every i is too slow. The value ⌊n/i⌋ takes only about 2√n different values: handle each block of equal values at once.',
  constraints: '- 1 ≤ n ≤ 10^11\n- The answer fits in a signed 64-bit integer.',
  difficulty: 'hard',
  tags: ['math', 'divisor-blocks'],
  timeComplexity: 'O(√n)',
  spaceComplexity: 'O(1)',
  fn: 'sumFloorDiv',
  params: [{ name: 'n', type: 'long' }],
  returns: 'long',
  solve: (n: number) => floorSumOf(n),
  samples: [
    { args: [5], explanation: '5 + 2 + 1 + 1 + 1 = 10.' },
    { args: [10], explanation: '10 + 5 + 3 + 2 + 2 + 1 + 1 + 1 + 1 + 1 = 27.' },
  ],
  hidden: [
    { args: [1] },
    { args: [2] },
    { args: [3] },
    { args: [100] },
    { args: [1000] },
    { args: [999999] },
    { args: [1000000007] },
    { args: [int(rng(351), 1000000, 1000000000)] },
    { args: [100000000000], stress: true },
    { args: [99999999977], stress: true },
  ],
  solutions: {
    python: 's = 0\ni = 1\nwhile i <= n:\n    q = n // i\n    j = n // q\n    s += q * (j - i + 1)\n    i = j + 1\nreturn s',
    javascript: 'let s = 0;\nfor (let i = 1; i <= n; ) {\n  const q = Math.floor(n / i);\n  const j = Math.floor(n / q);\n  s += q * (j - i + 1);\n  i = j + 1;\n}\nreturn s;',
    java: 'long s = 0;\nfor (long i = 1; i <= n; ) {\n    long q = n / i, j = n / q;\n    s += q * (j - i + 1);\n    i = j + 1;\n}\nreturn s;',
    csharp: 'long s = 0;\nfor (long i = 1; i <= n; )\n{\n    long q = n / i, j = n / q;\n    s += q * (j - i + 1);\n    i = j + 1;\n}\nreturn s;',
    go: 'var s int64\nfor i := int64(1); i <= n; {\n    q := n / i\n    j := n / q\n    s += q * (j - i + 1)\n    i = j + 1\n}\nreturn s',
    rust: 'let (mut s, mut i) = (0i64, 1i64);\nwhile i <= n {\n    let q = n / i;\n    let j = n / q;\n    s += q * (j - i + 1);\n    i = j + 1;\n}\ns',
    cpp: 'long long s = 0;\nfor (long long i = 1; i <= n; ) {\n    long long q = n / i, j = n / q;\n    s += q * (j - i + 1);\n    i = j + 1;\n}\nreturn s;',
    c: 'long long s = 0;\nfor (long long i = 1; i <= n; ) {\n    long long q = n / i, j = n / q;\n    s += q * (j - i + 1);\n    i = j + 1;\n}\nreturn s;',
  },
});

const fibOf = (n: number): number => {
  // Fast doubling with BigInt: F(2k) = F(k)(2F(k+1) − F(k)), F(2k+1) = F(k)² + F(k+1)².
  const go = (k: bigint): [bigint, bigint] => {
    if (k === 0n) return [0n, 1n];
    const [a, b] = go(k >> 1n);
    const c = (a * ((2n * b - a + MOD) % MOD)) % MOD;
    const d = (a * a + b * b) % MOD;
    return k & 1n ? [d, (c + d) % MOD] : [c, d];
  };
  return Number(go(BigInt(n))[0]);
};

const fibMod = coding({
  title: 'Huge Fibonacci Modulo a Prime',
  statement:
    'F(0) = 0, F(1) = 1 and F(k) = F(k−1) + F(k−2). Return F(n) modulo **1 000 000 007**.\n\n`n` goes up to 10^15, so even a linear loop is too slow: use matrix exponentiation or fast doubling — F(2k) = F(k)·(2F(k+1) − F(k)) and F(2k+1) = F(k)² + F(k+1)².',
  constraints: '- 0 ≤ n ≤ 10^15',
  difficulty: 'hard',
  tags: ['math', 'fast-power', 'matrix-exponentiation'],
  timeComplexity: 'O(log n)',
  spaceComplexity: 'O(log n)',
  fn: 'fibMod',
  params: [{ name: 'n', type: 'long' }],
  returns: 'int',
  solve: (n: number) => fibOf(n),
  samples: [
    { args: [10], explanation: '0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55: F(10) = 55.' },
    { args: [100], explanation: 'F(100) = 354224848179261915075, which is 687995182 modulo 1 000 000 007.' },
  ],
  hidden: [
    { args: [0] },
    { args: [1] },
    { args: [2] },
    { args: [50] },
    { args: [90] },
    { args: [1000000] },
    { args: [1000000006] },
    { args: [2000000016] },
    { args: [123456789012] },
    { args: [1000000000000000], stress: true },
    { args: [999999999999999], stress: true },
  ],
  solutions: {
    python: {
      helpers: 'M = 1_000_000_007\n\n\ndef _fib(k):\n    a, b = 0, 1\n    for bit in bin(k)[2:]:\n        c = a * (2 * b - a) % M\n        d = (a * a + b * b) % M\n        if bit == "1":\n            a, b = d, (c + d) % M\n        else:\n            a, b = c, d\n    return a',
      body: 'return _fib(n)',
    },
    javascript: 'const M = 1000000007n;\nlet a = 0n, b = 1n;\nfor (const bit of n.toString(2)) {\n  const c = (a * ((2n * b - a + M) % M)) % M;\n  const d = (a * a + b * b) % M;\n  if (bit === "1") { a = d; b = (c + d) % M; } else { a = c; b = d; }\n}\nreturn Number(a);',
    java: 'final long M = 1_000_000_007L;\nlong a = 0, b = 1;\nfor (int i = 63 - Long.numberOfLeadingZeros(Math.max(n, 1)); i >= 0; i--) {\n    long c = a * ((2 * b - a + M) % M) % M;\n    long d = (a * a + b * b) % M;\n    if (((n >> i) & 1) == 1) { a = d; b = (c + d) % M; } else { a = c; b = d; }\n}\nreturn (int) a;',
    csharp: 'const long M = 1_000_000_007L;\nlong a = 0, b = 1;\nfor (int i = 62; i >= 0; i--)\n{\n    long c = a * ((2 * b - a + M) % M) % M;\n    long d = (a * a + b * b) % M;\n    if (((n >> i) & 1) == 1) { a = d; b = (c + d) % M; } else { a = c; b = d; }\n}\nreturn (int)a;',
    go: 'const M = 1_000_000_007\nvar a, b int64 = 0, 1\nfor i := 62; i >= 0; i-- {\n    c := a * ((2*b - a + M) % M) % M\n    d := (a*a + b*b) % M\n    if (n>>uint(i))&1 == 1 {\n        a, b = d, (c+d)%M\n    } else {\n        a, b = c, d\n    }\n}\nreturn int(a)',
    rust: 'const M: i64 = 1_000_000_007;\nlet (mut a, mut b) = (0i64, 1i64);\nfor i in (0..63).rev() {\n    let c = a * ((2 * b - a + M) % M) % M;\n    let d = (a * a + b * b) % M;\n    if (n >> i) & 1 == 1 {\n        a = d;\n        b = (c + d) % M;\n    } else {\n        a = c;\n        b = d;\n    }\n}\na as i32',
    cpp: 'const long long M = 1000000007LL;\nlong long a = 0, b = 1;\nfor (int i = 62; i >= 0; i--) {\n    long long c = a * ((2 * b - a + M) % M) % M;\n    long long d = (a * a + b * b) % M;\n    if ((n >> i) & 1) { a = d; b = (c + d) % M; } else { a = c; b = d; }\n}\nreturn (int)a;',
    c: 'const long long M = 1000000007LL;\nlong long a = 0, b = 1;\nfor (int i = 62; i >= 0; i--) {\n    long long c = a * ((2 * b - a + M) % M) % M;\n    long long d = (a * a + b * b) % M;\n    if ((n >> i) & 1) { a = d; b = (c + d) % M; } else { a = c; b = d; }\n}\nreturn (int)a;',
  },
});

export const MATH: CodingQuestionInput[] = [gcdOfArray, isPrime, reverseInteger, countPrimes, powMod, binomialMod, isqrt, columnTitle, sumFloorDiv, fibMod];
