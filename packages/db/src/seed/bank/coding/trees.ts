import type { CodingQuestionInput } from '@hbe/shared';
import { coding, int, rng, shuffle, range, type Rng } from './define.js';

// ------------------------------------------------------------------------------- tree helpers

interface T {
  val: number;
  left: T | null;
  right: T | null;
}
type Level = (number | null)[];

/** LeetCode level order → tree. */
function build(vals: Level): T | null {
  const nodes = vals.map((v) => (v === null ? null : { val: v, left: null, right: null } as T));
  let j = 1;
  for (const x of nodes) {
    if (!x) continue;
    if (j < nodes.length) x.left = nodes[j]!;
    j++;
    if (j < nodes.length) x.right = nodes[j]!;
    j++;
  }
  return nodes[0] ?? null;
}
/** Tree → LeetCode level order (children listed for non-null nodes, trailing nulls trimmed). */
function level(root: T | null): Level {
  if (!root) return [];
  const out: Level = [];
  const q: (T | null)[] = [root];
  for (let i = 0; i < q.length; i++) {
    const x = q[i]!;
    out.push(x ? x.val : null);
    if (x) q.push(x.left, x.right);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}
/** Random tree of n nodes: each node attaches to a random free child slot (height ≈ O(log n)). */
function randomTree(r: Rng, n: number, lo: number, hi: number): Level {
  if (n === 0) return [];
  const root: T = { val: int(r, lo, hi), left: null, right: null };
  const free: [T, 'left' | 'right'][] = [[root, 'left'], [root, 'right']];
  for (let i = 1; i < n; i++) {
    const k = Math.floor(r() * free.length);
    const [p, side] = free[k]!;
    free[k] = free[free.length - 1]!;
    free.pop();
    const x: T = { val: int(r, lo, hi), left: null, right: null };
    p[side] = x;
    free.push([x, 'left'], [x, 'right']);
  }
  return level(root);
}
/** Random BST with distinct values (insertion in random order). */
function randomBst(r: Rng, n: number, lo: number, hi: number): Level {
  const vals = new Set<number>();
  while (vals.size < n) vals.add(int(r, lo, hi));
  let root: T | null = null;
  for (const v of shuffle(r, [...vals])) {
    const x: T = { val: v, left: null, right: null };
    if (!root) {
      root = x;
      continue;
    }
    let cur = root;
    for (;;) {
      const side = v < cur.val ? 'left' : 'right';
      if (!cur[side]) {
        cur[side] = x;
        break;
      }
      cur = cur[side]!;
    }
  }
  return level(root);
}
/** A path-shaped tree of the given height, zig-zagging left and right. */
function chain(h: number, val: (i: number) => number): Level {
  let root: T | null = null;
  let cur: T | null = null;
  for (let i = 0; i < h; i++) {
    const x: T = { val: val(i), left: null, right: null };
    if (!cur) root = x;
    else if (i % 3 === 0) cur.left = x;
    else cur.right = x;
    cur = x;
  }
  return level(root);
}
const height = (t: T | null): number => (t ? 1 + Math.max(height(t.left), height(t.right)) : 0);
const inorder = (t: T | null, out: number[] = []): number[] => {
  if (t) {
    inorder(t.left, out);
    out.push(t.val);
    inorder(t.right, out);
  }
  return out;
};

// ------------------------------------------------------------------------------- trees

const maxDepth = coding({
  title: 'Maximum Depth of a Binary Tree',
  statement: 'Return the depth of the binary tree: the number of nodes on the longest path from the root down to a leaf. An empty tree has depth 0.',
  constraints: '- 0 ≤ number of nodes ≤ 10^5\n- The height of the tree is at most 500.\n- −10^4 ≤ node value ≤ 10^4',
  difficulty: 'easy',
  tags: ['trees', 'recursion'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(h)',
  fn: 'maxDepth',
  params: [{ name: 'root', type: 'tree' }],
  returns: 'int',
  solve: (root: Level) => height(build(root)),
  samples: [
    { args: [[3, 9, 20, null, null, 15, 7]], explanation: 'The longest path is 3 → 20 → 15 (or 3 → 20 → 7): depth 3.' },
    { args: [[1, null, 2]], explanation: 'The root has only a right child: depth 2.' },
  ],
  hidden: [
    { args: [[]] },
    { args: [[0]] },
    { args: [[1, 2, 3, 4, 5, 6, 7]] },
    { args: [[1, 2, null, 3, null, 4]] },
    { args: [randomTree(rng(601), 100, -100, 100)] },
    { args: [randomTree(rng(602), 1000, -10000, 10000)] },
    { args: [chain(500, (i) => i)] },
    { args: [randomBst(rng(603), 5000, -10000, 10000)] },
    { args: [randomTree(rng(604), 100000, -10000, 10000)], stress: true },
    { args: [[...chain(499, (i) => i % 100)]], stress: true },
  ],
  solutions: {
    python: 'if root is None:\n    return 0\nreturn 1 + max(max_depth(root.left), max_depth(root.right))',
    javascript: 'if (!root) return 0;\nreturn 1 + Math.max(maxDepth(root.left), maxDepth(root.right));',
    java: 'if (root == null) return 0;\nreturn 1 + Math.max(maxDepth(root.left), maxDepth(root.right));',
    csharp: 'if (root == null) return 0;\nreturn 1 + Math.Max(MaxDepth(root.left), MaxDepth(root.right));',
    go: 'if root == nil {\n    return 0\n}\nl, r := maxDepth(root.Left), maxDepth(root.Right)\nif l > r {\n    return l + 1\n}\nreturn r + 1',
    rust: { helpers: 'fn depth(t: &Option<Box<TreeNode>>) -> i32 {\n    match t {\n        None => 0,\n        Some(n) => 1 + depth(&n.left).max(depth(&n.right)),\n    }\n}', body: 'depth(&root)' },
    cpp: 'if (!root) return 0;\nreturn 1 + max(maxDepth(root->left), maxDepth(root->right));',
    c: 'if (!root) return 0;\nint l = max_depth(root->left), r = max_depth(root->right);\nreturn 1 + (l > r ? l : r);',
  },
});

const pathSumOf = (t: T | null, target: number): boolean => {
  if (!t) return false;
  if (!t.left && !t.right) return t.val === target;
  return pathSumOf(t.left, target - t.val) || pathSumOf(t.right, target - t.val);
};

const hasPathSum = coding({
  title: 'Root-to-Leaf Path Sum',
  statement: 'Return **true** if the tree has a path from the root down to a **leaf** (a node without children) whose values add up to `target`. An empty tree has no paths.',
  constraints: '- 0 ≤ number of nodes ≤ 10^5\n- The height of the tree is at most 500.\n- −1000 ≤ node value ≤ 1000\n- −10^6 ≤ target ≤ 10^6',
  difficulty: 'easy',
  tags: ['trees', 'recursion'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(h)',
  fn: 'hasPathSum',
  params: [{ name: 'root', type: 'tree' }, { name: 'target', type: 'int' }],
  returns: 'bool',
  solve: (root: Level, target: number) => pathSumOf(build(root), target),
  samples: [
    { args: [[5, 4, 8, 11, null, 13, 4, 7, 2, null, null, null, 1], 22], explanation: '5 → 4 → 11 → 2 adds up to 22.' },
    { args: [[1, 2], 1], explanation: 'The root alone is not a leaf (it has a child), so the only path is 1 → 2 = 3.' },
  ],
  hidden: [
    { args: [[], 0] },
    { args: [[7], 7] },
    { args: [[7], 0] },
    { args: [[1, 2, 3], 4] },
    { args: [[-2, null, -3], -5] },
    { args: [randomTree(rng(611), 200, -10, 10), 7] },
    { args: [randomTree(rng(612), 3000, -1000, 1000), 123] },
    { args: [chain(500, () => 1000), 500000] },
    { args: [randomTree(rng(613), 100000, -1000, 1000), 999999], stress: true },
    { args: [randomTree(rng(614), 100000, 0, 3), 40], stress: true },
  ],
  solutions: {
    python: 'if root is None:\n    return False\nif root.left is None and root.right is None:\n    return root.val == target\nreturn has_path_sum(root.left, target - root.val) or has_path_sum(root.right, target - root.val)',
    javascript: 'if (!root) return false;\nif (!root.left && !root.right) return root.val === target;\nreturn hasPathSum(root.left, target - root.val) || hasPathSum(root.right, target - root.val);',
    java: 'if (root == null) return false;\nif (root.left == null && root.right == null) return root.val == target;\nreturn hasPathSum(root.left, target - root.val) || hasPathSum(root.right, target - root.val);',
    csharp: 'if (root == null) return false;\nif (root.left == null && root.right == null) return root.val == target;\nreturn HasPathSum(root.left, target - root.val) || HasPathSum(root.right, target - root.val);',
    go: 'if root == nil {\n    return false\n}\nif root.Left == nil && root.Right == nil {\n    return root.Val == target\n}\nreturn hasPathSum(root.Left, target-root.Val) || hasPathSum(root.Right, target-root.Val)',
    rust: {
      helpers: 'fn walk(t: &Option<Box<TreeNode>>, target: i32) -> bool {\n    match t {\n        None => false,\n        Some(n) => {\n            if n.left.is_none() && n.right.is_none() {\n                return n.val == target;\n            }\n            walk(&n.left, target - n.val) || walk(&n.right, target - n.val)\n        }\n    }\n}',
      body: 'walk(&root, target)',
    },
    cpp: 'if (!root) return false;\nif (!root->left && !root->right) return root->val == target;\nreturn hasPathSum(root->left, target - root->val) || hasPathSum(root->right, target - root->val);',
    c: 'if (!root) return false;\nif (!root->left && !root->right) return root->val == target;\nreturn has_path_sum(root->left, target - root->val) || has_path_sum(root->right, target - root->val);',
  },
});

const inorderTraversal = coding({
  title: 'Inorder Traversal',
  statement: 'Return the node values in **inorder**: left subtree, then the node, then the right subtree. Try it without recursion, using an explicit stack.',
  constraints: '- 0 ≤ number of nodes ≤ 5·10^4\n- The height of the tree is at most 500.\n- −10^5 ≤ node value ≤ 10^5',
  difficulty: 'easy',
  tags: ['trees', 'stack'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(h)',
  fn: 'inorderTraversal',
  params: [{ name: 'root', type: 'tree' }],
  returns: 'int[]',
  solve: (root: Level) => inorder(build(root)),
  samples: [
    { args: [[1, null, 2, 3]], explanation: '1 has no left child, so it comes first; then its right subtree 2 → (3 on the left): 1, 3, 2.' },
    { args: [[4, 2, 6, 1, 3, 5, 7]], explanation: 'For a binary search tree, inorder lists the values in sorted order.' },
  ],
  hidden: [
    { args: [[]] },
    { args: [[1]] },
    { args: [[1, 2]] },
    { args: [[1, null, 2]] },
    { args: [randomTree(rng(621), 300, -100, 100)] },
    { args: [randomBst(rng(622), 3000, -100000, 100000)] },
    { args: [chain(500, (i) => i * 7 - 1000)] },
    { args: [randomTree(rng(623), 5000, -100000, 100000)] },
    { args: [randomTree(rng(624), 50000, -100000, 100000)], stress: true },
    { args: [randomBst(rng(625), 50000, -100000, 100000)], stress: true },
  ],
  solutions: {
    python: 'res = []\nstack = []\ncur = root\nwhile cur or stack:\n    while cur:\n        stack.append(cur)\n        cur = cur.left\n    cur = stack.pop()\n    res.append(cur.val)\n    cur = cur.right\nreturn res',
    javascript: 'const res = [], stack = [];\nlet cur = root;\nwhile (cur || stack.length) {\n  while (cur) { stack.push(cur); cur = cur.left; }\n  cur = stack.pop();\n  res.push(cur.val);\n  cur = cur.right;\n}\nreturn res;',
    java: 'ArrayList<Integer> res = new ArrayList<>();\nArrayDeque<TreeNode> stack = new ArrayDeque<>();\nTreeNode cur = root;\nwhile (cur != null || !stack.isEmpty()) {\n    while (cur != null) { stack.push(cur); cur = cur.left; }\n    cur = stack.pop();\n    res.add(cur.val);\n    cur = cur.right;\n}\nint[] out = new int[res.size()];\nfor (int i = 0; i < out.length; i++) out[i] = res.get(i);\nreturn out;',
    csharp: 'var res = new List<int>();\nvar stack = new Stack<TreeNode>();\nvar cur = root;\nwhile (cur != null || stack.Count > 0)\n{\n    while (cur != null) { stack.Push(cur); cur = cur.left; }\n    cur = stack.Pop();\n    res.Add(cur.val);\n    cur = cur.right;\n}\nreturn res.ToArray();',
    go: 'res := []int{}\nstack := []*TreeNode{}\ncur := root\nfor cur != nil || len(stack) > 0 {\n    for cur != nil {\n        stack = append(stack, cur)\n        cur = cur.Left\n    }\n    cur = stack[len(stack)-1]\n    stack = stack[:len(stack)-1]\n    res = append(res, cur.Val)\n    cur = cur.Right\n}\nreturn res',
    rust: 'let mut res = Vec::new();\nlet mut stack: Vec<&TreeNode> = Vec::new();\nlet mut cur = root.as_deref();\nwhile cur.is_some() || !stack.is_empty() {\n    while let Some(n) = cur {\n        stack.push(n);\n        cur = n.left.as_deref();\n    }\n    let n = stack.pop().unwrap();\n    res.push(n.val);\n    cur = n.right.as_deref();\n}\nres',
    cpp: 'vector<int> res;\nvector<TreeNode*> st;\nTreeNode* cur = root;\nwhile (cur || !st.empty()) {\n    while (cur) { st.push_back(cur); cur = cur->left; }\n    cur = st.back();\n    st.pop_back();\n    res.push_back(cur->val);\n    cur = cur->right;\n}\nreturn res;',
    c: 'int cap = 1024, n = 0, top = 0;\nint *res = malloc(sizeof(int) * (size_t)cap);\nstruct TreeNode **st = malloc(sizeof(struct TreeNode *) * 1024);\nstruct TreeNode *cur = root;\nwhile (cur || top) {\n    while (cur) { st[top++] = cur; cur = cur->left; }\n    cur = st[--top];\n    if (n == cap) { cap *= 2; res = realloc(res, sizeof(int) * (size_t)cap); }\n    res[n++] = cur->val;\n    cur = cur->right;\n}\nfree(st);\n*return_size = n;\nreturn res;',
  },
});

const isBst = (vals: Level) => {
  const a = inorder(build(vals));
  return a.every((x, i) => i === 0 || a[i - 1]! < x);
};
const breakBst = (vals: Level, seed: number): Level => {
  const r = rng(seed);
  const a = [...vals];
  const idx = a.map((v, i) => (v === null ? -1 : i)).filter((i) => i > 0);
  const i = idx[Math.floor(r() * idx.length)]!;
  a[i] = (a[i] as number) + (r() < 0.5 ? 1 : -1) * 3000000;
  return a;
};

const isValidBST = coding({
  title: 'Validate a Binary Search Tree',
  statement:
    'Return **true** if the tree is a binary search tree: for every node, all values in its left subtree are strictly smaller and all values in its right subtree are strictly larger. Comparing each node only with its children is not enough.',
  constraints: '- 1 ≤ number of nodes ≤ 10^5\n- The height of the tree is at most 500.\n- −2^31 ≤ node value ≤ 2^31 − 1',
  difficulty: 'moderate',
  tags: ['trees', 'binary-search-tree'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(h)',
  fn: 'isValidBST',
  params: [{ name: 'root', type: 'tree' }],
  returns: 'bool',
  solve: (root: Level) => isBst(root),
  samples: [
    { args: [[2, 1, 3]], explanation: '1 < 2 < 3.' },
    { args: [[5, 1, 6, null, null, 3, 7]], explanation: '3 is in the right subtree of 5 but smaller than 5, even though it is smaller than its parent 6.' },
  ],
  hidden: [
    { args: [[1]] },
    { args: [[1, 1]] },
    { args: [[2147483647]] },
    { args: [[-2147483648, null, 2147483647]] },
    { args: [[10, 5, 15, null, null, 6, 20]] },
    { args: [randomBst(rng(631), 1000, -1000000, 1000000)] },
    { args: [breakBst(randomBst(rng(632), 1000, -1000000, 1000000), 633)] },
    { args: [chain(500, (i) => i)] },
    { args: [randomBst(rng(634), 100000, -1000000000, 1000000000)], stress: true },
    { args: [breakBst(randomBst(rng(635), 100000, -1000000000, 1000000000), 636)], stress: true },
  ],
  solutions: {
    python: 'stack = []\ncur = root\nprev = None\nwhile cur or stack:\n    while cur:\n        stack.append(cur)\n        cur = cur.left\n    cur = stack.pop()\n    if prev is not None and cur.val <= prev:\n        return False\n    prev = cur.val\n    cur = cur.right\nreturn True',
    javascript: 'const stack = [];\nlet cur = root, prev = null;\nwhile (cur || stack.length) {\n  while (cur) { stack.push(cur); cur = cur.left; }\n  cur = stack.pop();\n  if (prev !== null && cur.val <= prev) return false;\n  prev = cur.val;\n  cur = cur.right;\n}\nreturn true;',
    java: 'ArrayDeque<TreeNode> stack = new ArrayDeque<>();\nTreeNode cur = root;\nlong prev = Long.MIN_VALUE;\nwhile (cur != null || !stack.isEmpty()) {\n    while (cur != null) { stack.push(cur); cur = cur.left; }\n    cur = stack.pop();\n    if (cur.val <= prev) return false;\n    prev = cur.val;\n    cur = cur.right;\n}\nreturn true;',
    csharp: 'var stack = new Stack<TreeNode>();\nvar cur = root;\nlong prev = long.MinValue;\nwhile (cur != null || stack.Count > 0)\n{\n    while (cur != null) { stack.Push(cur); cur = cur.left; }\n    cur = stack.Pop();\n    if (cur.val <= prev) return false;\n    prev = cur.val;\n    cur = cur.right;\n}\nreturn true;',
    go: 'stack := []*TreeNode{}\ncur := root\nprev, first := 0, true\nfor cur != nil || len(stack) > 0 {\n    for cur != nil {\n        stack = append(stack, cur)\n        cur = cur.Left\n    }\n    cur = stack[len(stack)-1]\n    stack = stack[:len(stack)-1]\n    if !first && cur.Val <= prev {\n        return false\n    }\n    prev, first = cur.Val, false\n    cur = cur.Right\n}\nreturn true',
    rust: 'let mut stack: Vec<&TreeNode> = Vec::new();\nlet mut cur = root.as_deref();\nlet mut prev: i64 = i64::MIN;\nwhile cur.is_some() || !stack.is_empty() {\n    while let Some(n) = cur {\n        stack.push(n);\n        cur = n.left.as_deref();\n    }\n    let n = stack.pop().unwrap();\n    if (n.val as i64) <= prev {\n        return false;\n    }\n    prev = n.val as i64;\n    cur = n.right.as_deref();\n}\ntrue',
    cpp: 'vector<TreeNode*> st;\nTreeNode* cur = root;\nlong long prev = LLONG_MIN;\nwhile (cur || !st.empty()) {\n    while (cur) { st.push_back(cur); cur = cur->left; }\n    cur = st.back();\n    st.pop_back();\n    if (cur->val <= prev) return false;\n    prev = cur->val;\n    cur = cur->right;\n}\nreturn true;',
    c: 'struct TreeNode **st = malloc(sizeof(struct TreeNode *) * 1024);\nint top = 0;\nstruct TreeNode *cur = root;\nlong long prev = LLONG_MIN;\nbool ok = true;\nwhile (ok && (cur || top)) {\n    while (cur) { st[top++] = cur; cur = cur->left; }\n    cur = st[--top];\n    if (cur->val <= prev) ok = false;\n    prev = cur->val;\n    cur = cur->right;\n}\nfree(st);\nreturn ok;',
  },
});

const rightView = (vals: Level) => {
  const out: number[] = [];
  let lvl: T[] = build(vals) ? [build(vals)!] : [];
  while (lvl.length) {
    out.push(lvl[lvl.length - 1]!.val);
    lvl = lvl.flatMap((x) => [x.left, x.right].filter((c): c is T => c !== null));
  }
  return out;
};

const rightSideView = coding({
  title: 'Binary Tree Right Side View',
  statement: 'Imagine standing to the right of the tree. Return the values of the nodes you can see, from top to bottom: the last node of each level.',
  constraints: '- 0 ≤ number of nodes ≤ 10^5\n- The height of the tree is at most 500.\n- −10^4 ≤ node value ≤ 10^4',
  difficulty: 'moderate',
  tags: ['trees', 'bfs'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'rightSideView',
  params: [{ name: 'root', type: 'tree' }],
  returns: 'int[]',
  solve: (root: Level) => rightView(root),
  samples: [
    { args: [[1, 2, 3, null, 5, null, 4]], explanation: 'Levels: [1], [2, 3], [5, 4]. The last of each is 1, 3, 4.' },
    { args: [[1, 2, 3, 4]], explanation: 'The bottom level has only 4 (under 2), so it is visible from the right: 1, 3, 4.' },
  ],
  hidden: [
    { args: [[]] },
    { args: [[1]] },
    { args: [[1, 2]] },
    { args: [[1, null, 2]] },
    { args: [[1, 2, 3, 4, 5, 6, 7]] },
    { args: [randomTree(rng(641), 500, -10000, 10000)] },
    { args: [randomTree(rng(642), 5000, -10000, 10000)] },
    { args: [chain(500, (i) => i)] },
    { args: [randomTree(rng(643), 100000, -10000, 10000)], stress: true },
    { args: [randomBst(rng(644), 20000, -10000, 10000)], stress: true },
  ],
  solutions: {
    python: 'res = []\nlevel = [root] if root else []\nwhile level:\n    res.append(level[-1].val)\n    nxt = []\n    for x in level:\n        if x.left:\n            nxt.append(x.left)\n        if x.right:\n            nxt.append(x.right)\n    level = nxt\nreturn res',
    javascript: 'const res = [];\nlet level = root ? [root] : [];\nwhile (level.length) {\n  res.push(level[level.length - 1].val);\n  const nxt = [];\n  for (const x of level) {\n    if (x.left) nxt.push(x.left);\n    if (x.right) nxt.push(x.right);\n  }\n  level = nxt;\n}\nreturn res;',
    java: 'ArrayList<Integer> res = new ArrayList<>();\nArrayDeque<TreeNode> q = new ArrayDeque<>();\nif (root != null) q.add(root);\nwhile (!q.isEmpty()) {\n    int size = q.size();\n    for (int i = 0; i < size; i++) {\n        TreeNode x = q.poll();\n        if (i == size - 1) res.add(x.val);\n        if (x.left != null) q.add(x.left);\n        if (x.right != null) q.add(x.right);\n    }\n}\nint[] out = new int[res.size()];\nfor (int i = 0; i < out.length; i++) out[i] = res.get(i);\nreturn out;',
    csharp: 'var res = new List<int>();\nvar q = new Queue<TreeNode>();\nif (root != null) q.Enqueue(root);\nwhile (q.Count > 0)\n{\n    int size = q.Count;\n    for (int i = 0; i < size; i++)\n    {\n        var x = q.Dequeue();\n        if (i == size - 1) res.Add(x.val);\n        if (x.left != null) q.Enqueue(x.left);\n        if (x.right != null) q.Enqueue(x.right);\n    }\n}\nreturn res.ToArray();',
    go: 'res := []int{}\nlevel := []*TreeNode{}\nif root != nil {\n    level = append(level, root)\n}\nfor len(level) > 0 {\n    res = append(res, level[len(level)-1].Val)\n    next := []*TreeNode{}\n    for _, x := range level {\n        if x.Left != nil {\n            next = append(next, x.Left)\n        }\n        if x.Right != nil {\n            next = append(next, x.Right)\n        }\n    }\n    level = next\n}\nreturn res',
    rust: 'let mut res = Vec::new();\nlet mut level: Vec<&TreeNode> = root.as_deref().into_iter().collect();\nwhile let Some(last) = level.last() {\n    res.push(last.val);\n    let mut next = Vec::new();\n    for x in &level {\n        if let Some(l) = x.left.as_deref() {\n            next.push(l);\n        }\n        if let Some(r) = x.right.as_deref() {\n            next.push(r);\n        }\n    }\n    level = next;\n}\nres',
    cpp: 'vector<int> res;\nvector<TreeNode*> level;\nif (root) level.push_back(root);\nwhile (!level.empty()) {\n    res.push_back(level.back()->val);\n    vector<TreeNode*> next;\n    for (TreeNode* x : level) {\n        if (x->left) next.push_back(x->left);\n        if (x->right) next.push_back(x->right);\n    }\n    level.swap(next);\n}\nreturn res;',
    c: 'int cap = 1024;\nstruct TreeNode **q = malloc(sizeof(struct TreeNode *) * (size_t)cap);\nint *res = malloc(sizeof(int) * 512);\nint head = 0, tail = 0, n = 0;\nif (root) q[tail++] = root;\nwhile (head < tail) {\n    int end = tail;\n    res[n++] = q[end - 1]->val;\n    for (; head < end; head++) {\n        struct TreeNode *x = q[head];\n        if (tail + 2 > cap) { cap *= 2; q = realloc(q, sizeof(struct TreeNode *) * (size_t)cap); }\n        if (x->left) q[tail++] = x->left;\n        if (x->right) q[tail++] = x->right;\n    }\n}\nfree(q);\n*return_size = n;\nreturn res;',
  },
});

const maxPathOf = (vals: Level) => {
  let best = -Infinity;
  const gain = (t: T | null): number => {
    if (!t) return 0;
    const l = Math.max(0, gain(t.left));
    const r = Math.max(0, gain(t.right));
    best = Math.max(best, t.val + l + r);
    return t.val + Math.max(l, r);
  };
  gain(build(vals));
  return best;
};

const maxPathSum = coding({
  title: 'Binary Tree Maximum Path Sum',
  statement:
    'A path is a sequence of nodes where each pair of consecutive nodes is connected by an edge; it does not have to pass through the root, and it contains at least one node. Return the largest possible sum of the node values on a path.',
  constraints: '- 1 ≤ number of nodes ≤ 5·10^4\n- The height of the tree is at most 500.\n- −10^6 ≤ node value ≤ 10^6\n- Use 64-bit integers for sums.',
  difficulty: 'hard',
  tags: ['trees', 'recursion', 'dynamic-programming'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(h)',
  fn: 'maxPathSum',
  params: [{ name: 'root', type: 'tree' }],
  returns: 'long',
  solve: (root: Level) => maxPathOf(root),
  samples: [
    { args: [[1, 2, 3]], explanation: 'The path 2 → 1 → 3 has sum 6.' },
    { args: [[-10, 9, 20, null, null, 15, 7]], explanation: 'The best path is 15 → 20 → 7 = 42; it does not include the root.' },
  ],
  hidden: [
    { args: [[-3]] },
    { args: [[5]] },
    { args: [[-1, -2, -3]] },
    { args: [[2, -1]] },
    { args: [[1, -2, 3, 4, null, null, -5]] },
    { args: [randomTree(rng(651), 1000, -100, 100)] },
    { args: [randomTree(rng(652), 3000, -1000000, 1000000)] },
    { args: [chain(500, () => 1000000)] },
    { args: [randomTree(rng(653), 50000, -1000000, 1000000)], stress: true },
    { args: [randomTree(rng(654), 50000, -1000, 999999)], stress: true },
  ],
  solutions: {
    python: {
      helpers: 'def _gain(node, best):\n    if node is None:\n        return 0\n    left = max(0, _gain(node.left, best))\n    right = max(0, _gain(node.right, best))\n    best[0] = max(best[0], node.val + left + right)\n    return node.val + max(left, right)',
      body: 'best = [float("-inf")]\n_gain(root, best)\nreturn best[0]',
    },
    javascript: {
      helpers: 'function gain(node, best) {\n  if (!node) return 0;\n  const l = Math.max(0, gain(node.left, best));\n  const r = Math.max(0, gain(node.right, best));\n  best.v = Math.max(best.v, node.val + l + r);\n  return node.val + Math.max(l, r);\n}',
      body: 'const best = { v: -Infinity };\ngain(root, best);\nreturn best.v;',
    },
    java: {
      helpers: 'private long best;\n\nprivate long gain(TreeNode node) {\n    if (node == null) return 0;\n    long l = Math.max(0, gain(node.left)), r = Math.max(0, gain(node.right));\n    best = Math.max(best, node.val + l + r);\n    return node.val + Math.max(l, r);\n}',
      body: 'best = Long.MIN_VALUE;\ngain(root);\nreturn best;',
    },
    csharp: {
      helpers: 'private long best;\n\nprivate long Gain(TreeNode node)\n{\n    if (node == null) return 0;\n    long l = Math.Max(0, Gain(node.left)), r = Math.Max(0, Gain(node.right));\n    best = Math.Max(best, node.val + l + r);\n    return node.val + Math.Max(l, r);\n}',
      body: 'best = long.MinValue;\nGain(root);\nreturn best;',
    },
    go: {
      helpers: 'func gain(node *TreeNode, best *int64) int64 {\n    if node == nil {\n        return 0\n    }\n    l, r := gain(node.Left, best), gain(node.Right, best)\n    if l < 0 {\n        l = 0\n    }\n    if r < 0 {\n        r = 0\n    }\n    if s := int64(node.Val) + l + r; s > *best {\n        *best = s\n    }\n    if l > r {\n        return int64(node.Val) + l\n    }\n    return int64(node.Val) + r\n}',
      imports: ['math'],
      body: 'best := int64(math.MinInt64)\ngain(root, &best)\nreturn best',
    },
    rust: {
      helpers: 'fn gain(t: &Option<Box<TreeNode>>, best: &mut i64) -> i64 {\n    match t {\n        None => 0,\n        Some(n) => {\n            let l = gain(&n.left, best).max(0);\n            let r = gain(&n.right, best).max(0);\n            *best = (*best).max(n.val as i64 + l + r);\n            n.val as i64 + l.max(r)\n        }\n    }\n}',
      body: 'let mut best = i64::MIN;\ngain(&root, &mut best);\nbest',
    },
    cpp: {
      helpers: 'long long gainOf(TreeNode* node, long long& best) {\n    if (!node) return 0;\n    long long l = max(0LL, gainOf(node->left, best)), r = max(0LL, gainOf(node->right, best));\n    best = max(best, node->val + l + r);\n    return node->val + max(l, r);\n}',
      body: 'long long best = LLONG_MIN;\ngainOf(root, best);\nreturn best;',
    },
    c: {
      helpers: 'static long long gain_of(struct TreeNode *node, long long *best) {\n    if (!node) return 0;\n    long long l = gain_of(node->left, best), r = gain_of(node->right, best);\n    if (l < 0) l = 0;\n    if (r < 0) r = 0;\n    if (node->val + l + r > *best) *best = node->val + l + r;\n    return node->val + (l > r ? l : r);\n}',
      body: 'long long best = LLONG_MIN;\ngain_of(root, &best);\nreturn best;',
    },
  },
});

// ------------------------------------------------------------------------------- graphs

const randomEdges = (r: Rng, n: number, m: number) => Array.from({ length: m }, () => [int(r, 0, n - 1), int(r, 0, n - 1)]);
const connected = (n: number, edges: number[][], s: number, d: number) => {
  const p = range(n);
  const find = (x: number): number => {
    while (p[x] !== x) {
      p[x] = p[p[x]!]!;
      x = p[x]!;
    }
    return x;
  };
  for (const [a, b] of edges) p[find(a!)] = find(b!);
  return find(s) === find(d);
};

const pathExists = coding({
  title: 'Does a Path Exist?',
  statement: 'An undirected graph has `n` vertices numbered 0 … n−1 and the given `edges` (each row is a pair `u v`). Return **true** if there is a path from `source` to `destination`.',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- 0 ≤ number of edges ≤ 2·10^5\n- 0 ≤ u, v, source, destination < n (self-loops and repeated edges may appear)',
  difficulty: 'easy',
  tags: ['graphs', 'union-find', 'bfs'],
  timeComplexity: 'O((n + m) α(n))',
  spaceComplexity: 'O(n)',
  fn: 'pathExists',
  params: [{ name: 'n', type: 'int' }, { name: 'edges', type: 'int[][]' }, { name: 'source', type: 'int' }, { name: 'destination', type: 'int' }],
  returns: 'bool',
  solve: (n: number, edges: number[][], s: number, d: number) => connected(n, edges, s, d),
  samples: [
    { args: [3, [[0, 1], [1, 2], [2, 0]], 0, 2], explanation: '0 → 1 → 2 (or the direct edge 2–0).' },
    { args: [6, [[0, 1], [0, 2], [3, 5], [5, 4], [4, 3]], 0, 5], explanation: 'Vertices {0, 1, 2} and {3, 4, 5} are separate components.' },
  ],
  hidden: [
    { args: [1, [], 0, 0] },
    { args: [2, [], 0, 1] },
    { args: [2, [[1, 1]], 0, 1] },
    { args: [2, [[0, 1]], 1, 0] },
    { args: [5, [[0, 1], [1, 2], [3, 4]], 2, 3] },
    { args: [100, randomEdges(rng(661), 100, 60), 3, 97] },
    { args: [1000, randomEdges(rng(662), 1000, 1500), 0, 999] },
    { args: [5000, range(4999).map((i) => [i, i + 1]), 0, 4999] },
    { args: [200000, randomEdges(rng(663), 200000, 200000), 12345, 199999], stress: true },
    { args: [200000, range(199998).map((i) => [i, i + 1]), 0, 199999], stress: true },
  ],
  solutions: {
    python: 'parent = list(range(n))\n\ndef find(x):\n    while parent[x] != x:\n        parent[x] = parent[parent[x]]\n        x = parent[x]\n    return x\n\nfor u, v in edges:\n    parent[find(u)] = find(v)\nreturn find(source) == find(destination)',
    javascript: 'const parent = Int32Array.from({ length: n }, (_, i) => i);\nconst find = (x) => {\n  while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }\n  return x;\n};\nfor (const [u, v] of edges) parent[find(u)] = find(v);\nreturn find(source) === find(destination);',
    java: { helpers: 'private int[] parent;\n\nprivate int find(int x) {\n    while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; }\n    return x;\n}', body: 'parent = new int[n];\nfor (int i = 0; i < n; i++) parent[i] = i;\nfor (int[] e : edges) parent[find(e[0])] = find(e[1]);\nreturn find(source) == find(destination);' },
    csharp: { helpers: 'private int[] parent;\n\nprivate int Find(int x)\n{\n    while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; }\n    return x;\n}', body: 'parent = new int[n];\nfor (int i = 0; i < n; i++) parent[i] = i;\nforeach (var e in edges) parent[Find(e[0])] = Find(e[1]);\nreturn Find(source) == Find(destination);' },
    go: 'parent := make([]int, n)\nfor i := range parent {\n    parent[i] = i\n}\nvar find func(int) int\nfind = func(x int) int {\n    for parent[x] != x {\n        parent[x] = parent[parent[x]]\n        x = parent[x]\n    }\n    return x\n}\nfor _, e := range edges {\n    parent[find(e[0])] = find(e[1])\n}\nreturn find(source) == find(destination)',
    rust: {
      helpers: 'fn find(p: &mut Vec<usize>, mut x: usize) -> usize {\n    while p[x] != x {\n        p[x] = p[p[x]];\n        x = p[x];\n    }\n    x\n}',
      body: 'let mut p: Vec<usize> = (0..n as usize).collect();\nfor e in edges {\n    let a = find(&mut p, e[0] as usize);\n    let b = find(&mut p, e[1] as usize);\n    p[a] = b;\n}\nfind(&mut p, source as usize) == find(&mut p, destination as usize)',
    },
    cpp: 'vector<int> parent(n);\niota(parent.begin(), parent.end(), 0);\nfunction<int(int)> find = [&](int x) {\n    while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; }\n    return x;\n};\nfor (const auto& e : edges) parent[find(e[0])] = find(e[1]);\nreturn find(source) == find(destination);',
    c: {
      helpers: 'static int find_root(int *p, int x) {\n    while (p[x] != x) { p[x] = p[p[x]]; x = p[x]; }\n    return x;\n}',
      body: 'int *p = malloc(sizeof(int) * (size_t)n);\nfor (int i = 0; i < n; i++) p[i] = i;\nfor (int i = 0; i < edges_rows; i++) p[find_root(p, edges[i][0])] = find_root(p, edges[i][1]);\nbool ok = find_root(p, source) == find_root(p, destination);\nfree(p);\nreturn ok;',
    },
  },
});

const islandsOf = (grid: string[]) => {
  const g = grid.map((row) => row.split(''));
  let count = 0;
  for (let i = 0; i < g.length; i++)
    for (let j = 0; j < g[0]!.length; j++) {
      if (g[i]![j] !== '1') continue;
      count++;
      const st = [[i, j]];
      g[i]![j] = '0';
      while (st.length) {
        const [x, y] = st.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = x! + dx!;
          const b = y! + dy!;
          if (a >= 0 && b >= 0 && a < g.length && b < g[0]!.length && g[a]![b] === '1') {
            g[a]![b] = '0';
            st.push([a, b]);
          }
        }
      }
    }
  return count;
};
const randomGrid = (r: Rng, rows: number, cols: number, p: number) => Array.from({ length: rows }, () => Array.from({ length: cols }, () => (r() < p ? '1' : '0')).join(''));

const numIslands = coding({
  title: 'Number of Islands',
  statement: 'The grid is given as rows of `1` (land) and `0` (water). An island is a group of land cells connected horizontally or vertically (not diagonally). Return the number of islands.',
  constraints: '- 1 ≤ rows, cols ≤ 300\n- Every row has the same length and contains only `0` and `1`.',
  difficulty: 'moderate',
  tags: ['graphs', 'grid', 'dfs'],
  timeComplexity: 'O(rows · cols)',
  spaceComplexity: 'O(rows · cols)',
  fn: 'numIslands',
  params: [{ name: 'grid', type: 'string[]' }],
  returns: 'int',
  solve: (grid: string[]) => islandsOf(grid),
  samples: [
    { args: [['11110', '11010', '11000', '00000']], explanation: 'All the land cells touch each other: one island.' },
    { args: [['11000', '11000', '00100', '00011']], explanation: 'Three separate groups.' },
  ],
  hidden: [
    { args: [['0']] },
    { args: [['1']] },
    { args: [['10', '01']] },
    { args: [['111', '101', '111']] },
    { args: [['1010101']] },
    { args: [randomGrid(rng(671), 20, 30, 0.4)] },
    { args: [randomGrid(rng(672), 100, 100, 0.5)] },
    { args: [randomGrid(rng(673), 200, 50, 0.3)] },
    { args: [randomGrid(rng(674), 300, 300, 0.45)], stress: true },
    { args: [Array.from({ length: 300 }, (_, i) => (i % 2 ? '1'.repeat(300) : `${'0'.repeat(299)}1`))], stress: true },
  ],
  solutions: {
    python: 'g = [bytearray(row, "ascii") for row in grid]\nrows, cols = len(g), len(g[0])\ncount = 0\nfor i in range(rows):\n    for j in range(cols):\n        if g[i][j] != 49:\n            continue\n        count += 1\n        g[i][j] = 48\n        stack = [(i, j)]\n        while stack:\n            x, y = stack.pop()\n            for a, b in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):\n                if 0 <= a < rows and 0 <= b < cols and g[a][b] == 49:\n                    g[a][b] = 48\n                    stack.append((a, b))\nreturn count',
    javascript: "const g = grid.map((r) => r.split(''));\nconst rows = g.length, cols = g[0].length;\nlet count = 0;\nfor (let i = 0; i < rows; i++)\n  for (let j = 0; j < cols; j++) {\n    if (g[i][j] !== '1') continue;\n    count++;\n    g[i][j] = '0';\n    const st = [i * cols + j];\n    while (st.length) {\n      const c = st.pop(), x = Math.floor(c / cols), y = c % cols;\n      for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]])\n        if (a >= 0 && b >= 0 && a < rows && b < cols && g[a][b] === '1') { g[a][b] = '0'; st.push(a * cols + b); }\n    }\n  }\nreturn count;",
    java: 'int rows = grid.length, cols = grid[0].length(), count = 0;\nchar[][] g = new char[rows][];\nfor (int i = 0; i < rows; i++) g[i] = grid[i].toCharArray();\nint[] st = new int[rows * cols];\nint[] dx = { 1, -1, 0, 0 }, dy = { 0, 0, 1, -1 };\nfor (int i = 0; i < rows; i++)\n    for (int j = 0; j < cols; j++) {\n        if (g[i][j] != \'1\') continue;\n        count++;\n        g[i][j] = \'0\';\n        int top = 0;\n        st[top++] = i * cols + j;\n        while (top > 0) {\n            int c = st[--top], x = c / cols, y = c % cols;\n            for (int d = 0; d < 4; d++) {\n                int a = x + dx[d], b = y + dy[d];\n                if (a >= 0 && b >= 0 && a < rows && b < cols && g[a][b] == \'1\') { g[a][b] = \'0\'; st[top++] = a * cols + b; }\n            }\n        }\n    }\nreturn count;',
    csharp: 'int rows = grid.Length, cols = grid[0].Length, count = 0;\nvar g = grid.Select(r => r.ToCharArray()).ToArray();\nvar st = new Stack<(int, int)>();\nint[] dx = { 1, -1, 0, 0 }, dy = { 0, 0, 1, -1 };\nfor (int i = 0; i < rows; i++)\n    for (int j = 0; j < cols; j++)\n    {\n        if (g[i][j] != \'1\') continue;\n        count++;\n        g[i][j] = \'0\';\n        st.Push((i, j));\n        while (st.Count > 0)\n        {\n            var (x, y) = st.Pop();\n            for (int d = 0; d < 4; d++)\n            {\n                int a = x + dx[d], b = y + dy[d];\n                if (a >= 0 && b >= 0 && a < rows && b < cols && g[a][b] == \'1\') { g[a][b] = \'0\'; st.Push((a, b)); }\n            }\n        }\n    }\nreturn count;',
    go: 'rows, cols := len(grid), len(grid[0])\ng := make([][]byte, rows)\nfor i := range grid {\n    g[i] = []byte(grid[i])\n}\ncount := 0\ndirs := [4][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}\nfor i := 0; i < rows; i++ {\n    for j := 0; j < cols; j++ {\n        if g[i][j] != \'1\' {\n            continue\n        }\n        count++\n        g[i][j] = \'0\'\n        st := [][2]int{{i, j}}\n        for len(st) > 0 {\n            c := st[len(st)-1]\n            st = st[:len(st)-1]\n            for _, d := range dirs {\n                a, b := c[0]+d[0], c[1]+d[1]\n                if a >= 0 && b >= 0 && a < rows && b < cols && g[a][b] == \'1\' {\n                    g[a][b] = \'0\'\n                    st = append(st, [2]int{a, b})\n                }\n            }\n        }\n    }\n}\nreturn count',
    rust: 'let mut g: Vec<Vec<u8>> = grid.iter().map(|r| r.as_bytes().to_vec()).collect();\nlet (rows, cols) = (g.len() as i32, g[0].len() as i32);\nlet mut count = 0;\nfor i in 0..rows {\n    for j in 0..cols {\n        if g[i as usize][j as usize] != b\'1\' {\n            continue;\n        }\n        count += 1;\n        g[i as usize][j as usize] = b\'0\';\n        let mut st = vec![(i, j)];\n        while let Some((x, y)) = st.pop() {\n            for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {\n                let (a, b) = (x + dx, y + dy);\n                if a >= 0 && b >= 0 && a < rows && b < cols && g[a as usize][b as usize] == b\'1\' {\n                    g[a as usize][b as usize] = b\'0\';\n                    st.push((a, b));\n                }\n            }\n        }\n    }\n}\ncount',
    cpp: 'vector<string> g = grid;\nint rows = g.size(), cols = g[0].size(), count = 0;\nint dx[] = {1, -1, 0, 0}, dy[] = {0, 0, 1, -1};\nfor (int i = 0; i < rows; i++)\n    for (int j = 0; j < cols; j++) {\n        if (g[i][j] != \'1\') continue;\n        count++;\n        g[i][j] = \'0\';\n        vector<pair<int, int>> st{{i, j}};\n        while (!st.empty()) {\n            auto [x, y] = st.back();\n            st.pop_back();\n            for (int d = 0; d < 4; d++) {\n                int a = x + dx[d], b = y + dy[d];\n                if (a >= 0 && b >= 0 && a < rows && b < cols && g[a][b] == \'1\') { g[a][b] = \'0\'; st.push_back({a, b}); }\n            }\n        }\n    }\nreturn count;',
    c: 'int rows = grid_size, cols = (int)strlen(grid[0]), count = 0;\nchar *g = malloc((size_t)rows * (size_t)cols);\nfor (int i = 0; i < rows; i++) memcpy(g + (size_t)i * cols, grid[i], (size_t)cols);\nint *st = malloc(sizeof(int) * (size_t)rows * (size_t)cols);\nint dx[] = {1, -1, 0, 0}, dy[] = {0, 0, 1, -1};\nfor (int i = 0; i < rows; i++)\n    for (int j = 0; j < cols; j++) {\n        if (g[i * cols + j] != \'1\') continue;\n        count++;\n        g[i * cols + j] = \'0\';\n        int top = 0;\n        st[top++] = i * cols + j;\n        while (top > 0) {\n            int c = st[--top], x = c / cols, y = c % cols;\n            for (int d = 0; d < 4; d++) {\n                int a = x + dx[d], b = y + dy[d];\n                if (a >= 0 && b >= 0 && a < rows && b < cols && g[a * cols + b] == \'1\') { g[a * cols + b] = \'0\'; st[top++] = a * cols + b; }\n            }\n        }\n    }\nfree(g);\nfree(st);\nreturn count;',
  },
});

const finishable = (n: number, pre: number[][]) => {
  const indeg = new Array(n).fill(0);
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of pre) {
    adj[b!]!.push(a!);
    indeg[a!]++;
  }
  const q = range(n).filter((i) => indeg[i] === 0);
  for (let i = 0; i < q.length; i++) for (const v of adj[q[i]!]!) if (--indeg[v] === 0) q.push(v);
  return q.length === n;
};
const dag = (r: Rng, n: number, m: number) => {
  const order = shuffle(r, range(n));
  return Array.from({ length: m }, () => {
    const i = int(r, 0, n - 2);
    const j = int(r, i + 1, n - 1);
    return [order[j]!, order[i]!];
  });
};

const canFinish = coding({
  title: 'Course Schedule',
  statement:
    'There are `numCourses` courses numbered 0 … numCourses−1. Each row `[a, b]` of `prerequisites` means you must take course `b` before course `a`. Return **true** if it is possible to finish every course (that is, the prerequisites contain no cycle).',
  constraints: '- 1 ≤ numCourses ≤ 10^5\n- 0 ≤ number of prerequisites ≤ 2·10^5\n- 0 ≤ a, b < numCourses, a ≠ b',
  difficulty: 'moderate',
  tags: ['graphs', 'topological-sort'],
  timeComplexity: 'O(n + m)',
  spaceComplexity: 'O(n + m)',
  fn: 'canFinish',
  params: [{ name: 'numCourses', type: 'int' }, { name: 'prerequisites', type: 'int[][]' }],
  returns: 'bool',
  solve: (n: number, pre: number[][]) => finishable(n, pre),
  samples: [
    { args: [2, [[1, 0]]], explanation: 'Take course 0, then course 1.' },
    { args: [2, [[1, 0], [0, 1]]], explanation: 'Each course needs the other first: a cycle.' },
  ],
  hidden: [
    { args: [1, []] },
    { args: [3, []] },
    { args: [3, [[1, 0], [2, 1]]] },
    { args: [3, [[1, 0], [2, 1], [0, 2]]] },
    { args: [4, [[1, 0], [2, 0], [3, 1], [3, 2]]] },
    { args: [200, dag(rng(681), 200, 600)] },
    { args: [200, [...dag(rng(682), 200, 600), [5, 0], [0, 5]]] },
    { args: [5000, range(4999).map((i) => [i + 1, i])] },
    { args: [100000, dag(rng(683), 100000, 200000)], stress: true },
    { args: [100000, [...range(99999).map((i) => [i + 1, i]), [0, 99999]]], stress: true },
  ],
  solutions: {
    python: 'adj = [[] for _ in range(num_courses)]\nindeg = [0] * num_courses\nfor a, b in prerequisites:\n    adj[b].append(a)\n    indeg[a] += 1\nq = [i for i in range(num_courses) if indeg[i] == 0]\nfor u in q:\n    for v in adj[u]:\n        indeg[v] -= 1\n        if indeg[v] == 0:\n            q.append(v)\nreturn len(q) == num_courses',
    javascript: 'const adj = Array.from({ length: numCourses }, () => []);\nconst indeg = new Int32Array(numCourses);\nfor (const [a, b] of prerequisites) { adj[b].push(a); indeg[a]++; }\nconst q = [];\nfor (let i = 0; i < numCourses; i++) if (indeg[i] === 0) q.push(i);\nfor (let i = 0; i < q.length; i++) for (const v of adj[q[i]]) if (--indeg[v] === 0) q.push(v);\nreturn q.length === numCourses;',
    java: 'List<List<Integer>> adj = new ArrayList<>();\nfor (int i = 0; i < numCourses; i++) adj.add(new ArrayList<>());\nint[] indeg = new int[numCourses];\nfor (int[] p : prerequisites) { adj.get(p[1]).add(p[0]); indeg[p[0]]++; }\nint[] q = new int[numCourses];\nint head = 0, tail = 0;\nfor (int i = 0; i < numCourses; i++) if (indeg[i] == 0) q[tail++] = i;\nwhile (head < tail) for (int v : adj.get(q[head++])) if (--indeg[v] == 0) q[tail++] = v;\nreturn tail == numCourses;',
    csharp: 'var adj = new List<int>[numCourses];\nfor (int i = 0; i < numCourses; i++) adj[i] = new List<int>();\nvar indeg = new int[numCourses];\nforeach (var p in prerequisites) { adj[p[1]].Add(p[0]); indeg[p[0]]++; }\nvar q = new Queue<int>();\nfor (int i = 0; i < numCourses; i++) if (indeg[i] == 0) q.Enqueue(i);\nint seen = 0;\nwhile (q.Count > 0)\n{\n    int u = q.Dequeue();\n    seen++;\n    foreach (var v in adj[u]) if (--indeg[v] == 0) q.Enqueue(v);\n}\nreturn seen == numCourses;',
    go: 'adj := make([][]int, numCourses)\nindeg := make([]int, numCourses)\nfor _, p := range prerequisites {\n    adj[p[1]] = append(adj[p[1]], p[0])\n    indeg[p[0]]++\n}\nq := []int{}\nfor i := 0; i < numCourses; i++ {\n    if indeg[i] == 0 {\n        q = append(q, i)\n    }\n}\nfor i := 0; i < len(q); i++ {\n    for _, v := range adj[q[i]] {\n        indeg[v]--\n        if indeg[v] == 0 {\n            q = append(q, v)\n        }\n    }\n}\nreturn len(q) == numCourses',
    rust: 'let n = num_courses as usize;\nlet mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];\nlet mut indeg = vec![0usize; n];\nfor p in prerequisites {\n    adj[p[1] as usize].push(p[0] as usize);\n    indeg[p[0] as usize] += 1;\n}\nlet mut q: Vec<usize> = (0..n).filter(|&i| indeg[i] == 0).collect();\nlet mut i = 0;\nwhile i < q.len() {\n    let u = q[i];\n    i += 1;\n    for &v in &adj[u] {\n        indeg[v] -= 1;\n        if indeg[v] == 0 {\n            q.push(v);\n        }\n    }\n}\nq.len() == n',
    cpp: 'vector<vector<int>> adj(numCourses);\nvector<int> indeg(numCourses), q;\nfor (const auto& p : prerequisites) { adj[p[1]].push_back(p[0]); indeg[p[0]]++; }\nfor (int i = 0; i < numCourses; i++) if (!indeg[i]) q.push_back(i);\nfor (size_t i = 0; i < q.size(); i++) for (int v : adj[q[i]]) if (--indeg[v] == 0) q.push_back(v);\nreturn (int)q.size() == numCourses;',
    c: 'int n = num_courses, m = prerequisites_rows;\nint *start = calloc((size_t)n + 1, sizeof(int)), *to = malloc(sizeof(int) * (size_t)(m > 0 ? m : 1)), *indeg = calloc((size_t)n, sizeof(int));\nfor (int i = 0; i < m; i++) { start[prerequisites[i][1] + 1]++; indeg[prerequisites[i][0]]++; }\nfor (int i = 0; i < n; i++) start[i + 1] += start[i];\nint *pos = malloc(sizeof(int) * (size_t)n);\nmemcpy(pos, start, sizeof(int) * (size_t)n);\nfor (int i = 0; i < m; i++) to[pos[prerequisites[i][1]]++] = prerequisites[i][0];\nint *q = malloc(sizeof(int) * (size_t)n);\nint head = 0, tail = 0;\nfor (int i = 0; i < n; i++) if (!indeg[i]) q[tail++] = i;\nwhile (head < tail) {\n    int u = q[head++];\n    for (int k = start[u]; k < start[u + 1]; k++) if (--indeg[to[k]] == 0) q[tail++] = to[k];\n}\nbool ok = tail == n;\nfree(start); free(to); free(indeg); free(pos); free(q);\nreturn ok;',
  },
});

const dijkstraOf = (n: number, edges: number[][], src: number) => {
  const adj: [number, number][][] = Array.from({ length: n }, () => []);
  for (const [u, v, w] of edges) adj[u!]!.push([v!, w!]);
  const dist = new Array<number>(n).fill(Infinity);
  dist[src] = 0;
  // Simple O(n²)-free version for the reference: a binary heap.
  const heap: [number, number][] = [[0, src]];
  const push = (x: [number, number]) => {
    heap.push(x);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= heap[i]![0]) break;
      [heap[p], heap[i]] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u]!) continue;
    for (const [v, w] of adj[u]!) if (d + w < dist[v]!) {
      dist[v] = d + w;
      push([dist[v]!, v]);
    }
  }
  return dist.map((d) => (d === Infinity ? -1 : d));
};
const weighted = (r: Rng, n: number, m: number, maxW: number) => Array.from({ length: m }, () => [int(r, 0, n - 1), int(r, 0, n - 1), int(r, 1, maxW)]);

const shortestPaths = coding({
  title: 'Shortest Paths From a Source (Dijkstra)',
  statement:
    'A directed graph has `n` vertices numbered 0 … n−1. Each row of `edges` is `u v w`: an edge from u to v with positive weight w. Return, for every vertex, the length of the shortest path from `source`, or **−1** if it cannot be reached.',
  constraints: '- 1 ≤ n ≤ 3·10^4\n- 0 ≤ number of edges ≤ 10^5\n- 1 ≤ w ≤ 10^4 (parallel edges and self-loops may appear)',
  difficulty: 'hard',
  tags: ['graphs', 'shortest-paths', 'heap'],
  timeComplexity: 'O((n + m) log n)',
  spaceComplexity: 'O(n + m)',
  fn: 'shortestPaths',
  params: [{ name: 'n', type: 'int' }, { name: 'edges', type: 'int[][]' }, { name: 'source', type: 'int' }],
  returns: 'long[]',
  solve: (n: number, edges: number[][], src: number) => dijkstraOf(n, edges, src),
  samples: [
    { args: [4, [[0, 1, 4], [0, 2, 1], [2, 1, 2], [1, 3, 1]], 0], explanation: '0 → 2 → 1 costs 3, cheaper than the direct edge of 4; 3 is reached via 1 at cost 4.' },
    { args: [3, [[1, 2, 5]], 0], explanation: 'Nothing leaves vertex 0, so 1 and 2 are unreachable.' },
  ],
  hidden: [
    { args: [1, [], 0] },
    { args: [2, [[0, 1, 10000]], 1] },
    { args: [2, [[0, 0, 5], [0, 1, 3], [0, 1, 2]], 0] },
    { args: [5, [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [0, 4, 10]], 0] },
    { args: [5, [[4, 3, 1], [3, 2, 1], [2, 1, 1], [1, 0, 1]], 2] },
    { args: [100, weighted(rng(691), 100, 400, 100), 0] },
    { args: [2000, weighted(rng(692), 2000, 8000, 10000), 17] },
    { args: [5000, range(4999).map((i) => [i, i + 1, 10000]), 0] },
    { args: [30000, weighted(rng(693), 30000, 100000, 10000), 0], stress: true },
    { args: [30000, [...range(29999).map((i) => [i, i + 1, 1]), ...weighted(rng(694), 30000, 70000, 10000)], 0], stress: true },
  ],
  solutions: {
    python: {
      helpers: 'import heapq',
      body: 'adj = [[] for _ in range(n)]\nfor u, v, w in edges:\n    adj[u].append((v, w))\nINF = float("inf")\ndist = [INF] * n\ndist[source] = 0\nheap = [(0, source)]\nwhile heap:\n    d, u = heapq.heappop(heap)\n    if d > dist[u]:\n        continue\n    for v, w in adj[u]:\n        nd = d + w\n        if nd < dist[v]:\n            dist[v] = nd\n            heapq.heappush(heap, (nd, v))\nreturn [d if d != INF else -1 for d in dist]',
    },
    javascript: {
      helpers:
        'class MinHeap {\n  constructor() { this.a = []; }\n  get size() { return this.a.length; }\n  push(d, v) {\n    const a = this.a;\n    a.push([d, v]);\n    let i = a.length - 1;\n    while (i > 0) {\n      const p = (i - 1) >> 1;\n      if (a[p][0] <= a[i][0]) break;\n      [a[p], a[i]] = [a[i], a[p]];\n      i = p;\n    }\n  }\n  pop() {\n    const a = this.a, top = a[0], last = a.pop();\n    if (a.length) {\n      a[0] = last;\n      let i = 0;\n      for (;;) {\n        const l = 2 * i + 1, r = l + 1;\n        let m = i;\n        if (l < a.length && a[l][0] < a[m][0]) m = l;\n        if (r < a.length && a[r][0] < a[m][0]) m = r;\n        if (m === i) break;\n        [a[m], a[i]] = [a[i], a[m]];\n        i = m;\n      }\n    }\n    return top;\n  }\n}',
      body: 'const adj = Array.from({ length: n }, () => []);\nfor (const [u, v, w] of edges) adj[u].push([v, w]);\nconst dist = new Array(n).fill(Infinity);\ndist[source] = 0;\nconst heap = new MinHeap();\nheap.push(0, source);\nwhile (heap.size) {\n  const [d, u] = heap.pop();\n  if (d > dist[u]) continue;\n  for (const [v, w] of adj[u]) if (d + w < dist[v]) { dist[v] = d + w; heap.push(dist[v], v); }\n}\nreturn dist.map((d) => (d === Infinity ? -1 : d));',
    },
    java: 'List<List<int[]>> adj = new ArrayList<>();\nfor (int i = 0; i < n; i++) adj.add(new ArrayList<>());\nfor (int[] e : edges) adj.get(e[0]).add(new int[] { e[1], e[2] });\nlong[] dist = new long[n];\nArrays.fill(dist, Long.MAX_VALUE);\ndist[source] = 0;\nPriorityQueue<long[]> pq = new PriorityQueue<>((x, y) -> Long.compare(x[0], y[0]));\npq.add(new long[] { 0, source });\nwhile (!pq.isEmpty()) {\n    long[] top = pq.poll();\n    int u = (int) top[1];\n    if (top[0] > dist[u]) continue;\n    for (int[] e : adj.get(u)) {\n        long nd = top[0] + e[1];\n        if (nd < dist[e[0]]) { dist[e[0]] = nd; pq.add(new long[] { nd, e[0] }); }\n    }\n}\nfor (int i = 0; i < n; i++) if (dist[i] == Long.MAX_VALUE) dist[i] = -1;\nreturn dist;',
    csharp: 'var adj = new List<(int v, int w)>[n];\nfor (int i = 0; i < n; i++) adj[i] = new List<(int, int)>();\nforeach (var e in edges) adj[e[0]].Add((e[1], e[2]));\nvar dist = new long[n];\nArray.Fill(dist, long.MaxValue);\ndist[source] = 0;\nvar pq = new PriorityQueue<int, long>();\npq.Enqueue(source, 0);\nwhile (pq.TryDequeue(out int u, out long d))\n{\n    if (d > dist[u]) continue;\n    foreach (var (v, w) in adj[u])\n    {\n        long nd = d + w;\n        if (nd < dist[v]) { dist[v] = nd; pq.Enqueue(v, nd); }\n    }\n}\nfor (int i = 0; i < n; i++) if (dist[i] == long.MaxValue) dist[i] = -1;\nreturn dist;',
    go: {
      imports: ['container/heap'],
      helpers: 'type item struct {\n    d int64\n    v int\n}\n\ntype minHeap []item\n\nfunc (h minHeap) Len() int            { return len(h) }\nfunc (h minHeap) Less(i, j int) bool  { return h[i].d < h[j].d }\nfunc (h minHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }\nfunc (h *minHeap) Push(x interface{}) { *h = append(*h, x.(item)) }\nfunc (h *minHeap) Pop() interface{} {\n    old := *h\n    x := old[len(old)-1]\n    *h = old[:len(old)-1]\n    return x\n}',
      body: 'type edge struct{ v, w int }\nadj := make([][]edge, n)\nfor _, e := range edges {\n    adj[e[0]] = append(adj[e[0]], edge{e[1], e[2]})\n}\ndist := make([]int64, n)\nfor i := range dist {\n    dist[i] = -1\n}\ndist[source] = 0\nh := &minHeap{{0, source}}\nfor h.Len() > 0 {\n    top := heap.Pop(h).(item)\n    if top.d > dist[top.v] {\n        continue\n    }\n    for _, e := range adj[top.v] {\n        nd := top.d + int64(e.w)\n        if dist[e.v] == -1 || nd < dist[e.v] {\n            dist[e.v] = nd\n            heap.Push(h, item{nd, e.v})\n        }\n    }\n}\nreturn dist',
    },
    rust: 'use std::cmp::Reverse;\nuse std::collections::BinaryHeap;\nlet n = n as usize;\nlet mut adj: Vec<Vec<(usize, i64)>> = vec![Vec::new(); n];\nfor e in edges {\n    adj[e[0] as usize].push((e[1] as usize, e[2] as i64));\n}\nlet mut dist = vec![i64::MAX; n];\ndist[source as usize] = 0;\nlet mut heap = BinaryHeap::new();\nheap.push(Reverse((0i64, source as usize)));\nwhile let Some(Reverse((d, u))) = heap.pop() {\n    if d > dist[u] {\n        continue;\n    }\n    for &(v, w) in &adj[u] {\n        if d + w < dist[v] {\n            dist[v] = d + w;\n            heap.push(Reverse((dist[v], v)));\n        }\n    }\n}\ndist.into_iter().map(|d| if d == i64::MAX { -1 } else { d }).collect()',
    cpp: 'vector<vector<pair<int, int>>> adj(n);\nfor (const auto& e : edges) adj[e[0]].push_back({e[1], e[2]});\nvector<long long> dist(n, LLONG_MAX);\ndist[source] = 0;\npriority_queue<pair<long long, int>, vector<pair<long long, int>>, greater<>> pq;\npq.push({0, source});\nwhile (!pq.empty()) {\n    auto [d, u] = pq.top();\n    pq.pop();\n    if (d > dist[u]) continue;\n    for (auto [v, w] : adj[u])\n        if (d + w < dist[v]) { dist[v] = d + w; pq.push({dist[v], v}); }\n}\nfor (auto& d : dist) if (d == LLONG_MAX) d = -1;\nreturn dist;',
    c: {
      helpers: 'typedef struct { long long d; int v; } hitem;\n\nstatic void heap_push(hitem *h, int *size, hitem x) {\n    int i = (*size)++;\n    h[i] = x;\n    while (i > 0) {\n        int p = (i - 1) / 2;\n        if (h[p].d <= h[i].d) break;\n        hitem t = h[p]; h[p] = h[i]; h[i] = t;\n        i = p;\n    }\n}\n\nstatic hitem heap_pop(hitem *h, int *size) {\n    hitem top = h[0];\n    h[0] = h[--(*size)];\n    int i = 0;\n    for (;;) {\n        int l = 2 * i + 1, r = l + 1, m = i;\n        if (l < *size && h[l].d < h[m].d) m = l;\n        if (r < *size && h[r].d < h[m].d) m = r;\n        if (m == i) break;\n        hitem t = h[m]; h[m] = h[i]; h[i] = t;\n        i = m;\n    }\n    return top;\n}',
      body: 'int m = edges_rows;\nint *start = calloc((size_t)n + 1, sizeof(int)), *to = malloc(sizeof(int) * (size_t)(m > 0 ? m : 1)), *wt = malloc(sizeof(int) * (size_t)(m > 0 ? m : 1));\nfor (int i = 0; i < m; i++) start[edges[i][0] + 1]++;\nfor (int i = 0; i < n; i++) start[i + 1] += start[i];\nint *pos = malloc(sizeof(int) * (size_t)n);\nmemcpy(pos, start, sizeof(int) * (size_t)n);\nfor (int i = 0; i < m; i++) { int k = pos[edges[i][0]]++; to[k] = edges[i][1]; wt[k] = edges[i][2]; }\nlong long *dist = malloc(sizeof(long long) * (size_t)n);\nfor (int i = 0; i < n; i++) dist[i] = LLONG_MAX;\ndist[source] = 0;\nhitem *h = malloc(sizeof(hitem) * (size_t)(m + 1));\nint size = 0;\nheap_push(h, &size, (hitem){0, source});\nwhile (size > 0) {\n    hitem top = heap_pop(h, &size);\n    if (top.d > dist[top.v]) continue;\n    for (int k = start[top.v]; k < start[top.v + 1]; k++) {\n        long long nd = top.d + wt[k];\n        if (nd < dist[to[k]]) { dist[to[k]] = nd; heap_push(h, &size, (hitem){nd, to[k]}); }\n    }\n}\nfor (int i = 0; i < n; i++) if (dist[i] == LLONG_MAX) dist[i] = -1;\nfree(start); free(to); free(wt); free(pos); free(h);\n*return_size = n;\nreturn dist;',
    },
  },
});

export const TREES: CodingQuestionInput[] = [maxDepth, hasPathSum, inorderTraversal, pathExists, isValidBST, numIslands, canFinish, rightSideView, maxPathSum, shortestPaths];
