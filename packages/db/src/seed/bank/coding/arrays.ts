import type { CodingQuestionInput } from '@hbe/shared';
import { sumArray } from '../../questions/sum-array.js';
import { coding, int, ints, range, rng, shuffle } from './define.js';
import { C_CMP_INT, C_COPY, C_HMAP, join } from './snippets.js';

const containsDuplicate = coding({
  title: 'Contains Duplicate',
  statement: 'Given an array of integers `nums`, return **true** if any value appears at least twice, and **false** if every element is distinct.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- −10^9 ≤ nums[i] ≤ 10^9',
  difficulty: 'easy',
  tags: ['arrays', 'hashing'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'containsDuplicate',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'bool',
  solve: (nums: number[]) => new Set(nums).size !== nums.length,
  samples: [
    { args: [[1, 2, 3, 1]], explanation: 'The value 1 appears twice.' },
    { args: [[4, -2, 7, 0]], explanation: 'All four values are different.' },
  ],
  hidden: [
    { args: [[42]] },
    { args: [[5, 5]] },
    { args: [[-1000000000, 1000000000]] },
    { args: [range(1000, -500)] },
    { args: [[...range(999, 1), 500]] },
    { args: [ints(rng(101), 5000, -1000000000, 1000000000)] },
    { args: [ints(rng(102), 3000, 0, 1000)] },
    { args: [[0, 0, 0, 0, 0, 0]] },
    { args: [shuffle(rng(103), range(200000, -100000))], stress: true },
    { args: [[...shuffle(rng(104), range(199999, 1)), 77777]], stress: true },
  ],
  solutions: {
    python: 'return len(set(nums)) != len(nums)',
    javascript: 'return new Set(nums).size !== nums.length;',
    java: 'HashSet<Integer> seen = new HashSet<>();\nfor (int x : nums) if (!seen.add(x)) return true;\nreturn false;',
    csharp: 'var seen = new HashSet<int>();\nforeach (var x in nums) if (!seen.Add(x)) return true;\nreturn false;',
    go: 'seen := make(map[int]bool, len(nums))\nfor _, x := range nums {\n    if seen[x] {\n        return true\n    }\n    seen[x] = true\n}\nreturn false',
    rust: 'let mut seen = std::collections::HashSet::new();\nfor &x in nums {\n    if !seen.insert(x) {\n        return true;\n    }\n}\nfalse',
    cpp: 'unordered_set<int> seen;\nseen.reserve(nums.size() * 2);\nfor (int x : nums) if (!seen.insert(x).second) return true;\nreturn false;',
    c: {
      helpers: join(C_CMP_INT, C_COPY),
      body: 'int *a = copy_ints(nums, nums_size);\nqsort(a, (size_t)nums_size, sizeof(int), cmp_int);\nbool dup = false;\nfor (int i = 1; i < nums_size; i++) if (a[i] == a[i - 1]) { dup = true; break; }\nfree(a);\nreturn dup;',
    },
  },
});

const runningSum = coding({
  title: 'Running Sum',
  statement: 'Return an array `res` where `res[i]` is the sum of `nums[0..i]` (the running total after each element).',
  constraints: '- 1 ≤ n ≤ 2.5·10^4\n- −10^9 ≤ nums[i] ≤ 10^9\n- Use 64-bit integers: totals can exceed 2^31.',
  difficulty: 'easy',
  tags: ['arrays', 'prefix-sums'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'runningSum',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'long[]',
  solve: (nums: number[]) => {
    let s = 0;
    return nums.map((x) => (s += x));
  },
  samples: [
    { args: [[1, 2, 3, 4]], explanation: '1, 1+2, 1+2+3, 1+2+3+4.' },
    { args: [[5, -5, 5]], explanation: 'Negative numbers lower the total: 5, 0, 5.' },
  ],
  hidden: [
    { args: [[7]] },
    { args: [[-3, -3, -3]] },
    { args: [Array(30).fill(1000000000)] },
    { args: [Array(30).fill(-1000000000)] },
    { args: [[0, 0, 0, 1]] },
    { args: [ints(rng(111), 100, -100, 100)] },
    { args: [ints(rng(112), 2000, -1000000000, 1000000000)] },
    { args: [range(500, 1)] },
    { args: [Array(25000).fill(1000000000)], stress: true },
    { args: [ints(rng(113), 25000, -1000000000, 1000000000)], stress: true },
  ],
  solutions: {
    python: 'res = []\ns = 0\nfor x in nums:\n    s += x\n    res.append(s)\nreturn res',
    javascript: 'const res = new Array(nums.length);\nlet s = 0;\nfor (let i = 0; i < nums.length; i++) {\n  s += nums[i];\n  res[i] = s;\n}\nreturn res;',
    java: 'long[] res = new long[nums.length];\nlong s = 0;\nfor (int i = 0; i < nums.length; i++) { s += nums[i]; res[i] = s; }\nreturn res;',
    csharp: 'var res = new long[nums.Length];\nlong s = 0;\nfor (int i = 0; i < nums.Length; i++) { s += nums[i]; res[i] = s; }\nreturn res;',
    go: 'res := make([]int64, len(nums))\nvar s int64\nfor i, x := range nums {\n    s += int64(x)\n    res[i] = s\n}\nreturn res',
    rust: 'let mut s: i64 = 0;\nnums.iter().map(|&x| { s += x as i64; s }).collect()',
    cpp: 'vector<long long> res(nums.size());\nlong long s = 0;\nfor (size_t i = 0; i < nums.size(); i++) { s += nums[i]; res[i] = s; }\nreturn res;',
    c: 'long long *res = malloc(sizeof(long long) * (size_t)(nums_size > 0 ? nums_size : 1));\nlong long s = 0;\nfor (int i = 0; i < nums_size; i++) { s += nums[i]; res[i] = s; }\n*return_size = nums_size;\nreturn res;',
  },
});

const rotateRight = coding({
  title: 'Rotate Array Right',
  statement: 'Rotate `nums` to the right by `k` steps and return the result: the element at index `i` moves to index `(i + k) mod n`.\n\n`k` can be much larger than the array length.',
  constraints: '- 1 ≤ n ≤ 4·10^4\n- 0 ≤ k ≤ 10^9\n- −10^9 ≤ nums[i] ≤ 10^9',
  difficulty: 'easy',
  tags: ['arrays', 'modular-arithmetic'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'rotateRight',
  params: [{ name: 'nums', type: 'int[]' }, { name: 'k', type: 'int' }],
  returns: 'int[]',
  solve: (nums: number[], k: number) => {
    const n = nums.length;
    const s = k % n;
    return [...nums.slice(n - s), ...nums.slice(0, n - s)];
  },
  samples: [
    { args: [[1, 2, 3, 4, 5], 2], explanation: 'The last two elements move to the front.' },
    { args: [[10, 20, 30], 7], explanation: 'Rotating by 7 is the same as rotating by 7 mod 3 = 1.' },
  ],
  hidden: [
    { args: [[9], 1000000000] },
    { args: [[1, 2], 0] },
    { args: [[1, 2, 3, 4], 4] },
    { args: [[1, 2, 3, 4], 3] },
    { args: [range(100), 99] },
    { args: [ints(rng(121), 1000, -1000000000, 1000000000), 123456789] },
    { args: [range(10, -5), 15] },
    { args: [ints(rng(122), 37, 0, 9), 1] },
    { args: [ints(rng(123), 40000, -1000000000, 1000000000), 999999937], stress: true },
    { args: [range(40000), 20000], stress: true },
  ],
  solutions: {
    python: 'n = len(nums)\ns = k % n\nreturn nums[n - s:] + nums[:n - s]',
    javascript: 'const n = nums.length;\nconst s = k % n;\nreturn nums.slice(n - s).concat(nums.slice(0, n - s));',
    java: 'int n = nums.length;\nint s = k % n;\nint[] res = new int[n];\nfor (int i = 0; i < n; i++) res[(i + s) % n] = nums[i];\nreturn res;',
    csharp: 'int n = nums.Length;\nint s = k % n;\nvar res = new int[n];\nfor (int i = 0; i < n; i++) res[(i + s) % n] = nums[i];\nreturn res;',
    go: 'n := len(nums)\ns := k % n\nres := make([]int, n)\nfor i, x := range nums {\n    res[(i+s)%n] = x\n}\nreturn res',
    rust: 'let n = nums.len();\nlet s = (k as usize) % n;\nlet mut res = vec![0; n];\nfor (i, &x) in nums.iter().enumerate() {\n    res[(i + s) % n] = x;\n}\nres',
    cpp: 'int n = nums.size();\nint s = k % n;\nvector<int> res(n);\nfor (int i = 0; i < n; i++) res[(i + s) % n] = nums[i];\nreturn res;',
    c: 'int n = nums_size;\nint s = k % n;\nint *res = malloc(sizeof(int) * (size_t)n);\nfor (int i = 0; i < n; i++) res[(i + s) % n] = nums[i];\n*return_size = n;\nreturn res;',
  },
});

/** A random array that contains at least one pair summing to `target`. */
function twoSumCase(seed: number, n: number, lo: number, hi: number): [number[], number] {
  const r = rng(seed);
  const nums = ints(r, n, lo, hi);
  const i = int(r, 0, n - 1);
  let j = int(r, 0, n - 1);
  if (j === i) j = (i + 1) % n;
  return [nums, nums[i]! + nums[j]!];
}

const twoSum = coding({
  title: 'Two Sum',
  statement:
    'Given an array `nums` and an integer `target`, return the indices `[i, j]` (0-based, `i < j`) of two elements that add up to `target`.\n\n' +
    'At least one such pair exists. If there are several, return the pair with the **smallest `j`**; among those, the **smallest `i`**.',
  constraints: '- 2 ≤ n ≤ 2·10^5\n- −10^8 ≤ nums[i] ≤ 10^8\n- −2·10^8 ≤ target ≤ 2·10^8\n- At least one valid pair exists.',
  difficulty: 'moderate',
  tags: ['arrays', 'hashing'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'twoSum',
  params: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }],
  returns: 'int[]',
  solve: (nums: number[], target: number) => {
    const seen = new Map<number, number>();
    for (let j = 0; j < nums.length; j++) {
      const i = seen.get(target - nums[j]!);
      if (i !== undefined) return [i, j];
      if (!seen.has(nums[j]!)) seen.set(nums[j]!, j);
    }
    return [];
  },
  samples: [
    { args: [[2, 7, 11, 15], 9], explanation: 'nums[0] + nums[1] = 2 + 7 = 9.' },
    { args: [[3, 3, 4, 2], 6], explanation: 'Both 3 + 3 (indices 0, 1) and 4 + 2 (indices 2, 3) work; [0, 1] has the smaller j.' },
  ],
  hidden: [
    { args: [[1, 1], 2] },
    { args: [[-5, 10, 15], 5] },
    { args: [[5, 1, 5, 1, 5], 10] },
    { args: [[0, 4, 3, 0], 0] },
    { args: [[100000000, -100000000, 7], 0] },
    { args: twoSumCase(131, 50, -20, 20) },
    { args: twoSumCase(132, 1000, -100000000, 100000000) },
    { args: twoSumCase(133, 5000, -1000, 1000) },
    { args: [[...range(1000, 1), 5000, 3000], 8000] },
    { args: [[...range(199998).map((x) => 2 * x), 1, 3], 4], stress: true },
    { args: twoSumCase(134, 200000, -100000000, 100000000), stress: true },
  ],
  solutions: {
    python: 'seen = {}\nfor j, x in enumerate(nums):\n    i = seen.get(target - x)\n    if i is not None:\n        return [i, j]\n    if x not in seen:\n        seen[x] = j\nreturn []',
    javascript: 'const seen = new Map();\nfor (let j = 0; j < nums.length; j++) {\n  const i = seen.get(target - nums[j]);\n  if (i !== undefined) return [i, j];\n  if (!seen.has(nums[j])) seen.set(nums[j], j);\n}\nreturn [];',
    java: 'HashMap<Integer, Integer> seen = new HashMap<>();\nfor (int j = 0; j < nums.length; j++) {\n    Integer i = seen.get(target - nums[j]);\n    if (i != null) return new int[] { i, j };\n    seen.putIfAbsent(nums[j], j);\n}\nreturn new int[0];',
    csharp: 'var seen = new Dictionary<int, int>();\nfor (int j = 0; j < nums.Length; j++)\n{\n    if (seen.TryGetValue(target - nums[j], out int i)) return new[] { i, j };\n    seen.TryAdd(nums[j], j);\n}\nreturn new int[0];',
    go: 'seen := make(map[int]int, len(nums))\nfor j, x := range nums {\n    if i, ok := seen[target-x]; ok {\n        return []int{i, j}\n    }\n    if _, ok := seen[x]; !ok {\n        seen[x] = j\n    }\n}\nreturn nil',
    rust: 'let mut seen = std::collections::HashMap::new();\nfor (j, &x) in nums.iter().enumerate() {\n    if let Some(&i) = seen.get(&(target - x)) {\n        return vec![i as i32, j as i32];\n    }\n    seen.entry(x).or_insert(j);\n}\nvec![]',
    cpp: 'unordered_map<int, int> seen;\nseen.reserve(nums.size() * 2);\nfor (int j = 0; j < (int)nums.size(); j++) {\n    auto it = seen.find(target - nums[j]);\n    if (it != seen.end()) return {it->second, j};\n    seen.emplace(nums[j], j);\n}\nreturn {};',
    c: {
      helpers: C_HMAP,
      body: 'hmap m;\nhm_init(&m, (size_t)nums_size);\nint *res = malloc(sizeof(int) * 2);\n*return_size = 0;\nfor (int j = 0; j < nums_size; j++) {\n    long long *i = hm_get(&m, (long long)target - nums[j]);\n    if (i) { res[0] = (int)*i; res[1] = j; *return_size = 2; break; }\n    if (!hm_get(&m, nums[j])) *hm_put(&m, nums[j]) = j;\n}\nhm_free(&m);\nreturn res;',
    },
  },
});

const longestConsecutive = coding({
  title: 'Longest Consecutive Run',
  statement:
    'Return the length of the longest run of consecutive integers (x, x+1, x+2, …) whose values all appear in `nums`. The values can appear in any order, and duplicates count once.\n\nAim for O(n) time.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- −10^9 ≤ nums[i] ≤ 10^9',
  difficulty: 'moderate',
  tags: ['arrays', 'hashing'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'longestConsecutive',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  solve: (nums: number[]) => {
    const s = new Set(nums);
    let best = 0;
    for (const x of s) {
      if (s.has(x - 1)) continue;
      let y = x;
      while (s.has(y + 1)) y++;
      best = Math.max(best, y - x + 1);
    }
    return best;
  },
  samples: [
    { args: [[100, 4, 200, 1, 3, 2]], explanation: 'The values 1, 2, 3, 4 form a run of length 4.' },
    { args: [[0, 3, 7, 2, 5, 8, 4, 6, 0, 1]], explanation: '0 through 8 are all present (0 twice): length 9.' },
  ],
  hidden: [
    { args: [[5]] },
    { args: [[2, 2, 2]] },
    { args: [[-1000000000, 1000000000]] },
    { args: [[-2, -1, 0, 1, 2]] },
    { args: [[10, 30, 20]] },
    { args: [ints(rng(141), 1000, 0, 2000)] },
    { args: [ints(rng(142), 5000, -1000000000, 1000000000)] },
    { args: [[...shuffle(rng(143), range(300, 1000)), ...shuffle(rng(144), range(500, -5000))]] },
    { args: [shuffle(rng(145), range(200000, -100000))], stress: true },
    { args: [ints(rng(146), 200000, 0, 400000)], stress: true },
  ],
  solutions: {
    python: 's = set(nums)\nbest = 0\nfor x in s:\n    if x - 1 not in s:\n        y = x\n        while y + 1 in s:\n            y += 1\n        best = max(best, y - x + 1)\nreturn best',
    javascript: 'const s = new Set(nums);\nlet best = 0;\nfor (const x of s) {\n  if (s.has(x - 1)) continue;\n  let y = x;\n  while (s.has(y + 1)) y++;\n  best = Math.max(best, y - x + 1);\n}\nreturn best;',
    java: 'HashSet<Integer> s = new HashSet<>();\nfor (int x : nums) s.add(x);\nint best = 0;\nfor (int x : s) {\n    if (s.contains(x - 1)) continue;\n    int y = x;\n    while (s.contains(y + 1)) y++;\n    best = Math.max(best, y - x + 1);\n}\nreturn best;',
    csharp: 'var s = new HashSet<int>(nums);\nint best = 0;\nforeach (var x in s)\n{\n    if (s.Contains(x - 1)) continue;\n    int y = x;\n    while (s.Contains(y + 1)) y++;\n    best = Math.Max(best, y - x + 1);\n}\nreturn best;',
    go: 's := make(map[int]bool, len(nums))\nfor _, x := range nums {\n    s[x] = true\n}\nbest := 0\nfor x := range s {\n    if s[x-1] {\n        continue\n    }\n    y := x\n    for s[y+1] {\n        y++\n    }\n    if y-x+1 > best {\n        best = y - x + 1\n    }\n}\nreturn best',
    rust: 'let s: std::collections::HashSet<i32> = nums.iter().copied().collect();\nlet mut best = 0;\nfor &x in &s {\n    if s.contains(&(x - 1)) {\n        continue;\n    }\n    let mut y = x;\n    while s.contains(&(y + 1)) {\n        y += 1;\n    }\n    best = best.max(y - x + 1);\n}\nbest',
    cpp: 'unordered_set<int> s(nums.begin(), nums.end());\nint best = 0;\nfor (int x : s) {\n    if (s.count(x - 1)) continue;\n    int y = x;\n    while (s.count(y + 1)) y++;\n    best = max(best, y - x + 1);\n}\nreturn best;',
    c: {
      helpers: join(C_CMP_INT, C_COPY),
      body: 'int *a = copy_ints(nums, nums_size);\nqsort(a, (size_t)nums_size, sizeof(int), cmp_int);\nint best = 1, run = 1;\nfor (int i = 1; i < nums_size; i++) {\n    if (a[i] == a[i - 1]) continue;\n    run = (a[i] == a[i - 1] + 1) ? run + 1 : 1;\n    if (run > best) best = run;\n}\nfree(a);\nreturn best;',
    },
  },
});

const subarraySumK = coding({
  title: 'Subarrays With Sum K',
  statement: 'Count the contiguous, non-empty subarrays of `nums` whose elements add up to exactly `k`.\n\nThe count can exceed 2^31, so return a 64-bit integer.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- −1000 ≤ nums[i] ≤ 1000\n- −10^6 ≤ k ≤ 10^6',
  difficulty: 'moderate',
  tags: ['arrays', 'prefix-sums', 'hashing'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'countSubarrays',
  params: [{ name: 'nums', type: 'int[]' }, { name: 'k', type: 'int' }],
  returns: 'long',
  solve: (nums: number[], k: number) => {
    const seen = new Map<number, number>([[0, 1]]);
    let prefix = 0;
    let count = 0;
    for (const x of nums) {
      prefix += x;
      count += seen.get(prefix - k) ?? 0;
      seen.set(prefix, (seen.get(prefix) ?? 0) + 1);
    }
    return count;
  },
  samples: [
    { args: [[1, 1, 1], 2], explanation: '[1, 1] starting at index 0 and [1, 1] starting at index 1.' },
    { args: [[3, 4, -7, 3, 1, 3, 1, -4], 7], explanation: 'Three subarrays add up to 7: [3, 4], [3, 4, −7, 3, 1, 3] and [3, 1, 3]. Negative values make sliding windows fail here.' },
  ],
  hidden: [
    { args: [[5], 5] },
    { args: [[5], -5] },
    { args: [[0, 0, 0, 0], 0] },
    { args: [[1, -1, 1, -1, 1], 0] },
    { args: [[-1000, 1000, -1000], -1000] },
    { args: [ints(rng(151), 500, -10, 10), 5] },
    { args: [ints(rng(152), 3000, -1000, 1000), 1000] },
    { args: [ints(rng(153), 2000, 0, 3), 30] },
    { args: [Array(200000).fill(0), 0], stress: true },
    { args: [ints(rng(154), 200000, -1000, 1000), 777], stress: true },
  ],
  solutions: {
    python: 'count = 0\nprefix = 0\nseen = {0: 1}\nfor x in nums:\n    prefix += x\n    count += seen.get(prefix - k, 0)\n    seen[prefix] = seen.get(prefix, 0) + 1\nreturn count',
    javascript: 'const seen = new Map([[0, 1]]);\nlet prefix = 0;\nlet count = 0;\nfor (const x of nums) {\n  prefix += x;\n  count += seen.get(prefix - k) ?? 0;\n  seen.set(prefix, (seen.get(prefix) ?? 0) + 1);\n}\nreturn count;',
    java: 'HashMap<Long, Integer> seen = new HashMap<>();\nseen.put(0L, 1);\nlong prefix = 0, count = 0;\nfor (int x : nums) {\n    prefix += x;\n    count += seen.getOrDefault(prefix - k, 0);\n    seen.merge(prefix, 1, Integer::sum);\n}\nreturn count;',
    csharp: 'var seen = new Dictionary<long, int> { [0] = 1 };\nlong prefix = 0, count = 0;\nforeach (var x in nums)\n{\n    prefix += x;\n    if (seen.TryGetValue(prefix - k, out int c)) count += c;\n    seen[prefix] = seen.GetValueOrDefault(prefix) + 1;\n}\nreturn count;',
    go: 'seen := map[int64]int64{0: 1}\nvar prefix, count int64\nfor _, x := range nums {\n    prefix += int64(x)\n    count += seen[prefix-int64(k)]\n    seen[prefix]++\n}\nreturn count',
    rust: 'let mut seen = std::collections::HashMap::new();\nseen.insert(0i64, 1i64);\nlet (mut prefix, mut count) = (0i64, 0i64);\nfor &x in nums {\n    prefix += x as i64;\n    count += seen.get(&(prefix - k as i64)).copied().unwrap_or(0);\n    *seen.entry(prefix).or_insert(0) += 1;\n}\ncount',
    cpp: 'unordered_map<long long, long long> seen;\nseen.reserve(nums.size() * 2);\nseen[0] = 1;\nlong long prefix = 0, count = 0;\nfor (int x : nums) {\n    prefix += x;\n    auto it = seen.find(prefix - k);\n    if (it != seen.end()) count += it->second;\n    seen[prefix]++;\n}\nreturn count;',
    c: {
      helpers: C_HMAP,
      body: 'hmap m;\nhm_init(&m, (size_t)nums_size + 1);\n*hm_put(&m, 0) = 1;\nlong long prefix = 0, count = 0;\nfor (int i = 0; i < nums_size; i++) {\n    prefix += nums[i];\n    long long *c = hm_get(&m, prefix - k);\n    if (c) count += *c;\n    *hm_put(&m, prefix) += 1;\n}\nhm_free(&m);\nreturn count;',
    },
  },
});

const topKFrequent = coding({
  title: 'Top K Frequent Values',
  statement:
    'Return the `k` values that occur most often in `nums`, from most to least frequent. Values with the same frequency are ordered by value, smallest first.\n\n`k` is at most the number of distinct values.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- −10^9 ≤ nums[i] ≤ 10^9\n- 1 ≤ k ≤ number of distinct values in nums',
  difficulty: 'moderate',
  tags: ['arrays', 'hashing', 'sorting'],
  timeComplexity: 'O(n log n)',
  spaceComplexity: 'O(n)',
  fn: 'topKFrequent',
  params: [{ name: 'nums', type: 'int[]' }, { name: 'k', type: 'int' }],
  returns: 'int[]',
  solve: (nums: number[], k: number) => {
    const c = new Map<number, number>();
    for (const x of nums) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, k).map((e) => e[0]);
  },
  samples: [
    { args: [[1, 1, 1, 2, 2, 3], 2], explanation: '1 appears three times and 2 twice.' },
    { args: [[4, 4, -1, -1, 9], 3], explanation: '4 and −1 both appear twice; −1 is smaller so it comes first. Then 9.' },
  ],
  hidden: [
    { args: [[7], 1] },
    { args: [[3, 2, 1], 3] },
    { args: [[5, 5, 5, 5], 1] },
    { args: [[2, 2, 1, 1, 0, 0], 2] },
    { args: [ints(rng(161), 1000, 0, 20), 5] },
    { args: [ints(rng(162), 5000, -50, 50), 10] },
    { args: [ints(rng(163), 3000, -1000000000, 1000000000), 3] },
    { args: [[...range(100), ...range(50), ...range(10)], 15] },
    { args: [ints(rng(164), 200000, 0, 5000), 100], stress: true },
    { args: [shuffle(rng(165), range(200000, -100000)), 1000], stress: true },
  ],
  solutions: {
    python: { helpers: 'from collections import Counter', body: 'cnt = Counter(nums)\nreturn [v for v, _ in sorted(cnt.items(), key=lambda p: (-p[1], p[0]))[:k]]' },
    javascript: 'const c = new Map();\nfor (const x of nums) c.set(x, (c.get(x) ?? 0) + 1);\nreturn [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, k).map((e) => e[0]);',
    java: 'HashMap<Integer, Integer> c = new HashMap<>();\nfor (int x : nums) c.merge(x, 1, Integer::sum);\nList<int[]> e = new ArrayList<>();\nfor (Map.Entry<Integer, Integer> x : c.entrySet()) e.add(new int[] { x.getKey(), x.getValue() });\ne.sort((a, b) -> a[1] != b[1] ? Integer.compare(b[1], a[1]) : Integer.compare(a[0], b[0]));\nint[] res = new int[k];\nfor (int i = 0; i < k; i++) res[i] = e.get(i)[0];\nreturn res;',
    csharp: 'var c = new Dictionary<int, int>();\nforeach (var x in nums) c[x] = c.GetValueOrDefault(x) + 1;\nreturn c.OrderByDescending(p => p.Value).ThenBy(p => p.Key).Take(k).Select(p => p.Key).ToArray();',
    go: {
      imports: ['sort'],
      body: 'c := map[int]int{}\nfor _, x := range nums {\n    c[x]++\n}\nkeys := make([]int, 0, len(c))\nfor v := range c {\n    keys = append(keys, v)\n}\nsort.Slice(keys, func(a, b int) bool {\n    if c[keys[a]] != c[keys[b]] {\n        return c[keys[a]] > c[keys[b]]\n    }\n    return keys[a] < keys[b]\n})\nreturn keys[:k]',
    },
    rust: 'let mut c = std::collections::HashMap::new();\nfor &x in nums {\n    *c.entry(x).or_insert(0) += 1;\n}\nlet mut e: Vec<(i32, i32)> = c.into_iter().collect();\ne.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));\ne.iter().take(k as usize).map(|p| p.0).collect()',
    cpp: 'unordered_map<int, int> c;\nfor (int x : nums) c[x]++;\nvector<pair<int, int>> e(c.begin(), c.end());\nsort(e.begin(), e.end(), [](const pair<int, int>& a, const pair<int, int>& b) { return a.second != b.second ? a.second > b.second : a.first < b.first; });\nvector<int> res;\nfor (int i = 0; i < k; i++) res.push_back(e[i].first);\nreturn res;',
    c: {
      helpers: join(
        C_CMP_INT,
        C_COPY,
        'typedef struct { int v, c; } vc;\n\nstatic int cmp_vc(const void *a, const void *b) {\n    const vc *x = a, *y = b;\n    if (x->c != y->c) return y->c - x->c;\n    return (x->v > y->v) - (x->v < y->v);\n}',
      ),
      body: 'int *a = copy_ints(nums, nums_size);\nqsort(a, (size_t)nums_size, sizeof(int), cmp_int);\nvc *e = malloc(sizeof(vc) * (size_t)nums_size);\nint m = 0;\nfor (int i = 0; i < nums_size; i++) {\n    if (m > 0 && e[m - 1].v == a[i]) e[m - 1].c++;\n    else { e[m].v = a[i]; e[m].c = 1; m++; }\n}\nqsort(e, (size_t)m, sizeof(vc), cmp_vc);\nint *res = malloc(sizeof(int) * (size_t)k);\nfor (int i = 0; i < k; i++) res[i] = e[i].v;\n*return_size = k;\nfree(a);\nfree(e);\nreturn res;',
    },
  },
});

const firstMissingPositive = coding({
  title: 'First Missing Positive',
  statement: 'Return the smallest positive integer (1, 2, 3, …) that does **not** appear in `nums`.\n\nTry for O(n) time; as a challenge, use O(1) extra space by reordering a copy of the array in place.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- −2^31 ≤ nums[i] ≤ 2^31 − 1',
  difficulty: 'hard',
  tags: ['arrays', 'in-place'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'firstMissingPositive',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  solve: (nums: number[]) => {
    const s = new Set(nums);
    let m = 1;
    while (s.has(m)) m++;
    return m;
  },
  samples: [
    { args: [[3, 4, -1, 1]], explanation: '1 is present, 2 is missing.' },
    { args: [[1, 2, 0]], explanation: '1 and 2 are present, so the answer is 3.' },
  ],
  hidden: [
    { args: [[1]] },
    { args: [[2]] },
    { args: [[-2147483648, 2147483647]] },
    { args: [[1, 1, 1, 2, 2]] },
    { args: [[7, 8, 9, 11, 12]] },
    { args: [shuffle(rng(171), range(1000, 1))] },
    { args: [[...shuffle(rng(172), range(499, 1)), ...range(500, 501)]] },
    { args: [ints(rng(173), 3000, -5, 3000)] },
    { args: [shuffle(rng(174), range(200000, 1))], stress: true },
    { args: [[...shuffle(rng(175), [...range(99999, 1), ...range(99999, 100001)]), 200000, -7]], stress: true },
  ],
  solutions: {
    python: 'a = list(nums)\nn = len(a)\nfor i in range(n):\n    while 1 <= a[i] <= n and a[a[i] - 1] != a[i]:\n        j = a[i] - 1\n        a[i], a[j] = a[j], a[i]\nfor i in range(n):\n    if a[i] != i + 1:\n        return i + 1\nreturn n + 1',
    javascript: 'const a = nums.slice();\nconst n = a.length;\nfor (let i = 0; i < n; i++) {\n  while (a[i] >= 1 && a[i] <= n && a[a[i] - 1] !== a[i]) {\n    const j = a[i] - 1;\n    [a[i], a[j]] = [a[j], a[i]];\n  }\n}\nfor (let i = 0; i < n; i++) if (a[i] !== i + 1) return i + 1;\nreturn n + 1;',
    java: 'int[] a = nums.clone();\nint n = a.length;\nfor (int i = 0; i < n; i++) {\n    while (a[i] >= 1 && a[i] <= n && a[a[i] - 1] != a[i]) {\n        int j = a[i] - 1, t = a[i];\n        a[i] = a[j];\n        a[j] = t;\n    }\n}\nfor (int i = 0; i < n; i++) if (a[i] != i + 1) return i + 1;\nreturn n + 1;',
    csharp: 'var a = (int[])nums.Clone();\nint n = a.Length;\nfor (int i = 0; i < n; i++)\n{\n    while (a[i] >= 1 && a[i] <= n && a[a[i] - 1] != a[i])\n    {\n        int j = a[i] - 1;\n        (a[i], a[j]) = (a[j], a[i]);\n    }\n}\nfor (int i = 0; i < n; i++) if (a[i] != i + 1) return i + 1;\nreturn n + 1;',
    go: 'a := append([]int(nil), nums...)\nn := len(a)\nfor i := 0; i < n; i++ {\n    for a[i] >= 1 && a[i] <= n && a[a[i]-1] != a[i] {\n        j := a[i] - 1\n        a[i], a[j] = a[j], a[i]\n    }\n}\nfor i := 0; i < n; i++ {\n    if a[i] != i+1 {\n        return i + 1\n    }\n}\nreturn n + 1',
    rust: 'let mut a = nums.to_vec();\nlet n = a.len() as i32;\nfor i in 0..a.len() {\n    while a[i] >= 1 && a[i] <= n && a[(a[i] - 1) as usize] != a[i] {\n        let j = (a[i] - 1) as usize;\n        a.swap(i, j);\n    }\n}\nfor (i, &x) in a.iter().enumerate() {\n    if x != i as i32 + 1 {\n        return i as i32 + 1;\n    }\n}\nn + 1',
    cpp: 'vector<int> a = nums;\nint n = a.size();\nfor (int i = 0; i < n; i++)\n    while (a[i] >= 1 && a[i] <= n && a[a[i] - 1] != a[i]) swap(a[i], a[a[i] - 1]);\nfor (int i = 0; i < n; i++) if (a[i] != i + 1) return i + 1;\nreturn n + 1;',
    c: {
      helpers: C_COPY,
      body: 'int *a = copy_ints(nums, nums_size);\nint n = nums_size, res = n + 1;\nfor (int i = 0; i < n; i++) {\n    while (a[i] >= 1 && a[i] <= n && a[a[i] - 1] != a[i]) {\n        int j = a[i] - 1, t = a[i];\n        a[i] = a[j];\n        a[j] = t;\n    }\n}\nfor (int i = 0; i < n; i++) if (a[i] != i + 1) { res = i + 1; break; }\nfree(a);\nreturn res;',
    },
  },
});

/** Number of subarrays with at most k distinct values (values are 1..n). */
function atMost(nums: number[], k: number): number {
  const c = new Map<number, number>();
  let left = 0;
  let total = 0;
  for (let right = 0; right < nums.length; right++) {
    c.set(nums[right]!, (c.get(nums[right]!) ?? 0) + 1);
    while (c.size > k) {
      const v = nums[left++]!;
      const n = c.get(v)! - 1;
      if (n === 0) c.delete(v);
      else c.set(v, n);
    }
    total += right - left + 1;
  }
  return total;
}

const exactlyKDistinct = coding({
  title: 'Subarrays With Exactly K Distinct Values',
  statement:
    'Count the contiguous subarrays of `nums` that contain **exactly** `k` different values.\n\nHint: the number of subarrays with *at most* k distinct values is easy to count with a sliding window.',
  constraints: '- 1 ≤ n ≤ 10^5\n- 1 ≤ nums[i] ≤ n\n- 1 ≤ k ≤ n',
  difficulty: 'hard',
  tags: ['arrays', 'sliding-window', 'hashing'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'countExactlyK',
  params: [{ name: 'nums', type: 'int[]' }, { name: 'k', type: 'int' }],
  returns: 'long',
  solve: (nums: number[], k: number) => atMost(nums, k) - atMost(nums, k - 1),
  samples: [
    { args: [[1, 2, 1, 2, 3], 2], explanation: 'Seven subarrays: [1,2], [2,1], [1,2], [2,3], [1,2,1], [2,1,2], [1,2,1,2].' },
    { args: [[1, 2, 1, 3, 4], 3], explanation: '[1,2,1,3], [2,1,3] and [1,3,4].' },
  ],
  hidden: [
    { args: [[1], 1] },
    { args: [[1, 1, 1, 1], 1] },
    { args: [[1, 2, 3], 4] },
    { args: [[3, 2, 1], 3] },
    { args: [[2, 2, 1, 1, 2], 2] },
    { args: [ints(rng(181), 500, 1, 5), 3] },
    { args: [ints(rng(182), 3000, 1, 100), 20] },
    { args: [ints(rng(183), 2000, 1, 2000), 1] },
    { args: [ints(rng(184), 100000, 1, 50), 25], stress: true },
    { args: [ints(rng(185), 100000, 1, 100000), 1000], stress: true },
  ],
  solutions: {
    python: {
      helpers:
        'def _at_most(nums, k):\n    if k <= 0:\n        return 0\n    cnt = {}\n    left = 0\n    total = 0\n    for right, v in enumerate(nums):\n        cnt[v] = cnt.get(v, 0) + 1\n        while len(cnt) > k:\n            u = nums[left]\n            left += 1\n            cnt[u] -= 1\n            if cnt[u] == 0:\n                del cnt[u]\n        total += right - left + 1\n    return total',
      body: 'return _at_most(nums, k) - _at_most(nums, k - 1)',
    },
    javascript: {
      helpers:
        'function atMost(nums, k) {\n  if (k <= 0) return 0;\n  const cnt = new Int32Array(nums.length + 1);\n  let distinct = 0, left = 0, total = 0;\n  for (let right = 0; right < nums.length; right++) {\n    if (cnt[nums[right]]++ === 0) distinct++;\n    while (distinct > k) if (--cnt[nums[left++]] === 0) distinct--;\n    total += right - left + 1;\n  }\n  return total;\n}',
      body: 'return atMost(nums, k) - atMost(nums, k - 1);',
    },
    java: {
      helpers:
        'private long atMost(int[] nums, int k) {\n    if (k <= 0) return 0;\n    int[] cnt = new int[nums.length + 1];\n    int distinct = 0, left = 0;\n    long total = 0;\n    for (int right = 0; right < nums.length; right++) {\n        if (cnt[nums[right]]++ == 0) distinct++;\n        while (distinct > k) if (--cnt[nums[left++]] == 0) distinct--;\n        total += right - left + 1;\n    }\n    return total;\n}',
      body: 'return atMost(nums, k) - atMost(nums, k - 1);',
    },
    csharp: {
      helpers:
        'private static long AtMost(int[] nums, int k)\n{\n    if (k <= 0) return 0;\n    var cnt = new int[nums.Length + 1];\n    int distinct = 0, left = 0;\n    long total = 0;\n    for (int right = 0; right < nums.Length; right++)\n    {\n        if (cnt[nums[right]]++ == 0) distinct++;\n        while (distinct > k) if (--cnt[nums[left++]] == 0) distinct--;\n        total += right - left + 1;\n    }\n    return total;\n}',
      body: 'return AtMost(nums, k) - AtMost(nums, k - 1);',
    },
    go: {
      helpers:
        'func atMost(nums []int, k int) int64 {\n    if k <= 0 {\n        return 0\n    }\n    cnt := make([]int, len(nums)+1)\n    distinct, left := 0, 0\n    var total int64\n    for right, v := range nums {\n        if cnt[v] == 0 {\n            distinct++\n        }\n        cnt[v]++\n        for distinct > k {\n            cnt[nums[left]]--\n            if cnt[nums[left]] == 0 {\n                distinct--\n            }\n            left++\n        }\n        total += int64(right - left + 1)\n    }\n    return total\n}',
      body: 'return atMost(nums, k) - atMost(nums, k-1)',
    },
    rust: {
      helpers:
        'fn at_most(nums: &[i32], k: i32) -> i64 {\n    if k <= 0 {\n        return 0;\n    }\n    let mut cnt = vec![0i32; nums.len() + 1];\n    let (mut distinct, mut left, mut total) = (0i32, 0usize, 0i64);\n    for right in 0..nums.len() {\n        let v = nums[right] as usize;\n        if cnt[v] == 0 {\n            distinct += 1;\n        }\n        cnt[v] += 1;\n        while distinct > k {\n            let u = nums[left] as usize;\n            cnt[u] -= 1;\n            if cnt[u] == 0 {\n                distinct -= 1;\n            }\n            left += 1;\n        }\n        total += (right - left + 1) as i64;\n    }\n    total\n}',
      body: 'at_most(nums, k) - at_most(nums, k - 1)',
    },
    cpp: {
      helpers:
        'long long atMost(const vector<int>& nums, int k) {\n    if (k <= 0) return 0;\n    vector<int> cnt(nums.size() + 1);\n    int distinct = 0, left = 0;\n    long long total = 0;\n    for (int right = 0; right < (int)nums.size(); right++) {\n        if (cnt[nums[right]]++ == 0) distinct++;\n        while (distinct > k) if (--cnt[nums[left++]] == 0) distinct--;\n        total += right - left + 1;\n    }\n    return total;\n}',
      body: 'return atMost(nums, k) - atMost(nums, k - 1);',
    },
    c: {
      helpers:
        'static long long at_most(const int *nums, int n, int k) {\n    if (k <= 0) return 0;\n    int *cnt = calloc((size_t)n + 1, sizeof(int));\n    int distinct = 0, left = 0;\n    long long total = 0;\n    for (int right = 0; right < n; right++) {\n        if (cnt[nums[right]]++ == 0) distinct++;\n        while (distinct > k) if (--cnt[nums[left++]] == 0) distinct--;\n        total += right - left + 1;\n    }\n    free(cnt);\n    return total;\n}',
      body: 'return at_most(nums, nums_size, k) - at_most(nums, nums_size, k - 1);',
    },
  },
});

export const ARRAYS: CodingQuestionInput[] = [sumArray, containsDuplicate, runningSum, rotateRight, twoSum, longestConsecutive, subarraySumK, topKFrequent, firstMissingPositive, exactlyKDistinct];
