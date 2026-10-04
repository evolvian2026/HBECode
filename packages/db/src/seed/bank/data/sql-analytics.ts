import type { DbDataset, DbQuestionInput } from '@hbe/shared';
import { ds, int, md, nameOf, pick, rng, sqlQuestion, table } from './common.js';

// --- employees(id, name, dept, salary) ---------------------------------------------------------

type Emp = [number, string, string, number];
const DEPTS = ['Design', 'Finance', 'Ops', 'Sales', 'Tech'];
const empSql = (rows: Emp[]) => table('employees', 'id INT PRIMARY KEY, name VARCHAR(40) NOT NULL, dept VARCHAR(20) NOT NULL, salary INT NOT NULL', ['id', 'name', 'dept', 'salary'], rows);
const EMP_SCHEMA = md('employees', [['id', 'INT (primary key)'], ['name', 'VARCHAR(40), unique'], ['dept', 'VARCHAR(20)'], ['salary', 'INT']]);
const EMP_STARTER = '-- employees(id, name, dept, salary)\nSELECT\n';
function emps(seed: number, n: number, o: { depts?: number; ties?: boolean } = {}): Emp[] {
  const r = rng(seed);
  const ds_ = DEPTS.slice(0, o.depts ?? 4);
  return Array.from({ length: n }, (_, i) => [i + 1, nameOf(i), pick(r, ds_), o.ties ? 40_000 + 5_000 * int(r, 0, 3) : 30_000 + 500 * int(r, 0, 240)]);
}
const empHidden = (seed: number, sizes: [number, { depts?: number; ties?: boolean }][]): DbDataset[] => sizes.map(([n, o], i) => ds(empSql(emps(seed + i, n, o))));
const EMP_A: Emp[] = [
  [1, 'Asha', 'Tech', 90_000],
  [2, 'Ravi', 'Tech', 120_000],
  [3, 'Meera', 'Sales', 70_000],
  [4, 'Kiran', 'Tech', 90_000],
  [5, 'Dev', 'Sales', 82_000],
];
const EMP_B: Emp[] = [
  [1, 'Zoya', 'Ops', 50_000],
  [2, 'Omkar', 'Ops', 50_000],
  [3, 'Lata', 'Ops', 45_000],
];

// --- daily_sales(day, amount) ------------------------------------------------------------------

type Day = [number, number];
const salesSql = (rows: Day[]) => table('daily_sales', 'day INT PRIMARY KEY, amount INT NOT NULL', ['day', 'amount'], rows);
const SALES_SCHEMA = md('daily_sales', [['day', 'INT (primary key), the day number'], ['amount', 'INT, that day\'s sales']]);
const SALES_STARTER = '-- daily_sales(day, amount)\nSELECT\n';
/** Days in random order with gaps, so solutions must sort and must not assume consecutive days. */
function days(seed: number, n: number, gaps = true): Day[] {
  const r = rng(seed);
  let d = int(r, 1, 5);
  const rows: Day[] = [];
  for (let i = 0; i < n; i++) {
    rows.push([d, int(r, 0, 500) * 10]);
    d += gaps ? int(r, 1, 3) : 1;
  }
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
  }
  return rows;
}
const salesHidden = (seed: number, sizes: number[]) => sizes.map((n, i) => ds(salesSql(days(seed + i, n, i % 2 === 0))));
const SALES_A: Day[] = [[1, 100], [2, 150], [4, 120], [5, 200]];
const SALES_B: Day[] = [[7, 30], [3, 60]];

// --- orders(id, customer, day, amount) ---------------------------------------------------------

type Ord = [number, string, number, number];
const ordSql = (rows: Ord[]) => table('orders', 'id INT PRIMARY KEY, customer VARCHAR(40) NOT NULL, day INT NOT NULL, amount INT NOT NULL', ['id', 'customer', 'day', 'amount'], rows);
const ORD_SCHEMA = md('orders', [['id', 'INT (primary key)'], ['customer', 'VARCHAR(40)'], ['day', 'INT, the day number the order was placed'], ['amount', 'INT']]);
function orders(seed: number, n: number, customers: number, spanDays: number): Ord[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => [i + 1, nameOf(int(r, 0, customers - 1)), int(r, 1, spanDays), int(r, 1, 100) * 10]);
}

