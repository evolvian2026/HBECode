import type { CodingQuestionInput } from '@hbe/shared';
import { coding, int, ints, rng, word, range, type Rng } from './define.js';

const MOD = 1_000_000_007;

const climbStairs = coding({
  title: 'Climbing Stairs',
  statement: 'You climb a staircase of `n` steps, taking either 1 or 2 steps at a time. Return the number of distinct ways to reach the top.',
  constraints: '- 1 ≤ n ≤ 70\n- The answer fits in a signed 64-bit integer.',
  difficulty: 'easy',
  tags: ['dynamic-programming'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'climbStairs',
  params: [{ name: 'n', type: 'int' }],
  returns: 'long',
  solve: (n: number) => {
    let a = 1;
    let b = 1;
    for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
    return b;
  },
  samples: [
    { args: [2], explanation: '1+1 or 2.' },
    { args: [3], explanation: '1+1+1, 1+2 or 2+1.' },
  ],
  hidden: [{ args: [1] }, { args: [4] }, { args: [5] }, { args: [10] }, { args: [20] }, { args: [35] }, { args: [45] }, { args: [60] }, { args: [69] }, { args: [70], stress: true }],
  solutions: {
    python: 'a, b = 1, 1\nfor _ in range(n - 1):\n    a, b = b, a + b\nreturn b',
    javascript: 'let a = 1, b = 1;\nfor (let i = 2; i <= n; i++) [a, b] = [b, a + b];\nreturn b;',
    java: 'long a = 1, b = 1;\nfor (int i = 2; i <= n; i++) { long t = a + b; a = b; b = t; }\nreturn b;',
    csharp: 'long a = 1, b = 1;\nfor (int i = 2; i <= n; i++) (a, b) = (b, a + b);\nreturn b;',
    go: 'a, b := int64(1), int64(1)\nfor i := 2; i <= n; i++ {\n    a, b = b, a+b\n}\nreturn b',
    rust: 'let (mut a, mut b) = (1i64, 1i64);\nfor _ in 2..=n {\n    let t = a + b;\n    a = b;\n    b = t;\n}\nb',
    cpp: 'long long a = 1, b = 1;\nfor (int i = 2; i <= n; i++) { long long t = a + b; a = b; b = t; }\nreturn b;',
    c: 'long long a = 1, b = 1;\nfor (int i = 2; i <= n; i++) { long long t = a + b; a = b; b = t; }\nreturn b;',
  },
});

const robOf = (nums: number[]) => {
  let take = 0;
  let skip = 0;
  for (const x of nums) [take, skip] = [skip + x, Math.max(take, skip)];
  return Math.max(take, skip);
};

const houseRobber = coding({
  title: 'House Robber',
  statement: 'Houses along a street hold `nums[i]` coins each. You cannot take from two **adjacent** houses. Return the most coins you can collect.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- 0 ≤ nums[i] ≤ 10^4',
  difficulty: 'easy',
  tags: ['dynamic-programming'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'rob',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'long',
  solve: (nums: number[]) => robOf(nums),
  samples: [
    { args: [[1, 2, 3, 1]], explanation: 'Take houses 0 and 2: 1 + 3 = 4.' },
    { args: [[2, 7, 9, 3, 1]], explanation: 'Take houses 0, 2 and 4: 2 + 9 + 1 = 12.' },
  ],
  hidden: [
    { args: [[0]] },
    { args: [[5]] },
    { args: [[5, 6]] },
    { args: [[2, 1, 1, 2]] },
    { args: [[10, 1, 1, 10, 1, 1, 10]] },
    { args: [ints(rng(701), 500, 0, 100)] },
    { args: [ints(rng(702), 5000, 0, 10000)] },
    { args: [Array(1000).fill(10000)] },
    { args: [ints(rng(703), 200000, 0, 10000)], stress: true },
    { args: [range(200000).map((i) => (i % 3 === 0 ? 10000 : 1))], stress: true },
  ],
  solutions: {
    python: 'take = skip = 0\nfor x in nums:\n    take, skip = skip + x, max(take, skip)\nreturn max(take, skip)',
    javascript: 'let take = 0, skip = 0;\nfor (const x of nums) [take, skip] = [skip + x, Math.max(take, skip)];\nreturn Math.max(take, skip);',
    java: 'long take = 0, skip = 0;\nfor (int x : nums) { long t = skip + x; skip = Math.max(take, skip); take = t; }\nreturn Math.max(take, skip);',
    csharp: 'long take = 0, skip = 0;\nforeach (var x in nums) (take, skip) = (skip + x, Math.Max(take, skip));\nreturn Math.Max(take, skip);',
    go: 'var take, skip int64\nfor _, x := range nums {\n    t := skip + int64(x)\n    if take > skip {\n        skip = take\n    }\n    take = t\n}\nif take > skip {\n    return take\n}\nreturn skip',
    rust: 'let (mut take, mut skip) = (0i64, 0i64);\nfor &x in nums {\n    let t = skip + x as i64;\n    skip = skip.max(take);\n    take = t;\n}\ntake.max(skip)',
    cpp: 'long long take = 0, skip = 0;\nfor (int x : nums) { long long t = skip + x; skip = max(take, skip); take = t; }\nreturn max(take, skip);',
    c: 'long long take = 0, skip = 0;\nfor (int i = 0; i < nums_size; i++) { long long t = skip + nums[i]; if (take > skip) skip = take; take = t; }\nreturn take > skip ? take : skip;',
  },
});

const minCostOf = (cost: number[]) => {
  let a = 0;
  let b = 0;
  for (let i = 2; i <= cost.length; i++) [a, b] = [b, Math.min(b + cost[i - 1]!, a + cost[i - 2]!)];
  return b;
};

const minCostClimbing = coding({
  title: 'Min Cost Climbing Stairs',
  statement:
    'Step `i` costs `cost[i]` to stand on. You start on step 0 or step 1 for free and may climb 1 or 2 steps at a time, paying for each step you land on. Return the minimum cost to reach the top (just past the last step).',
  constraints: '- 2 ≤ n ≤ 2·10^5\n- 0 ≤ cost[i] ≤ 999',
  difficulty: 'easy',
  tags: ['dynamic-programming'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'minCostClimbingStairs',
  params: [{ name: 'cost', type: 'int[]' }],
  returns: 'int',
  solve: (cost: number[]) => minCostOf(cost),
  samples: [
    { args: [[10, 15, 20]], explanation: 'Start on step 1 (cost 15) and jump two steps to the top.' },
    { args: [[1, 100, 1, 1, 1, 100, 1, 1, 100, 1]], explanation: 'Land only on the 1s: total 6.' },
  ],
  hidden: [
    { args: [[0, 0]] },
    { args: [[5, 3]] },
    { args: [[3, 5]] },
    { args: [[1, 2, 3, 4, 5]] },
    { args: [[999, 0, 999, 0, 999]] },
    { args: [ints(rng(711), 500, 0, 999)] },
    { args: [ints(rng(712), 5000, 0, 999)] },
    { args: [Array(1000).fill(999)] },
    { args: [ints(rng(713), 200000, 0, 999)], stress: true },
    { args: [range(200000).map((i) => (i % 2 ? 999 : 0))], stress: true },
  ],
  solutions: {
    python: 'a = b = 0\nfor i in range(2, len(cost) + 1):\n    a, b = b, min(b + cost[i - 1], a + cost[i - 2])\nreturn b',
    javascript: 'let a = 0, b = 0;\nfor (let i = 2; i <= cost.length; i++) [a, b] = [b, Math.min(b + cost[i - 1], a + cost[i - 2])];\nreturn b;',
    java: 'int a = 0, b = 0;\nfor (int i = 2; i <= cost.length; i++) { int t = Math.min(b + cost[i - 1], a + cost[i - 2]); a = b; b = t; }\nreturn b;',
    csharp: 'int a = 0, b = 0;\nfor (int i = 2; i <= cost.Length; i++) (a, b) = (b, Math.Min(b + cost[i - 1], a + cost[i - 2]));\nreturn b;',
    go: 'a, b := 0, 0\nfor i := 2; i <= len(cost); i++ {\n    t := b + cost[i-1]\n    if a+cost[i-2] < t {\n        t = a + cost[i-2]\n    }\n    a, b = b, t\n}\nreturn b',
    rust: 'let (mut a, mut b) = (0, 0);\nfor i in 2..=cost.len() {\n    let t = (b + cost[i - 1]).min(a + cost[i - 2]);\n    a = b;\n    b = t;\n}\nb',
    cpp: 'int a = 0, b = 0;\nfor (size_t i = 2; i <= cost.size(); i++) { int t = min(b + cost[i - 1], a + cost[i - 2]); a = b; b = t; }\nreturn b;',
    c: 'int a = 0, b = 0;\nfor (int i = 2; i <= cost_size; i++) { int t = b + cost[i - 1] < a + cost[i - 2] ? b + cost[i - 1] : a + cost[i - 2]; a = b; b = t; }\nreturn b;',
  },
});

const kadane = (a: number[]) => {
  let best = a[0]!;
  let cur = 0;
  for (const x of a) {
    cur = Math.max(x, cur + x);
    best = Math.max(best, cur);
  }
  return best;
};

const maxSubarray = coding({
  title: 'Maximum Subarray Sum',
  statement: 'Return the largest sum of a contiguous, non-empty subarray of `nums` (Kadane\'s algorithm).',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- −10^9 ≤ nums[i] ≤ 10^9\n- Use 64-bit integers.',
  difficulty: 'easy',
  tags: ['dynamic-programming', 'arrays'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'maxSubarray',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'long',
  solve: (nums: number[]) => kadane(nums),
  samples: [
    { args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], explanation: '[4, −1, 2, 1] adds up to 6.' },
    { args: [[-3, -1, -2]], explanation: 'All values are negative: the best is the single element −1.' },
  ],
  hidden: [
    { args: [[7]] },
    { args: [[-7]] },
    { args: [[1, 2, 3]] },
    { args: [[5, -10, 5]] },
    { args: [[-1000000000, 1000000000, -1000000000]] },
    { args: [ints(rng(721), 500, -100, 100)] },
    { args: [ints(rng(722), 5000, -1000000000, 1000000000)] },
    { args: [Array(1000).fill(-5)] },
    { args: [Array(200000).fill(1000000000)], stress: true },
    { args: [ints(rng(723), 200000, -1000000000, 1000000000)], stress: true },
  ],
  solutions: {
    python: 'best = nums[0]\ncur = 0\nfor x in nums:\n    cur = x if cur + x < x else cur + x\n    if cur > best:\n        best = cur\nreturn best',
    javascript: 'let best = nums[0], cur = 0;\nfor (const x of nums) {\n  cur = Math.max(x, cur + x);\n  best = Math.max(best, cur);\n}\nreturn best;',
    java: 'long best = nums[0], cur = 0;\nfor (int x : nums) { cur = Math.max(x, cur + x); best = Math.max(best, cur); }\nreturn best;',
    csharp: 'long best = nums[0], cur = 0;\nforeach (var x in nums) { cur = Math.Max(x, cur + x); best = Math.Max(best, cur); }\nreturn best;',
    go: 'best, cur := int64(nums[0]), int64(0)\nfor _, x := range nums {\n    v := int64(x)\n    if cur+v > v {\n        cur += v\n    } else {\n        cur = v\n    }\n    if cur > best {\n        best = cur\n    }\n}\nreturn best',
    rust: 'let (mut best, mut cur) = (nums[0] as i64, 0i64);\nfor &x in nums {\n    cur = (x as i64).max(cur + x as i64);\n    best = best.max(cur);\n}\nbest',
    cpp: 'long long best = nums[0], cur = 0;\nfor (int x : nums) { cur = max<long long>(x, cur + x); best = max(best, cur); }\nreturn best;',
    c: 'long long best = nums[0], cur = 0;\nfor (int i = 0; i < nums_size; i++) { cur = cur + nums[i] > nums[i] ? cur + nums[i] : nums[i]; if (cur > best) best = cur; }\nreturn best;',
  },
});

const coinOf = (coins: number[], amount: number) => {
  const dp = new Array(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (let a = 1; a <= amount; a++) for (const c of coins) if (c <= a && dp[a - c] + 1 < dp[a]) dp[a] = dp[a - c] + 1;
  return dp[amount] === Infinity ? -1 : dp[amount];
};

const coinChange = coding({
  title: 'Coin Change',
  statement: 'Return the fewest coins needed to make exactly `amount`, using unlimited coins of the given denominations, or **−1** if it cannot be done. Greedy (largest coin first) is not always optimal.',
  constraints: '- 1 ≤ number of coin types ≤ 12\n- 1 ≤ coins[i] ≤ 10^4\n- 0 ≤ amount ≤ 10^4',
  difficulty: 'moderate',
  tags: ['dynamic-programming'],
  timeComplexity: 'O(amount · coins)',
  spaceComplexity: 'O(amount)',
  fn: 'coinChange',
  params: [{ name: 'coins', type: 'int[]' }, { name: 'amount', type: 'int' }],
  returns: 'int',
  solve: (coins: number[], amount: number) => coinOf(coins, amount),
  samples: [
    { args: [[1, 2, 5], 11], explanation: '11 = 5 + 5 + 1: three coins.' },
    { args: [[1, 3, 4], 6], explanation: 'Greedy takes 4 + 1 + 1 (three coins), but 3 + 3 uses two.' },
  ],
  hidden: [
    { args: [[2], 3] },
    { args: [[1], 0] },
    { args: [[7], 14] },
    { args: [[186, 419, 83, 408], 6249] },
    { args: [[3, 7], 11] },
    { args: [[2, 5, 10, 25], 99] },
    { args: [ints(rng(731), 5, 5, 50), 997] },
    { args: [[9999, 10000], 9998] },
    { args: [[1, 7, 13, 29, 53, 97, 101, 211, 307, 401, 503, 997], 10000], stress: true },
    { args: [[2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24], 9999], stress: true },
  ],
  solutions: {
    python: 'INF = amount + 1\ndp = [0] + [INF] * amount\nfor a in range(1, amount + 1):\n    best = INF\n    for c in coins:\n        if c <= a and dp[a - c] + 1 < best:\n            best = dp[a - c] + 1\n    dp[a] = best\nreturn -1 if dp[amount] > amount else dp[amount]',
    javascript: 'const dp = new Array(amount + 1).fill(Infinity);\ndp[0] = 0;\nfor (let a = 1; a <= amount; a++) for (const c of coins) if (c <= a && dp[a - c] + 1 < dp[a]) dp[a] = dp[a - c] + 1;\nreturn dp[amount] === Infinity ? -1 : dp[amount];',
    java: 'int[] dp = new int[amount + 1];\nArrays.fill(dp, amount + 1);\ndp[0] = 0;\nfor (int a = 1; a <= amount; a++) for (int c : coins) if (c <= a) dp[a] = Math.min(dp[a], dp[a - c] + 1);\nreturn dp[amount] > amount ? -1 : dp[amount];',
    csharp: 'var dp = new int[amount + 1];\nArray.Fill(dp, amount + 1);\ndp[0] = 0;\nfor (int a = 1; a <= amount; a++) foreach (var c in coins) if (c <= a) dp[a] = Math.Min(dp[a], dp[a - c] + 1);\nreturn dp[amount] > amount ? -1 : dp[amount];',
    go: 'dp := make([]int, amount+1)\nfor a := 1; a <= amount; a++ {\n    dp[a] = amount + 1\n    for _, c := range coins {\n        if c <= a && dp[a-c]+1 < dp[a] {\n            dp[a] = dp[a-c] + 1\n        }\n    }\n}\nif dp[amount] > amount {\n    return -1\n}\nreturn dp[amount]',
    rust: 'let amount = amount as usize;\nlet mut dp = vec![amount + 1; amount + 1];\ndp[0] = 0;\nfor a in 1..=amount {\n    for &c in coins {\n        let c = c as usize;\n        if c <= a && dp[a - c] + 1 < dp[a] {\n            dp[a] = dp[a - c] + 1;\n        }\n    }\n}\nif dp[amount] > amount { -1 } else { dp[amount] as i32 }',
    cpp: 'vector<int> dp(amount + 1, amount + 1);\ndp[0] = 0;\nfor (int a = 1; a <= amount; a++) for (int c : coins) if (c <= a) dp[a] = min(dp[a], dp[a - c] + 1);\nreturn dp[amount] > amount ? -1 : dp[amount];',
    c: 'int *dp = malloc(sizeof(int) * (size_t)(amount + 1));\ndp[0] = 0;\nfor (int a = 1; a <= amount; a++) {\n    dp[a] = amount + 1;\n    for (int i = 0; i < coins_size; i++) if (coins[i] <= a && dp[a - coins[i]] + 1 < dp[a]) dp[a] = dp[a - coins[i]] + 1;\n}\nint res = dp[amount] > amount ? -1 : dp[amount];\nfree(dp);\nreturn res;',
  },
});

const lisOf = (a: number[]) => {
  const tails: number[] = [];
  for (const x of a) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (tails[m]! < x) lo = m + 1;
      else hi = m;
    }
    tails[lo] = x;
  }
  return tails.length;
};

const lengthOfLIS = coding({
  title: 'Longest Increasing Subsequence',
  statement: 'Return the length of the longest **strictly** increasing subsequence of `nums` (elements in order, not necessarily adjacent).\n\nO(n²) is too slow for the largest inputs; use the O(n log n) "tails + binary search" method.',
  constraints: '- 1 ≤ n ≤ 10^5\n- −10^9 ≤ nums[i] ≤ 10^9',
  difficulty: 'moderate',
  tags: ['dynamic-programming', 'binary-search'],
  timeComplexity: 'O(n log n)',
  spaceComplexity: 'O(n)',
  fn: 'lengthOfLIS',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  solve: (nums: number[]) => lisOf(nums),
  samples: [
    { args: [[10, 9, 2, 5, 3, 7, 101, 18]], explanation: 'For example 2, 3, 7, 101: length 4.' },
    { args: [[7, 7, 7, 7]], explanation: 'Equal values do not count as increasing: length 1.' },
  ],
  hidden: [
    { args: [[5]] },
    { args: [[1, 2]] },
    { args: [[2, 1]] },
    { args: [[0, 1, 0, 3, 2, 3]] },
    { args: [[4, 10, 4, 3, 8, 9]] },
    { args: [ints(rng(741), 1000, 0, 100)] },
    { args: [ints(rng(742), 5000, -1000000000, 1000000000)] },
    { args: [range(3000).reverse()] },
    { args: [range(100000)], stress: true },
    { args: [ints(rng(743), 100000, -1000000000, 1000000000)], stress: true },
  ],
  solutions: {
    python: { helpers: 'from bisect import bisect_left', body: 'tails = []\nfor x in nums:\n    i = bisect_left(tails, x)\n    if i == len(tails):\n        tails.append(x)\n    else:\n        tails[i] = x\nreturn len(tails)' },
    javascript: 'const tails = [];\nfor (const x of nums) {\n  let lo = 0, hi = tails.length;\n  while (lo < hi) {\n    const m = (lo + hi) >> 1;\n    if (tails[m] < x) lo = m + 1;\n    else hi = m;\n  }\n  tails[lo] = x;\n}\nreturn tails.length;',
    java: 'int[] tails = new int[nums.length];\nint len = 0;\nfor (int x : nums) {\n    int i = Arrays.binarySearch(tails, 0, len, x);\n    if (i < 0) i = -i - 1;\n    tails[i] = x;\n    if (i == len) len++;\n}\nreturn len;',
    csharp: 'var tails = new List<int>();\nforeach (var x in nums)\n{\n    int i = tails.BinarySearch(x);\n    if (i < 0) i = ~i;\n    if (i == tails.Count) tails.Add(x);\n    else tails[i] = x;\n}\nreturn tails.Count;',
    go: { imports: ['sort'], body: 'tails := []int{}\nfor _, x := range nums {\n    i := sort.SearchInts(tails, x)\n    if i == len(tails) {\n        tails = append(tails, x)\n    } else {\n        tails[i] = x\n    }\n}\nreturn len(tails)' },
    rust: 'let mut tails: Vec<i32> = Vec::new();\nfor &x in nums {\n    let i = tails.partition_point(|&t| t < x);\n    if i == tails.len() {\n        tails.push(x);\n    } else {\n        tails[i] = x;\n    }\n}\ntails.len() as i32',
    cpp: 'vector<int> tails;\nfor (int x : nums) {\n    auto it = lower_bound(tails.begin(), tails.end(), x);\n    if (it == tails.end()) tails.push_back(x);\n    else *it = x;\n}\nreturn tails.size();',
    c: 'int *tails = malloc(sizeof(int) * (size_t)nums_size);\nint len = 0;\nfor (int k = 0; k < nums_size; k++) {\n    int x = nums[k], lo = 0, hi = len;\n    while (lo < hi) {\n        int m = (lo + hi) / 2;\n        if (tails[m] < x) lo = m + 1;\n        else hi = m;\n    }\n    tails[lo] = x;\n    if (lo == len) len++;\n}\nfree(tails);\nreturn len;',
  },
});

const pathsOf = (grid: string[]) => {
  const c = grid[0]!.length;
  const dp = new Array(c).fill(0);
  dp[0] = grid[0]![0] === '0' ? 1 : 0;
  for (const row of grid)
    for (let j = 0; j < c; j++) {
      if (row[j] === '1') dp[j] = 0;
      else if (j > 0) dp[j] = (dp[j] + dp[j - 1]) % MOD;
    }
  return dp[c - 1];
};
const obstacleGrid = (r: Rng, rows: number, cols: number, p: number) =>
  Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => ((i === 0 && j === 0) || (i === rows - 1 && j === cols - 1) ? '0' : r() < p ? '1' : '0')).join(''));

