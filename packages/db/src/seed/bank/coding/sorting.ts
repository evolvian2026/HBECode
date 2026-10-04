import type { CodingQuestionInput } from '@hbe/shared';
import { coding, int, ints, range, rng, shuffle, type Rng } from './define.js';

const sortedDistinct = (r: Rng, n: number, lo: number, hi: number) => {
  const s = new Set<number>();
  while (s.size < n) s.add(int(r, lo, hi));
  return [...s].sort((a, b) => a - b);
};
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

const binarySearch = coding({
  title: 'Binary Search',
  statement: '`nums` is sorted in increasing order and its values are distinct. Return the index of `target`, or **−1** if it is not present.\n\nYour solution should take O(log n) time.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- −10^9 ≤ nums[i], target ≤ 10^9\n- nums is strictly increasing.',
  difficulty: 'easy',
  tags: ['binary-search'],
  timeComplexity: 'O(log n)',
  spaceComplexity: 'O(1)',
  fn: 'search',
  params: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }],
  returns: 'int',
  solve: (nums: number[], target: number) => nums.indexOf(target),
  samples: [
    { args: [[-1, 0, 3, 5, 9, 12], 9], explanation: '9 is at index 4.' },
    { args: [[-1, 0, 3, 5, 9, 12], 2], explanation: '2 is not in the array.' },
  ],
  hidden: [
    { args: [[5], 5] },
    { args: [[5], -5] },
    { args: [[1, 3], 3] },
    { args: [[1, 3], 0] },
    { args: [[1, 3], 4] },
    { args: [range(1000, -500), -500] },
    { args: [range(1000, -500), 499] },
    { args: (() => { const a = sortedDistinct(rng(401), 5000, -1000000000, 1000000000); return [a, a[1234]!]; })() },
    { args: [range(200000).map((x) => x * 2), 199999], stress: true },
    { args: (() => { const a = sortedDistinct(rng(402), 200000, -1000000000, 1000000000); return [a, a[199999]!]; })(), stress: true },
  ],
  solutions: {
    python: 'lo, hi = 0, len(nums) - 1\nwhile lo <= hi:\n    mid = (lo + hi) // 2\n    if nums[mid] == target:\n        return mid\n    if nums[mid] < target:\n        lo = mid + 1\n    else:\n        hi = mid - 1\nreturn -1',
    javascript: 'let lo = 0, hi = nums.length - 1;\nwhile (lo <= hi) {\n  const mid = (lo + hi) >> 1;\n  if (nums[mid] === target) return mid;\n  if (nums[mid] < target) lo = mid + 1;\n  else hi = mid - 1;\n}\nreturn -1;',
    java: 'int lo = 0, hi = nums.length - 1;\nwhile (lo <= hi) {\n    int mid = (lo + hi) >>> 1;\n    if (nums[mid] == target) return mid;\n    if (nums[mid] < target) lo = mid + 1;\n    else hi = mid - 1;\n}\nreturn -1;',
    csharp: 'int i = Array.BinarySearch(nums, target);\nreturn i >= 0 ? i : -1;',
    go: {
      imports: ['sort'],
      body: 'i := sort.SearchInts(nums, target)\nif i < len(nums) && nums[i] == target {\n    return i\n}\nreturn -1',
    },
    rust: 'match nums.binary_search(&target) {\n    Ok(i) => i as i32,\n    Err(_) => -1,\n}',
    cpp: 'auto it = lower_bound(nums.begin(), nums.end(), target);\nreturn it != nums.end() && *it == target ? (int)(it - nums.begin()) : -1;',
    c: 'int lo = 0, hi = nums_size - 1;\nwhile (lo <= hi) {\n    int mid = lo + (hi - lo) / 2;\n    if (nums[mid] == target) return mid;\n    if (nums[mid] < target) lo = mid + 1;\n    else hi = mid - 1;\n}\nreturn -1;',
  },
});

const mergeSorted = coding({
  title: 'Merge Two Sorted Arrays',
  statement: 'Both `a` and `b` are sorted in non-decreasing order. Return one sorted array containing all elements of both, in linear time.',
  constraints: '- 1 ≤ |a|, |b| ≤ 2·10^4\n- −10^6 ≤ a[i], b[i] ≤ 10^6\n- a and b are sorted (duplicates allowed).',
  difficulty: 'easy',
  tags: ['sorting', 'two-pointers'],
  timeComplexity: 'O(|a| + |b|)',
  spaceComplexity: 'O(|a| + |b|)',
  fn: 'mergeSorted',
  params: [{ name: 'a', type: 'int[]' }, { name: 'b', type: 'int[]' }],
  returns: 'int[]',
  solve: (a: number[], b: number[]) => sorted([...a, ...b]),
  samples: [
    { args: [[1, 3, 5], [2, 4, 6, 8]], explanation: 'Take the smaller front element each time.' },
    { args: [[1, 1, 2], [1, 3]], explanation: 'Duplicates are kept.' },
  ],
  hidden: [
    { args: [[0], [0]] },
    { args: [[-5], [5]] },
    { args: [[5], [-5]] },
    { args: [[1, 2, 3], [4, 5, 6]] },
    { args: [[4, 5, 6], [1, 2, 3]] },
    { args: [sorted(ints(rng(411), 100, -10, 10)), sorted(ints(rng(412), 37, -10, 10))] },
    { args: [sorted(ints(rng(413), 2000, -1000000, 1000000)), sorted(ints(rng(414), 3000, -1000000, 1000000))] },
    { args: [Array(500).fill(7), Array(300).fill(7)] },
    { args: [sorted(ints(rng(415), 20000, -1000000, 1000000)), sorted(ints(rng(416), 20000, -1000000, 1000000))], stress: true },
    { args: [range(20000, -1000000), range(20000, 980000)], stress: true },
  ],
  solutions: {
    python: 'res = []\ni = j = 0\nwhile i < len(a) and j < len(b):\n    if a[i] <= b[j]:\n        res.append(a[i])\n        i += 1\n    else:\n        res.append(b[j])\n        j += 1\nres.extend(a[i:])\nres.extend(b[j:])\nreturn res',
    javascript: 'const res = [];\nlet i = 0, j = 0;\nwhile (i < a.length && j < b.length) res.push(a[i] <= b[j] ? a[i++] : b[j++]);\nwhile (i < a.length) res.push(a[i++]);\nwhile (j < b.length) res.push(b[j++]);\nreturn res;',
    java: 'int[] res = new int[a.length + b.length];\nint i = 0, j = 0, k = 0;\nwhile (i < a.length && j < b.length) res[k++] = a[i] <= b[j] ? a[i++] : b[j++];\nwhile (i < a.length) res[k++] = a[i++];\nwhile (j < b.length) res[k++] = b[j++];\nreturn res;',
    csharp: 'var res = new int[a.Length + b.Length];\nint i = 0, j = 0, k = 0;\nwhile (i < a.Length && j < b.Length) res[k++] = a[i] <= b[j] ? a[i++] : b[j++];\nwhile (i < a.Length) res[k++] = a[i++];\nwhile (j < b.Length) res[k++] = b[j++];\nreturn res;',
    go: 'res := make([]int, 0, len(a)+len(b))\ni, j := 0, 0\nfor i < len(a) && j < len(b) {\n    if a[i] <= b[j] {\n        res = append(res, a[i])\n        i++\n    } else {\n        res = append(res, b[j])\n        j++\n    }\n}\nres = append(res, a[i:]...)\nreturn append(res, b[j:]...)',
    rust: 'let mut res = Vec::with_capacity(a.len() + b.len());\nlet (mut i, mut j) = (0, 0);\nwhile i < a.len() && j < b.len() {\n    if a[i] <= b[j] {\n        res.push(a[i]);\n        i += 1;\n    } else {\n        res.push(b[j]);\n        j += 1;\n    }\n}\nres.extend_from_slice(&a[i..]);\nres.extend_from_slice(&b[j..]);\nres',
    cpp: 'vector<int> res(a.size() + b.size());\nmerge(a.begin(), a.end(), b.begin(), b.end(), res.begin());\nreturn res;',
    c: 'int *res = malloc(sizeof(int) * (size_t)(a_size + b_size));\nint i = 0, j = 0, k = 0;\nwhile (i < a_size && j < b_size) res[k++] = a[i] <= b[j] ? a[i++] : b[j++];\nwhile (i < a_size) res[k++] = a[i++];\nwhile (j < b_size) res[k++] = b[j++];\n*return_size = k;\nreturn res;',
  },
});