// --- staff(id, name, manager_id) ---------------------------------------------------------------

type Staff = [number, string, number | null];
const staffSql = (rows: Staff[]) => table('staff', 'id INT PRIMARY KEY, name VARCHAR(40) NOT NULL, manager_id INT', ['id', 'name', 'manager_id'], rows);
function staff(seed: number, n: number, roots: number, deep: boolean): Staff[] {
  const r = rng(seed);
  // Managers always have a smaller id than their reports, so the data is a forest (no cycles).
  return Array.from({ length: n }, (_, i) => [i + 1, nameOf(i), i < roots ? null : deep ? int(r, Math.max(1, i - 2), i) : int(r, 1, i)]);
}

// --- logins(user_id, day) ----------------------------------------------------------------------

type Login = [number, number];
const loginSql = (rows: Login[]) => table('logins', 'user_id INT NOT NULL, day INT NOT NULL', ['user_id', 'day'], rows);
function logins(seed: number, users: number, span: number, p: number): Login[] {
  const r = rng(seed);
  const rows: Login[] = [];
  for (let u = 1; u <= users; u++) {
    for (let d = 1; d <= span; d++) {
      if (r() < p) {
        rows.push([u, d]);
        if (r() < 0.2) rows.push([u, d]);
      }
    }
  }
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
  }
  return rows;
}

// --- Easy --------------------------------------------------------------------------------------

const rowNumber = sqlQuestion({
  title: 'Number Employees Within Department',
  statement:
    'Number the employees of each department from 1, highest salary first; employees with the same salary are numbered by `id`. Return `dept`, `name`, `salary` and the number as `position`, ordered by `dept`, then `position`.',
  difficulty: 'easy',
  tags: ['sql', 'window-functions', 'row-number'],
  mode: 'query',
  schemaDisplay: EMP_SCHEMA,
  samples: [ds(empSql(EMP_A), 'Sales: Dev 1, Meera 2. Tech: Ravi 1; Asha and Kiran tie at 90000 so Asha (id 1) is 2 and Kiran 3.'), ds(empSql(EMP_B), 'Zoya and Omkar tie; Zoya has the lower id.')],
  hidden: empHidden(1301, [[1, {}], [6, { depts: 1, ties: true }], [20, {}], [40, { ties: true }], [80, { depts: 5 }], [10, { depts: 5 }], [200, { ties: true, depts: 3 }], [30, { depts: 2 }]]),
  solution: 'SELECT dept, name, salary,\n       ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC, id) AS position\nFROM employees\nORDER BY dept, position;\n',
  starter: EMP_STARTER,
});

const runningTotal = sqlQuestion({
  title: 'Running Sales Total',
  statement: 'For every day in `daily_sales`, return `day`, `amount` and `running_total`: the sum of `amount` over that day and all earlier days. Order by `day`.',
  difficulty: 'easy',
  tags: ['sql', 'window-functions', 'running-total'],
  mode: 'query',
  schemaDisplay: SALES_SCHEMA,
  samples: [ds(salesSql(SALES_A), 'Running totals: 100, 250, 370, 570. Day 3 has no row and is simply absent.'), ds(salesSql(SALES_B), 'Rows are stored out of order; day 3 comes first: 60, then 90.')],
  hidden: salesHidden(1311, [1, 3, 10, 30, 60, 100, 250, 15]),
  solution: 'SELECT day, amount, SUM(amount) OVER (ORDER BY day) AS running_total\nFROM daily_sales\nORDER BY day;\n',
  starter: SALES_STARTER,
});

