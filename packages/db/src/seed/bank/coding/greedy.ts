import type { CodingQuestionInput } from '@hbe/shared';
import { coding, int, ints, rng, word, range, type Rng } from './define.js';

const bestTimeOnce = coding({
  title: 'Best Time to Buy and Sell Once',
  statement: '`prices[i]` is a stock\'s price on day i. Buy on one day and sell on a **later** day to maximise profit, and return that profit (0 if no profit is possible).',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- 0 ≤ prices[i] ≤ 10^4',
  difficulty: 'easy',
  tags: ['greedy', 'arrays'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'maxProfit',
  params: [{ name: 'prices', type: 'int[]' }],
  returns: 'int',
  solve: (p: number[]) => {
    let lo = Infinity;
    let best = 0;
    for (const x of p) {
      lo = Math.min(lo, x);
      best = Math.max(best, x - lo);
    }
    return best;
  },
  samples: [
    { args: [[7, 1, 5, 3, 6, 4]], explanation: 'Buy at 1 (day 1), sell at 6 (day 4): profit 5.' },
    { args: [[7, 6, 4, 3, 1]], explanation: 'Prices only fall: no profitable trade, so 0.' },
  ],
  hidden: [
    { args: [[5]] },
    { args: [[1, 2]] },
    { args: [[2, 1]] },
    { args: [[3, 3, 3]] },
    { args: [[2, 4, 1, 7]] },
    { args: [ints(rng(801), 500, 0, 100)] },
    { args: [ints(rng(802), 5000, 0, 10000)] },
    { args: [range(1000).reverse()] },
    { args: [ints(rng(803), 200000, 0, 10000)], stress: true },
    { args: [[...range(100000, 5000).map((x) => x % 10000), ...range(100000).map((x) => 10000 - (x % 10000))]], stress: true },
  ],
  solutions: {
    python: 'lo = float("inf")\nbest = 0\nfor x in prices:\n    if x < lo:\n        lo = x\n    elif x - lo > best:\n        best = x - lo\nreturn best',
    javascript: 'let lo = Infinity, best = 0;\nfor (const x of prices) {\n  lo = Math.min(lo, x);\n  best = Math.max(best, x - lo);\n}\nreturn best;',
    java: 'int lo = Integer.MAX_VALUE, best = 0;\nfor (int x : prices) { lo = Math.min(lo, x); best = Math.max(best, x - lo); }\nreturn best;',
    csharp: 'int lo = int.MaxValue, best = 0;\nforeach (var x in prices) { lo = Math.Min(lo, x); best = Math.Max(best, x - lo); }\nreturn best;',
    go: 'lo, best := prices[0], 0\nfor _, x := range prices {\n    if x < lo {\n        lo = x\n    }\n    if x-lo > best {\n        best = x - lo\n    }\n}\nreturn best',
    rust: 'let (mut lo, mut best) = (i32::MAX, 0);\nfor &x in prices {\n    lo = lo.min(x);\n    best = best.max(x - lo);\n}\nbest',
    cpp: 'int lo = INT_MAX, best = 0;\nfor (int x : prices) { lo = min(lo, x); best = max(best, x - lo); }\nreturn best;',
    c: 'int lo = INT_MAX, best = 0;\nfor (int i = 0; i < prices_size; i++) { if (prices[i] < lo) lo = prices[i]; if (prices[i] - lo > best) best = prices[i] - lo; }\nreturn best;',
  },
});

const cookiesOf = (g: number[], s: number[]) => {
  const a = [...g].sort((x, y) => x - y);
  const b = [...s].sort((x, y) => x - y);
  let i = 0;
  for (const c of b) if (i < a.length && c >= a[i]!) i++;
  return i;
};

const assignCookies = coding({
  title: 'Assign Cookies',
  statement: 'Child i is content with a cookie of size at least `greed[i]`; cookie j has size `sizes[j]`. Each child gets at most one cookie. Return the maximum number of content children.',
  constraints: '- 1 ≤ |greed|, |sizes| ≤ 10^5\n- 1 ≤ greed[i], sizes[j] ≤ 10^9',
  difficulty: 'easy',
  tags: ['greedy', 'sorting'],
  timeComplexity: 'O(n log n + m log m)',
  spaceComplexity: 'O(1)',
  fn: 'findContentChildren',
  params: [{ name: 'greed', type: 'int[]' }, { name: 'sizes', type: 'int[]' }],
  returns: 'int',
  solve: (g: number[], s: number[]) => cookiesOf(g, s),
  samples: [
    { args: [[1, 2, 3], [1, 1]], explanation: 'Both cookies have size 1, so only the child with greed 1 is content.' },
    { args: [[1, 2], [1, 2, 3]], explanation: 'Both children can be satisfied.' },
  ],
  hidden: [
    { args: [[5], [4]] },
    { args: [[5], [5]] },
    { args: [[1, 1, 1], [1]] },
    { args: [[10, 9, 8, 7], [5, 6, 7, 8]] },
    { args: [[1000000000], [1, 1000000000]] },
    { args: [ints(rng(811), 300, 1, 100), ints(rng(812), 200, 1, 100)] },
    { args: [ints(rng(813), 5000, 1, 1000000000), ints(rng(814), 5000, 1, 1000000000)] },
    { args: [range(1000, 1), range(1000, 1).reverse()] },
    { args: [ints(rng(815), 100000, 1, 1000000000), ints(rng(816), 100000, 1, 1000000000)], stress: true },
    { args: [Array(100000).fill(7), Array(99999).fill(7)], stress: true },
  ],
  solutions: {
    python: 'g = sorted(greed)\ni = 0\nfor c in sorted(sizes):\n    if i < len(g) and c >= g[i]:\n        i += 1\nreturn i',
    javascript: 'const g = Int32Array.from(greed).sort(), s = Int32Array.from(sizes).sort();\nlet i = 0;\nfor (const c of s) if (i < g.length && c >= g[i]) i++;\nreturn i;',
    java: 'int[] g = greed.clone(), s = sizes.clone();\nArrays.sort(g);\nArrays.sort(s);\nint i = 0;\nfor (int c : s) if (i < g.length && c >= g[i]) i++;\nreturn i;',
    csharp: 'var g = (int[])greed.Clone();\nvar s = (int[])sizes.Clone();\nArray.Sort(g);\nArray.Sort(s);\nint i = 0;\nforeach (var c in s) if (i < g.Length && c >= g[i]) i++;\nreturn i;',
    go: { imports: ['sort'], body: 'g := append([]int(nil), greed...)\ns := append([]int(nil), sizes...)\nsort.Ints(g)\nsort.Ints(s)\ni := 0\nfor _, c := range s {\n    if i < len(g) && c >= g[i] {\n        i++\n    }\n}\nreturn i' },
    rust: 'let mut g = greed.to_vec();\nlet mut s = sizes.to_vec();\ng.sort_unstable();\ns.sort_unstable();\nlet mut i = 0;\nfor c in s {\n    if i < g.len() && c >= g[i] {\n        i += 1;\n    }\n}\ni as i32',
    cpp: 'vector<int> g = greed, s = sizes;\nsort(g.begin(), g.end());\nsort(s.begin(), s.end());\nsize_t i = 0;\nfor (int c : s) if (i < g.size() && c >= g[i]) i++;\nreturn i;',
    c: {
      helpers: 'static int cmp_int(const void *a, const void *b) {\n    int x = *(const int *)a, y = *(const int *)b;\n    return (x > y) - (x < y);\n}',
      body: 'int *g = malloc(sizeof(int) * (size_t)greed_size), *s = malloc(sizeof(int) * (size_t)sizes_size);\nmemcpy(g, greed, sizeof(int) * (size_t)greed_size);\nmemcpy(s, sizes, sizeof(int) * (size_t)sizes_size);\nqsort(g, (size_t)greed_size, sizeof(int), cmp_int);\nqsort(s, (size_t)sizes_size, sizeof(int), cmp_int);\nint i = 0;\nfor (int j = 0; j < sizes_size; j++) if (i < greed_size && s[j] >= g[i]) i++;\nfree(g);\nfree(s);\nreturn i;',
    },
  },
});

const changeOk = (bills: number[]) => {
  let five = 0;
  let ten = 0;
  for (const b of bills) {
    if (b === 5) five++;
    else if (b === 10) {
      if (!five) return false;
      five--;
      ten++;
    } else if (ten && five) {
      ten--;
      five--;
    } else if (five >= 3) five -= 3;
    else return false;
  }
  return true;
};
const billsOf = (r: Rng, n: number, fair: boolean) => {
  const out: number[] = [];
  let five = 0;
  let ten = 0;
  for (let i = 0; i < n; i++) {
    let b = [5, 5, 10, 20][Math.floor(r() * 4)]!;
    if (fair) {
      if (b === 10 && !five) b = 5;
      if (b === 20 && !(ten && five) && five < 3) b = 5;
    }
    if (b === 5) five++;
    else if (b === 10) {
      five--;
      ten++;
    } else if (ten && five) {
      ten--;
      five--;
    } else five -= 3;
    out.push(b);
  }
  return out;
};

const lemonadeChange = coding({
  title: 'Lemonade Change',
  statement:
    'A lemonade costs 5. Customers pay, in order, with the bills in `bills` (each 5, 10 or 20), and you start with no change. Return **true** if you can give every customer correct change.\n\nWhen paid with 20, give back a 10 and a 5 if you can — 10s are useless for anything else.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- bills[i] is 5, 10 or 20.',
  difficulty: 'easy',
  tags: ['greedy', 'simulation'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'lemonadeChange',
  params: [{ name: 'bills', type: 'int[]' }],
  returns: 'bool',
  solve: (bills: number[]) => changeOk(bills),
  samples: [
    { args: [[5, 5, 5, 10, 20]], explanation: 'After three 5s, the 10 gets a 5 back and the 20 gets 10 + 5 back.' },
    { args: [[5, 5, 10, 10, 20]], explanation: 'At the 20 you hold two 10s and no 5: no correct change.' },
  ],
  hidden: [
    { args: [[5]] },
    { args: [[10]] },
    { args: [[20]] },
    { args: [[5, 10]] },
    { args: [[5, 5, 5, 20]] },
    { args: [[5, 10, 5, 20, 5, 5, 5, 20]] },
    { args: [billsOf(rng(821), 1000, true)] },
    { args: [billsOf(rng(822), 1000, false)] },
    { args: [billsOf(rng(823), 200000, true)], stress: true },
    { args: [[...billsOf(rng(824), 199999, true), 20, 20, 20, 20, 20, 20].slice(0, 200000)], stress: true },
  ],
  solutions: {
    python: 'five = ten = 0\nfor b in bills:\n    if b == 5:\n        five += 1\n    elif b == 10:\n        if not five:\n            return False\n        five -= 1\n        ten += 1\n    elif ten and five:\n        ten -= 1\n        five -= 1\n    elif five >= 3:\n        five -= 3\n    else:\n        return False\nreturn True',
    javascript: 'let five = 0, ten = 0;\nfor (const b of bills) {\n  if (b === 5) five++;\n  else if (b === 10) { if (!five) return false; five--; ten++; }\n  else if (ten && five) { ten--; five--; }\n  else if (five >= 3) five -= 3;\n  else return false;\n}\nreturn true;',
    java: 'int five = 0, ten = 0;\nfor (int b : bills) {\n    if (b == 5) five++;\n    else if (b == 10) { if (five == 0) return false; five--; ten++; }\n    else if (ten > 0 && five > 0) { ten--; five--; }\n    else if (five >= 3) five -= 3;\n    else return false;\n}\nreturn true;',
    csharp: 'int five = 0, ten = 0;\nforeach (var b in bills)\n{\n    if (b == 5) five++;\n    else if (b == 10) { if (five == 0) return false; five--; ten++; }\n    else if (ten > 0 && five > 0) { ten--; five--; }\n    else if (five >= 3) five -= 3;\n    else return false;\n}\nreturn true;',
    go: 'five, ten := 0, 0\nfor _, b := range bills {\n    switch {\n    case b == 5:\n        five++\n    case b == 10:\n        if five == 0 {\n            return false\n        }\n        five--\n        ten++\n    case ten > 0 && five > 0:\n        ten--\n        five--\n    case five >= 3:\n        five -= 3\n    default:\n        return false\n    }\n}\nreturn true',
    rust: 'let (mut five, mut ten) = (0, 0);\nfor &b in bills {\n    if b == 5 {\n        five += 1;\n    } else if b == 10 {\n        if five == 0 {\n            return false;\n        }\n        five -= 1;\n        ten += 1;\n    } else if ten > 0 && five > 0 {\n        ten -= 1;\n        five -= 1;\n    } else if five >= 3 {\n        five -= 3;\n    } else {\n        return false;\n    }\n}\ntrue',
    cpp: 'int five = 0, ten = 0;\nfor (int b : bills) {\n    if (b == 5) five++;\n    else if (b == 10) { if (!five) return false; five--; ten++; }\n    else if (ten && five) { ten--; five--; }\n    else if (five >= 3) five -= 3;\n    else return false;\n}\nreturn true;',
    c: 'int five = 0, ten = 0;\nfor (int i = 0; i < bills_size; i++) {\n    int b = bills[i];\n    if (b == 5) five++;\n    else if (b == 10) { if (!five) return false; five--; ten++; }\n    else if (ten && five) { ten--; five--; }\n    else if (five >= 3) five -= 3;\n    else return false;\n}\nreturn true;',
  },
});

const bestTimeMany = coding({
  title: 'Best Time to Buy and Sell, Many Trades',
  statement: 'You may complete as many buy-then-sell trades as you like, but hold at most one share at a time (sell before buying again). Return the maximum total profit.\n\nEvery rise from one day to the next can be captured.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- 0 ≤ prices[i] ≤ 10^4\n- Use 64-bit integers.',
  difficulty: 'easy',
  tags: ['greedy', 'arrays'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'maxProfitMany',
  params: [{ name: 'prices', type: 'int[]' }],
  returns: 'long',
  solve: (p: number[]) => p.reduce((s, x, i) => s + (i > 0 && x > p[i - 1]! ? x - p[i - 1]! : 0), 0),
  samples: [
    { args: [[7, 1, 5, 3, 6, 4]], explanation: 'Buy 1 sell 5 (+4), buy 3 sell 6 (+3): 7.' },
    { args: [[1, 2, 3, 4, 5]], explanation: 'Buy at 1 and sell at 5 (+4), which equals the sum of the daily rises.' },
  ],
  hidden: [
    { args: [[5]] },
    { args: [[5, 4]] },
    { args: [[4, 5]] },
    { args: [[3, 3, 5, 0, 0, 3, 1, 4]] },
    { args: [[1, 10, 1, 10, 1, 10]] },
    { args: [ints(rng(831), 500, 0, 100)] },
    { args: [ints(rng(832), 5000, 0, 10000)] },
    { args: [range(1000).reverse()] },
    { args: [range(200000).map((i) => (i % 2 ? 10000 : 0))], stress: true },
    { args: [ints(rng(833), 200000, 0, 10000)], stress: true },
  ],
  solutions: {
    python: 'total = 0\nfor i in range(1, len(prices)):\n    if prices[i] > prices[i - 1]:\n        total += prices[i] - prices[i - 1]\nreturn total',
    javascript: 'let total = 0;\nfor (let i = 1; i < prices.length; i++) if (prices[i] > prices[i - 1]) total += prices[i] - prices[i - 1];\nreturn total;',
    java: 'long total = 0;\nfor (int i = 1; i < prices.length; i++) if (prices[i] > prices[i - 1]) total += prices[i] - prices[i - 1];\nreturn total;',
    csharp: 'long total = 0;\nfor (int i = 1; i < prices.Length; i++) if (prices[i] > prices[i - 1]) total += prices[i] - prices[i - 1];\nreturn total;',
    go: 'var total int64\nfor i := 1; i < len(prices); i++ {\n    if prices[i] > prices[i-1] {\n        total += int64(prices[i] - prices[i-1])\n    }\n}\nreturn total',
    rust: 'prices.windows(2).map(|w| (w[1] - w[0]).max(0) as i64).sum()',
    cpp: 'long long total = 0;\nfor (size_t i = 1; i < prices.size(); i++) if (prices[i] > prices[i - 1]) total += prices[i] - prices[i - 1];\nreturn total;',
    c: 'long long total = 0;\nfor (int i = 1; i < prices_size; i++) if (prices[i] > prices[i - 1]) total += prices[i] - prices[i - 1];\nreturn total;',
  },
});

const jumpOk = (a: number[]) => {
  let reach = 0;
  for (let i = 0; i < a.length && i <= reach; i++) reach = Math.max(reach, i + a[i]!);
  return reach >= a.length - 1;
};

const canJump = coding({
  title: 'Jump Game',
  statement: 'You start at index 0. From index i you may jump forward up to `nums[i]` positions. Return **true** if you can reach the last index.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- 0 ≤ nums[i] ≤ 10^5',
  difficulty: 'moderate',
  tags: ['greedy', 'arrays'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'canJump',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'bool',
  solve: (nums: number[]) => jumpOk(nums),
  samples: [
    { args: [[2, 3, 1, 1, 4]], explanation: 'Jump 1 step to index 1, then 3 steps to the end.' },
    { args: [[3, 2, 1, 0, 4]], explanation: 'Every route lands on index 3, whose value is 0.' },
  ],
  hidden: [
    { args: [[0]] },
    { args: [[0, 1]] },
    { args: [[1, 0]] },
    { args: [[2, 0, 0]] },
    { args: [[1, 1, 0, 1]] },
    { args: [ints(rng(841), 500, 0, 3)] },
    { args: [ints(rng(842), 5000, 0, 2)] },
    { args: [[...Array(999).fill(1), 0]] },
    { args: [[...Array(199999).fill(1), 0]], stress: true },
    { args: [[100000, ...Array(99999).fill(0), 100000, ...Array(99999).fill(0)]], stress: true },
  ],
  solutions: {
    python: 'reach = 0\nfor i, x in enumerate(nums):\n    if i > reach:\n        return False\n    if i + x > reach:\n        reach = i + x\nreturn True',
    javascript: 'let reach = 0;\nfor (let i = 0; i < nums.length; i++) {\n  if (i > reach) return false;\n  reach = Math.max(reach, i + nums[i]);\n}\nreturn true;',
    java: 'int reach = 0;\nfor (int i = 0; i < nums.length; i++) {\n    if (i > reach) return false;\n    reach = Math.max(reach, i + nums[i]);\n}\nreturn true;',
    csharp: 'int reach = 0;\nfor (int i = 0; i < nums.Length; i++)\n{\n    if (i > reach) return false;\n    reach = Math.Max(reach, i + nums[i]);\n}\nreturn true;',
    go: 'reach := 0\nfor i, x := range nums {\n    if i > reach {\n        return false\n    }\n    if i+x > reach {\n        reach = i + x\n    }\n}\nreturn true',
    rust: 'let mut reach = 0usize;\nfor (i, &x) in nums.iter().enumerate() {\n    if i > reach {\n        return false;\n    }\n    reach = reach.max(i + x as usize);\n}\ntrue',
    cpp: 'int reach = 0;\nfor (int i = 0; i < (int)nums.size(); i++) {\n    if (i > reach) return false;\n    reach = max(reach, i + nums[i]);\n}\nreturn true;',
    c: 'int reach = 0;\nfor (int i = 0; i < nums_size; i++) {\n    if (i > reach) return false;\n    if (i + nums[i] > reach) reach = i + nums[i];\n}\nreturn true;',
  },
});

const eraseOf = (iv: number[][]) => {
  const a = [...iv].sort((x, y) => x[1]! - y[1]!);
  let end = -Infinity;
  let kept = 0;
  for (const [s, e] of a) if (s! >= end) {
    kept++;
    end = e!;
  }
  return iv.length - kept;
};
const intervals = (r: Rng, n: number, max: number, len: number) => Array.from({ length: n }, () => { const s = int(r, 0, max); return [s, s + int(r, 1, len)]; });

const eraseOverlap = coding({
  title: 'Non-overlapping Intervals',
  statement: 'Return the minimum number of intervals to remove so that the rest do not overlap. Intervals that only touch (`[1,2]` and `[2,3]`) do not overlap.\n\nKeep the intervals that end earliest.',
  constraints: '- 1 ≤ n ≤ 10^5\n- 0 ≤ start < end ≤ 10^9',
  difficulty: 'moderate',
  tags: ['greedy', 'intervals', 'sorting'],
  timeComplexity: 'O(n log n)',
  spaceComplexity: 'O(n)',
  fn: 'eraseOverlapIntervals',
  params: [{ name: 'intervals', type: 'int[][]' }],
  returns: 'int',
  solve: (iv: number[][]) => eraseOf(iv),
  samples: [
    { args: [[[1, 2], [2, 3], [3, 4], [1, 3]]], explanation: 'Remove [1,3]; the others only touch.' },
    { args: [[[1, 2], [1, 2], [1, 2]]], explanation: 'Keep one copy, remove the other two.' },
  ],
  hidden: [
    { args: [[[0, 1]]] },
    { args: [[[1, 2], [2, 3]]] },
    { args: [[[1, 100], [11, 22], [1, 11], [2, 12]]] },
    { args: [[[0, 1000000000], [1, 2], [3, 4], [5, 6]]] },
    { args: [[[1, 3], [2, 4], [3, 5], [4, 6]]] },
    { args: [intervals(rng(851), 300, 1000, 50)] },
    { args: [intervals(rng(852), 5000, 1000000, 1000)] },
    { args: [range(2000).map((i) => [i, i + 2])] },
    { args: [intervals(rng(853), 100000, 1000000000, 100000)], stress: true },
    { args: [intervals(rng(854), 100000, 1000, 10)], stress: true },
  ],
  solutions: {
    python: 'end = float("-inf")\nkept = 0\nfor s, e in sorted(intervals, key=lambda x: x[1]):\n    if s >= end:\n        kept += 1\n        end = e\nreturn len(intervals) - kept',
    javascript: 'const a = intervals.slice().sort((x, y) => x[1] - y[1]);\nlet end = -Infinity, kept = 0;\nfor (const [s, e] of a) if (s >= end) { kept++; end = e; }\nreturn intervals.length - kept;',
    java: 'int[][] a = intervals.clone();\nArrays.sort(a, (x, y) -> Integer.compare(x[1], y[1]));\nlong end = Long.MIN_VALUE;\nint kept = 0;\nfor (int[] iv : a) if (iv[0] >= end) { kept++; end = iv[1]; }\nreturn a.length - kept;',
    csharp: 'var a = intervals.OrderBy(x => x[1]).ToArray();\nlong end = long.MinValue;\nint kept = 0;\nforeach (var iv in a) if (iv[0] >= end) { kept++; end = iv[1]; }\nreturn a.Length - kept;',
    go: { imports: ['sort'], body: 'a := make([][]int, len(intervals))\ncopy(a, intervals)\nsort.Slice(a, func(i, j int) bool { return a[i][1] < a[j][1] })\nend, kept := -1, 0\nfor _, iv := range a {\n    if iv[0] >= end {\n        kept++\n        end = iv[1]\n    }\n}\nreturn len(a) - kept' },
    rust: 'let mut a: Vec<&Vec<i32>> = intervals.iter().collect();\na.sort_by_key(|x| x[1]);\nlet (mut end, mut kept) = (i64::MIN, 0);\nfor iv in a {\n    if iv[0] as i64 >= end {\n        kept += 1;\n        end = iv[1] as i64;\n    }\n}\nintervals.len() as i32 - kept',
    cpp: 'vector<vector<int>> a = intervals;\nsort(a.begin(), a.end(), [](const vector<int>& x, const vector<int>& y) { return x[1] < y[1]; });\nlong long end = LLONG_MIN;\nint kept = 0;\nfor (const auto& iv : a) if (iv[0] >= end) { kept++; end = iv[1]; }\nreturn (int)a.size() - kept;',
    c: {
      helpers: 'static int cmp_end(const void *a, const void *b) {\n    const int *x = *(const int *const *)a, *y = *(const int *const *)b;\n    return (x[1] > y[1]) - (x[1] < y[1]);\n}',
      body: 'int n = intervals_rows;\nint **a = malloc(sizeof(int *) * (size_t)n);\nfor (int i = 0; i < n; i++) a[i] = intervals[i];\nqsort(a, (size_t)n, sizeof(int *), cmp_end);\nlong long end = LLONG_MIN;\nint kept = 0;\nfor (int i = 0; i < n; i++) if (a[i][0] >= end) { kept++; end = a[i][1]; }\nfree(a);\nreturn n - kept;',
    },
  },
});

const gasOf = (gas: number[], cost: number[]) => {
  let total = 0;
  let tank = 0;
  let start = 0;
  for (let i = 0; i < gas.length; i++) {
    total += gas[i]! - cost[i]!;
    tank += gas[i]! - cost[i]!;
    if (tank < 0) {
      tank = 0;
      start = i + 1;
    }
  }
  return total < 0 ? -1 : start;
};
const gasCase = (r: Rng, n: number, ok: boolean): [number[], number[]] => {
  const gas = ints(r, n, 0, 10000);
  const cost = ints(r, n, 0, 10000);
  const diff = gas.reduce((s, x, i) => s + x - cost[i]!, 0);
  if (ok && diff < 0) {
    let need = -diff;
    for (let i = 0; i < n && need > 0; i++) {
      const add = Math.min(10000 - gas[i]!, need);
      gas[i]! += add;
      need -= add;
    }
  }
  return [gas, cost];
};

const gasStation = coding({
  title: 'Gas Station',
  statement:
    'Gas stations stand in a circle. Station i provides `gas[i]` fuel, and driving from station i to the next costs `cost[i]`. Starting with an empty tank, return the smallest index of a station from which you can drive around the whole circle once, or **−1** if there is none.\n\nIf the trip fails between stations i and j, no station between them can be the start either.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- 0 ≤ gas[i], cost[i] ≤ 10^4',
  difficulty: 'moderate',
  tags: ['greedy', 'arrays'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'canCompleteCircuit',
  params: [{ name: 'gas', type: 'int[]' }, { name: 'cost', type: 'int[]' }],
  returns: 'int',
  solve: (gas: number[], cost: number[]) => gasOf(gas, cost),
  samples: [
    { args: [[1, 2, 3, 4, 5], [3, 4, 5, 1, 2]], explanation: 'Start at station 3: the tank never goes negative.' },
    { args: [[2, 3, 4], [3, 4, 3]], explanation: 'Total gas 9 is less than total cost 10.' },
  ],
  hidden: [
    { args: [[5], [5]] },
    { args: [[4], [5]] },
    { args: [[0, 10], [5, 5]] },
    { args: [[3, 1, 1], [1, 2, 2]] },
    { args: [[5, 1, 2, 3, 4], [4, 4, 1, 5, 1]] },
    { args: gasCase(rng(861), 500, true) },
    { args: gasCase(rng(862), 5000, true) },
    { args: gasCase(rng(863), 5000, false) },
    { args: gasCase(rng(864), 200000, true), stress: true },
    { args: [[...Array(199999).fill(0), 10000], [...Array(199999).fill(0), 10000]], stress: true },
  ],
  solutions: {
    python: 'total = tank = start = 0\nfor i in range(len(gas)):\n    d = gas[i] - cost[i]\n    total += d\n    tank += d\n    if tank < 0:\n        tank = 0\n        start = i + 1\nreturn -1 if total < 0 else start',
    javascript: 'let total = 0, tank = 0, start = 0;\nfor (let i = 0; i < gas.length; i++) {\n  const d = gas[i] - cost[i];\n  total += d;\n  tank += d;\n  if (tank < 0) { tank = 0; start = i + 1; }\n}\nreturn total < 0 ? -1 : start;',
    java: 'long total = 0, tank = 0;\nint start = 0;\nfor (int i = 0; i < gas.length; i++) {\n    int d = gas[i] - cost[i];\n    total += d;\n    tank += d;\n    if (tank < 0) { tank = 0; start = i + 1; }\n}\nreturn total < 0 ? -1 : start;',
    csharp: 'long total = 0, tank = 0;\nint start = 0;\nfor (int i = 0; i < gas.Length; i++)\n{\n    int d = gas[i] - cost[i];\n    total += d;\n    tank += d;\n    if (tank < 0) { tank = 0; start = i + 1; }\n}\nreturn total < 0 ? -1 : start;',
    go: 'total, tank, start := 0, 0, 0\nfor i := range gas {\n    d := gas[i] - cost[i]\n    total += d\n    tank += d\n    if tank < 0 {\n        tank = 0\n        start = i + 1\n    }\n}\nif total < 0 {\n    return -1\n}\nreturn start',
    rust: 'let (mut total, mut tank, mut start) = (0i64, 0i64, 0usize);\nfor i in 0..gas.len() {\n    let d = (gas[i] - cost[i]) as i64;\n    total += d;\n    tank += d;\n    if tank < 0 {\n        tank = 0;\n        start = i + 1;\n    }\n}\nif total < 0 { -1 } else { start as i32 }',
    cpp: 'long long total = 0, tank = 0;\nint start = 0;\nfor (size_t i = 0; i < gas.size(); i++) {\n    int d = gas[i] - cost[i];\n    total += d;\n    tank += d;\n    if (tank < 0) { tank = 0; start = i + 1; }\n}\nreturn total < 0 ? -1 : start;',
    c: 'long long total = 0, tank = 0;\nint start = 0;\nfor (int i = 0; i < gas_size; i++) {\n    int d = gas[i] - cost[i];\n    total += d;\n    tank += d;\n    if (tank < 0) { tank = 0; start = i + 1; }\n}\nreturn total < 0 ? -1 : start;',
  },
});

const labelsOf = (s: string) => {
  const last = new Map<string, number>();
  for (let i = 0; i < s.length; i++) last.set(s[i]!, i);
  const out: number[] = [];
  let start = 0;
  let end = 0;
  for (let i = 0; i < s.length; i++) {
    end = Math.max(end, last.get(s[i]!)!);
    if (i === end) {
      out.push(end - start + 1);
      start = i + 1;
    }
  }
  return out;
};

const partitionLabels = coding({
  title: 'Partition Labels',
  statement: 'Split `s` into as many parts as possible so that each letter appears in at most one part. Return the sizes of the parts, left to right.',
  constraints: '- 1 ≤ |s| ≤ 2·10^5\n- s contains only lowercase English letters.',
  difficulty: 'moderate',
  tags: ['greedy', 'strings'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'partitionLabels',
  params: [{ name: 's', type: 'string' }],
  returns: 'int[]',
  solve: (s: string) => labelsOf(s),
  samples: [
    { args: ['ababcbacadefegdehijhklij'], explanation: 'Parts "ababcbaca", "defegde", "hijhklij": sizes 9, 7, 8.' },
    { args: ['eccbbbbdec'], explanation: '"e" appears at both ends, so everything is one part.' },
  ],
  hidden: [
    { args: ['a'] },
    { args: ['ab'] },
    { args: ['aa'] },
    { args: ['abcabc'] },
    { args: ['abcdefghijklmnopqrstuvwxyz'] },
    { args: [word(rng(871), 1000, 'abc')] },
    { args: [Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i).repeat(i + 1)).join('')] },
    { args: [word(rng(872), 5000, 'abcdefghijklmnopqrstuvwxyz')] },
    { args: [Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i).repeat(7692)).join('')], stress: true },
    { args: [word(rng(873), 200000, 'abcdefghijklmnopqrstuvwxyz')], stress: true },
  ],
  solutions: {
    python: 'last = {c: i for i, c in enumerate(s)}\nres = []\nstart = end = 0\nfor i, c in enumerate(s):\n    if last[c] > end:\n        end = last[c]\n    if i == end:\n        res.append(end - start + 1)\n        start = i + 1\nreturn res',
    javascript: 'const last = new Array(26).fill(0);\nfor (let i = 0; i < s.length; i++) last[s.charCodeAt(i) - 97] = i;\nconst res = [];\nlet start = 0, end = 0;\nfor (let i = 0; i < s.length; i++) {\n  end = Math.max(end, last[s.charCodeAt(i) - 97]);\n  if (i === end) { res.push(end - start + 1); start = i + 1; }\n}\nreturn res;',
    java: 'int[] last = new int[26];\nfor (int i = 0; i < s.length(); i++) last[s.charAt(i) - \'a\'] = i;\nint[] buf = new int[26];\nint n = 0, start = 0, end = 0;\nfor (int i = 0; i < s.length(); i++) {\n    end = Math.max(end, last[s.charAt(i) - \'a\']);\n    if (i == end) { buf[n++] = end - start + 1; start = i + 1; }\n}\nreturn Arrays.copyOf(buf, n);',
    csharp: 'var last = new int[26];\nfor (int i = 0; i < s.Length; i++) last[s[i] - \'a\'] = i;\nvar res = new List<int>();\nint start = 0, end = 0;\nfor (int i = 0; i < s.Length; i++)\n{\n    end = Math.Max(end, last[s[i] - \'a\']);\n    if (i == end) { res.Add(end - start + 1); start = i + 1; }\n}\nreturn res.ToArray();',
    go: 'var last [26]int\nfor i := 0; i < len(s); i++ {\n    last[s[i]-\'a\'] = i\n}\nres := []int{}\nstart, end := 0, 0\nfor i := 0; i < len(s); i++ {\n    if last[s[i]-\'a\'] > end {\n        end = last[s[i]-\'a\']\n    }\n    if i == end {\n        res = append(res, end-start+1)\n        start = i + 1\n    }\n}\nreturn res',
    rust: 'let b = s.as_bytes();\nlet mut last = [0usize; 26];\nfor (i, &c) in b.iter().enumerate() {\n    last[(c - b\'a\') as usize] = i;\n}\nlet mut res = Vec::new();\nlet (mut start, mut end) = (0usize, 0usize);\nfor (i, &c) in b.iter().enumerate() {\n    end = end.max(last[(c - b\'a\') as usize]);\n    if i == end {\n        res.push((end - start + 1) as i32);\n        start = i + 1;\n    }\n}\nres',
    cpp: 'int last[26] = {0};\nfor (int i = 0; i < (int)s.size(); i++) last[s[i] - \'a\'] = i;\nvector<int> res;\nint start = 0, end = 0;\nfor (int i = 0; i < (int)s.size(); i++) {\n    end = max(end, last[s[i] - \'a\']);\n    if (i == end) { res.push_back(end - start + 1); start = i + 1; }\n}\nreturn res;',
    c: 'int last[26] = {0}, n = (int)strlen(s);\nfor (int i = 0; i < n; i++) last[s[i] - \'a\'] = i;\nint *res = malloc(sizeof(int) * 26);\nint m = 0, start = 0, end = 0;\nfor (int i = 0; i < n; i++) {\n    if (last[s[i] - \'a\'] > end) end = last[s[i] - \'a\'];\n    if (i == end) { res[m++] = end - start + 1; start = i + 1; }\n}\n*return_size = m;\nreturn res;',
  },
});

const candyOf = (r: number[]) => {
  const n = r.length;
  const c = new Array(n).fill(1);
  for (let i = 1; i < n; i++) if (r[i]! > r[i - 1]!) c[i] = c[i - 1] + 1;
  for (let i = n - 2; i >= 0; i--) if (r[i]! > r[i + 1]! && c[i] <= c[i + 1]) c[i] = c[i + 1] + 1;
  return c.reduce((a, b) => a + b, 0);
};

const candy = coding({
  title: 'Candy',
  statement:
    'Children stand in a line with ratings `ratings[i]`. Give each child at least one candy, and give any child with a higher rating than a neighbour more candies than that neighbour. Return the minimum total number of candies.\n\nOne left-to-right pass and one right-to-left pass are enough.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- 0 ≤ ratings[i] ≤ 2·10^4\n- Use 64-bit integers for the total.',
  difficulty: 'hard',
  tags: ['greedy', 'arrays'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'candy',
  params: [{ name: 'ratings', type: 'int[]' }],
  returns: 'long',
  solve: (r: number[]) => candyOf(r),
  samples: [
    { args: [[1, 0, 2]], explanation: 'Candies 2, 1, 2: total 5.' },
    { args: [[1, 2, 2]], explanation: 'Candies 1, 2, 1: equal neighbours need not differ.' },
  ],
  hidden: [
    { args: [[0]] },
    { args: [[1, 1]] },
    { args: [[1, 2]] },
    { args: [[2, 1]] },
    { args: [[1, 3, 2, 2, 1]] },
    { args: [[1, 2, 87, 87, 87, 2, 1]] },
    { args: [ints(rng(881), 1000, 0, 10)] },
    { args: [ints(rng(882), 5000, 0, 20000)] },
    { args: [range(200000).map((i) => i % 20001)], stress: true },
    { args: [[...range(100000), ...range(100000).reverse()].map((x) => x % 20001)], stress: true },
  ],
  solutions: {
    python: 'n = len(ratings)\nc = [1] * n\nfor i in range(1, n):\n    if ratings[i] > ratings[i - 1]:\n        c[i] = c[i - 1] + 1\nfor i in range(n - 2, -1, -1):\n    if ratings[i] > ratings[i + 1] and c[i] <= c[i + 1]:\n        c[i] = c[i + 1] + 1\nreturn sum(c)',
    javascript: 'const n = ratings.length, c = new Array(n).fill(1);\nfor (let i = 1; i < n; i++) if (ratings[i] > ratings[i - 1]) c[i] = c[i - 1] + 1;\nfor (let i = n - 2; i >= 0; i--) if (ratings[i] > ratings[i + 1] && c[i] <= c[i + 1]) c[i] = c[i + 1] + 1;\nreturn c.reduce((a, b) => a + b, 0);',
    java: 'int n = ratings.length;\nint[] c = new int[n];\nArrays.fill(c, 1);\nfor (int i = 1; i < n; i++) if (ratings[i] > ratings[i - 1]) c[i] = c[i - 1] + 1;\nfor (int i = n - 2; i >= 0; i--) if (ratings[i] > ratings[i + 1] && c[i] <= c[i + 1]) c[i] = c[i + 1] + 1;\nlong total = 0;\nfor (int x : c) total += x;\nreturn total;',
    csharp: 'int n = ratings.Length;\nvar c = Enumerable.Repeat(1, n).ToArray();\nfor (int i = 1; i < n; i++) if (ratings[i] > ratings[i - 1]) c[i] = c[i - 1] + 1;\nfor (int i = n - 2; i >= 0; i--) if (ratings[i] > ratings[i + 1] && c[i] <= c[i + 1]) c[i] = c[i + 1] + 1;\nreturn c.Sum(x => (long)x);',
    go: 'n := len(ratings)\nc := make([]int64, n)\nfor i := range c {\n    c[i] = 1\n}\nfor i := 1; i < n; i++ {\n    if ratings[i] > ratings[i-1] {\n        c[i] = c[i-1] + 1\n    }\n}\nfor i := n - 2; i >= 0; i-- {\n    if ratings[i] > ratings[i+1] && c[i] <= c[i+1] {\n        c[i] = c[i+1] + 1\n    }\n}\nvar total int64\nfor _, x := range c {\n    total += x\n}\nreturn total',
    rust: 'let n = ratings.len();\nlet mut c = vec![1i64; n];\nfor i in 1..n {\n    if ratings[i] > ratings[i - 1] {\n        c[i] = c[i - 1] + 1;\n    }\n}\nfor i in (0..n.saturating_sub(1)).rev() {\n    if ratings[i] > ratings[i + 1] && c[i] <= c[i + 1] {\n        c[i] = c[i + 1] + 1;\n    }\n}\nc.iter().sum()',
    cpp: 'int n = ratings.size();\nvector<long long> c(n, 1);\nfor (int i = 1; i < n; i++) if (ratings[i] > ratings[i - 1]) c[i] = c[i - 1] + 1;\nfor (int i = n - 2; i >= 0; i--) if (ratings[i] > ratings[i + 1] && c[i] <= c[i + 1]) c[i] = c[i + 1] + 1;\nreturn accumulate(c.begin(), c.end(), 0LL);',
    c: 'int n = ratings_size;\nlong long *c = malloc(sizeof(long long) * (size_t)n);\nfor (int i = 0; i < n; i++) c[i] = 1;\nfor (int i = 1; i < n; i++) if (ratings[i] > ratings[i - 1]) c[i] = c[i - 1] + 1;\nfor (int i = n - 2; i >= 0; i--) if (ratings[i] > ratings[i + 1] && c[i] <= c[i + 1]) c[i] = c[i + 1] + 1;\nlong long total = 0;\nfor (int i = 0; i < n; i++) total += c[i];\nfree(c);\nreturn total;',
  },
});

const refuelOf = (target: number, fuel: number, stations: number[][]) => {
  // Max-heap of the fuel at stations already passed.
  const h: number[] = [];
  const push = (x: number) => {
    h.push(x);
    for (let k = h.length - 1; k > 0; ) {
      const p = (k - 1) >> 1;
      if (h[p]! >= h[k]!) break;
      [h[p], h[k]] = [h[k]!, h[p]!];
      k = p;
    }
  };
  const pop = () => {
    const top = h[0]!;
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      for (let k = 0; ; ) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < h.length && h[l]! > h[m]!) m = l;
        if (r < h.length && h[r]! > h[m]!) m = r;
        if (m === k) break;
        [h[m], h[k]] = [h[k]!, h[m]!];
        k = m;
      }
    }
    return top;
  };
  let stops = 0;
  let i = 0;
  let reach = fuel;
  while (reach < target) {
    while (i < stations.length && stations[i]![0]! <= reach) push(stations[i++]![1]!);
    if (!h.length) return -1;
    reach += pop();
    stops++;
  }
  return stops;
};
const stationsOf = (r: Rng, n: number, target: number, maxFuel: number) => {
  const pos = new Set<number>();
  while (pos.size < n) pos.add(int(r, 1, target - 1));
  return [...pos].sort((a, b) => a - b).map((p) => [p, int(r, 1, maxFuel)]);
};