const sortedSquares = coding({
  title: 'Squares of a Sorted Array',
  statement: '`nums` is sorted in non-decreasing order and may contain negative numbers. Return the squares of its elements, also sorted in non-decreasing order, in O(n) time.',
  constraints: '- 1 ≤ n ≤ 4·10^4\n- −10^4 ≤ nums[i] ≤ 10^4\n- nums is sorted.',
  difficulty: 'easy',
  tags: ['sorting', 'two-pointers'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'sortedSquares',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int[]',
  solve: (nums: number[]) => sorted(nums.map((x) => x * x)),
  samples: [
    { args: [[-4, -1, 0, 3, 10]], explanation: 'Squares 16, 1, 0, 9, 100 sorted: 0, 1, 9, 16, 100.' },
    { args: [[-7, -3, 2, 3, 11]], explanation: 'The largest square can come from either end.' },
  ],
  hidden: [
    { args: [[0]] },
    { args: [[-10000]] },
    { args: [[-3, -2, -1]] },
    { args: [[1, 2, 3]] },
    { args: [[-2, -2, 2, 2]] },
    { args: [sorted(ints(rng(421), 500, -100, 100))] },
    { args: [sorted(ints(rng(422), 3000, -10000, 10000))] },
    { args: [range(201, -100)] },
    { args: [sorted(ints(rng(423), 40000, -10000, 10000))], stress: true },
    { args: [range(40000, -20000)], stress: true },
  ],
  solutions: {
    python: 'n = len(nums)\nres = [0] * n\nlo, hi = 0, n - 1\nfor k in range(n - 1, -1, -1):\n    if abs(nums[lo]) > abs(nums[hi]):\n        res[k] = nums[lo] * nums[lo]\n        lo += 1\n    else:\n        res[k] = nums[hi] * nums[hi]\n        hi -= 1\nreturn res',
    javascript: 'const n = nums.length, res = new Array(n);\nlet lo = 0, hi = n - 1;\nfor (let k = n - 1; k >= 0; k--) {\n  if (Math.abs(nums[lo]) > Math.abs(nums[hi])) { res[k] = nums[lo] * nums[lo]; lo++; }\n  else { res[k] = nums[hi] * nums[hi]; hi--; }\n}\nreturn res;',
    java: 'int n = nums.length;\nint[] res = new int[n];\nint lo = 0, hi = n - 1;\nfor (int k = n - 1; k >= 0; k--) {\n    if (Math.abs(nums[lo]) > Math.abs(nums[hi])) { res[k] = nums[lo] * nums[lo]; lo++; }\n    else { res[k] = nums[hi] * nums[hi]; hi--; }\n}\nreturn res;',
    csharp: 'int n = nums.Length;\nvar res = new int[n];\nint lo = 0, hi = n - 1;\nfor (int k = n - 1; k >= 0; k--)\n{\n    if (Math.Abs(nums[lo]) > Math.Abs(nums[hi])) { res[k] = nums[lo] * nums[lo]; lo++; }\n    else { res[k] = nums[hi] * nums[hi]; hi--; }\n}\nreturn res;',
    go: {
      helpers: 'func absInt(x int) int {\n    if x < 0 {\n        return -x\n    }\n    return x\n}',
      body: 'n := len(nums)\nres := make([]int, n)\nlo, hi := 0, n-1\nfor k := n - 1; k >= 0; k-- {\n    if absInt(nums[lo]) > absInt(nums[hi]) {\n        res[k] = nums[lo] * nums[lo]\n        lo++\n    } else {\n        res[k] = nums[hi] * nums[hi]\n        hi--\n    }\n}\nreturn res',
    },
    rust: 'let n = nums.len();\nlet mut res = vec![0; n];\nlet (mut lo, mut hi) = (0usize, n - 1);\nfor k in (0..n).rev() {\n    if nums[lo].abs() > nums[hi].abs() {\n        res[k] = nums[lo] * nums[lo];\n        lo += 1;\n    } else {\n        res[k] = nums[hi] * nums[hi];\n        if hi > 0 {\n            hi -= 1;\n        }\n    }\n}\nres',
    cpp: 'int n = nums.size();\nvector<int> res(n);\nint lo = 0, hi = n - 1;\nfor (int k = n - 1; k >= 0; k--) {\n    if (abs(nums[lo]) > abs(nums[hi])) { res[k] = nums[lo] * nums[lo]; lo++; }\n    else { res[k] = nums[hi] * nums[hi]; hi--; }\n}\nreturn res;',
    c: 'int n = nums_size;\nint *res = malloc(sizeof(int) * (size_t)n);\nint lo = 0, hi = n - 1;\nfor (int k = n - 1; k >= 0; k--) {\n    if (abs(nums[lo]) > abs(nums[hi])) { res[k] = nums[lo] * nums[lo]; lo++; }\n    else { res[k] = nums[hi] * nums[hi]; hi--; }\n}\n*return_size = n;\nreturn res;',
  },
});

const countOccurrences = coding({
  title: 'Count Occurrences in a Sorted Array',
  statement: '`nums` is sorted in non-decreasing order. Return how many times `target` occurs, in O(log n) time (find where its run starts and ends with binary search).',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- −10^9 ≤ nums[i], target ≤ 10^9',
  difficulty: 'easy',
  tags: ['binary-search'],
  timeComplexity: 'O(log n)',
  spaceComplexity: 'O(1)',
  fn: 'countOccurrences',
  params: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }],
  returns: 'int',
  solve: (nums: number[], target: number) => nums.filter((x) => x === target).length,
  samples: [
    { args: [[1, 2, 2, 2, 3, 5], 2], explanation: '2 appears at indices 1, 2 and 3.' },
    { args: [[1, 2, 2, 2, 3, 5], 4], explanation: '4 does not appear.' },
  ],
  hidden: [
    { args: [[7], 7] },
    { args: [[7], 8] },
    { args: [[7, 7, 7, 7], 7] },
    { args: [[1, 1, 2, 2], 1] },
    { args: [[1, 1, 2, 2], 2] },
    { args: [sorted(ints(rng(431), 1000, 0, 20)), 10] },
    { args: [sorted(ints(rng(432), 5000, -1000000000, 1000000000)), 0] },
    { args: [[...Array(100).fill(-3), ...Array(100).fill(3)], 0] },
    { args: [[...range(100000), ...Array(100000).fill(100000)], 100000], stress: true },
    { args: [sorted(ints(rng(433), 200000, -50, 50)), -50], stress: true },
  ],
  solutions: {
    python: { helpers: 'from bisect import bisect_left, bisect_right', body: 'return bisect_right(nums, target) - bisect_left(nums, target)' },
    javascript: {
      helpers: 'function lowerBound(a, x) {\n  let lo = 0, hi = a.length;\n  while (lo < hi) {\n    const mid = (lo + hi) >> 1;\n    if (a[mid] < x) lo = mid + 1;\n    else hi = mid;\n  }\n  return lo;\n}',
      body: 'return lowerBound(nums, target + 1) - lowerBound(nums, target);',
    },
    java: {
      helpers: 'private static int lowerBound(int[] a, long x) {\n    int lo = 0, hi = a.length;\n    while (lo < hi) {\n        int mid = (lo + hi) >>> 1;\n        if (a[mid] < x) lo = mid + 1;\n        else hi = mid;\n    }\n    return lo;\n}',
      body: 'return lowerBound(nums, (long) target + 1) - lowerBound(nums, target);',
    },
    csharp: {
      helpers: 'private static int LowerBound(int[] a, long x)\n{\n    int lo = 0, hi = a.Length;\n    while (lo < hi)\n    {\n        int mid = (lo + hi) >> 1;\n        if (a[mid] < x) lo = mid + 1;\n        else hi = mid;\n    }\n    return lo;\n}',
      body: 'return LowerBound(nums, (long)target + 1) - LowerBound(nums, target);',
    },
    go: {
      imports: ['sort'],
      body: 'return sort.SearchInts(nums, target+1) - sort.SearchInts(nums, target)',
    },
    rust: 'nums.partition_point(|&x| x <= target) as i32 - nums.partition_point(|&x| x < target) as i32',
    cpp: 'return upper_bound(nums.begin(), nums.end(), target) - lower_bound(nums.begin(), nums.end(), target);',
    c: {
      helpers: 'static int lower_bound_ll(const int *a, int n, long long x) {\n    int lo = 0, hi = n;\n    while (lo < hi) {\n        int mid = lo + (hi - lo) / 2;\n        if (a[mid] < x) lo = mid + 1;\n        else hi = mid;\n    }\n    return lo;\n}',
      body: 'return lower_bound_ll(nums, nums_size, (long long)target + 1) - lower_bound_ll(nums, nums_size, target);',
    },
  },
});