const salaryRanks = sqlQuestion({
  title: 'Rank and Dense Rank',
  statement:
    'Rank all employees by salary, highest first. Return `name`, `salary`, `salary_rank` (tied salaries share a rank and the next rank skips, like 1, 2, 2, 4) and `dense_salary_rank` (no gaps, like 1, 2, 2, 3). Order by `salary` descending, then `id`.',
  difficulty: 'easy',
  tags: ['sql', 'window-functions', 'rank'],
  mode: 'query',
  schemaDisplay: EMP_SCHEMA,
  samples: [ds(empSql(EMP_A), 'Ravi is 1. Asha and Kiran tie at rank 2 (dense rank 2). Dev is rank 4 but dense rank 3; Meera is rank 5, dense rank 4.'), ds(empSql(EMP_B), 'Zoya and Omkar share rank 1; Lata is rank 3, dense rank 2.')],
  hidden: empHidden(1321, [[1, {}], [4, { ties: true }], [12, { ties: true }], [30, {}], [60, { ties: true }], [8, {}], [150, { ties: true }], [300, {}]]),
  solution:
    'SELECT name, salary,\n       RANK() OVER (ORDER BY salary DESC) AS salary_rank,\n       DENSE_RANK() OVER (ORDER BY salary DESC) AS dense_salary_rank\nFROM employees\nORDER BY salary DESC, id;\n',
  starter: EMP_STARTER,
});

const dailyChange = sqlQuestion({
  title: 'Change From the Previous Day',
  statement:
    'For every row of `daily_sales`, return `day`, `amount` and `delta`: this amount minus the amount of the previous recorded day (the closest smaller `day`). The first day has no previous day, so its `delta` is NULL. Order by `day`.',
  difficulty: 'easy',
  tags: ['sql', 'window-functions', 'lag'],
  mode: 'query',
  schemaDisplay: SALES_SCHEMA,
  samples: [ds(salesSql(SALES_A), 'Changes: NULL, +50, -30 (day 4 compares with day 2), +80.'), ds(salesSql(SALES_B), 'Day 3 is first (NULL); day 7 changes by 30 − 60 = −30.')],
  hidden: salesHidden(1331, [1, 2, 9, 25, 50, 120, 300, 40]),
  solution: 'SELECT day, amount, amount - LAG(amount) OVER (ORDER BY day) AS delta\nFROM daily_sales\nORDER BY day;\n',
  starter: SALES_STARTER,
});

// --- Moderate ----------------------------------------------------------------------------------

const topTwo = sqlQuestion({
  title: 'Top Two Earners per Department',
  statement:
    'Return the two highest-paid employees of every department (one if the department has only one). Ties on salary go to the lower `id`. Return `dept`, `name`, `salary`, ordered by `dept`, then `salary` descending, then `id`.',
  difficulty: 'moderate',
  tags: ['sql', 'window-functions', 'cte', 'top-n'],
  mode: 'query',
  schemaDisplay: EMP_SCHEMA,
  samples: [ds(empSql(EMP_A), 'Sales has exactly two people. In Tech, Ravi is first and Asha beats Kiran on id.'), ds(empSql(EMP_B), 'Zoya and Omkar; Lata is third.')],
  hidden: empHidden(1341, [[1, {}], [3, { depts: 1, ties: true }], [15, {}], [40, { ties: true }], [90, { depts: 5 }], [7, { depts: 5 }], [250, { ties: true }], [25, { depts: 2, ties: true }]]),
  solution:
    'WITH ranked AS (\n  SELECT id, dept, name, salary,\n         ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC, id) AS rn\n  FROM employees\n)\nSELECT dept, name, salary\nFROM ranked\nWHERE rn <= 2\nORDER BY dept, salary DESC, id;\n',
  starter: EMP_STARTER,
});

const movingAverage = sqlQuestion({
  title: 'Three-Day Moving Average',
  statement:
    'For every row of `daily_sales`, return `day` and `avg3`: the average `amount` over this row and the two rows before it (by `day`), rounded to 2 decimals. The first rows average over as many rows as exist. Order by `day`.',
  difficulty: 'moderate',
  tags: ['sql', 'window-functions', 'frames'],
  mode: 'query',
  schemaDisplay: SALES_SCHEMA,
  samples: [ds(salesSql(SALES_A), 'avg3: 100, 125 (100 and 150), 123.33 (100, 150, 120), 156.67 (150, 120, 200).'), ds(salesSql(SALES_B), 'Day 3: 60; day 7: (60 + 30) / 2 = 45.')],
  hidden: salesHidden(1351, [1, 2, 3, 12, 40, 100, 300, 25]),
  solution: 'SELECT day,\n       ROUND(AVG(amount) OVER (ORDER BY day ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS avg3\nFROM daily_sales\nORDER BY day;\n',
  starter: SALES_STARTER,
});

