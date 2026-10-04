import type { CodingQuestionInput } from '@hbe/shared';
import { coding, int, ints, pick, range, rng, word, type Rng } from './define.js';

const reverseList = coding({
  title: 'Reverse a Linked List',
  statement: 'Reverse the singly linked list starting at `head` and return the new head. Re-link the existing nodes; do not build a new list from the values.',
  constraints: '- 0 ≤ number of nodes ≤ 10^5\n- −10^9 ≤ node value ≤ 10^9',
  difficulty: 'easy',
  tags: ['linked-list'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'reverseList',
  params: [{ name: 'head', type: 'list' }],
  returns: 'list',
  solve: (head: number[]) => [...head].reverse(),
  samples: [
    { args: [[1, 2, 3, 4, 5]], explanation: '1→2→3→4→5 becomes 5→4→3→2→1.' },
    { args: [[]], explanation: 'An empty list stays empty (an empty output line).' },
  ],
  hidden: [
    { args: [[7]] },
    { args: [[1, 2]] },
    { args: [[3, 3, 3]] },
    { args: [[-1000000000, 0, 1000000000]] },
    { args: [range(100)] },
    { args: [ints(rng(501), 1000, -1000, 1000)] },
    { args: [ints(rng(502), 5000, -1000000000, 1000000000)] },
    { args: [range(20, -10)] },
    { args: [ints(rng(503), 100000, 0, 999)], stress: true },
    { args: [range(60000)], stress: true },
  ],
  solutions: {
    python: 'prev = None\ncur = head\nwhile cur:\n    nxt = cur.next\n    cur.next = prev\n    prev = cur\n    cur = nxt\nreturn prev',
    javascript: 'let prev = null, cur = head;\nwhile (cur) {\n  const nxt = cur.next;\n  cur.next = prev;\n  prev = cur;\n  cur = nxt;\n}\nreturn prev;',
    java: 'ListNode prev = null, cur = head;\nwhile (cur != null) {\n    ListNode nxt = cur.next;\n    cur.next = prev;\n    prev = cur;\n    cur = nxt;\n}\nreturn prev;',
    csharp: 'ListNode prev = null, cur = head;\nwhile (cur != null)\n{\n    var nxt = cur.next;\n    cur.next = prev;\n    prev = cur;\n    cur = nxt;\n}\nreturn prev;',
    go: 'var prev *ListNode\ncur := head\nfor cur != nil {\n    nxt := cur.Next\n    cur.Next = prev\n    prev = cur\n    cur = nxt\n}\nreturn prev',
    rust: 'let mut prev: Option<Box<ListNode>> = None;\nlet mut cur = head;\nwhile let Some(mut node) = cur {\n    cur = node.next.take();\n    node.next = prev;\n    prev = Some(node);\n}\nprev',
    cpp: 'ListNode *prev = nullptr, *cur = head;\nwhile (cur) {\n    ListNode *nxt = cur->next;\n    cur->next = prev;\n    prev = cur;\n    cur = nxt;\n}\nreturn prev;',
    c: 'struct ListNode *prev = NULL, *cur = head;\nwhile (cur) {\n    struct ListNode *nxt = cur->next;\n    cur->next = prev;\n    prev = cur;\n    cur = nxt;\n}\nreturn prev;',
  },
});

const sortedInts = (r: Rng, n: number, lo: number, hi: number) => ints(r, n, lo, hi).sort((a, b) => a - b);
const mergeTwoLists = coding({
  title: 'Merge Two Sorted Lists',
  statement: 'Both lists are sorted in non-decreasing order. Splice their nodes together into one sorted list and return its head. When values are equal, take the node from `l1` first.',
  constraints: '- 0 ≤ length of each list ≤ 2.5·10^4\n- −10^6 ≤ node value ≤ 10^6',
  difficulty: 'easy',
  tags: ['linked-list', 'two-pointers'],
  timeComplexity: 'O(n + m)',
  spaceComplexity: 'O(1)',
  fn: 'mergeTwoLists',
  params: [{ name: 'l1', type: 'list' }, { name: 'l2', type: 'list' }],
  returns: 'list',
  solve: (a: number[], b: number[]) => [...a, ...b].sort((x, y) => x - y),
  samples: [
    { args: [[1, 2, 4], [1, 3, 4]], explanation: 'Interleave the nodes: 1, 1, 2, 3, 4, 4.' },
    { args: [[], [0]], explanation: 'If one list is empty, the result is the other list.' },
  ],
  hidden: [
    { args: [[], []] },
    { args: [[5], []] },
    { args: [[1, 2, 3], [4, 5, 6]] },
    { args: [[4, 5, 6], [1, 2, 3]] },
    { args: [[2, 2, 2], [2, 2]] },
    { args: [sortedInts(rng(511), 100, -50, 50), sortedInts(rng(512), 150, -50, 50)] },
    { args: [sortedInts(rng(513), 3000, -1000000, 1000000), sortedInts(rng(514), 10, -1000000, 1000000)] },
    { args: [range(500, -1000), range(500, -800)] },
    { args: [sortedInts(rng(515), 25000, -1000000, 1000000), sortedInts(rng(516), 25000, -1000000, 1000000)], stress: true },
    { args: [range(25000, 0).map((x) => 2 * x), range(25000, 0).map((x) => 2 * x + 1)], stress: true },
  ],
  solutions: {
    python: 'dummy = tail = ListNode()\nwhile l1 and l2:\n    if l1.val <= l2.val:\n        tail.next = l1\n        l1 = l1.next\n    else:\n        tail.next = l2\n        l2 = l2.next\n    tail = tail.next\ntail.next = l1 or l2\nreturn dummy.next',
    javascript: 'const dummy = new ListNode();\nlet tail = dummy;\nwhile (l1 && l2) {\n  if (l1.val <= l2.val) { tail.next = l1; l1 = l1.next; }\n  else { tail.next = l2; l2 = l2.next; }\n  tail = tail.next;\n}\ntail.next = l1 || l2;\nreturn dummy.next;',
    java: 'ListNode dummy = new ListNode(), tail = dummy;\nwhile (l1 != null && l2 != null) {\n    if (l1.val <= l2.val) { tail.next = l1; l1 = l1.next; }\n    else { tail.next = l2; l2 = l2.next; }\n    tail = tail.next;\n}\ntail.next = l1 != null ? l1 : l2;\nreturn dummy.next;',
    csharp: 'var dummy = new ListNode();\nvar tail = dummy;\nwhile (l1 != null && l2 != null)\n{\n    if (l1.val <= l2.val) { tail.next = l1; l1 = l1.next; }\n    else { tail.next = l2; l2 = l2.next; }\n    tail = tail.next;\n}\ntail.next = l1 ?? l2;\nreturn dummy.next;',
    go: 'dummy := &ListNode{}\ntail := dummy\nfor l1 != nil && l2 != nil {\n    if l1.Val <= l2.Val {\n        tail.Next = l1\n        l1 = l1.Next\n    } else {\n        tail.Next = l2\n        l2 = l2.Next\n    }\n    tail = tail.Next\n}\nif l1 != nil {\n    tail.Next = l1\n} else {\n    tail.Next = l2\n}\nreturn dummy.Next',
    rust: 'let (mut a, mut b) = (l1, l2);\nlet mut dummy = Box::new(ListNode::new(0));\nlet mut tail = &mut dummy;\nloop {\n    match (a, b) {\n        (Some(mut x), Some(mut y)) => {\n            if x.val <= y.val {\n                a = x.next.take();\n                b = Some(y);\n                tail.next = Some(x);\n            } else {\n                b = y.next.take();\n                a = Some(x);\n                tail.next = Some(y);\n            }\n            tail = tail.next.as_mut().unwrap();\n        }\n        (rest_a, rest_b) => {\n            tail.next = rest_a.or(rest_b);\n            break;\n        }\n    }\n}\ndummy.next',
    cpp: 'ListNode dummy, *tail = &dummy;\nwhile (l1 && l2) {\n    if (l1->val <= l2->val) { tail->next = l1; l1 = l1->next; }\n    else { tail->next = l2; l2 = l2->next; }\n    tail = tail->next;\n}\ntail->next = l1 ? l1 : l2;\nreturn dummy.next;',
    c: 'struct ListNode dummy = {0, NULL}, *tail = &dummy;\nwhile (l1 && l2) {\n    if (l1->val <= l2->val) { tail->next = l1; l1 = l1->next; }\n    else { tail->next = l2; l2 = l2->next; }\n    tail = tail->next;\n}\ntail->next = l1 ? l1 : l2;\nreturn dummy.next;',
  },
});

const bracketsOk = (s: string) => {
  const st: string[] = [];
  const pair: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  for (const c of s) {
    if ('([{'.includes(c)) st.push(c);
    else if (st.pop() !== pair[c]) return false;
  }
  return st.length === 0;
};
const balanced = (r: Rng, n: number): string => {
  let s = '';
  const st: string[] = [];
  const close: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  while (s.length < n) {
    if (st.length && (r() < 0.5 || s.length + st.length >= n)) s += close[st.pop()!]!;
    else {
      const o = pick(r, ['(', '[', '{']);
      st.push(o);
      s += o;
    }
  }
  while (st.length) s += close[st.pop()!]!;
  return s;
};

const validBrackets = coding({
  title: 'Valid Brackets',
  statement: '`s` consists of the characters `()[]{}`. Return **true** if every opening bracket is closed by the same type of bracket, in the correct order.',
  constraints: '- 1 ≤ |s| ≤ 2·10^5\n- s contains only `()[]{}`.',
  difficulty: 'easy',
  tags: ['stack', 'strings'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'isValidBrackets',
  params: [{ name: 's', type: 'string' }],
  returns: 'bool',
  solve: (s: string) => bracketsOk(s),
  samples: [
    { args: ['([]{})'], explanation: 'Every bracket is closed by its partner in the right order.' },
    { args: ['([)]'], explanation: '"[" is still open when ")" arrives.' },
  ],
  hidden: [
    { args: ['('] },
    { args: [')'] },
    { args: ['()'] },
    { args: ['(]'] },
    { args: ['{[]}'] },
    { args: ['((()'] },
    { args: [balanced(rng(521), 1000)] },
    { args: [`${balanced(rng(522), 3000)})`] },
    { args: [balanced(rng(523), 200000)], stress: true },
    { args: [`${'('.repeat(100000)}${')'.repeat(99999)}]`], stress: true },
  ],
  solutions: {
    python: 'pair = {")": "(", "]": "[", "}": "{"}\nstack = []\nfor c in s:\n    if c in "([{":\n        stack.append(c)\n    elif not stack or stack.pop() != pair[c]:\n        return False\nreturn not stack',
    javascript: "const pair = { ')': '(', ']': '[', '}': '{' };\nconst stack = [];\nfor (const c of s) {\n  if (c === '(' || c === '[' || c === '{') stack.push(c);\n  else if (stack.pop() !== pair[c]) return false;\n}\nreturn stack.length === 0;",
    java: 'char[] st = new char[s.length()];\nint top = 0;\nfor (int i = 0; i < s.length(); i++) {\n    char c = s.charAt(i);\n    if (c == \'(\' || c == \'[\' || c == \'{\') st[top++] = c;\n    else {\n        char want = c == \')\' ? \'(\' : c == \']\' ? \'[\' : \'{\';\n        if (top == 0 || st[--top] != want) return false;\n    }\n}\nreturn top == 0;',
    csharp: 'var st = new Stack<char>();\nforeach (var c in s)\n{\n    if (c == \'(\' || c == \'[\' || c == \'{\') st.Push(c);\n    else\n    {\n        char want = c == \')\' ? \'(\' : c == \']\' ? \'[\' : \'{\';\n        if (st.Count == 0 || st.Pop() != want) return false;\n    }\n}\nreturn st.Count == 0;',
    go: 'st := make([]byte, 0, len(s))\npair := map[byte]byte{\')\': \'(\', \']\': \'[\', \'}\': \'{\'}\nfor i := 0; i < len(s); i++ {\n    c := s[i]\n    if c == \'(\' || c == \'[\' || c == \'{\' {\n        st = append(st, c)\n        continue\n    }\n    if len(st) == 0 || st[len(st)-1] != pair[c] {\n        return false\n    }\n    st = st[:len(st)-1]\n}\nreturn len(st) == 0',
    rust: 'let mut st: Vec<u8> = Vec::new();\nfor c in s.bytes() {\n    match c {\n        b\'(\' | b\'[\' | b\'{\' => st.push(c),\n        _ => {\n            let want = match c {\n                b\')\' => b\'(\',\n                b\']\' => b\'[\',\n                _ => b\'{\',\n            };\n            if st.pop() != Some(want) {\n                return false;\n            }\n        }\n    }\n}\nst.is_empty()',
    cpp: 'string st;\nfor (char c : s) {\n    if (c == \'(\' || c == \'[\' || c == \'{\') st.push_back(c);\n    else {\n        char want = c == \')\' ? \'(\' : c == \']\' ? \'[\' : \'{\';\n        if (st.empty() || st.back() != want) return false;\n        st.pop_back();\n    }\n}\nreturn st.empty();',
    c: 'size_t n = strlen(s), top = 0;\nchar *st = malloc(n + 1);\nbool ok = true;\nfor (size_t i = 0; i < n && ok; i++) {\n    char c = s[i];\n    if (c == \'(\' || c == \'[\' || c == \'{\') st[top++] = c;\n    else {\n        char want = c == \')\' ? \'(\' : c == \']\' ? \'[\' : \'{\';\n        if (top == 0 || st[--top] != want) ok = false;\n    }\n}\nok = ok && top == 0;\nfree(st);\nreturn ok;',
  },
});

const removeDups = (s: string) => {
  const st: string[] = [];
  for (const c of s) {
    if (st[st.length - 1] === c) st.pop();
    else st.push(c);
  }
  return st.join('');
};

const removeAdjacentDuplicates = coding({
  title: 'Remove Adjacent Duplicate Pairs',
  statement:
    'Repeatedly remove two adjacent equal letters from `s` until no such pair remains, and return the final string (it may be empty — then print an empty line). The result does not depend on the order of removals.',
  constraints: '- 1 ≤ |s| ≤ 2·10^5\n- s contains only lowercase English letters.',
  difficulty: 'easy',
  tags: ['stack', 'strings'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'removeDuplicatePairs',
  params: [{ name: 's', type: 'string' }],
  returns: 'string',
  solve: (s: string) => removeDups(s),
  samples: [
    { args: ['abbaca'], explanation: 'Remove "bb" to get "aaca", then "aa" to get "ca".' },
    { args: ['azxxzy'], explanation: 'Removing "xx" gives "azzy"; removing "zz" then gives "ay", which has no adjacent pair.' },
  ],
  hidden: [
    { args: ['a'] },
    { args: ['aa'] },
    { args: ['aaa'] },
    { args: ['abccba'] },
    { args: ['abcd'] },
    { args: [word(rng(531), 1000, 'ab')] },
    { args: [word(rng(532), 5000, 'abc')] },
    { args: [`${'ab'.repeat(500)}${'ba'.repeat(500)}`] },
    { args: [(() => { const h = word(rng(533), 100000, 'abcdefghij'); return h + h.split('').reverse().join(''); })()], stress: true },
    { args: [word(rng(534), 200000, 'ab')], stress: true },
  ],
  solutions: {
    python: 'st = []\nfor c in s:\n    if st and st[-1] == c:\n        st.pop()\n    else:\n        st.append(c)\nreturn "".join(st)',
    javascript: "const st = [];\nfor (const c of s) {\n  if (st.length && st[st.length - 1] === c) st.pop();\n  else st.push(c);\n}\nreturn st.join('');",
    java: 'StringBuilder st = new StringBuilder();\nfor (int i = 0; i < s.length(); i++) {\n    char c = s.charAt(i);\n    int n = st.length();\n    if (n > 0 && st.charAt(n - 1) == c) st.setLength(n - 1);\n    else st.append(c);\n}\nreturn st.toString();',
    csharp: 'var st = new System.Text.StringBuilder();\nforeach (var c in s)\n{\n    if (st.Length > 0 && st[st.Length - 1] == c) st.Length--;\n    else st.Append(c);\n}\nreturn st.ToString();',
    go: 'st := make([]byte, 0, len(s))\nfor i := 0; i < len(s); i++ {\n    if n := len(st); n > 0 && st[n-1] == s[i] {\n        st = st[:n-1]\n    } else {\n        st = append(st, s[i])\n    }\n}\nreturn string(st)',
    rust: 'let mut st: Vec<u8> = Vec::with_capacity(s.len());\nfor c in s.bytes() {\n    if st.last() == Some(&c) {\n        st.pop();\n    } else {\n        st.push(c);\n    }\n}\nString::from_utf8(st).unwrap()',
    cpp: 'string st;\nfor (char c : s) {\n    if (!st.empty() && st.back() == c) st.pop_back();\n    else st.push_back(c);\n}\nreturn st;',
    c: 'size_t n = strlen(s), top = 0;\nchar *st = malloc(n + 1);\nfor (size_t i = 0; i < n; i++) {\n    if (top > 0 && st[top - 1] == s[i]) top--;\n    else st[top++] = s[i];\n}\nst[top] = 0;\nreturn st;',
  },
});

const removeNthFromEnd = coding({
  title: 'Remove the Kth Node From the End',
  statement: 'Remove the `k`-th node from the end of the list (k = 1 is the last node) and return the head of the resulting list. You can do it in one pass with two pointers `k` nodes apart, or in two passes by counting the nodes first.',
  constraints: '- 1 ≤ number of nodes ≤ 8·10^4\n- 1 ≤ k ≤ number of nodes\n- −10^9 ≤ node value ≤ 10^9',
  difficulty: 'moderate',
  tags: ['linked-list', 'two-pointers'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'removeKthFromEnd',
  params: [{ name: 'head', type: 'list' }, { name: 'k', type: 'int' }],
  returns: 'list',
  solve: (head: number[], k: number) => head.filter((_, i) => i !== head.length - k),
  samples: [
    { args: [[1, 2, 3, 4, 5], 2], explanation: 'The 2nd node from the end holds 4; removing it leaves 1→2→3→5.' },
    { args: [[1], 1], explanation: 'Removing the only node leaves an empty list.' },
  ],
  hidden: [
    { args: [[1, 2], 1] },
    { args: [[1, 2], 2] },
    { args: [[5, 6, 7], 3] },
    { args: [[5, 6, 7], 2] },
    { args: [range(100), 50] },
    { args: [ints(rng(541), 1000, -1000000000, 1000000000), 1000] },
    { args: [ints(rng(542), 1000, -1000000000, 1000000000), 1] },
    { args: [ints(rng(543), 5000, 0, 9), 2500] },
    { args: [range(80000), 79999], stress: true },
    { args: [ints(rng(544), 80000, -1000, 1000), 1], stress: true },
  ],
  solutions: {
    python: 'dummy = ListNode(0, head)\nfast = slow = dummy\nfor _ in range(k):\n    fast = fast.next\nwhile fast.next:\n    fast = fast.next\n    slow = slow.next\nslow.next = slow.next.next\nreturn dummy.next',
    javascript: 'const dummy = new ListNode(0, head);\nlet fast = dummy, slow = dummy;\nfor (let i = 0; i < k; i++) fast = fast.next;\nwhile (fast.next) { fast = fast.next; slow = slow.next; }\nslow.next = slow.next.next;\nreturn dummy.next;',
    java: 'ListNode dummy = new ListNode(0, head), fast = dummy, slow = dummy;\nfor (int i = 0; i < k; i++) fast = fast.next;\nwhile (fast.next != null) { fast = fast.next; slow = slow.next; }\nslow.next = slow.next.next;\nreturn dummy.next;',
    csharp: 'var dummy = new ListNode(0, head);\nListNode fast = dummy, slow = dummy;\nfor (int i = 0; i < k; i++) fast = fast.next;\nwhile (fast.next != null) { fast = fast.next; slow = slow.next; }\nslow.next = slow.next.next;\nreturn dummy.next;',
    go: 'dummy := &ListNode{Next: head}\nfast, slow := dummy, dummy\nfor i := 0; i < k; i++ {\n    fast = fast.Next\n}\nfor fast.Next != nil {\n    fast = fast.Next\n    slow = slow.Next\n}\nslow.Next = slow.Next.Next\nreturn dummy.Next',
    rust: 'let mut len = 0;\n{\n    let mut cur = &head;\n    while let Some(n) = cur {\n        len += 1;\n        cur = &n.next;\n    }\n}\nlet mut dummy = Box::new(ListNode { val: 0, next: head });\nlet mut cur = &mut dummy;\nfor _ in 0..(len - k) {\n    cur = cur.next.as_mut().unwrap();\n}\nlet removed = cur.next.take();\ncur.next = removed.and_then(|mut r| r.next.take());\ndummy.next',
    cpp: 'ListNode dummy(0, head), *fast = &dummy, *slow = &dummy;\nfor (int i = 0; i < k; i++) fast = fast->next;\nwhile (fast->next) { fast = fast->next; slow = slow->next; }\nslow->next = slow->next->next;\nreturn dummy.next;',
    c: 'struct ListNode dummy = {0, head}, *fast = &dummy, *slow = &dummy;\nfor (int i = 0; i < k; i++) fast = fast->next;\nwhile (fast->next) { fast = fast->next; slow = slow->next; }\nslow->next = slow->next->next;\nreturn dummy.next;',
  },
});

const rpnOf = (tokens: string[]) => {
  const st: number[] = [];
  for (const t of tokens) {
    if (['+', '-', '*', '/'].includes(t)) {
      const b = st.pop()!;
      const a = st.pop()!;
      st.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : Math.trunc(a / b));
    } else st.push(Number(t));
  }
  return st[0]!;
};
/** A long, valid RPN expression whose intermediate values stay small. */
const rpnChain = (r: Rng, n: number): string[] => {
  const out = [String(int(r, -9, 9))];
  let acc = Number(out[0]);
  while (out.length < n) {
    const v = int(r, 1, 9) * (r() < 0.3 ? -1 : 1);
    let op = pick(r, ['+', '-', '*', '/']);
    if (op === '*' && Math.abs(acc * v) > 100000) op = '/';
    out.push(String(v), op);
    acc = op === '+' ? acc + v : op === '-' ? acc - v : op === '*' ? acc * v : Math.trunc(acc / v);
  }
  return out;
};

const evalRPN = coding({
  title: 'Evaluate Reverse Polish Notation',
  statement:
    'Evaluate an arithmetic expression written in Reverse Polish Notation: each token is an integer or one of `+ - * /`, and an operator applies to the two values before it. Division truncates toward zero (−7 / 2 = −3).\n\nThe expression is valid, never divides by zero, and every intermediate value fits in a signed 32-bit integer.',
  constraints: '- 1 ≤ number of tokens ≤ 10^5\n- Integer tokens are between −10^6 and 10^6.',
  difficulty: 'moderate',
  tags: ['stack'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'evalRPN',
  params: [{ name: 'tokens', type: 'string[]' }],
  returns: 'int',
  solve: (tokens: string[]) => rpnOf(tokens),
  samples: [
    { args: [['2', '1', '+', '3', '*']], explanation: '(2 + 1) × 3 = 9.' },
    { args: [['4', '13', '5', '/', '+']], explanation: '13 / 5 = 2 (truncated), then 4 + 2 = 6.' },
  ],
  hidden: [
    { args: [['42']] },
    { args: [['-7', '2', '/']] },
    { args: [['7', '-2', '/']] },
    { args: [['10', '6', '9', '3', '+', '-11', '*', '/', '*', '17', '+', '5', '+']] },
    { args: [['1000000', '1000', '*', '7', '/']] },
    { args: [['3', '4', '-', '5', '-']] },
    { args: [rpnChain(rng(551), 201)] },
    { args: [rpnChain(rng(552), 2001)] },
    { args: [rpnChain(rng(553), 99999)], stress: true },
    { args: [[...range(50000).map(() => '1'), ...range(49999).map(() => '+')]], stress: true },
  ],
  solutions: {
    python: 'st = []\nfor t in tokens:\n    if t in ("+", "-", "*", "/"):\n        b = st.pop()\n        a = st.pop()\n        if t == "+":\n            st.append(a + b)\n        elif t == "-":\n            st.append(a - b)\n        elif t == "*":\n            st.append(a * b)\n        else:\n            q = abs(a) // abs(b)\n            st.append(q if (a < 0) == (b < 0) else -q)\n    else:\n        st.append(int(t))\nreturn st[0]',
    javascript: "const st = [];\nfor (const t of tokens) {\n  if (t === '+' || t === '-' || t === '*' || t === '/') {\n    const b = st.pop(), a = st.pop();\n    st.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : Math.trunc(a / b));\n  } else st.push(Number(t));\n}\nreturn st[0];",
    java: 'int[] st = new int[tokens.length];\nint top = 0;\nfor (String t : tokens) {\n    if (t.length() == 1 && "+-*/".indexOf(t.charAt(0)) >= 0) {\n        int b = st[--top], a = st[--top];\n        switch (t.charAt(0)) {\n            case \'+\': st[top++] = a + b; break;\n            case \'-\': st[top++] = a - b; break;\n            case \'*\': st[top++] = a * b; break;\n            default: st[top++] = a / b;\n        }\n    } else st[top++] = Integer.parseInt(t);\n}\nreturn st[0];',
    csharp: 'var st = new Stack<int>();\nforeach (var t in tokens)\n{\n    if (t == "+" || t == "-" || t == "*" || t == "/")\n    {\n        int b = st.Pop(), a = st.Pop();\n        st.Push(t == "+" ? a + b : t == "-" ? a - b : t == "*" ? a * b : a / b);\n    }\n    else st.Push(int.Parse(t));\n}\nreturn st.Pop();',
    go: {
      imports: ['strconv'],
      body: 'st := make([]int, 0, len(tokens))\nfor _, t := range tokens {\n    switch t {\n    case "+", "-", "*", "/":\n        b, a := st[len(st)-1], st[len(st)-2]\n        st = st[:len(st)-2]\n        switch t {\n        case "+":\n            st = append(st, a+b)\n        case "-":\n            st = append(st, a-b)\n        case "*":\n            st = append(st, a*b)\n        default:\n            st = append(st, a/b)\n        }\n    default:\n        v, _ := strconv.Atoi(t)\n        st = append(st, v)\n    }\n}\nreturn st[0]',
    },
    rust: 'let mut st: Vec<i32> = Vec::new();\nfor t in tokens {\n    match t.as_str() {\n        "+" | "-" | "*" | "/" => {\n            let b = st.pop().unwrap();\n            let a = st.pop().unwrap();\n            st.push(match t.as_str() {\n                "+" => a + b,\n                "-" => a - b,\n                "*" => a * b,\n                _ => a / b,\n            });\n        }\n        _ => st.push(t.parse().unwrap()),\n    }\n}\nst[0]',
    cpp: 'vector<int> st;\nfor (const string& t : tokens) {\n    if (t == "+" || t == "-" || t == "*" || t == "/") {\n        int b = st.back(); st.pop_back();\n        int a = st.back(); st.pop_back();\n        st.push_back(t == "+" ? a + b : t == "-" ? a - b : t == "*" ? a * b : a / b);\n    } else st.push_back(stoi(t));\n}\nreturn st[0];',
    c: 'int *st = malloc(sizeof(int) * (size_t)tokens_size);\nint top = 0;\nfor (int i = 0; i < tokens_size; i++) {\n    const char *t = tokens[i];\n    if (t[1] == 0 && strchr("+-*/", t[0])) {\n        int b = st[--top], a = st[--top];\n        st[top++] = t[0] == \'+\' ? a + b : t[0] == \'-\' ? a - b : t[0] == \'*\' ? a * b : a / b;\n    } else st[top++] = atoi(t);\n}\nint res = st[0];\nfree(st);\nreturn res;',
  },
});

const digitsOf = (n: bigint) => String(n).split('').reverse().map(Number);
const addTwoNumbers = coding({
  title: 'Add Two Numbers as Lists',
  statement:
    'Two non-negative integers are stored as linked lists of digits in **reverse order** (the head is the ones digit): 342 is 2→4→3. Return their sum in the same form.\n\nThe numbers can have up to 50 000 digits, so you cannot convert them to built-in integers.',
  constraints: '- 1 ≤ number of nodes in each list ≤ 5·10^4\n- 0 ≤ node value ≤ 9\n- No leading zeros, except the number 0 itself.',
  difficulty: 'moderate',
  tags: ['linked-list', 'math'],
  timeComplexity: 'O(max(n, m))',
  spaceComplexity: 'O(max(n, m))',
  fn: 'addTwoNumbers',
  params: [{ name: 'a', type: 'list' }, { name: 'b', type: 'list' }],
  returns: 'list',
  solve: (a: number[], b: number[]) => {
    const out: number[] = [];
    let carry = 0;
    for (let i = 0; i < Math.max(a.length, b.length) || carry; i++) {
      const s = (a[i] ?? 0) + (b[i] ?? 0) + carry;
      out.push(s % 10);
      carry = Math.floor(s / 10);
    }
    return out;
  },
  samples: [
    { args: [[2, 4, 3], [5, 6, 4]], explanation: '342 + 465 = 807, stored as 7→0→8.' },
    { args: [[9, 9, 9, 9], [1]], explanation: '9999 + 1 = 10000: the carry adds a new digit.' },
  ],
  hidden: [
    { args: [[0], [0]] },
    { args: [[5], [5]] },
    { args: [[1], [9, 9, 9]] },
    { args: [digitsOf(123456789n), digitsOf(987654321n)] },
    { args: [[0], [1, 2, 3]] },
    { args: [[...Array(30).fill(9)], [1]] },
    { args: (() => { const r = rng(561); const d = (n: number) => [...ints(r, n - 1, 0, 9), int(r, 1, 9)]; return [d(1000), d(700)]; })() },
    { args: (() => { const r = rng(562); const d = (n: number) => [...ints(r, n - 1, 0, 9), int(r, 1, 9)]; return [d(5000), d(5000)]; })() },
    { args: [Array(50000).fill(9), Array(50000).fill(9)], stress: true },
    { args: (() => { const r = rng(563); const d = (n: number) => [...ints(r, n - 1, 0, 9), int(r, 1, 9)]; return [d(50000), d(49999)]; })(), stress: true },
  ],
  solutions: {
    python: 'dummy = tail = ListNode()\ncarry = 0\nwhile a or b or carry:\n    s = carry\n    if a:\n        s += a.val\n        a = a.next\n    if b:\n        s += b.val\n        b = b.next\n    carry, digit = divmod(s, 10)\n    tail.next = ListNode(digit)\n    tail = tail.next\nreturn dummy.next',
    javascript: 'const dummy = new ListNode();\nlet tail = dummy, carry = 0;\nwhile (a || b || carry) {\n  let s = carry;\n  if (a) { s += a.val; a = a.next; }\n  if (b) { s += b.val; b = b.next; }\n  carry = Math.floor(s / 10);\n  tail.next = new ListNode(s % 10);\n  tail = tail.next;\n}\nreturn dummy.next;',
    java: 'ListNode dummy = new ListNode(), tail = dummy;\nint carry = 0;\nwhile (a != null || b != null || carry > 0) {\n    int s = carry;\n    if (a != null) { s += a.val; a = a.next; }\n    if (b != null) { s += b.val; b = b.next; }\n    carry = s / 10;\n    tail.next = new ListNode(s % 10);\n    tail = tail.next;\n}\nreturn dummy.next;',
    csharp: 'var dummy = new ListNode();\nvar tail = dummy;\nint carry = 0;\nwhile (a != null || b != null || carry > 0)\n{\n    int s = carry;\n    if (a != null) { s += a.val; a = a.next; }\n    if (b != null) { s += b.val; b = b.next; }\n    carry = s / 10;\n    tail.next = new ListNode(s % 10);\n    tail = tail.next;\n}\nreturn dummy.next;',
    go: 'dummy := &ListNode{}\ntail, carry := dummy, 0\nfor a != nil || b != nil || carry > 0 {\n    s := carry\n    if a != nil {\n        s += a.Val\n        a = a.Next\n    }\n    if b != nil {\n        s += b.Val\n        b = b.Next\n    }\n    carry = s / 10\n    tail.Next = &ListNode{Val: s % 10}\n    tail = tail.Next\n}\nreturn dummy.Next',
    rust: 'let (mut a, mut b) = (a, b);\nlet mut dummy = Box::new(ListNode::new(0));\nlet mut tail = &mut dummy;\nlet mut carry = 0;\nwhile a.is_some() || b.is_some() || carry > 0 {\n    let mut s = carry;\n    if let Some(n) = a {\n        s += n.val;\n        a = n.next;\n    }\n    if let Some(n) = b {\n        s += n.val;\n        b = n.next;\n    }\n    carry = s / 10;\n    tail.next = Some(Box::new(ListNode::new(s % 10)));\n    tail = tail.next.as_mut().unwrap();\n}\ndummy.next',
    cpp: 'ListNode dummy, *tail = &dummy;\nint carry = 0;\nwhile (a || b || carry) {\n    int s = carry;\n    if (a) { s += a->val; a = a->next; }\n    if (b) { s += b->val; b = b->next; }\n    carry = s / 10;\n    tail->next = new ListNode(s % 10);\n    tail = tail->next;\n}\nreturn dummy.next;',
    c: 'struct ListNode dummy = {0, NULL}, *tail = &dummy;\nint carry = 0;\nwhile (a || b || carry) {\n    int s = carry;\n    if (a) { s += a->val; a = a->next; }\n    if (b) { s += b->val; b = b->next; }\n    carry = s / 10;\n    struct ListNode *x = malloc(sizeof *x);\n    x->val = s % 10;\n    x->next = NULL;\n    tail->next = x;\n    tail = x;\n}\nreturn dummy.next;',
  },
});

const windowMax = (nums: number[], k: number) => {
  const out: number[] = [];
  const dq: number[] = [];
  let head = 0;
  for (let i = 0; i < nums.length; i++) {
    while (dq.length > head && nums[dq[dq.length - 1]!]! <= nums[i]!) dq.pop();
    dq.push(i);
    if (dq[head]! <= i - k) head++;
    if (i >= k - 1) out.push(nums[dq[head]!]!);
  }
  return out;
};

const maxSlidingWindow = coding({
  title: 'Sliding Window Maximum',
  statement:
    'A window of size `k` slides over `nums` from left to right, one position at a time. Return the maximum of each window position (n − k + 1 values).\n\nRecomputing each maximum is O(n·k); a double-ended queue of candidate indices does it in O(n).',
  constraints: '- 1 ≤ k ≤ n ≤ 5·10^4\n- −10^4 ≤ nums[i] ≤ 10^4',
  difficulty: 'moderate',
  tags: ['queue', 'deque', 'sliding-window'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(k)',
  fn: 'maxSlidingWindow',
  params: [{ name: 'nums', type: 'int[]' }, { name: 'k', type: 'int' }],
  returns: 'int[]',
  solve: (nums: number[], k: number) => windowMax(nums, k),
  samples: [
    { args: [[1, 3, -1, -3, 5, 3, 6, 7], 3], explanation: 'Windows [1,3,−1], [3,−1,−3], [−1,−3,5], [−3,5,3], [5,3,6], [3,6,7] have maxima 3, 3, 5, 5, 6, 7.' },
    { args: [[9, 8, 7], 1], explanation: 'With k = 1 every element is its own window.' },
  ],
  hidden: [
    { args: [[5], 1] },
    { args: [[1, -1], 2] },
    { args: [[4, 4, 4, 4], 2] },
    { args: [range(10), 3] },
    { args: [range(10).reverse(), 3] },
    { args: [ints(rng(571), 500, -100, 100), 7] },
    { args: [ints(rng(572), 3000, -10000, 10000), 3000] },
    { args: [ints(rng(573), 3000, -10000, 10000), 100] },
    { args: [ints(rng(574), 50000, -10000, 10000), 1000], stress: true },
    { args: [range(50000, -25000).map((x) => (x % 2 ? -x % 10000 : x % 10000)), 2], stress: true },
  ],
  solutions: {
    python: { helpers: 'from collections import deque', body: 'dq = deque()\nres = []\nfor i, x in enumerate(nums):\n    while dq and nums[dq[-1]] <= x:\n        dq.pop()\n    dq.append(i)\n    if dq[0] <= i - k:\n        dq.popleft()\n    if i >= k - 1:\n        res.append(nums[dq[0]])\nreturn res' },
    javascript: 'const dq = new Int32Array(nums.length);\nlet head = 0, tail = 0;\nconst res = [];\nfor (let i = 0; i < nums.length; i++) {\n  while (tail > head && nums[dq[tail - 1]] <= nums[i]) tail--;\n  dq[tail++] = i;\n  if (dq[head] <= i - k) head++;\n  if (i >= k - 1) res.push(nums[dq[head]]);\n}\nreturn res;',
    java: 'ArrayDeque<Integer> dq = new ArrayDeque<>();\nint[] res = new int[nums.length - k + 1];\nfor (int i = 0; i < nums.length; i++) {\n    while (!dq.isEmpty() && nums[dq.peekLast()] <= nums[i]) dq.pollLast();\n    dq.addLast(i);\n    if (dq.peekFirst() <= i - k) dq.pollFirst();\n    if (i >= k - 1) res[i - k + 1] = nums[dq.peekFirst()];\n}\nreturn res;',
    csharp: 'var dq = new LinkedList<int>();\nvar res = new int[nums.Length - k + 1];\nfor (int i = 0; i < nums.Length; i++)\n{\n    while (dq.Count > 0 && nums[dq.Last.Value] <= nums[i]) dq.RemoveLast();\n    dq.AddLast(i);\n    if (dq.First.Value <= i - k) dq.RemoveFirst();\n    if (i >= k - 1) res[i - k + 1] = nums[dq.First.Value];\n}\nreturn res;',
    go: 'dq := make([]int, 0, len(nums))\nhead := 0\nres := make([]int, 0, len(nums)-k+1)\nfor i, x := range nums {\n    for len(dq) > head && nums[dq[len(dq)-1]] <= x {\n        dq = dq[:len(dq)-1]\n    }\n    dq = append(dq, i)\n    if dq[head] <= i-k {\n        head++\n    }\n    if i >= k-1 {\n        res = append(res, nums[dq[head]])\n    }\n}\nreturn res',
    rust: 'let k = k as usize;\nlet mut dq: std::collections::VecDeque<usize> = std::collections::VecDeque::new();\nlet mut res = Vec::with_capacity(nums.len() + 1 - k);\nfor i in 0..nums.len() {\n    while let Some(&j) = dq.back() {\n        if nums[j] <= nums[i] {\n            dq.pop_back();\n        } else {\n            break;\n        }\n    }\n    dq.push_back(i);\n    if dq[0] + k <= i {\n        dq.pop_front();\n    }\n    if i + 1 >= k {\n        res.push(nums[dq[0]]);\n    }\n}\nres',
    cpp: 'deque<int> dq;\nvector<int> res;\nfor (int i = 0; i < (int)nums.size(); i++) {\n    while (!dq.empty() && nums[dq.back()] <= nums[i]) dq.pop_back();\n    dq.push_back(i);\n    if (dq.front() <= i - k) dq.pop_front();\n    if (i >= k - 1) res.push_back(nums[dq.front()]);\n}\nreturn res;',
    c: 'int *dq = malloc(sizeof(int) * (size_t)nums_size);\nint head = 0, tail = 0, m = 0;\nint *res = malloc(sizeof(int) * (size_t)(nums_size - k + 1));\nfor (int i = 0; i < nums_size; i++) {\n    while (tail > head && nums[dq[tail - 1]] <= nums[i]) tail--;\n    dq[tail++] = i;\n    if (dq[head] <= i - k) head++;\n    if (i >= k - 1) res[m++] = nums[dq[head]];\n}\nfree(dq);\n*return_size = m;\nreturn res;',
  },
});

const reverseGroups = (a: number[], k: number) => {
  const out: number[] = [];
  for (let i = 0; i < a.length; i += k) {
    const g = a.slice(i, i + k);
    out.push(...(g.length === k ? g.reverse() : g));
  }
  return out;
};

const reverseKGroup = coding({
  title: 'Reverse Nodes in Groups of K',
  statement:
    'Reverse the nodes of the list `k` at a time and return the new head. If the number of nodes left at the end is less than `k`, leave them in their original order.\n\nRe-link the nodes (not just the values), using O(1) extra memory if you can.',
  constraints: '- 1 ≤ number of nodes ≤ 8·10^4\n- 1 ≤ k ≤ number of nodes\n- 0 ≤ node value ≤ 10^4',
  difficulty: 'hard',
  tags: ['linked-list'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(1)',
  fn: 'reverseKGroup',
  params: [{ name: 'head', type: 'list' }, { name: 'k', type: 'int' }],
  returns: 'list',
  solve: (head: number[], k: number) => reverseGroups(head, k),
  samples: [
    { args: [[1, 2, 3, 4, 5], 2], explanation: 'Groups (1,2) and (3,4) are reversed; 5 is left alone: 2→1→4→3→5.' },
    { args: [[1, 2, 3, 4, 5], 3], explanation: 'Only one full group of 3: 3→2→1→4→5.' },
  ],
  hidden: [
    { args: [[1], 1] },
    { args: [[1, 2], 2] },
    { args: [[1, 2, 3], 1] },
    { args: [[1, 2, 3, 4], 4] },
    { args: [range(10), 3] },
    { args: [ints(rng(581), 1000, 0, 10000), 7] },
    { args: [ints(rng(582), 999, 0, 9), 1000 - 1] },
    { args: [range(5000), 64] },
    { args: [range(80000).map((x) => x % 10001), 2], stress: true },
    { args: [ints(rng(583), 79999, 0, 10000), 1000], stress: true },
  ],
  solutions: {
    python: 'dummy = ListNode(0, head)\ngroup_prev = dummy\nwhile True:\n    kth = group_prev\n    for _ in range(k):\n        kth = kth.next\n        if kth is None:\n            return dummy.next\n    group_next = kth.next\n    prev, cur = group_next, group_prev.next\n    while cur is not group_next:\n        nxt = cur.next\n        cur.next = prev\n        prev = cur\n        cur = nxt\n    first = group_prev.next\n    group_prev.next = kth\n    group_prev = first',
    javascript: 'const dummy = new ListNode(0, head);\nlet groupPrev = dummy;\nfor (;;) {\n  let kth = groupPrev;\n  for (let i = 0; i < k; i++) {\n    kth = kth.next;\n    if (!kth) return dummy.next;\n  }\n  const groupNext = kth.next;\n  let prev = groupNext, cur = groupPrev.next;\n  while (cur !== groupNext) {\n    const nxt = cur.next;\n    cur.next = prev;\n    prev = cur;\n    cur = nxt;\n  }\n  const first = groupPrev.next;\n  groupPrev.next = kth;\n  groupPrev = first;\n}',
    java: 'ListNode dummy = new ListNode(0, head), groupPrev = dummy;\nwhile (true) {\n    ListNode kth = groupPrev;\n    for (int i = 0; i < k; i++) {\n        kth = kth.next;\n        if (kth == null) return dummy.next;\n    }\n    ListNode groupNext = kth.next, prev = groupNext, cur = groupPrev.next;\n    while (cur != groupNext) {\n        ListNode nxt = cur.next;\n        cur.next = prev;\n        prev = cur;\n        cur = nxt;\n    }\n    ListNode first = groupPrev.next;\n    groupPrev.next = kth;\n    groupPrev = first;\n}',
    csharp: 'var dummy = new ListNode(0, head);\nvar groupPrev = dummy;\nwhile (true)\n{\n    var kth = groupPrev;\n    for (int i = 0; i < k; i++)\n    {\n        kth = kth.next;\n        if (kth == null) return dummy.next;\n    }\n    ListNode groupNext = kth.next, prev = groupNext, cur = groupPrev.next;\n    while (cur != groupNext)\n    {\n        var nxt = cur.next;\n        cur.next = prev;\n        prev = cur;\n        cur = nxt;\n    }\n    var first = groupPrev.next;\n    groupPrev.next = kth;\n    groupPrev = first;\n}',
    go: 'dummy := &ListNode{Next: head}\ngroupPrev := dummy\nfor {\n    kth := groupPrev\n    for i := 0; i < k; i++ {\n        kth = kth.Next\n        if kth == nil {\n            return dummy.Next\n        }\n    }\n    groupNext := kth.Next\n    prev, cur := groupNext, groupPrev.Next\n    for cur != groupNext {\n        nxt := cur.Next\n        cur.Next = prev\n        prev = cur\n        cur = nxt\n    }\n    first := groupPrev.Next\n    groupPrev.Next = kth\n    groupPrev = first\n}',
    rust: '// Collect the values, reverse each full group, rebuild the list.\nlet mut vals = Vec::new();\nlet mut cur = &head;\nwhile let Some(n) = cur {\n    vals.push(n.val);\n    cur = &n.next;\n}\nlet k = k as usize;\nlet mut i = 0;\nwhile i + k <= vals.len() {\n    vals[i..i + k].reverse();\n    i += k;\n}\nlet mut res: Option<Box<ListNode>> = None;\nfor &v in vals.iter().rev() {\n    res = Some(Box::new(ListNode { val: v, next: res }));\n}\nres',
    cpp: 'ListNode dummy(0, head), *groupPrev = &dummy;\nwhile (true) {\n    ListNode *kth = groupPrev;\n    for (int i = 0; i < k; i++) {\n        kth = kth->next;\n        if (!kth) return dummy.next;\n    }\n    ListNode *groupNext = kth->next, *prev = groupNext, *cur = groupPrev->next;\n    while (cur != groupNext) {\n        ListNode *nxt = cur->next;\n        cur->next = prev;\n        prev = cur;\n        cur = nxt;\n    }\n    ListNode *first = groupPrev->next;\n    groupPrev->next = kth;\n    groupPrev = first;\n}',
    c: 'struct ListNode dummy = {0, head}, *groupPrev = &dummy;\nwhile (1) {\n    struct ListNode *kth = groupPrev;\n    for (int i = 0; i < k; i++) {\n        kth = kth->next;\n        if (!kth) return dummy.next;\n    }\n    struct ListNode *groupNext = kth->next, *prev = groupNext, *cur = groupPrev->next;\n    while (cur != groupNext) {\n        struct ListNode *nxt = cur->next;\n        cur->next = prev;\n        prev = cur;\n        cur = nxt;\n    }\n    struct ListNode *first = groupPrev->next;\n    groupPrev->next = kth;\n    groupPrev = first;\n}',
  },
});

const rectOf = (h: number[]) => {
  let best = 0;
  const st: number[] = [];
  for (let i = 0; i <= h.length; i++) {
    const cur = i === h.length ? 0 : h[i]!;
    while (st.length && h[st[st.length - 1]!]! >= cur) {
      const height = h[st.pop()!]!;
      const left = st.length ? st[st.length - 1]! + 1 : 0;
      best = Math.max(best, height * (i - left));
    }
    st.push(i);
  }
  return best;
};

const largestRectangle = coding({
  title: 'Largest Rectangle in a Histogram',
  statement:
    'The bars of a histogram have width 1 and heights `heights[i]`. Return the area of the largest rectangle that fits entirely inside the histogram.\n\nThe area can exceed 2^31: use 64-bit integers. A monotonic stack gives O(n).',
  constraints: '- 1 ≤ n ≤ 2·10^5\n- 0 ≤ heights[i] ≤ 10^9',
  difficulty: 'hard',
  tags: ['stack', 'monotonic-stack'],
  timeComplexity: 'O(n)',
  spaceComplexity: 'O(n)',
  fn: 'largestRectangle',
  params: [{ name: 'heights', type: 'int[]' }],
  returns: 'long',
  solve: (h: number[]) => rectOf(h),
  samples: [
    { args: [[2, 1, 5, 6, 2, 3]], explanation: 'Bars 5 and 6 give a 5 × 2 = 10 rectangle.' },
    { args: [[2, 4]], explanation: 'The single bar of height 4 has area 4 (2 × 2 also gives 4).' },
  ],
  hidden: [
    { args: [[0]] },
    { args: [[7]] },
    { args: [[1, 1, 1, 1]] },
    { args: [[6, 2, 5, 4, 5, 1, 6]] },
    { args: [range(1000, 1)] },
    { args: [range(1000, 1).reverse()] },
    { args: [ints(rng(591), 3000, 0, 1000)] },
    { args: [ints(rng(592), 5000, 0, 1000000000)] },
    { args: [Array(200000).fill(1000000000)], stress: true },
    { args: [ints(rng(593), 200000, 0, 1000000000)], stress: true },
  ],
  solutions: {
    python: 'best = 0\nst = []\nn = len(heights)\nfor i in range(n + 1):\n    cur = heights[i] if i < n else 0\n    while st and heights[st[-1]] >= cur:\n        h = heights[st.pop()]\n        left = st[-1] + 1 if st else 0\n        area = h * (i - left)\n        if area > best:\n            best = area\n    st.append(i)\nreturn best',
    javascript: 'let best = 0;\nconst st = [];\nfor (let i = 0; i <= heights.length; i++) {\n  const cur = i === heights.length ? 0 : heights[i];\n  while (st.length && heights[st[st.length - 1]] >= cur) {\n    const h = heights[st.pop()];\n    const left = st.length ? st[st.length - 1] + 1 : 0;\n    best = Math.max(best, h * (i - left));\n  }\n  st.push(i);\n}\nreturn best;',
    java: 'long best = 0;\nint n = heights.length, top = 0;\nint[] st = new int[n + 1];\nfor (int i = 0; i <= n; i++) {\n    int cur = i == n ? 0 : heights[i];\n    while (top > 0 && heights[st[top - 1]] >= cur) {\n        long h = heights[st[--top]];\n        int left = top > 0 ? st[top - 1] + 1 : 0;\n        best = Math.max(best, h * (i - left));\n    }\n    st[top++] = i;\n}\nreturn best;',
    csharp: 'long best = 0;\nvar st = new Stack<int>();\nint n = heights.Length;\nfor (int i = 0; i <= n; i++)\n{\n    int cur = i == n ? 0 : heights[i];\n    while (st.Count > 0 && heights[st.Peek()] >= cur)\n    {\n        long h = heights[st.Pop()];\n        int left = st.Count > 0 ? st.Peek() + 1 : 0;\n        best = Math.Max(best, h * (i - left));\n    }\n    st.Push(i);\n}\nreturn best;',
    go: 'var best int64\nn := len(heights)\nst := make([]int, 0, n+1)\nfor i := 0; i <= n; i++ {\n    cur := 0\n    if i < n {\n        cur = heights[i]\n    }\n    for len(st) > 0 && heights[st[len(st)-1]] >= cur {\n        h := int64(heights[st[len(st)-1]])\n        st = st[:len(st)-1]\n        left := 0\n        if len(st) > 0 {\n            left = st[len(st)-1] + 1\n        }\n        if a := h * int64(i-left); a > best {\n            best = a\n        }\n    }\n    st = append(st, i)\n}\nreturn best',
    rust: 'let n = heights.len();\nlet mut best: i64 = 0;\nlet mut st: Vec<usize> = Vec::with_capacity(n + 1);\nfor i in 0..=n {\n    let cur = if i < n { heights[i] } else { 0 };\n    while let Some(&top) = st.last() {\n        if heights[top] < cur {\n            break;\n        }\n        st.pop();\n        let left = st.last().map_or(0, |&j| j + 1);\n        best = best.max(heights[top] as i64 * (i - left) as i64);\n    }\n    st.push(i);\n}\nbest',
    cpp: 'long long best = 0;\nint n = heights.size();\nvector<int> st;\nfor (int i = 0; i <= n; i++) {\n    int cur = i == n ? 0 : heights[i];\n    while (!st.empty() && heights[st.back()] >= cur) {\n        long long h = heights[st.back()];\n        st.pop_back();\n        int left = st.empty() ? 0 : st.back() + 1;\n        best = max(best, h * (i - left));\n    }\n    st.push_back(i);\n}\nreturn best;',
    c: 'long long best = 0;\nint n = heights_size, top = 0;\nint *st = malloc(sizeof(int) * (size_t)(n + 1));\nfor (int i = 0; i <= n; i++) {\n    int cur = i == n ? 0 : heights[i];\n    while (top > 0 && heights[st[top - 1]] >= cur) {\n        long long h = heights[st[--top]];\n        int left = top > 0 ? st[top - 1] + 1 : 0;\n        if (h * (i - left) > best) best = h * (i - left);\n    }\n    st[top++] = i;\n}\nfree(st);\nreturn best;',
  },
});

export const LINEAR: CodingQuestionInput[] = [reverseList, mergeTwoLists, validBrackets, removeAdjacentDuplicates, removeNthFromEnd, evalRPN, addTwoNumbers, maxSlidingWindow, reverseKGroup, largestRectangle];