const uniquePaths = coding({
  title: 'Grid Paths With Obstacles',
  statement:
    'A robot starts in the top-left cell of the grid and wants to reach the bottom-right cell, moving only **right** or **down**. Cells marked `1` are blocked, `0` are free. Return the number of distinct paths modulo **1 000 000 007** (0 if the start or end is blocked).',
  constraints: '- 1 ≤ rows, cols ≤ 300\n- Each row has the same length and contains only `0` and `1`.',
  difficulty: 'moderate',
  tags: ['dynamic-programming', 'grid'],
  timeComplexity: 'O(rows · cols)',
  spaceComplexity: 'O(cols)',
  fn: 'uniquePaths',
  params: [{ name: 'grid', type: 'string[]' }],
  returns: 'int',
  solve: (grid: string[]) => pathsOf(grid),
  samples: [
    { args: [['000', '010', '000']], explanation: 'Two paths go around the blocked centre: right-right-down-down and down-down-right-right.' },
    { args: [['01', '00']], explanation: 'Only down then right.' },
  ],
  hidden: [
    { args: [['0']] },
    { args: [['1']] },
    { args: [['00', '01']] },
    { args: [['0000000000']] },
    { args: [['0', '0', '0', '0']] },
    { args: [obstacleGrid(rng(751), 10, 10, 0.2)] },
    { args: [obstacleGrid(rng(752), 50, 80, 0.15)] },
    { args: [Array.from({ length: 30 }, () => '0'.repeat(30))] },
    { args: [Array.from({ length: 300 }, () => '0'.repeat(300))], stress: true },
    { args: [obstacleGrid(rng(753), 300, 300, 0.05)], stress: true },
  ],
  solutions: {
    python: 'M = 1_000_000_007\ncols = len(grid[0])\ndp = [0] * cols\ndp[0] = 1 if grid[0][0] == "0" else 0\nfor row in grid:\n    for j in range(cols):\n        if row[j] == "1":\n            dp[j] = 0\n        elif j:\n            dp[j] = (dp[j] + dp[j - 1]) % M\nreturn dp[-1]',
    javascript: "const M = 1000000007, cols = grid[0].length;\nconst dp = new Array(cols).fill(0);\ndp[0] = grid[0][0] === '0' ? 1 : 0;\nfor (const row of grid)\n  for (let j = 0; j < cols; j++) {\n    if (row[j] === '1') dp[j] = 0;\n    else if (j) dp[j] = (dp[j] + dp[j - 1]) % M;\n  }\nreturn dp[cols - 1];",
    java: 'final int M = 1_000_000_007;\nint cols = grid[0].length();\nint[] dp = new int[cols];\ndp[0] = grid[0].charAt(0) == \'0\' ? 1 : 0;\nfor (String row : grid)\n    for (int j = 0; j < cols; j++) {\n        if (row.charAt(j) == \'1\') dp[j] = 0;\n        else if (j > 0) dp[j] = (dp[j] + dp[j - 1]) % M;\n    }\nreturn dp[cols - 1];',
    csharp: 'const int M = 1_000_000_007;\nint cols = grid[0].Length;\nvar dp = new int[cols];\ndp[0] = grid[0][0] == \'0\' ? 1 : 0;\nforeach (var row in grid)\n    for (int j = 0; j < cols; j++)\n    {\n        if (row[j] == \'1\') dp[j] = 0;\n        else if (j > 0) dp[j] = (dp[j] + dp[j - 1]) % M;\n    }\nreturn dp[cols - 1];',
    go: 'const M = 1_000_000_007\ncols := len(grid[0])\ndp := make([]int, cols)\nif grid[0][0] == \'0\' {\n    dp[0] = 1\n}\nfor _, row := range grid {\n    for j := 0; j < cols; j++ {\n        if row[j] == \'1\' {\n            dp[j] = 0\n        } else if j > 0 {\n            dp[j] = (dp[j] + dp[j-1]) % M\n        }\n    }\n}\nreturn dp[cols-1]',
    rust: 'const M: i64 = 1_000_000_007;\nlet cols = grid[0].len();\nlet mut dp = vec![0i64; cols];\nif grid[0].as_bytes()[0] == b\'0\' {\n    dp[0] = 1;\n}\nfor row in grid {\n    let b = row.as_bytes();\n    for j in 0..cols {\n        if b[j] == b\'1\' {\n            dp[j] = 0;\n        } else if j > 0 {\n            dp[j] = (dp[j] + dp[j - 1]) % M;\n        }\n    }\n}\ndp[cols - 1] as i32',
    cpp: 'const int M = 1000000007;\nint cols = grid[0].size();\nvector<int> dp(cols);\ndp[0] = grid[0][0] == \'0\';\nfor (const string& row : grid)\n    for (int j = 0; j < cols; j++) {\n        if (row[j] == \'1\') dp[j] = 0;\n        else if (j) dp[j] = (dp[j] + dp[j - 1]) % M;\n    }\nreturn dp[cols - 1];',
    c: 'const int M = 1000000007;\nint cols = (int)strlen(grid[0]);\nint *dp = calloc((size_t)cols, sizeof(int));\ndp[0] = grid[0][0] == \'0\';\nfor (int i = 0; i < grid_size; i++)\n    for (int j = 0; j < cols; j++) {\n        if (grid[i][j] == \'1\') dp[j] = 0;\n        else if (j) dp[j] = (dp[j] + dp[j - 1]) % M;\n    }\nint res = dp[cols - 1];\nfree(dp);\nreturn res;',
  },
});

