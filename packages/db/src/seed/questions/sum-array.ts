import type { CodingQuestionInput } from '@hbe/shared';
import { mulberry32 } from './rng.js';

/** Seed question #1 (easy). Hidden tests are generated deterministically; expected outputs use BigInt. */
function caseOf(values: bigint[]): { input: string; output: string } {
  const sum = values.reduce((a, b) => a + b, 0n);
  return { input: `${values.length}\n${values.join(' ')}\n`, output: `${sum}\n` };
}

function randomValues(n: number, seed: number): bigint[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => BigInt(Math.floor(rnd() * 2_000_000_001) - 1_000_000_000));
}

const hidden = [
  { values: [7n], stress: false },
  { values: [-1_000_000_000n], stress: false },
  { values: Array.from({ length: 50 }, () => 0n), stress: false },
  { values: [5n, -5n, 12n, -12n, 999n, -999n], stress: false },
  { values: Array.from({ length: 10 }, () => 1_000_000_000n), stress: false },
  { values: Array.from({ length: 10 }, () => -1_000_000_000n), stress: false },
  { values: randomValues(1000, 1), stress: false },
  { values: randomValues(50_000, 2), stress: false },
  { values: Array.from({ length: 200_000 }, () => 1_000_000_000n), stress: true },
  { values: randomValues(200_000, 3), stress: true },
].map((h) => ({ ...caseOf(h.values), weight: 1, isStress: h.stress }));