const rotate = (a: number[], k: number) => [...a.slice(k), ...a.slice(0, k)];
const searchRotated = coding({
  title: 'Search in a Rotated Sorted Array',
  statement:
    'A strictly increasing array was rotated at an unknown pivot (for example `[0,1,2,4,5,6,7]` might become `[4,5,6,7,0,1,2]`). Return the index of `target` in `nums`, or **−1**, in O(log n) time.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- −10^9 ≤ nums[i], target ≤ 10^9\n- The values are distinct.',
  difficulty: 'moderate',
  tags: ['binary-search'],
  timeComplexity: 'O(log n)',
  spaceComplexity: 'O(1)',
  fn: 'searchRotated',
  params: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }],
  returns: 'int',
  solve: (nums: number[], target: number) => nums.indexOf(target),
  samples: [
    { args: [[4, 5, 6, 7, 0, 1, 2], 0], explanation: '0 is at index 4.' },
    { args: [[4, 5, 6, 7, 0, 1, 2], 3], explanation: '3 is not present.' },
  ],
  hidden: [
    { args: [[1], 1] },
    { args: [[1], 0] },
    { args: [[3, 1], 1] },
    { args: [[3, 1], 3] },
    { args: [[1, 3], 3] },
    { args: [[5, 1, 3], 5] },
    { args: (() => { const a = rotate(sortedDistinct(rng(441), 1000, -1000, 5000), 377); return [a, a[600]!]; })() },
    { args: (() => { const a = rotate(sortedDistinct(rng(442), 5000, -1000000000, 1000000000), 4999); return [a, a[0]!]; })() },
    { args: (() => { const a = rotate(range(200000, -100000), 123457); return [a, 99999]; })(), stress: true },
    { args: [rotate(range(200000).map((x) => 2 * x), 50000), 77777], stress: true },
  ],
  solutions: {
    python: 'lo, hi = 0, len(nums) - 1\nwhile lo <= hi:\n    mid = (lo + hi) // 2\n    if nums[mid] == target:\n        return mid\n    if nums[lo] <= nums[mid]:\n        if nums[lo] <= target < nums[mid]:\n            hi = mid - 1\n        else:\n            lo = mid + 1\n    else:\n        if nums[mid] < target <= nums[hi]:\n            lo = mid + 1\n        else:\n            hi = mid - 1\nreturn -1',
    javascript: 'let lo = 0, hi = nums.length - 1;\nwhile (lo <= hi) {\n  const mid = (lo + hi) >> 1;\n  if (nums[mid] === target) return mid;\n  if (nums[lo] <= nums[mid]) {\n    if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;\n    else lo = mid + 1;\n  } else if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;\n  else hi = mid - 1;\n}\nreturn -1;',
    java: 'int lo = 0, hi = nums.length - 1;\nwhile (lo <= hi) {\n    int mid = (lo + hi) >>> 1;\n    if (nums[mid] == target) return mid;\n    if (nums[lo] <= nums[mid]) {\n        if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;\n        else lo = mid + 1;\n    } else if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;\n    else hi = mid - 1;\n}\nreturn -1;',
    csharp: 'int lo = 0, hi = nums.Length - 1;\nwhile (lo <= hi)\n{\n    int mid = (lo + hi) >> 1;\n    if (nums[mid] == target) return mid;\n    if (nums[lo] <= nums[mid])\n    {\n        if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;\n        else lo = mid + 1;\n    }\n    else if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;\n    else hi = mid - 1;\n}\nreturn -1;',
    go: 'lo, hi := 0, len(nums)-1\nfor lo <= hi {\n    mid := (lo + hi) / 2\n    if nums[mid] == target {\n        return mid\n    }\n    if nums[lo] <= nums[mid] {\n        if nums[lo] <= target && target < nums[mid] {\n            hi = mid - 1\n        } else {\n            lo = mid + 1\n        }\n    } else if nums[mid] < target && target <= nums[hi] {\n        lo = mid + 1\n    } else {\n        hi = mid - 1\n    }\n}\nreturn -1',
    rust: 'let (mut lo, mut hi) = (0i64, nums.len() as i64 - 1);\nwhile lo <= hi {\n    let mid = (lo + hi) / 2;\n    let (l, m, h) = (nums[lo as usize], nums[mid as usize], nums[hi as usize]);\n    if m == target {\n        return mid as i32;\n    }\n    if l <= m {\n        if l <= target && target < m {\n            hi = mid - 1;\n        } else {\n            lo = mid + 1;\n        }\n    } else if m < target && target <= h {\n        lo = mid + 1;\n    } else {\n        hi = mid - 1;\n    }\n}\n-1',
    cpp: 'int lo = 0, hi = (int)nums.size() - 1;\nwhile (lo <= hi) {\n    int mid = (lo + hi) / 2;\n    if (nums[mid] == target) return mid;\n    if (nums[lo] <= nums[mid]) {\n        if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;\n        else lo = mid + 1;\n    } else if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;\n    else hi = mid - 1;\n}\nreturn -1;',
    c: 'int lo = 0, hi = nums_size - 1;\nwhile (lo <= hi) {\n    int mid = lo + (hi - lo) / 2;\n    if (nums[mid] == target) return mid;\n    if (nums[lo] <= nums[mid]) {\n        if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;\n        else lo = mid + 1;\n    } else if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;\n    else hi = mid - 1;\n}\nreturn -1;',
  },
});