const lcsOf = (a: string, b: string) => {
  let prev = new Array(b.length + 1).fill(0);
  for (const ca of a) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = ca === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
};

const lcs = coding({
  title: 'Longest Common Subsequence',
  statement: 'Return the length of the longest sequence of characters that appears, in order but not necessarily contiguously, in both `a` and `b`.',
  constraints: '- 1 ≤ |a|, |b| ≤ 1000\n- a and b contain only lowercase English letters.',
  difficulty: 'moderate',
  tags: ['dynamic-programming', 'strings'],
  timeComplexity: 'O(|a| · |b|)',
  spaceComplexity: 'O(|b|)',
  fn: 'longestCommonSubsequence',
  params: [{ name: 'a', type: 'string' }, { name: 'b', type: 'string' }],
  returns: 'int',
  solve: (a: string, b: string) => lcsOf(a, b),
  samples: [
    { args: ['abcde', 'ace'], explanation: '"ace" appears in both, in order.' },
    { args: ['abc', 'def'], explanation: 'No common letters.' },
  ],
  hidden: [
    { args: ['a', 'a'] },
    { args: ['a', 'b'] },
    { args: ['abc', 'abc'] },
    { args: ['abcba', 'abcbcba'] },
    { args: ['bsbininm', 'jmjkbkjkv'] },
    { args: [word(rng(761), 300, 'abc'), word(rng(762), 400, 'abc')] },
    { args: [word(rng(763), 800, 'abcdefghijklmnopqrstuvwxyz'), word(rng(764), 700, 'abcdefghijklmnopqrstuvwxyz')] },
    { args: ['a'.repeat(1000), 'a'.repeat(999)] },
    { args: [word(rng(765), 1000, 'ab'), word(rng(766), 1000, 'ab')], stress: true },
    { args: [word(rng(767), 1000, 'abcdefghij'), word(rng(768), 1000, 'abcdefghij')], stress: true },
  ],
  baseTimeLimitMs: 2000,
  solutions: {
    python: 'm = len(b)\nprev = [0] * (m + 1)\nfor ca in a:\n    cur = [0] * (m + 1)\n    for j in range(1, m + 1):\n        if ca == b[j - 1]:\n            cur[j] = prev[j - 1] + 1\n        else:\n            cur[j] = prev[j] if prev[j] > cur[j - 1] else cur[j - 1]\n    prev = cur\nreturn prev[m]',
    javascript: 'const m = b.length;\nlet prev = new Int32Array(m + 1);\nfor (let i = 0; i < a.length; i++) {\n  const cur = new Int32Array(m + 1);\n  for (let j = 1; j <= m; j++) cur[j] = a[i] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);\n  prev = cur;\n}\nreturn prev[m];',
    java: 'int m = b.length();\nint[] prev = new int[m + 1], cur = new int[m + 1];\nfor (int i = 0; i < a.length(); i++) {\n    for (int j = 1; j <= m; j++) cur[j] = a.charAt(i) == b.charAt(j - 1) ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);\n    int[] t = prev; prev = cur; cur = t;\n}\nreturn prev[m];',
    csharp: 'int m = b.Length;\nvar prev = new int[m + 1];\nvar cur = new int[m + 1];\nfor (int i = 0; i < a.Length; i++)\n{\n    for (int j = 1; j <= m; j++) cur[j] = a[i] == b[j - 1] ? prev[j - 1] + 1 : Math.Max(prev[j], cur[j - 1]);\n    (prev, cur) = (cur, prev);\n}\nreturn prev[m];',
    go: 'm := len(b)\nprev, cur := make([]int, m+1), make([]int, m+1)\nfor i := 0; i < len(a); i++ {\n    for j := 1; j <= m; j++ {\n        if a[i] == b[j-1] {\n            cur[j] = prev[j-1] + 1\n        } else if prev[j] > cur[j-1] {\n            cur[j] = prev[j]\n        } else {\n            cur[j] = cur[j-1]\n        }\n    }\n    prev, cur = cur, prev\n}\nreturn prev[m]',
    rust: 'let (a, b) = (a.as_bytes(), b.as_bytes());\nlet m = b.len();\nlet mut prev = vec![0i32; m + 1];\nlet mut cur = vec![0i32; m + 1];\nfor &ca in a {\n    for j in 1..=m {\n        cur[j] = if ca == b[j - 1] { prev[j - 1] + 1 } else { prev[j].max(cur[j - 1]) };\n    }\n    std::mem::swap(&mut prev, &mut cur);\n}\nprev[m]',
    cpp: 'int m = b.size();\nvector<int> prev(m + 1), cur(m + 1);\nfor (char ca : a) {\n    for (int j = 1; j <= m; j++) cur[j] = ca == b[j - 1] ? prev[j - 1] + 1 : max(prev[j], cur[j - 1]);\n    swap(prev, cur);\n}\nreturn prev[m];',
    c: 'int n = (int)strlen(a), m = (int)strlen(b);\nint *prev = calloc((size_t)m + 1, sizeof(int)), *cur = calloc((size_t)m + 1, sizeof(int));\nfor (int i = 0; i < n; i++) {\n    for (int j = 1; j <= m; j++) cur[j] = a[i] == b[j - 1] ? prev[j - 1] + 1 : (prev[j] > cur[j - 1] ? prev[j] : cur[j - 1]);\n    int *t = prev; prev = cur; cur = t;\n}\nint res = prev[m];\nfree(prev);\nfree(cur);\nreturn res;',
  },
});