const minRefuelStops = coding({
  title: 'Minimum Refuelling Stops',
  statement:
    'A car starts at position 0 with `startFuel` litres and must reach position `target`; it uses one litre per unit of distance. Each row of `stations` is `position fuel` (sorted by position): stopping there adds that much fuel. Return the minimum number of stops needed to reach the target, or **−1** if it is impossible. Reaching a station or the target with exactly 0 fuel is fine.\n\nGreedy with a max-heap: when you run dry, refuel retroactively at the biggest station you have passed.',
  constraints: '- 1 ≤ target ≤ 10^9\n- 0 ≤ startFuel ≤ 10^9\n- 0 ≤ number of stations ≤ 5·10^4\n- 0 < position < target (strictly increasing), 1 ≤ fuel ≤ 10^9',
  difficulty: 'hard',
  tags: ['greedy', 'heap'],
  timeComplexity: 'O(n log n)',
  spaceComplexity: 'O(n)',
  fn: 'minRefuelStops',
  params: [{ name: 'target', type: 'int' }, { name: 'startFuel', type: 'int' }, { name: 'stations', type: 'int[][]' }],
  returns: 'int',
  solve: (t: number, f: number, st: number[][]) => refuelOf(t, f, st),
  samples: [
    { args: [100, 10, [[10, 60], [20, 30], [30, 30], [60, 40]]], explanation: 'Stop at 10 (fuel 60, reach 70) and at 60 (fuel 40, reach 110): two stops.' },
    { args: [100, 1, [[10, 100]]], explanation: 'The first station is out of reach.' },
  ],
  hidden: [
    { args: [1, 1, []] },
    { args: [5, 4, []] },
    { args: [100, 50, [[50, 50]]] },
    { args: [100, 50, [[25, 25], [50, 50]]] },
    { args: [1000, 299, [[13, 21], [26, 115], [100, 47], [225, 99], [299, 141], [444, 198], [608, 190], [636, 157], [647, 255], [841, 123]]] },
    { args: [10000, 100, stationsOf(rng(891), 300, 10000, 200)] },
    { args: [1000000, 5000, stationsOf(rng(892), 5000, 1000000, 1000)] },
    { args: [1000000000, 1000000000, stationsOf(rng(893), 100, 1000000000, 10)] },
    { args: [1000000000, 30000, stationsOf(rng(894), 50000, 1000000000, 40000)], stress: true },
    { args: [50000, 1, range(49999, 1).map((p) => [p, 1])], stress: true },
  ],
  solutions: {
    python: {
      helpers: 'import heapq',
      body: 'heap = []\nstops = i = 0\nreach = start_fuel\nwhile reach < target:\n    while i < len(stations) and stations[i][0] <= reach:\n        heapq.heappush(heap, -stations[i][1])\n        i += 1\n    if not heap:\n        return -1\n    reach -= heapq.heappop(heap)\n    stops += 1\nreturn stops',
    },
    javascript: {
      helpers: 'function siftUp(h, i) {\n  while (i > 0) {\n    const p = (i - 1) >> 1;\n    if (h[p] >= h[i]) break;\n    [h[p], h[i]] = [h[i], h[p]];\n    i = p;\n  }\n}\nfunction popMax(h) {\n  const top = h[0], last = h.pop();\n  if (h.length) {\n    h[0] = last;\n    let i = 0;\n    for (;;) {\n      const l = 2 * i + 1, r = l + 1;\n      let m = i;\n      if (l < h.length && h[l] > h[m]) m = l;\n      if (r < h.length && h[r] > h[m]) m = r;\n      if (m === i) break;\n      [h[m], h[i]] = [h[i], h[m]];\n      i = m;\n    }\n  }\n  return top;\n}',
      body: 'const heap = [];\nlet stops = 0, i = 0, reach = startFuel;\nwhile (reach < target) {\n  while (i < stations.length && stations[i][0] <= reach) { heap.push(stations[i++][1]); siftUp(heap, heap.length - 1); }\n  if (!heap.length) return -1;\n  reach += popMax(heap);\n  stops++;\n}\nreturn stops;',
    },
    java: 'PriorityQueue<Integer> pq = new PriorityQueue<>(Collections.reverseOrder());\nlong reach = startFuel;\nint stops = 0, i = 0;\nwhile (reach < target) {\n    while (i < stations.length && stations[i][0] <= reach) pq.add(stations[i++][1]);\n    if (pq.isEmpty()) return -1;\n    reach += pq.poll();\n    stops++;\n}\nreturn stops;',
    csharp: 'var pq = new PriorityQueue<int, int>();\nlong reach = startFuel;\nint stops = 0, i = 0;\nwhile (reach < target)\n{\n    while (i < stations.Length && stations[i][0] <= reach) { pq.Enqueue(stations[i][1], -stations[i][1]); i++; }\n    if (pq.Count == 0) return -1;\n    reach += pq.Dequeue();\n    stops++;\n}\nreturn stops;',
    go: {
      imports: ['container/heap'],
      helpers: 'type maxHeap []int\n\nfunc (h maxHeap) Len() int            { return len(h) }\nfunc (h maxHeap) Less(i, j int) bool  { return h[i] > h[j] }\nfunc (h maxHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }\nfunc (h *maxHeap) Push(x interface{}) { *h = append(*h, x.(int)) }\nfunc (h *maxHeap) Pop() interface{} {\n    old := *h\n    x := old[len(old)-1]\n    *h = old[:len(old)-1]\n    return x\n}',
      body: 'h := &maxHeap{}\nreach, stops, i := startFuel, 0, 0\nfor reach < target {\n    for i < len(stations) && stations[i][0] <= reach {\n        heap.Push(h, stations[i][1])\n        i++\n    }\n    if h.Len() == 0 {\n        return -1\n    }\n    reach += heap.Pop(h).(int)\n    stops++\n}\nreturn stops',
    },
    rust: 'let mut heap = std::collections::BinaryHeap::new();\nlet (mut reach, mut stops, mut i) = (start_fuel as i64, 0, 0usize);\nwhile reach < target as i64 {\n    while i < stations.len() && stations[i][0] as i64 <= reach {\n        heap.push(stations[i][1] as i64);\n        i += 1;\n    }\n    match heap.pop() {\n        Some(f) => {\n            reach += f;\n            stops += 1;\n        }\n        None => return -1,\n    }\n}\nstops',
    cpp: 'priority_queue<int> pq;\nlong long reach = startFuel;\nint stops = 0;\nsize_t i = 0;\nwhile (reach < target) {\n    while (i < stations.size() && stations[i][0] <= reach) pq.push(stations[i++][1]);\n    if (pq.empty()) return -1;\n    reach += pq.top();\n    pq.pop();\n    stops++;\n}\nreturn stops;',
    c: {
      helpers: 'static void up(int *h, int i) {\n    while (i > 0) {\n        int p = (i - 1) / 2;\n        if (h[p] >= h[i]) break;\n        int t = h[p]; h[p] = h[i]; h[i] = t;\n        i = p;\n    }\n}\n\nstatic int pop_max(int *h, int *n) {\n    int top = h[0];\n    h[0] = h[--(*n)];\n    int i = 0;\n    for (;;) {\n        int l = 2 * i + 1, r = l + 1, m = i;\n        if (l < *n && h[l] > h[m]) m = l;\n        if (r < *n && h[r] > h[m]) m = r;\n        if (m == i) break;\n        int t = h[m]; h[m] = h[i]; h[i] = t;\n        i = m;\n    }\n    return top;\n}',
      body: 'int *h = malloc(sizeof(int) * (size_t)(stations_rows + 1));\nint hn = 0, stops = 0, i = 0;\nlong long reach = start_fuel;\nwhile (reach < target) {\n    while (i < stations_rows && stations[i][0] <= reach) { h[hn] = stations[i][1]; up(h, hn++); i++; }\n    if (hn == 0) { stops = -1; break; }\n    reach += pop_max(h, &hn);\n    stops++;\n}\nfree(h);\nreturn stops;',
    },
  },
});

export const GREEDY: CodingQuestionInput[] = [bestTimeOnce, assignCookies, lemonadeChange, bestTimeMany, canJump, eraseOverlap, gasStation, partitionLabels, candy, minRefuelStops];