const kthLargest = coding({
  title: 'Kth Largest Element',
  statement: 'Return the `k`-th largest element of `nums` (counting duplicates: in `[3, 3, 1]` the 2nd largest is 3).',
  constraints: '- 1 ≤ k ≤ n ≤ 2·10^5\n- −10^9 ≤ nums[i] ≤ 10^9',
  difficulty: 'moderate',
  tags: ['sorting', 'heap', 'quickselect'],
  timeComplexity: 'O(n log k)',
  spaceComplexity: 'O(k)',
  fn: 'kthLargest',
  params: [{ name: 'nums', type: 'int[]' }, { name: 'k', type: 'int' }],
  returns: 'int',
  solve: (nums: number[], k: number) => sorted(nums)[nums.length - k]!,
  samples: [
    { args: [[3, 2, 1, 5, 6, 4], 2], explanation: 'Sorted descending: 6, 5, … — the 2nd is 5.' },
    { args: [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4], explanation: 'Descending: 6, 5, 5, 4 — duplicates count separately.' },
  ],
  hidden: [
    { args: [[1], 1] },
    { args: [[2, 1], 1] },
    { args: [[2, 1], 2] },
    { args: [[7, 7, 7], 3] },
    { args: [[-1, -2, -3, -4], 2] },
    { args: [ints(rng(451), 1000, -100, 100), 500] },
    { args: [ints(rng(452), 5000, -1000000000, 1000000000), 1] },
    { args: [ints(rng(453), 5000, -1000000000, 1000000000), 5000] },
    { args: [ints(rng(454), 200000, -1000000000, 1000000000), 100000], stress: true },
    { args: [shuffle(rng(455), range(200000)), 3], stress: true },
  ],
  solutions: {
    python: { helpers: 'import heapq', body: 'return heapq.nlargest(k, nums)[-1]' },
    javascript: 'const a = Int32Array.from(nums).sort();\nreturn a[a.length - k];',
    java: 'int[] a = nums.clone();\nArrays.sort(a);\nreturn a[a.length - k];',
    csharp: 'var a = (int[])nums.Clone();\nArray.Sort(a);\nreturn a[a.Length - k];',
    go: { imports: ['sort'], body: 'a := append([]int(nil), nums...)\nsort.Ints(a)\nreturn a[len(a)-k]' },
    rust: 'let mut a = nums.to_vec();\nlet idx = a.len() - k as usize;\n*a.select_nth_unstable(idx).1',
    cpp: 'vector<int> a = nums;\nnth_element(a.begin(), a.end() - k, a.end());\nreturn *(a.end() - k);',
    c: {
      helpers: 'static int cmp_int(const void *a, const void *b) {\n    int x = *(const int *)a, y = *(const int *)b;\n    return (x > y) - (x < y);\n}',
      body: 'int *a = malloc(sizeof(int) * (size_t)nums_size);\nmemcpy(a, nums, sizeof(int) * (size_t)nums_size);\nqsort(a, (size_t)nums_size, sizeof(int), cmp_int);\nint res = a[nums_size - k];\nfree(a);\nreturn res;',
    },
  },
});

const mergeIntervalsOf = (iv: number[][]) => {
  const a = [...iv].sort((x, y) => x[0]! - y[0]! || x[1]! - y[1]!);
  const out: number[][] = [];
  for (const [s, e] of a) {
    const last = out[out.length - 1];
    if (last && s! <= last[1]!) last[1] = Math.max(last[1]!, e!);
    else out.push([s!, e!]);
  }
  return out;
};
const randomIntervals = (r: Rng, n: number, max: number, len: number) => Array.from({ length: n }, () => { const s = int(r, 0, max); return [s, s + int(r, 0, len)]; });