const editOf = (a: string, b: string) => {
  let prev = range(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! : 1 + Math.min(prev[j - 1]!, prev[j]!, cur[j - 1]!);
    prev = cur;
  }
  return prev[b.length]!;
};

const editDistance = coding({
  title: 'Edit Distance',
  statement: 'Return the minimum number of single-character operations — insert, delete or replace — that turn `a` into `b` (Levenshtein distance).',
  constraints: '- 1 ≤ |a|, |b| ≤ 1000\n- a and b contain only lowercase English letters.',
  difficulty: 'hard',
  tags: ['dynamic-programming', 'strings'],
  timeComplexity: 'O(|a| · |b|)',
  spaceComplexity: 'O(|b|)',
  fn: 'minDistance',
  params: [{ name: 'a', type: 'string' }, { name: 'b', type: 'string' }],
  returns: 'int',
  solve: (a: string, b: string) => editOf(a, b),
  samples: [
    { args: ['horse', 'ros'], explanation: 'horse → rorse (replace h) → rose (delete r) → ros (delete e).' },
    { args: ['intention', 'execution'], explanation: 'Five operations are needed.' },
  ],
  hidden: [
    { args: ['a', 'a'] },
    { args: ['a', 'b'] },
    { args: ['abc', 'a'] },
    { args: ['a', 'abc'] },
    { args: ['kitten', 'sitting'] },
    { args: [word(rng(771), 200, 'abc'), word(rng(772), 300, 'abc')] },
    { args: [word(rng(773), 700, 'abcdefghijklmnopqrstuvwxyz'), word(rng(774), 800, 'abcdefghijklmnopqrstuvwxyz')] },
    { args: ['a'.repeat(1000), 'b'.repeat(1000)] },
    { args: [word(rng(775), 1000, 'ab'), word(rng(776), 1000, 'ab')], stress: true },
    { args: [word(rng(777), 1000, 'abcdefghijklmnopqrstuvwxyz'), word(rng(778), 999, 'abcdefghijklmnopqrstuvwxyz')], stress: true },
  ],
  baseTimeLimitMs: 2000,
  solutions: {
    python: 'm = len(b)\nprev = list(range(m + 1))\nfor i in range(1, len(a) + 1):\n    cur = [i] + [0] * m\n    ca = a[i - 1]\n    for j in range(1, m + 1):\n        if ca == b[j - 1]:\n            cur[j] = prev[j - 1]\n        else:\n            x = prev[j - 1]\n            if prev[j] < x:\n                x = prev[j]\n            if cur[j - 1] < x:\n                x = cur[j - 1]\n            cur[j] = x + 1\n    prev = cur\nreturn prev[m]',
    javascript: 'const m = b.length;\nlet prev = Int32Array.from({ length: m + 1 }, (_, j) => j);\nfor (let i = 1; i <= a.length; i++) {\n  const cur = new Int32Array(m + 1);\n  cur[0] = i;\n  for (let j = 1; j <= m; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);\n  prev = cur;\n}\nreturn prev[m];',
    java: 'int m = b.length();\nint[] prev = new int[m + 1], cur = new int[m + 1];\nfor (int j = 0; j <= m; j++) prev[j] = j;\nfor (int i = 1; i <= a.length(); i++) {\n    cur[0] = i;\n    for (int j = 1; j <= m; j++)\n        cur[j] = a.charAt(i - 1) == b.charAt(j - 1) ? prev[j - 1] : 1 + Math.min(prev[j - 1], Math.min(prev[j], cur[j - 1]));\n    int[] t = prev; prev = cur; cur = t;\n}\nreturn prev[m];',
    csharp: 'int m = b.Length;\nvar prev = new int[m + 1];\nvar cur = new int[m + 1];\nfor (int j = 0; j <= m; j++) prev[j] = j;\nfor (int i = 1; i <= a.Length; i++)\n{\n    cur[0] = i;\n    for (int j = 1; j <= m; j++)\n        cur[j] = a[i - 1] == b[j - 1] ? prev[j - 1] : 1 + Math.Min(prev[j - 1], Math.Min(prev[j], cur[j - 1]));\n    (prev, cur) = (cur, prev);\n}\nreturn prev[m];',
    go: 'm := len(b)\nprev, cur := make([]int, m+1), make([]int, m+1)\nfor j := range prev {\n    prev[j] = j\n}\nfor i := 1; i <= len(a); i++ {\n    cur[0] = i\n    for j := 1; j <= m; j++ {\n        if a[i-1] == b[j-1] {\n            cur[j] = prev[j-1]\n            continue\n        }\n        x := prev[j-1]\n        if prev[j] < x {\n            x = prev[j]\n        }\n        if cur[j-1] < x {\n            x = cur[j-1]\n        }\n        cur[j] = x + 1\n    }\n    prev, cur = cur, prev\n}\nreturn prev[m]',
    rust: 'let (a, b) = (a.as_bytes(), b.as_bytes());\nlet m = b.len();\nlet mut prev: Vec<i32> = (0..=m as i32).collect();\nlet mut cur = vec![0i32; m + 1];\nfor i in 1..=a.len() {\n    cur[0] = i as i32;\n    for j in 1..=m {\n        cur[j] = if a[i - 1] == b[j - 1] { prev[j - 1] } else { 1 + prev[j - 1].min(prev[j]).min(cur[j - 1]) };\n    }\n    std::mem::swap(&mut prev, &mut cur);\n}\nprev[m]',
    cpp: 'int m = b.size();\nvector<int> prev(m + 1), cur(m + 1);\niota(prev.begin(), prev.end(), 0);\nfor (size_t i = 1; i <= a.size(); i++) {\n    cur[0] = i;\n    for (int j = 1; j <= m; j++) cur[j] = a[i - 1] == b[j - 1] ? prev[j - 1] : 1 + min({prev[j - 1], prev[j], cur[j - 1]});\n    swap(prev, cur);\n}\nreturn prev[m];',
    c: 'int n = (int)strlen(a), m = (int)strlen(b);\nint *prev = malloc(sizeof(int) * (size_t)(m + 1)), *cur = malloc(sizeof(int) * (size_t)(m + 1));\nfor (int j = 0; j <= m; j++) prev[j] = j;\nfor (int i = 1; i <= n; i++) {\n    cur[0] = i;\n    for (int j = 1; j <= m; j++) {\n        if (a[i - 1] == b[j - 1]) { cur[j] = prev[j - 1]; continue; }\n        int x = prev[j - 1];\n        if (prev[j] < x) x = prev[j];\n        if (cur[j - 1] < x) x = cur[j - 1];\n        cur[j] = x + 1;\n    }\n    int *t = prev; prev = cur; cur = t;\n}\nint res = prev[m];\nfree(prev);\nfree(cur);\nreturn res;',
  },
});