export const sumArray: CodingQuestionInput = {
  type: 'coding',
  title: 'Sum of an Array',
  statement:
    'Given an array of **n** integers, return the sum of all its elements.\n\nImplement the function in the starter code. It receives the array and must return the sum as a 64-bit integer.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- −10^9 ≤ a[i] ≤ 10^9\n- The answer fits in a signed 64-bit integer.',
  inputFormat: 'The first line contains **n**. The second line contains **n** space-separated integers a[1..n].',
  outputFormat: 'Print one integer: the sum of the array.',
  difficulty: 'easy',
  tags: ['arrays', 'basics'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  baseTimeLimitMs: 1000,
  memoryLimitMb: 256,
  compare: { mode: 'trim_trailing' },
  isPractice: true,
  samples: [
    { input: '3\n1 2 3\n', output: '6\n', explanation: '1 + 2 + 3 = 6.' },
    { input: '4\n-5 10 -3 0\n', output: '2\n', explanation: '−5 + 10 − 3 + 0 = 2. Negative numbers reduce the sum.' },
  ],
  hidden,
  templates: {
    c: {
      stub: 'long long sum_array(int n, const long long *a) {\n    // write your code here\n    return 0;\n}\n',
      driver:
        '#include <stdio.h>\n#include <stdlib.h>\n// @@STUDENT_CODE@@\nint main(void) {\n    int n;\n    if (scanf("%d", &n) != 1) return 1;\n    long long *a = malloc(sizeof(long long) * (size_t)(n > 0 ? n : 1));\n    for (int i = 0; i < n; i++) if (scanf("%lld", &a[i]) != 1) return 1;\n    printf("%lld\\n", sum_array(n, a));\n    free(a);\n    return 0;\n}\n',
      solution: 'long long sum_array(int n, const long long *a) {\n    long long s = 0;\n    for (int i = 0; i < n; i++) s += a[i];\n    return s;\n}\n',
    },
    cpp: {
      stub: 'long long sumArray(const vector<long long>& a) {\n    // write your code here\n    return 0;\n}\n',
      driver:
        '#include <bits/stdc++.h>\nusing namespace std;\n// @@STUDENT_CODE@@\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    int n;\n    if (!(cin >> n)) return 1;\n    vector<long long> a(n);\n    for (auto& x : a) cin >> x;\n    cout << sumArray(a) << "\\n";\n    return 0;\n}\n',
      solution: 'long long sumArray(const vector<long long>& a) {\n    long long s = 0;\n    for (long long x : a) s += x;\n    return s;\n}\n',
    },
    java: {
      stub: 'class Solution {\n    long sumArray(long[] a) {\n        // write your code here\n        return 0;\n    }\n}\n',
      driver:
        'import java.io.*;\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        DataInputStream in = new DataInputStream(new BufferedInputStream(System.in, 1 << 16));\n        int n = (int) readLong(in);\n        long[] a = new long[n];\n        for (int i = 0; i < n; i++) a[i] = readLong(in);\n        System.out.println(new Solution().sumArray(a));\n    }\n\n    private static long readLong(DataInputStream in) throws IOException {\n        int c = in.read();\n        while (c != \'-\' && (c < \'0\' || c > \'9\')) c = in.read();\n        boolean neg = c == \'-\';\n        if (neg) c = in.read();\n        long r = 0;\n        while (c >= \'0\' && c <= \'9\') { r = r * 10 + (c - \'0\'); c = in.read(); }\n        return neg ? -r : r;\n    }\n}\n',
      solution: 'class Solution {\n    long sumArray(long[] a) {\n        long s = 0;\n        for (long x : a) s += x;\n        return s;\n    }\n}\n',
    },
    python: {
      stub: 'def sum_array(a: list[int]) -> int:\n    # write your code here\n    return 0\n',
      driver:
        '\nimport sys\n\ndef _main():\n    data = sys.stdin.buffer.read().split()\n    n = int(data[0])\n    a = list(map(int, data[1:1 + n]))\n    print(sum_array(a))\n\n_main()\n',
      solution: 'def sum_array(a: list[int]) -> int:\n    return sum(a)\n',
    },
    javascript: {
      stub: 'function sumArray(a) {\n  // write your code here\n  return 0;\n}\n',
      driver:
        "\nconst __data = require('fs').readFileSync(0, 'utf8').split(/\\s+/).filter(Boolean);\nconst __n = Number(__data[0]);\nconst __a = __data.slice(1, 1 + __n).map(Number);\nconsole.log(String(sumArray(__a)));\n",
      solution: 'function sumArray(a) {\n  let s = 0;\n  for (const x of a) s += x;\n  return s;\n}\n',
    },
    go: {
      stub: 'package main\n\nfunc sumArray(a []int64) int64 {\n\t// write your code here\n\treturn 0\n}\n',
      driver:
        'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\tr := bufio.NewReaderSize(os.Stdin, 1<<16)\n\tvar n int\n\tfmt.Fscan(r, &n)\n\ta := make([]int64, n)\n\tfor i := range a {\n\t\tfmt.Fscan(r, &a[i])\n\t}\n\tfmt.Println(sumArray(a))\n}\n',
      solution: 'package main\n\nfunc sumArray(a []int64) int64 {\n\tvar s int64\n\tfor _, x := range a {\n\t\ts += x\n\t}\n\treturn s\n}\n',
    },
    rust: {
      stub: 'fn sum_array(a: &[i64]) -> i64 {\n    // write your code here\n    0\n}\n',
      driver:
        '\nuse std::io::{self, Read, Write};\n\nfn main() {\n    let mut s = String::new();\n    io::stdin().read_to_string(&mut s).unwrap();\n    let mut it = s.split_ascii_whitespace();\n    let n: usize = it.next().unwrap().parse().unwrap();\n    let a: Vec<i64> = (0..n).map(|_| it.next().unwrap().parse().unwrap()).collect();\n    let out = io::stdout();\n    writeln!(out.lock(), "{}", sum_array(&a)).unwrap();\n}\n',
      solution: 'fn sum_array(a: &[i64]) -> i64 {\n    a.iter().sum()\n}\n',
    },
    csharp: {
      stub: 'public class Solution\n{\n    public long SumArray(long[] a)\n    {\n        // write your code here\n        return 0;\n    }\n}\n',
      driver:
        'using System;\nusing System.IO;\n\npublic static class Program\n{\n    public static void Main()\n    {\n        var tokens = Console.In.ReadToEnd().Split((char[])null, StringSplitOptions.RemoveEmptyEntries);\n        int n = int.Parse(tokens[0]);\n        var a = new long[n];\n        for (int i = 0; i < n; i++) a[i] = long.Parse(tokens[1 + i]);\n        Console.WriteLine(new Solution().SumArray(a));\n    }\n}\n',
      solution: 'public class Solution\n{\n    public long SumArray(long[] a)\n    {\n        long s = 0;\n        foreach (var x in a) s += x;\n        return s;\n    }\n}\n',
    },
  },
};