const mergeIntervals = coding({
  title: 'Merge Overlapping Intervals',
  statement:
    'Each row of `intervals` is `[start, end]` with start ≤ end. Merge all intervals that overlap or touch (`[1,4]` and `[4,6]` merge into `[1,6]`) and return the merged intervals sorted by start.',
  constraints: '- 1 ≤ n ≤ 2·10^4\n- 0 ≤ start ≤ end ≤ 10^6',
  difficulty: 'moderate',
  tags: ['sorting', 'intervals'],
  timeComplexity: 'O(n log n)',
  spaceComplexity: 'O(n)',
  fn: 'mergeIntervals',
  params: [{ name: 'intervals', type: 'int[][]' }],
  returns: 'int[][]',
  solve: (iv: number[][]) => mergeIntervalsOf(iv),
  samples: [
    { args: [[[1, 3], [2, 6], [8, 10], [15, 18]]], explanation: '[1,3] and [2,6] overlap, giving [1,6]; the others stay as they are.' },
    { args: [[[4, 7], [1, 4]]], explanation: 'The input is not sorted; [1,4] and [4,7] touch, so they merge into [1,7].' },
  ],
  hidden: [
    { args: [[[5, 5]]] },
    { args: [[[1, 2], [3, 4]]] },
    { args: [[[1, 10], [2, 3], [4, 5]]] },
    { args: [[[0, 0], [0, 0], [1, 1]]] },
    { args: [[[6, 8], [1, 9], [2, 4], [4, 7]]] },
    { args: [randomIntervals(rng(461), 100, 1000, 30)] },
    { args: [randomIntervals(rng(462), 3000, 1000000, 200)] },
    { args: [randomIntervals(rng(463), 2000, 100000, 5000)] },
    { args: [shuffle(rng(464), range(20000).map((i) => [i * 50, i * 50 + 10]))], stress: true },
    { args: [randomIntervals(rng(465), 20000, 1000000, 100)], stress: true },
  ],
  solutions: {
    python: 'res = []\nfor s, e in sorted(intervals):\n    if res and s <= res[-1][1]:\n        res[-1][1] = max(res[-1][1], e)\n    else:\n        res.append([s, e])\nreturn res',
    javascript: 'const a = intervals.map((x) => x.slice()).sort((x, y) => x[0] - y[0] || x[1] - y[1]);\nconst res = [];\nfor (const [s, e] of a) {\n  const last = res[res.length - 1];\n  if (last && s <= last[1]) last[1] = Math.max(last[1], e);\n  else res.push([s, e]);\n}\nreturn res;',
    java: 'int[][] a = intervals.clone();\nArrays.sort(a, (x, y) -> x[0] != y[0] ? Integer.compare(x[0], y[0]) : Integer.compare(x[1], y[1]));\nList<int[]> res = new ArrayList<>();\nfor (int[] iv : a) {\n    if (!res.isEmpty() && iv[0] <= res.get(res.size() - 1)[1]) {\n        int[] last = res.get(res.size() - 1);\n        last[1] = Math.max(last[1], iv[1]);\n    } else res.add(new int[] { iv[0], iv[1] });\n}\nreturn res.toArray(new int[0][]);',
    csharp: 'var a = intervals.OrderBy(x => x[0]).ThenBy(x => x[1]).ToArray();\nvar res = new List<int[]>();\nforeach (var iv in a)\n{\n    if (res.Count > 0 && iv[0] <= res[^1][1]) res[^1][1] = Math.Max(res[^1][1], iv[1]);\n    else res.Add(new[] { iv[0], iv[1] });\n}\nreturn res.ToArray();',
    go: {
      imports: ['sort'],
      body: 'a := make([][]int, len(intervals))\ncopy(a, intervals)\nsort.Slice(a, func(i, j int) bool {\n    if a[i][0] != a[j][0] {\n        return a[i][0] < a[j][0]\n    }\n    return a[i][1] < a[j][1]\n})\nres := [][]int{}\nfor _, iv := range a {\n    if len(res) > 0 && iv[0] <= res[len(res)-1][1] {\n        if iv[1] > res[len(res)-1][1] {\n            res[len(res)-1][1] = iv[1]\n        }\n    } else {\n        res = append(res, []int{iv[0], iv[1]})\n    }\n}\nreturn res',
    },
    rust: 'let mut a: Vec<Vec<i32>> = intervals.to_vec();\na.sort();\nlet mut res: Vec<Vec<i32>> = Vec::new();\nfor iv in a {\n    if let Some(last) = res.last_mut() {\n        if iv[0] <= last[1] {\n            last[1] = last[1].max(iv[1]);\n            continue;\n        }\n    }\n    res.push(iv);\n}\nres',
    cpp: 'vector<vector<int>> a = intervals, res;\nsort(a.begin(), a.end());\nfor (auto& iv : a) {\n    if (!res.empty() && iv[0] <= res.back()[1]) res.back()[1] = max(res.back()[1], iv[1]);\n    else res.push_back(iv);\n}\nreturn res;',
    c: {
      helpers: 'static int cmp_iv(const void *a, const void *b) {\n    const int *x = *(const int *const *)a, *y = *(const int *const *)b;\n    if (x[0] != y[0]) return (x[0] > y[0]) - (x[0] < y[0]);\n    return (x[1] > y[1]) - (x[1] < y[1]);\n}',
      body: 'int n = intervals_rows;\nint **a = malloc(sizeof(int *) * (size_t)n);\nfor (int i = 0; i < n; i++) a[i] = intervals[i];\nqsort(a, (size_t)n, sizeof(int *), cmp_iv);\nint **res = malloc(sizeof(int *) * (size_t)n);\nint m = 0;\nfor (int i = 0; i < n; i++) {\n    if (m > 0 && a[i][0] <= res[m - 1][1]) {\n        if (a[i][1] > res[m - 1][1]) res[m - 1][1] = a[i][1];\n    } else {\n        res[m] = malloc(sizeof(int) * 2);\n        res[m][0] = a[i][0];\n        res[m][1] = a[i][1];\n        m++;\n    }\n}\nfree(a);\n*return_rows = m;\n*return_cols = 2;\nreturn res;',
    },
  },
});

const kokoOf = (piles: number[], h: number) => {
  let lo = 1;
  let hi = Math.max(...piles);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    let hours = 0;
    for (const p of piles) hours += Math.ceil(p / mid);
    if (hours <= h) hi = mid;
    else lo = mid + 1;
  }
  return lo;
};

const minEatingSpeed = coding({
  title: 'Minimum Eating Speed',
  statement:
    'There are `piles[i]` bananas in pile i. Each hour you pick one pile and eat up to `speed` bananas from it (if the pile has fewer, you finish it and wait for the next hour). Return the smallest integer `speed` that lets you eat everything within `h` hours.\n\nHint: binary search on the answer.',
  constraints: '- 1 ≤ n ≤ 5·10^4\n- n ≤ h ≤ 10^9\n- 1 ≤ piles[i] ≤ 10^9',
  difficulty: 'moderate',
  tags: ['binary-search'],
  timeComplexity: 'O(n log max)',
  spaceComplexity: 'O(1)',
  fn: 'minEatingSpeed',
  params: [{ name: 'piles', type: 'int[]' }, { name: 'h', type: 'int' }],
  returns: 'int',
  solve: (piles: number[], h: number) => kokoOf(piles, h),
  samples: [
    { args: [[3, 6, 7, 11], 8], explanation: 'At speed 4 the piles take 1 + 2 + 2 + 3 = 8 hours; speed 3 would need 10.' },
    { args: [[30, 11, 23, 4, 20], 5], explanation: 'One pile per hour, so the speed must be at least the largest pile, 30.' },
  ],
  hidden: [
    { args: [[1], 1] },
    { args: [[1000000000], 2] },
    { args: [[1000000000], 1000000000] },
    { args: [[2, 2], 4] },
    { args: [[312884470], 968709470] },
    { args: [ints(rng(471), 100, 1, 1000), 150] },
    { args: [ints(rng(472), 1000, 1, 1000000000), 1000] },
    { args: [ints(rng(473), 3000, 1, 1000000), 999999999] },
    { args: [ints(rng(474), 50000, 1, 1000000000), 70000], stress: true },
    { args: [ints(rng(475), 50000, 500000000, 1000000000), 1000000000], stress: true },
  ],
  solutions: {
    python: 'lo, hi = 1, max(piles)\nwhile lo < hi:\n    mid = (lo + hi) // 2\n    if sum((p + mid - 1) // mid for p in piles) <= h:\n        hi = mid\n    else:\n        lo = mid + 1\nreturn lo',
    javascript: 'let lo = 1, hi = Math.max(...piles);\nwhile (lo < hi) {\n  const mid = Math.floor((lo + hi) / 2);\n  let hours = 0;\n  for (const p of piles) hours += Math.ceil(p / mid);\n  if (hours <= h) hi = mid;\n  else lo = mid + 1;\n}\nreturn lo;',
    java: 'int lo = 1, hi = 0;\nfor (int p : piles) hi = Math.max(hi, p);\nwhile (lo < hi) {\n    int mid = lo + (hi - lo) / 2;\n    long hours = 0;\n    for (int p : piles) hours += (p + mid - 1L) / mid;\n    if (hours <= h) hi = mid;\n    else lo = mid + 1;\n}\nreturn lo;',
    csharp: 'int lo = 1, hi = piles.Max();\nwhile (lo < hi)\n{\n    int mid = lo + (hi - lo) / 2;\n    long hours = 0;\n    foreach (var p in piles) hours += (p + mid - 1L) / mid;\n    if (hours <= h) hi = mid;\n    else lo = mid + 1;\n}\nreturn lo;',
    go: 'lo, hi := 1, 0\nfor _, p := range piles {\n    if p > hi {\n        hi = p\n    }\n}\nfor lo < hi {\n    mid := (lo + hi) / 2\n    hours := 0\n    for _, p := range piles {\n        hours += (p + mid - 1) / mid\n    }\n    if hours <= h {\n        hi = mid\n    } else {\n        lo = mid + 1\n    }\n}\nreturn lo',
    rust: 'let (mut lo, mut hi) = (1i64, *piles.iter().max().unwrap() as i64);\nwhile lo < hi {\n    let mid = (lo + hi) / 2;\n    let hours: i64 = piles.iter().map(|&p| (p as i64 + mid - 1) / mid).sum();\n    if hours <= h as i64 {\n        hi = mid;\n    } else {\n        lo = mid + 1;\n    }\n}\nlo as i32',
    cpp: 'int lo = 1, hi = *max_element(piles.begin(), piles.end());\nwhile (lo < hi) {\n    int mid = lo + (hi - lo) / 2;\n    long long hours = 0;\n    for (int p : piles) hours += (p + mid - 1LL) / mid;\n    if (hours <= h) hi = mid;\n    else lo = mid + 1;\n}\nreturn lo;',
    c: 'int lo = 1, hi = 0;\nfor (int i = 0; i < piles_size; i++) if (piles[i] > hi) hi = piles[i];\nwhile (lo < hi) {\n    int mid = lo + (hi - lo) / 2;\n    long long hours = 0;\n    for (int i = 0; i < piles_size; i++) hours += (piles[i] + mid - 1LL) / mid;\n    if (hours <= h) hi = mid;\n    else lo = mid + 1;\n}\nreturn lo;',
  },
});