const jobsOf = (jobs: number[][]) => {
  const js = [...jobs].sort((x, y) => x[1]! - y[1]!);
  const ends = js.map((j) => j[1]!);
  const dp = [0];
  for (let i = 0; i < js.length; i++) {
    const [s, , p] = js[i]!;
    let lo = 0;
    let hi = i;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (ends[m]! <= s!) lo = m + 1;
      else hi = m;
    }
    dp.push(Math.max(dp[i]!, dp[lo]! + p!));
  }
  return dp[js.length]!;
};
const randomJobs = (r: Rng, n: number, maxT: number, maxLen: number, maxP: number) =>
  Array.from({ length: n }, () => {
    const s = int(r, 0, maxT);
    return [s, s + int(r, 1, maxLen), int(r, 1, maxP)];
  });

const jobScheduling = coding({
  title: 'Maximum Profit Job Scheduling',
  statement:
    'Each row of `jobs` is `start end profit`. Choose a set of jobs that do not overlap (a job may start exactly when another ends) to maximise the total profit, and return that profit.\n\nSort by end time; for each job, binary-search the last job that ends by its start.',
  constraints: '- 1 ≤ n ≤ 5·10^4\n- 0 ≤ start < end ≤ 10^9\n- 1 ≤ profit ≤ 10^4',
  difficulty: 'hard',
  tags: ['dynamic-programming', 'binary-search', 'sorting'],
  timeComplexity: 'O(n log n)',
  spaceComplexity: 'O(n)',
  fn: 'jobScheduling',
  params: [{ name: 'jobs', type: 'int[][]' }],
  returns: 'long',
  solve: (jobs: number[][]) => jobsOf(jobs),
  samples: [
    { args: [[[1, 3, 50], [2, 4, 10], [3, 5, 40], [3, 6, 70]]], explanation: 'Jobs [1,3] and [3,6]: 50 + 70 = 120.' },
    { args: [[[1, 2, 5], [1, 3, 6], [2, 4, 7]]], explanation: '[1,2] then [2,4]: 5 + 7 = 12.' },
  ],
  hidden: [
    { args: [[[0, 1, 1]]] },
    { args: [[[1, 5, 10], [2, 3, 3], [3, 4, 3], [4, 5, 3]]] },
    { args: [[[1, 2, 1], [2, 3, 1], [3, 4, 1]]] },
    { args: [[[1, 10, 100], [1, 10, 99]]] },
    { args: [[[0, 1000000000, 10000], [0, 1, 9999], [1, 1000000000, 2]]] },
    { args: [randomJobs(rng(781), 200, 1000, 50, 100)] },
    { args: [randomJobs(rng(782), 3000, 1000000, 5000, 10000)] },
    { args: [range(2000).map((i) => [i, i + 1, 10000])] },
    { args: [randomJobs(rng(783), 50000, 1000000000, 100000, 10000)], stress: true },
    { args: [randomJobs(rng(784), 50000, 100000, 50, 10000)], stress: true },
  ],
  solutions: {
    python: {
      helpers: 'from bisect import bisect_right',
      body: 'js = sorted(jobs, key=lambda j: j[1])\nends = [j[1] for j in js]\ndp = [0] * (len(js) + 1)\nfor i, (s, e, p) in enumerate(js):\n    k = bisect_right(ends, s, 0, i)\n    dp[i + 1] = max(dp[i], dp[k] + p)\nreturn dp[-1]',
    },
    javascript: 'const js = jobs.slice().sort((x, y) => x[1] - y[1]);\nconst dp = new Array(js.length + 1).fill(0);\nfor (let i = 0; i < js.length; i++) {\n  const s = js[i][0];\n  let lo = 0, hi = i;\n  while (lo < hi) {\n    const m = (lo + hi) >> 1;\n    if (js[m][1] <= s) lo = m + 1;\n    else hi = m;\n  }\n  dp[i + 1] = Math.max(dp[i], dp[lo] + js[i][2]);\n}\nreturn dp[js.length];',
    java: 'int[][] js = jobs.clone();\nArrays.sort(js, (x, y) -> Integer.compare(x[1], y[1]));\nlong[] dp = new long[js.length + 1];\nfor (int i = 0; i < js.length; i++) {\n    int s = js[i][0], lo = 0, hi = i;\n    while (lo < hi) {\n        int m = (lo + hi) >>> 1;\n        if (js[m][1] <= s) lo = m + 1;\n        else hi = m;\n    }\n    dp[i + 1] = Math.max(dp[i], dp[lo] + js[i][2]);\n}\nreturn dp[js.length];',
    csharp: 'var js = jobs.OrderBy(j => j[1]).ToArray();\nvar dp = new long[js.Length + 1];\nfor (int i = 0; i < js.Length; i++)\n{\n    int s = js[i][0], lo = 0, hi = i;\n    while (lo < hi)\n    {\n        int m = (lo + hi) >> 1;\n        if (js[m][1] <= s) lo = m + 1;\n        else hi = m;\n    }\n    dp[i + 1] = Math.Max(dp[i], dp[lo] + js[i][2]);\n}\nreturn dp[js.Length];',
    go: {
      imports: ['sort'],
      body: 'js := make([][]int, len(jobs))\ncopy(js, jobs)\nsort.Slice(js, func(a, b int) bool { return js[a][1] < js[b][1] })\ndp := make([]int64, len(js)+1)\nfor i := range js {\n    s := js[i][0]\n    lo := sort.Search(i, func(m int) bool { return js[m][1] > s })\n    dp[i+1] = dp[i]\n    if v := dp[lo] + int64(js[i][2]); v > dp[i+1] {\n        dp[i+1] = v\n    }\n}\nreturn dp[len(js)]',
    },
    rust: 'let mut js: Vec<Vec<i32>> = jobs.to_vec();\njs.sort_by_key(|j| j[1]);\nlet mut dp = vec![0i64; js.len() + 1];\nfor i in 0..js.len() {\n    let s = js[i][0];\n    let lo = js[..i].partition_point(|j| j[1] <= s);\n    dp[i + 1] = dp[i].max(dp[lo] + js[i][2] as i64);\n}\ndp[js.len()]',
    cpp: 'vector<vector<int>> js = jobs;\nsort(js.begin(), js.end(), [](const vector<int>& x, const vector<int>& y) { return x[1] < y[1]; });\nvector<long long> dp(js.size() + 1);\nfor (size_t i = 0; i < js.size(); i++) {\n    int s = js[i][0];\n    size_t lo = partition_point(js.begin(), js.begin() + i, [s](const vector<int>& j) { return j[1] <= s; }) - js.begin();\n    dp[i + 1] = max(dp[i], dp[lo] + js[i][2]);\n}\nreturn dp[js.size()];',
    c: {
      helpers: 'static int cmp_end(const void *a, const void *b) {\n    const int *x = *(const int *const *)a, *y = *(const int *const *)b;\n    return (x[1] > y[1]) - (x[1] < y[1]);\n}',
      body: 'int n = jobs_rows;\nint **js = malloc(sizeof(int *) * (size_t)n);\nfor (int i = 0; i < n; i++) js[i] = jobs[i];\nqsort(js, (size_t)n, sizeof(int *), cmp_end);\nlong long *dp = calloc((size_t)n + 1, sizeof(long long));\nfor (int i = 0; i < n; i++) {\n    int s = js[i][0], lo = 0, hi = i;\n    while (lo < hi) {\n        int m = (lo + hi) / 2;\n        if (js[m][1] <= s) lo = m + 1;\n        else hi = m;\n    }\n    long long take = dp[lo] + js[i][2];\n    dp[i + 1] = take > dp[i] ? take : dp[i];\n}\nlong long res = dp[n];\nfree(js);\nfree(dp);\nreturn res;',
    },
  },
});

export const DP: CodingQuestionInput[] = [climbStairs, houseRobber, minCostClimbing, maxSubarray, coinChange, lengthOfLIS, uniquePaths, lcs, editDistance, jobScheduling];