const gapToTop = sqlQuestion({
  title: 'Gap to the Department Maximum',
  statement:
    'For every employee, return `dept`, `name`, `salary`, `dept_max` (the highest salary in their department) and `gap` (`dept_max` minus their salary). Order by `dept`, then `gap`, then `id`.',
  difficulty: 'moderate',
  tags: ['sql', 'window-functions', 'partition-by'],
  mode: 'query',
  schemaDisplay: EMP_SCHEMA,
  samples: [ds(empSql(EMP_A), 'Tech max is 120000, so Asha and Kiran have a gap of 30000. Sales max is 82000.'), ds(empSql(EMP_B), 'Ops max is 50000; Lata is 5000 behind.')],
  hidden: empHidden(1361, [[1, {}], [5, { depts: 1 }], [18, { ties: true }], [45, {}], [100, { depts: 5 }], [9, { depts: 5, ties: true }], [220, {}], [30, { depts: 3 }]]),
  solution:
    'SELECT dept, name, salary, MAX(salary) OVER (PARTITION BY dept) AS dept_max,\n       MAX(salary) OVER (PARTITION BY dept) - salary AS gap\nFROM employees\nORDER BY dept, gap, id;\n',
  starter: EMP_STARTER,
});

const ORD_A: Ord[] = [[1, 'Asha', 5, 100], [2, 'Ravi', 3, 40], [3, 'Asha', 2, 70], [4, 'Asha', 9, 20], [5, 'Ravi', 3, 90]];
const ORD_B: Ord[] = [[1, 'Kiran', 4, 10]];
const firstLast = sqlQuestion({
  title: 'First and Last Order per Customer',
  statement:
    'For every customer, return `customer`, `orders` (how many orders they placed), `first_order` (the `id` of their earliest order) and `last_order` (the `id` of their latest order). Orders on the same `day` are ordered by `id`. Order the result by `customer`.',
  difficulty: 'moderate',
  tags: ['sql', 'window-functions', 'first-value'],
  mode: 'query',
  schemaDisplay: ORD_SCHEMA,
  samples: [
    ds(ordSql(ORD_A), 'Asha: 3 orders, earliest is order 3 (day 2), latest order 4 (day 9). Ravi: both orders on day 3, so first is order 2 and last is order 5.'),
    ds(ordSql(ORD_B), 'One order is both the first and the last.'),
  ],
  hidden: [[1, 1, 5], [6, 2, 3], [20, 5, 10], [50, 8, 30], [100, 20, 15], [12, 12, 4], [300, 30, 60], [40, 3, 2]].map(([n, c, s], i) => ds(ordSql(orders(1371 + i, n!, c!, s!)))),
  solution:
    'WITH o AS (\n  SELECT customer,\n         COUNT(*) OVER (PARTITION BY customer) AS orders,\n         FIRST_VALUE(id) OVER (PARTITION BY customer ORDER BY day, id) AS first_order,\n         FIRST_VALUE(id) OVER (PARTITION BY customer ORDER BY day DESC, id DESC) AS last_order\n  FROM orders\n)\nSELECT DISTINCT customer, orders, first_order, last_order\nFROM o\nORDER BY customer;\n',
  starter: '-- orders(id, customer, day, amount)\nSELECT\n',
});

// --- Hard --------------------------------------------------------------------------------------