const medianOf = (a: number[], b: number[]) => {
  const m = sorted([...a, ...b]);
  const n = m.length;
  return n % 2 ? m[(n - 1) / 2]! : (m[n / 2 - 1]! + m[n / 2]!) / 2;
};

const medianTwoSorted = coding({
  title: 'Median of Two Sorted Arrays',
  statement:
    'Arrays `a` and `b` are sorted in non-decreasing order; either may be empty, but not both. Return the median of all their elements together (the average of the two middle values when the total count is even).\n\nThe intended solution runs in O(log(min(|a|, |b|))) time.',
  constraints: '- 0 ≤ |a|, |b| ≤ 10^5, |a| + |b| ≥ 1\n- −10^6 ≤ a[i], b[i] ≤ 10^6',
  difficulty: 'hard',
  tags: ['binary-search', 'divide-and-conquer'],
  timeComplexity: 'O(log min(m, n))',
  spaceComplexity: 'O(1)',
  fn: 'findMedian',
  params: [{ name: 'a', type: 'int[]' }, { name: 'b', type: 'int[]' }],
  returns: 'double',
  solve: (a: number[], b: number[]) => medianOf(a, b),
  samples: [
    { args: [[1, 3], [2]], explanation: 'All values: 1, 2, 3. The median is 2.' },
    { args: [[1, 2], [3, 4]], explanation: 'All values: 1, 2, 3, 4. The median is (2 + 3) / 2 = 2.5.' },
  ],
  hidden: [
    { args: [[], [1]] },
    { args: [[2], []] },
    { args: [[], [1, 2]] },
    { args: [[1, 1], [1, 1]] },
    { args: [[1, 2, 3], [100, 200]] },
    { args: [[-1000000], [1000000]] },
    { args: [sorted(ints(rng(481), 1001, -1000, 1000)), sorted(ints(rng(482), 500, -1000, 1000))] },
    { args: [sorted(ints(rng(483), 5000, -1000000, 1000000)), sorted(ints(rng(484), 5000, -1000000, 1000000))] },
    { args: [sorted(ints(rng(485), 100000, -1000000, 1000000)), sorted(ints(rng(486), 99999, -1000000, 1000000))], stress: true },
    { args: [range(100000, -1000000), []], stress: true },
  ],
  solutions: {
    python: 'if len(a) > len(b):\n    a, b = b, a\nm, n = len(a), len(b)\nlo, hi = 0, m\nhalf = (m + n + 1) // 2\nNEG, POS = float("-inf"), float("inf")\nwhile True:\n    i = (lo + hi) // 2\n    j = half - i\n    al = a[i - 1] if i > 0 else NEG\n    ar = a[i] if i < m else POS\n    bl = b[j - 1] if j > 0 else NEG\n    br = b[j] if j < n else POS\n    if al <= br and bl <= ar:\n        if (m + n) % 2:\n            return float(max(al, bl))\n        return (max(al, bl) + min(ar, br)) / 2\n    if al > br:\n        hi = i - 1\n    else:\n        lo = i + 1',
    javascript: 'if (a.length > b.length) [a, b] = [b, a];\nconst m = a.length, n = b.length, half = (m + n + 1) >> 1;\nlet lo = 0, hi = m;\nfor (;;) {\n  const i = (lo + hi) >> 1, j = half - i;\n  const al = i > 0 ? a[i - 1] : -Infinity, ar = i < m ? a[i] : Infinity;\n  const bl = j > 0 ? b[j - 1] : -Infinity, br = j < n ? b[j] : Infinity;\n  if (al <= br && bl <= ar) return (m + n) % 2 ? Math.max(al, bl) : (Math.max(al, bl) + Math.min(ar, br)) / 2;\n  if (al > br) hi = i - 1;\n  else lo = i + 1;\n}',
    java: 'if (a.length > b.length) { int[] t = a; a = b; b = t; }\nint m = a.length, n = b.length, half = (m + n + 1) / 2, lo = 0, hi = m;\nwhile (true) {\n    int i = (lo + hi) / 2, j = half - i;\n    long al = i > 0 ? a[i - 1] : Long.MIN_VALUE, ar = i < m ? a[i] : Long.MAX_VALUE;\n    long bl = j > 0 ? b[j - 1] : Long.MIN_VALUE, br = j < n ? b[j] : Long.MAX_VALUE;\n    if (al <= br && bl <= ar) return (m + n) % 2 == 1 ? Math.max(al, bl) : (Math.max(al, bl) + Math.min(ar, br)) / 2.0;\n    if (al > br) hi = i - 1;\n    else lo = i + 1;\n}',
    csharp: 'if (a.Length > b.Length) (a, b) = (b, a);\nint m = a.Length, n = b.Length, half = (m + n + 1) / 2, lo = 0, hi = m;\nwhile (true)\n{\n    int i = (lo + hi) / 2, j = half - i;\n    long al = i > 0 ? a[i - 1] : long.MinValue, ar = i < m ? a[i] : long.MaxValue;\n    long bl = j > 0 ? b[j - 1] : long.MinValue, br = j < n ? b[j] : long.MaxValue;\n    if (al <= br && bl <= ar) return (m + n) % 2 == 1 ? Math.Max(al, bl) : (Math.Max(al, bl) + Math.Min(ar, br)) / 2.0;\n    if (al > br) hi = i - 1;\n    else lo = i + 1;\n}',
    go: {
      imports: ['math'],
      body: 'if len(a) > len(b) {\n    a, b = b, a\n}\nm, n := len(a), len(b)\nhalf, lo, hi := (m+n+1)/2, 0, m\nfor {\n    i := (lo + hi) / 2\n    j := half - i\n    al, ar, bl, br := math.Inf(-1), math.Inf(1), math.Inf(-1), math.Inf(1)\n    if i > 0 {\n        al = float64(a[i-1])\n    }\n    if i < m {\n        ar = float64(a[i])\n    }\n    if j > 0 {\n        bl = float64(b[j-1])\n    }\n    if j < n {\n        br = float64(b[j])\n    }\n    if al <= br && bl <= ar {\n        if (m+n)%2 == 1 {\n            return math.Max(al, bl)\n        }\n        return (math.Max(al, bl) + math.Min(ar, br)) / 2\n    }\n    if al > br {\n        hi = i - 1\n    } else {\n        lo = i + 1\n    }\n}',
    },
    rust: 'let (a, b) = if a.len() > b.len() { (b, a) } else { (a, b) };\nlet (m, n) = (a.len(), b.len());\nlet half = (m + n + 1) / 2;\nlet (mut lo, mut hi) = (0usize, m);\nloop {\n    let i = (lo + hi) / 2;\n    let j = half - i;\n    let al = if i > 0 { a[i - 1] as f64 } else { f64::NEG_INFINITY };\n    let ar = if i < m { a[i] as f64 } else { f64::INFINITY };\n    let bl = if j > 0 { b[j - 1] as f64 } else { f64::NEG_INFINITY };\n    let br = if j < n { b[j] as f64 } else { f64::INFINITY };\n    if al <= br && bl <= ar {\n        return if (m + n) % 2 == 1 { al.max(bl) } else { (al.max(bl) + ar.min(br)) / 2.0 };\n    }\n    if al > br {\n        hi = i - 1;\n    } else {\n        lo = i + 1;\n    }\n}',
    cpp: 'const vector<int>& x = a.size() <= b.size() ? a : b;\nconst vector<int>& y = a.size() <= b.size() ? b : a;\nint m = x.size(), n = y.size(), half = (m + n + 1) / 2, lo = 0, hi = m;\nwhile (true) {\n    int i = (lo + hi) / 2, j = half - i;\n    double al = i > 0 ? x[i - 1] : -1e18, ar = i < m ? x[i] : 1e18;\n    double bl = j > 0 ? y[j - 1] : -1e18, br = j < n ? y[j] : 1e18;\n    if (al <= br && bl <= ar) return (m + n) % 2 ? max(al, bl) : (max(al, bl) + min(ar, br)) / 2.0;\n    if (al > br) hi = i - 1;\n    else lo = i + 1;\n}',
    c: 'const int *x = a, *y = b;\nint m = a_size, n = b_size;\nif (m > n) { x = b; y = a; m = b_size; n = a_size; }\nint half = (m + n + 1) / 2, lo = 0, hi = m;\nwhile (1) {\n    int i = (lo + hi) / 2, j = half - i;\n    double al = i > 0 ? x[i - 1] : -1e18, ar = i < m ? x[i] : 1e18;\n    double bl = j > 0 ? y[j - 1] : -1e18, br = j < n ? y[j] : 1e18;\n    if (al <= br && bl <= ar) {\n        double l = al > bl ? al : bl, r = ar < br ? ar : br;\n        return (m + n) % 2 ? l : (l + r) / 2.0;\n    }\n    if (al > br) hi = i - 1;\n    else lo = i + 1;\n}',
  },
});