const STAFF_A: Staff[] = [[1, 'Asha', null], [2, 'Ravi', 1], [3, 'Meera', 1], [4, 'Kiran', 2], [5, 'Dev', 4]];
const STAFF_B: Staff[] = [[1, 'Zoya', null], [2, 'Omkar', null], [3, 'Lata', 2]];
const hierarchy = sqlQuestion({
  title: 'Org Chart Depth and Team Size',
  statement:
    'The `staff` table is an org chart: `manager_id` points to another staff member, or is NULL for people at the top. For every person return `name`, `depth` (0 for people at the top, 1 for their direct reports, and so on) and `team` (how many people report to them directly **or indirectly**). Order by `depth`, then `id`.',
  difficulty: 'hard',
  tags: ['sql', 'recursive-cte', 'hierarchy'],
  mode: 'query',
  schemaDisplay: md('staff', [['id', 'INT (primary key)'], ['name', 'VARCHAR(40), unique'], ['manager_id', 'INT → staff.id, NULL at the top; there are no cycles']]),
  samples: [
    ds(staffSql(STAFF_A), 'Asha (depth 0) has 4 people under her. Ravi (depth 1) has Kiran and, through Kiran, Dev: team 2. Dev is at depth 3.'),
    ds(staffSql(STAFF_B), 'Two people at the top; Omkar has Lata.'),
  ],
  hidden: [[1, 1, false], [4, 1, true], [15, 2, false], [40, 3, false], [60, 1, true], [120, 4, false], [300, 5, false], [200, 2, true]].map(([n, roots, deep], i) => ds(staffSql(staff(1381 + i, n as number, roots as number, deep as boolean)))),
  solution:
    'WITH RECURSIVE lvl AS (\n  SELECT id, 0 AS depth FROM staff WHERE manager_id IS NULL\n  UNION ALL\n  SELECT s.id, l.depth + 1 FROM staff s JOIN lvl l ON s.manager_id = l.id\n),\nunder AS (\n  SELECT id AS boss, id AS member FROM staff\n  UNION ALL\n  SELECT u.boss, s.id FROM under u JOIN staff s ON s.manager_id = u.member\n)\nSELECT s.name, l.depth, (SELECT COUNT(*) - 1 FROM under u WHERE u.boss = s.id) AS team\nFROM staff s\nJOIN lvl l ON l.id = s.id\nORDER BY l.depth, s.id;\n',
  starter: '-- staff(id, name, manager_id)\nSELECT\n',
  timeLimitMs: 3000,
});

const LOG_A: Login[] = [[1, 1], [1, 2], [1, 2], [1, 3], [1, 5], [2, 4], [2, 6], [2, 7]];
const LOG_B: Login[] = [[3, 10], [3, 12]];
const streak = sqlQuestion({
  title: 'Longest Login Streak',
  statement:
    'The `logins` table has one row per login; a user may log in several times on the same day. A **streak** is a run of consecutive days with at least one login each. For every user, return `user_id` and `longest_streak` (the length in days of their longest streak). Order by `longest_streak` descending, then `user_id`.',
  difficulty: 'hard',
  tags: ['sql', 'window-functions', 'gaps-and-islands'],
  mode: 'query',
  schemaDisplay: md('logins', [['user_id', 'INT'], ['day', 'INT ≥ 1, the day number'], ['', 'rows are not unique: several logins on one day are possible']]),
  samples: [ds(loginSql(LOG_A), 'User 1: days 1–3 (the two logins on day 2 count once), then day 5: longest 3. User 2: days 6–7: longest 2.'), ds(loginSql(LOG_B), 'Days 10 and 12 are not consecutive: longest 1.')],
  hidden: [[1, 1, 1], [1, 10, 1], [3, 20, 0.5], [5, 40, 0.7], [10, 60, 0.85], [20, 30, 0.3], [30, 100, 0.9], [8, 15, 0.6]].map(([u, s, p], i) => ds(loginSql(logins(1391 + i, u!, s!, p!)))),
  solution:
    'WITH d AS (\n  SELECT DISTINCT user_id, day FROM logins\n),\ng AS (\n  SELECT user_id, day - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY day) AS grp\n  FROM d\n),\nruns AS (\n  SELECT user_id, COUNT(*) AS len FROM g GROUP BY user_id, grp\n)\nSELECT user_id, MAX(len) AS longest_streak\nFROM runs\nGROUP BY user_id\nORDER BY longest_streak DESC, user_id;\n',
  mysql:
    'WITH d AS (\n  SELECT DISTINCT user_id, day FROM logins\n),\ng AS (\n  SELECT user_id, CAST(day AS SIGNED) - CAST(ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY day) AS SIGNED) AS grp\n  FROM d\n),\nruns AS (\n  SELECT user_id, COUNT(*) AS len FROM g GROUP BY user_id, grp\n)\nSELECT user_id, MAX(len) AS longest_streak\nFROM runs\nGROUP BY user_id\nORDER BY longest_streak DESC, user_id;\n',
  starter: '-- logins(user_id, day)\nSELECT\n',
});

export const SQL_ANALYTICS: DbQuestionInput[] = [rowNumber, runningTotal, salaryRanks, dailyChange, topTwo, movingAverage, gapToTop, firstLast, hierarchy, streak];