const inversionsOf = (a: number[]) => {
  let count = 0;
  const sortCount = (xs: number[]): number[] => {
    if (xs.length < 2) return xs;
    const mid = xs.length >> 1;
    const l = sortCount(xs.slice(0, mid));
    const r = sortCount(xs.slice(mid));
    const out: number[] = [];
    let i = 0;
    let j = 0;
    while (i < l.length && j < r.length) {
      if (l[i]! <= r[j]!) out.push(l[i++]!);
      else {
        count += l.length - i;
        out.push(r[j++]!);
      }
    }
    return [...out, ...l.slice(i), ...r.slice(j)];
  };
  sortCount(a);
  return count;
};

const countInversions = coding({
  title: 'Count Inversions',
  statement: 'An inversion is a pair of indices `i < j` with `nums[i] > nums[j]`. Return the number of inversions in `nums`.\n\nThe count can be about n²/2, so use 64-bit integers; an O(n²) loop is too slow.',
  constraints: '- 1 ≤ n ≤ 10^5\n- −10^9 ≤ nums[i] ≤ 10^9',
  difficulty: 'hard',
  tags: ['sorting', 'merge-sort', 'divide-and-conquer'],
  timeComplexity: 'O(n log n)',
  spaceComplexity: 'O(n)',
  fn: 'countInversions',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'long',
  solve: (nums: number[]) => inversionsOf(nums),
  samples: [
    { args: [[2, 4, 1, 3, 5]], explanation: 'The inversions are (2,1), (4,1) and (4,3).' },
    { args: [[5, 4, 3, 2, 1]], explanation: 'Every pair is inverted: 5·4/2 = 10.' },
  ],
  hidden: [
    { args: [[1]] },
    { args: [[1, 2]] },
    { args: [[2, 1]] },
    { args: [[3, 3, 3]] },
    { args: [[1, 3, 2, 3, 1]] },
    { args: [ints(rng(491), 1000, 0, 10)] },
    { args: [ints(rng(492), 5000, -1000000000, 1000000000)] },
    { args: [range(3000).reverse()] },
    { args: [range(100000).reverse()], stress: true },
    { args: [ints(rng(493), 100000, -1000000000, 1000000000)], stress: true },
  ],
  baseTimeLimitMs: 2000,
  solutions: {
    python: {
      helpers:
        'def _sort_count(a):\n    n = len(a)\n    if n < 2:\n        return a, 0\n    mid = n // 2\n    left, x = _sort_count(a[:mid])\n    right, y = _sort_count(a[mid:])\n    out = []\n    i = j = 0\n    c = x + y\n    while i < len(left) and j < len(right):\n        if left[i] <= right[j]:\n            out.append(left[i])\n            i += 1\n        else:\n            c += len(left) - i\n            out.append(right[j])\n            j += 1\n    out.extend(left[i:])\n    out.extend(right[j:])\n    return out, c',
      body: 'return _sort_count(nums)[1]',
    },
    javascript: {
      helpers:
        'function sortCount(a, tmp, lo, hi) {\n  if (hi - lo < 2) return 0;\n  const mid = (lo + hi) >> 1;\n  let c = sortCount(a, tmp, lo, mid) + sortCount(a, tmp, mid, hi);\n  let i = lo, j = mid, k = lo;\n  while (i < mid && j < hi) {\n    if (a[i] <= a[j]) tmp[k++] = a[i++];\n    else { c += mid - i; tmp[k++] = a[j++]; }\n  }\n  while (i < mid) tmp[k++] = a[i++];\n  while (j < hi) tmp[k++] = a[j++];\n  for (let t = lo; t < hi; t++) a[t] = tmp[t];\n  return c;\n}',
      body: 'const a = nums.slice();\nreturn sortCount(a, new Array(a.length), 0, a.length);',
    },
    java: {
      helpers:
        'private long sortCount(int[] a, int[] tmp, int lo, int hi) {\n    if (hi - lo < 2) return 0;\n    int mid = (lo + hi) >>> 1;\n    long c = sortCount(a, tmp, lo, mid) + sortCount(a, tmp, mid, hi);\n    int i = lo, j = mid, k = lo;\n    while (i < mid && j < hi) {\n        if (a[i] <= a[j]) tmp[k++] = a[i++];\n        else { c += mid - i; tmp[k++] = a[j++]; }\n    }\n    while (i < mid) tmp[k++] = a[i++];\n    while (j < hi) tmp[k++] = a[j++];\n    System.arraycopy(tmp, lo, a, lo, hi - lo);\n    return c;\n}',
      body: 'int[] a = nums.clone();\nreturn sortCount(a, new int[a.length], 0, a.length);',
    },
    csharp: {
      helpers:
        'private static long SortCount(int[] a, int[] tmp, int lo, int hi)\n{\n    if (hi - lo < 2) return 0;\n    int mid = (lo + hi) >> 1;\n    long c = SortCount(a, tmp, lo, mid) + SortCount(a, tmp, mid, hi);\n    int i = lo, j = mid, k = lo;\n    while (i < mid && j < hi)\n    {\n        if (a[i] <= a[j]) tmp[k++] = a[i++];\n        else { c += mid - i; tmp[k++] = a[j++]; }\n    }\n    while (i < mid) tmp[k++] = a[i++];\n    while (j < hi) tmp[k++] = a[j++];\n    Array.Copy(tmp, lo, a, lo, hi - lo);\n    return c;\n}',
      body: 'var a = (int[])nums.Clone();\nreturn SortCount(a, new int[a.Length], 0, a.Length);',
    },
    go: {
      helpers:
        'func sortCount(a, tmp []int, lo, hi int) int64 {\n    if hi-lo < 2 {\n        return 0\n    }\n    mid := (lo + hi) / 2\n    c := sortCount(a, tmp, lo, mid) + sortCount(a, tmp, mid, hi)\n    i, j, k := lo, mid, lo\n    for i < mid && j < hi {\n        if a[i] <= a[j] {\n            tmp[k] = a[i]\n            i++\n        } else {\n            c += int64(mid - i)\n            tmp[k] = a[j]\n            j++\n        }\n        k++\n    }\n    for i < mid {\n        tmp[k] = a[i]\n        i++\n        k++\n    }\n    for j < hi {\n        tmp[k] = a[j]\n        j++\n        k++\n    }\n    copy(a[lo:hi], tmp[lo:hi])\n    return c\n}',
      body: 'a := append([]int(nil), nums...)\nreturn sortCount(a, make([]int, len(a)), 0, len(a))',
    },
    rust: {
      helpers:
        'fn sort_count(a: &mut Vec<i32>, tmp: &mut Vec<i32>, lo: usize, hi: usize) -> i64 {\n    if hi - lo < 2 {\n        return 0;\n    }\n    let mid = (lo + hi) / 2;\n    let mut c = sort_count(a, tmp, lo, mid) + sort_count(a, tmp, mid, hi);\n    let (mut i, mut j, mut k) = (lo, mid, lo);\n    while i < mid && j < hi {\n        if a[i] <= a[j] {\n            tmp[k] = a[i];\n            i += 1;\n        } else {\n            c += (mid - i) as i64;\n            tmp[k] = a[j];\n            j += 1;\n        }\n        k += 1;\n    }\n    while i < mid {\n        tmp[k] = a[i];\n        i += 1;\n        k += 1;\n    }\n    while j < hi {\n        tmp[k] = a[j];\n        j += 1;\n        k += 1;\n    }\n    a[lo..hi].copy_from_slice(&tmp[lo..hi]);\n    c\n}',
      body: 'let mut a = nums.to_vec();\nlet mut tmp = vec![0; a.len()];\nlet n = a.len();\nsort_count(&mut a, &mut tmp, 0, n)',
    },
    cpp: {
      helpers:
        'long long sortCount(vector<int>& a, vector<int>& tmp, int lo, int hi) {\n    if (hi - lo < 2) return 0;\n    int mid = (lo + hi) / 2;\n    long long c = sortCount(a, tmp, lo, mid) + sortCount(a, tmp, mid, hi);\n    int i = lo, j = mid, k = lo;\n    while (i < mid && j < hi) {\n        if (a[i] <= a[j]) tmp[k++] = a[i++];\n        else { c += mid - i; tmp[k++] = a[j++]; }\n    }\n    while (i < mid) tmp[k++] = a[i++];\n    while (j < hi) tmp[k++] = a[j++];\n    copy(tmp.begin() + lo, tmp.begin() + hi, a.begin() + lo);\n    return c;\n}',
      body: 'vector<int> a = nums, tmp(nums.size());\nreturn sortCount(a, tmp, 0, a.size());',
    },
    c: {
      helpers:
        'static long long sort_count(int *a, int *tmp, int lo, int hi) {\n    if (hi - lo < 2) return 0;\n    int mid = (lo + hi) / 2;\n    long long c = sort_count(a, tmp, lo, mid) + sort_count(a, tmp, mid, hi);\n    int i = lo, j = mid, k = lo;\n    while (i < mid && j < hi) {\n        if (a[i] <= a[j]) tmp[k++] = a[i++];\n        else { c += mid - i; tmp[k++] = a[j++]; }\n    }\n    while (i < mid) tmp[k++] = a[i++];\n    while (j < hi) tmp[k++] = a[j++];\n    memcpy(a + lo, tmp + lo, sizeof(int) * (size_t)(hi - lo));\n    return c;\n}',
      body: 'int *a = malloc(sizeof(int) * (size_t)nums_size), *tmp = malloc(sizeof(int) * (size_t)nums_size);\nmemcpy(a, nums, sizeof(int) * (size_t)nums_size);\nlong long c = sort_count(a, tmp, 0, nums_size);\nfree(a);\nfree(tmp);\nreturn c;',
    },
  },
});

export const SORTING: CodingQuestionInput[] = [binarySearch, mergeSorted, sortedSquares, countOccurrences, searchRotated, kthLargest, mergeIntervals, minEatingSpeed, medianTwoSorted, countInversions];
