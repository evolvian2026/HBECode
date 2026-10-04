import type { DbDataset, DbQuestionInput } from '@hbe/shared';
import { monthlyRevenue } from '../../questions/db-questions.js';
import { CITIES, int, md, nameOf, pick, rng, type Rng } from './common.js';

type Cell = string | number;
const csv = (header: string[], rows: Cell[][]) => `${header.join(',')}\n${rows.map((r) => r.join(',')).join('\n')}${rows.length ? '\n' : ''}`;
const pds = (tables: Record<string, string>, explanation = ''): DbDataset => ({ setup: { pandas: tables }, explanation, weight: 1 });
const shuffle = <T>(r: Rng, xs: T[]): T[] => {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs;
};

function pandasQuestion(
  q: Omit<DbQuestionInput, 'type' | 'dialects' | 'compare' | 'starters' | 'solutions' | 'isPractice' | 'mode' | 'timeLimitMs'> & { params: string[]; body: string; imports?: string },
): DbQuestionInput {
  const { params, body, imports, ...rest } = q;
  const sig = `def solve(${params.map((p) => `${p}: pd.DataFrame`).join(', ')}) -> pd.DataFrame:\n`;
  const head = `import pandas as pd\n${imports ?? ''}\n\n`;
  return {
    type: 'db',
    dialects: ['pandas'],
    isPractice: true,
    mode: 'query',
    ...rest,
    compare: { orderSensitive: true, columnNames: 'ignore_case', floatEpsilon: 1e-6, ignoreMongoId: true },
    starters: { pandas: `${head}${sig}    ...\n` },
    solutions: { pandas: `${head}${sig}${body}` },
    timeLimitMs: 3000,
  };
}

// --- employees ---------------------------------------------------------------------------------

type Emp = [number, string, string, number];
const DEPTS = ['Design', 'Finance', 'Ops', 'Sales', 'Tech'];
const empCsv = (rows: Emp[]) => ({ employees: csv(['id', 'name', 'dept', 'salary'], rows) });
const EMP_SCHEMA = md('employees', [['id', 'integer, unique'], ['name', 'text, unique'], ['dept', 'text'], ['salary', 'integer (a multiple of 100)']]);
function emps(seed: number, n: number, o: { depts?: number; ties?: boolean } = {}): Emp[] {
  const r = rng(seed);
  const ds = DEPTS.slice(0, o.depts ?? 4);
  return Array.from({ length: n }, (_, i) => [i + 1, nameOf(i), pick(r, ds), o.ties ? 40_000 + 5_000 * int(r, 0, 4) : 100 * int(r, 300, 1500)]);
}
const empSets = (seed: number, specs: [number, { depts?: number; ties?: boolean }][]) => specs.map(([n, o], i) => pds(empCsv(emps(seed + i, n, o))));
const EMP_A: Emp[] = [[1, 'Asha', 'Tech', 90_000], [2, 'Ravi', 'Tech', 120_000], [3, 'Meera', 'Sales', 70_000], [4, 'Kiran', 'Tech', 90_000], [5, 'Dev', 'Sales', 82_000], [6, 'Lata', 'Ops', 45_000]];
const EMP_B: Emp[] = [[1, 'Zoya', 'Ops', 50_000], [2, 'Omkar', 'Ops', 50_000], [3, 'Tara', 'Sales', 61_000]];

const wellPaid = pandasQuestion({
  title: 'Employees Earning at Least 60,000',
  statement: 'Implement `solve(employees)` returning the `name` and `salary` of employees earning at least **60000**, highest salary first; equal salaries are ordered by `name`.',
  difficulty: 'easy',
  tags: ['pandas', 'filter', 'sort'],
  schemaDisplay: EMP_SCHEMA,
  samples: [pds(empCsv(EMP_A), 'Everyone except Lata (45000). Asha and Kiran tie at 90000 and are ordered by name.'), pds(empCsv(EMP_B), 'Only Tara earns 60000 or more.')],
  hidden: empSets(1601, [[1, {}], [5, {}], [20, {}], [50, { ties: true }], [100, {}], [8, { ties: true }], [400, {}], [30, {}]]),
  params: ['employees'],
  body: "    df = employees[employees['salary'] >= 60000]\n    return df.sort_values(['salary', 'name'], ascending=[False, True])[['name', 'salary']].reset_index(drop=True)\n",
});

const deptStats = pandasQuestion({
  title: 'Department Headcount and Average Salary',
  statement: 'Implement `solve(employees)` returning one row per department with `dept`, `headcount` and `avg_salary` (the mean salary rounded to 2 decimals), sorted by `dept`.',
  difficulty: 'easy',
  tags: ['pandas', 'groupby', 'aggregation'],
  schemaDisplay: EMP_SCHEMA,
  samples: [pds(empCsv(EMP_A), 'Ops: 1 person, 45000. Sales: 2, (70000 + 82000) / 2 = 76000. Tech: 3, 100000.'), pds(empCsv(EMP_B), 'Ops: 2 at 50000; Sales: 1 at 61000.')],
  hidden: empSets(1611, [[1, {}], [3, { depts: 1 }], [20, {}], [45, { depts: 5 }], [120, {}], [7, { depts: 5 }], [400, { depts: 5 }], [25, { depts: 2 }]]),
  params: ['employees'],
  body:
    "    out = employees.groupby('dept', as_index=False).agg(headcount=('id', 'count'), avg_salary=('salary', 'mean'))\n" +
    "    out['avg_salary'] = out['avg_salary'].round(2)\n    return out.sort_values('dept').reset_index(drop=True)\n",
});

const bonuses = pandasQuestion({
  title: 'Bonus Column',
  statement:
    'Implement `solve(employees)` adding a `bonus` column: **10%** of salary for employees in **Sales** and **5%** for everyone else. Return `id`, `name`, `bonus`, sorted by `id`.',
  difficulty: 'easy',
  tags: ['pandas', 'new-column', 'conditional'],
  schemaDisplay: EMP_SCHEMA,
  samples: [pds(empCsv(EMP_A), 'Meera and Dev are in Sales: 7000 and 8200. Asha gets 5% of 90000 = 4500.'), pds(empCsv(EMP_B), 'Zoya and Omkar get 2500; Tara (Sales) gets 6100.')],
  hidden: empSets(1621, [[1, {}], [4, { depts: 1 }], [15, {}], [40, { depts: 5 }], [90, {}], [10, { depts: 4 }], [350, {}], [25, {}]]),
  params: ['employees'],
  body:
    "    df = employees.copy()\n    rate = df['dept'].eq('Sales').map({True: 0.10, False: 0.05})\n    df['bonus'] = (df['salary'] * rate).round(2)\n" +
    "    return df.sort_values('id')[['id', 'name', 'bonus']].reset_index(drop=True)\n",
});

// --- Moderate ----------------------------------------------------------------------------------

type Cust = [number, string, string];
type Ord = [number, number, number];
const shopCsv = (c: Cust[], o: Ord[]) => ({ customers: csv(['id', 'name', 'city'], c), orders: csv(['id', 'customer_id', 'amount'], o) });
function shop(seed: number, customers: number, orders: number, cities: number): { c: Cust[]; o: Ord[] } {
  const r = rng(seed);
  const cs = CITIES.slice(0, cities);
  const c = Array.from({ length: customers }, (_, i) => [i + 1, nameOf(i), pick(r, cs)] as Cust);
  const o = Array.from({ length: orders }, (_, i) => [i + 1, int(r, 1, customers), int(r, 1, 100) * 10] as Ord);
  return { c, o };
}
const cityRevenue = pandasQuestion({
  title: 'Revenue by City',
  statement:
    'Implement `solve(customers, orders)` returning, for every city with at least one order, `city`, `customers` (how many **different** customers from that city ordered), `orders` (number of orders) and `revenue` (sum of `amount`). Sort by `revenue` (highest first), then `city`.',
  difficulty: 'moderate',
  tags: ['pandas', 'merge', 'groupby'],
  schemaDisplay: `${md('customers', [['id', 'integer, unique'], ['name', 'text'], ['city', 'text']])}\n\n${md('orders', [['id', 'integer, unique'], ['customer_id', 'integer → customers.id'], ['amount', 'integer']])}`,
  samples: [
    pds(shopCsv([[1, 'Asha', 'Pune'], [2, 'Ravi', 'Delhi'], [3, 'Meera', 'Pune'], [4, 'Kiran', 'Agra']], [[1, 1, 100], [2, 3, 250], [3, 1, 50], [4, 2, 300]]), 'Pune: Asha and Meera placed 3 orders worth 400. Delhi: 1 order, 300. Nobody from Agra ordered.'),
    pds(shopCsv([[1, 'Dev', 'Kochi'], [2, 'Uma', 'Goa']], [[1, 2, 80], [2, 2, 20], [3, 1, 100]]), 'Both cities total 100, so they are ordered by name.'),
  ],
  hidden: [[1, 1, 1], [3, 5, 2], [10, 20, 4], [30, 60, 6], [60, 200, 10], [50, 5, 10], [200, 800, 10], [15, 40, 3]].map(([c, o, k], i) => {
    const s = shop(1631 + i, c!, o!, k!);
    return pds(shopCsv(s.c, s.o));
  }),
  params: ['customers', 'orders'],
  body:
    "    m = orders.merge(customers, left_on='customer_id', right_on='id', suffixes=('_order', ''))\n" +
    "    out = m.groupby('city', as_index=False).agg(customers=('customer_id', 'nunique'), orders=('id_order', 'count'), revenue=('amount', 'sum'))\n" +
    "    return out.sort_values(['revenue', 'city'], ascending=[False, True]).reset_index(drop=True)\n",
});

const REGIONS = ['east', 'north', 'south', 'west'];
const salesCsv = (rows: [string, string, number][]) => ({ sales: csv(['date', 'region', 'amount'], rows) });
function sales(seed: number, n: number, months: number, regions: number): [string, string, number][] {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const m = int(r, 0, months - 1);
    return [`${2024 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}-${String(int(r, 1, 28)).padStart(2, '0')}`, pick(r, REGIONS.slice(0, regions)), int(r, 1, 500)];
  });
}
const regionPivot = pandasQuestion({
  title: 'Month × Region Pivot',
  statement:
    'Implement `solve(sales)` returning one row per month that has sales, with columns `month` (text `YYYY-MM`) and `east`, `north`, `south`, `west`: the total `amount` for that region in that month, or **0** if it had none. All four region columns must always be present. Sort by `month`.',
  difficulty: 'moderate',
  tags: ['pandas', 'pivot', 'reindex'],
  schemaDisplay: md('sales', [['date', 'text, `YYYY-MM-DD`'], ['region', 'text: east, north, south or west'], ['amount', 'integer']]),
  samples: [
    pds(salesCsv([['2024-01-05', 'north', 100], ['2024-01-20', 'north', 50], ['2024-01-21', 'south', 70], ['2024-02-01', 'west', 30]]), 'January: north 150, south 70, east and west 0. February: only west 30.'),
    pds(salesCsv([['2024-03-01', 'east', 5]]), 'North, south and west still appear, as 0.'),
  ],
  hidden: [[1, 1, 1], [6, 2, 2], [30, 3, 4], [80, 6, 3], [200, 12, 4], [12, 12, 1], [800, 24, 4], [40, 2, 4]].map(([n, m, k], i) => pds(salesCsv(sales(1641 + i, n!, m!, k!)))),
  params: ['sales'],
  body:
    "    df = sales.copy()\n    df['month'] = df['date'].str[:7]\n" +
    "    p = df.pivot_table(index='month', columns='region', values='amount', aggfunc='sum', fill_value=0)\n" +
    "    p = p.reindex(columns=['east', 'north', 'south', 'west'], fill_value=0).reset_index()\n    p.columns.name = None\n" +
    "    return p.sort_values('month').reset_index(drop=True)[['month', 'east', 'north', 'south', 'west']]\n",
});

type Contact = [number, string, string, string];
const contactCsv = (rows: Contact[]) => ({ contacts: csv(['id', 'email', 'name', 'updated'], rows) });
function contacts(seed: number, people: number, maxVersions: number): Contact[] {
  const r = rng(seed);
  const rows: [string, string][] = [];
  for (let p = 0; p < people; p++) {
    const first = nameOf(p);
    const email = `${first.toLowerCase()}@mail${p % 3}.in`;
    for (let v = int(r, 1, maxVersions); v > 0; v--) {
      const shown = r() < 0.3 ? email.toUpperCase() : r() < 0.3 ? `${email[0]!.toUpperCase()}${email.slice(1)}` : email;
      rows.push([r() < 0.2 ? ` ${shown}` : shown, r() < 0.5 ? first : `${first} ${String.fromCharCode(65 + int(r, 0, 25))}`]);
    }
  }
  // Timestamps strictly increase in generation order (so the latest version is unambiguous); then shuffle.
  const base = Date.UTC(2024, 0, 1);
  let t = base;
  const stamped = rows.map(([e, n]) => {
    t += int(r, 1, 3000) * 60_000;
    return [e, n, new Date(t).toISOString().slice(0, 16).replace('T', ' ')] as [string, string, string];
  });
  return shuffle(r, stamped).map(([e, n, u], i) => [i + 1, e, n, u]);
}
const latestContact = pandasQuestion({
  title: 'Latest Version of Each Contact',
  statement:
    'The `contacts` table has several versions of some contacts. Two rows are the same contact when their emails match after trimming spaces and ignoring case. Implement `solve(contacts)` returning, for each contact, `email` (trimmed and lower-cased) and the `name` from its most recently `updated` row. Sort by `email`.',
  difficulty: 'moderate',
  tags: ['pandas', 'deduplicate', 'strings', 'dates'],
  schemaDisplay: md('contacts', [['id', 'integer, unique'], ['email', 'text; may differ in case or have a leading space'], ['name', 'text'], ['updated', 'text, `YYYY-MM-DD HH:MM`; never equal for two versions of a contact']]),
  samples: [
    pds(contactCsv([[1, 'asha@x.in', 'Asha', '2024-01-01 10:00'], [2, ' ASHA@x.in', 'Asha R', '2024-03-01 09:00'], [3, 'ravi@x.in', 'Ravi', '2024-02-01 08:00'], [4, 'Ravi@X.in', 'Ravi K', '2024-01-15 12:00']]), 'Rows 1 and 2 are one contact; row 2 is newer, so "Asha R". For ravi@x.in, row 3 is newer than row 4.'),
    pds(contactCsv([[1, 'dev@y.in', 'Dev', '2024-05-05 05:05']]), 'A single contact.'),
  ],
  hidden: [[1, 1], [3, 3], [10, 2], [30, 4], [60, 3], [20, 1], [250, 4], [15, 5]].map(([p, v], i) => pds(contactCsv(contacts(1651 + i, p!, v!)))),
  params: ['contacts'],
  body:
    "    df = contacts.copy()\n    df['email'] = df['email'].str.strip().str.lower()\n    df['updated'] = pd.to_datetime(df['updated'])\n" +
    "    df = df.sort_values('updated').drop_duplicates('email', keep='last')\n    return df.sort_values('email')[['email', 'name']].reset_index(drop=True)\n",
});

type Price = [number, number];
const priceCsv = (rows: Price[]) => ({ prices: csv(['day', 'close'], rows) });
function prices(seed: number, n: number): Price[] {
  const r = rng(seed);
  let c = int(r, 50, 500);
  const start = int(r, 1, 30);
  const rows: Price[] = Array.from({ length: n }, (_, i) => {
    c = Math.max(1, c + int(r, -20, 20));
    return [start + i, c];
  });
  return shuffle(r, rows);
}
const movingAvg = pandasQuestion({
  title: 'Rolling Three-Day Price Average',
  statement:
    'Implement `solve(prices)` returning `day`, `close` and `ma3`, sorted by `day`: `ma3` is the mean `close` of that day and the two days before it, rounded to 2 decimals, and empty (NaN) for the first two days. Rows arrive in no particular order.',
  difficulty: 'moderate',
  tags: ['pandas', 'rolling', 'sort'],
  schemaDisplay: md('prices', [['day', 'integer, consecutive days, each once'], ['close', 'integer']]),
  samples: [pds(priceCsv([[3, 12], [1, 10], [2, 11], [4, 15]]), 'Day 3: (10 + 11 + 12) / 3 = 11; day 4: (11 + 12 + 15) / 3 = 12.67. Days 1 and 2 have no ma3.'), pds(priceCsv([[6, 101], [5, 100], [7, 105]]), 'Only day 7 has two days before it: 102.')],
  hidden: [1, 2, 3, 10, 40, 100, 500, 25].map((n, i) => pds(priceCsv(prices(1661 + i, n)))),
  params: ['prices'],
  body: "    df = prices.sort_values('day').reset_index(drop=True)\n    df['ma3'] = df['close'].rolling(3).mean().round(2)\n    return df[['day', 'close', 'ma3']]\n",
});

// --- Hard --------------------------------------------------------------------------------------

const topTwoSalaries = pandasQuestion({
  title: 'Top Two Salary Levels per Department',
  statement:
    'Implement `solve(employees)` returning the employees whose salary is one of the **two highest distinct salaries** in their department (so ties are all included). Return `dept`, `name`, `salary` and `rank` (1 for the highest salary level, 2 for the next), sorted by `dept`, `rank`, then `name`.',
  difficulty: 'hard',
  tags: ['pandas', 'groupby', 'rank'],
  schemaDisplay: EMP_SCHEMA,
  samples: [
    pds(empCsv(EMP_A), 'Tech: Ravi (rank 1), then Asha and Kiran share rank 2. Sales: Dev 1, Meera 2. Ops: Lata 1.'),
    pds(empCsv(EMP_B), 'Omkar and Zoya share the top salary in Ops; nobody else is in Ops.'),
  ],
  hidden: empSets(1671, [[1, {}], [4, { depts: 1, ties: true }], [20, { ties: true }], [50, {}], [100, { ties: true, depts: 5 }], [9, { depts: 5 }], [400, { ties: true }], [30, { depts: 2 }]]),
  params: ['employees'],
  body:
    "    df = employees.copy()\n    df['rank'] = df.groupby('dept')['salary'].rank(method='dense', ascending=False).astype(int)\n    df = df[df['rank'] <= 2]\n" +
    "    return df.sort_values(['dept', 'rank', 'name'])[['dept', 'name', 'salary', 'rank']].reset_index(drop=True)\n",
});

type Ev = [number, string];
const evCsv = (rows: Ev[]) => ({ events: csv(['user_id', 'ts'], rows) });
const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
function events(seed: number, users: number, perUser: number): Ev[] {
  const r = rng(seed);
  const rows: Ev[] = [];
  for (let u = 1; u <= users; u++) {
    let t = Date.UTC(2024, 0, int(r, 1, 5), int(r, 0, 23), int(r, 0, 59));
    for (let k = int(r, 1, perUser); k > 0; k--) {
      rows.push([u, stamp(t)]);
      const roll = r();
      // Mostly short gaps, some exactly 30 minutes (same session), some longer (new session).
      t += (roll < 0.1 ? 0 : roll < 0.2 ? 30 : roll < 0.75 ? int(r, 1, 29) : int(r, 31, 300)) * 60_000;
    }
  }
  return shuffle(r, rows);
}
const sessions = pandasQuestion({
  title: 'Sessions per User',
  statement:
    'Each row of `events` is one user action. A user\'s actions belong to the same **session** until there is a gap of **more than 30 minutes** between two consecutive actions; then a new session starts. Implement `solve(events)` returning, per user, `user_id`, `sessions` (the number of sessions) and `longest_minutes` (the longest session, in whole minutes from its first to its last action). Sort by `user_id`.',
  difficulty: 'hard',
  tags: ['pandas', 'sessionize', 'groupby', 'dates'],
  schemaDisplay: md('events', [['user_id', 'integer'], ['ts', 'text, `YYYY-MM-DD HH:MM` (UTC); rows are in no particular order and may repeat']]),
  samples: [
    pds(evCsv([[1, '2024-01-01 09:20'], [1, '2024-01-01 09:00'], [1, '2024-01-01 09:50'], [1, '2024-01-01 10:30'], [2, '2024-01-01 23:50'], [2, '2024-01-02 00:10']]), 'User 1: 09:00, 09:20 and 09:50 form one 50-minute session (a 30-minute gap does not split it); 10:30 starts a second. User 2: one 20-minute session across midnight.'),
    pds(evCsv([[3, '2024-02-01 08:00']]), 'A single action is one session of 0 minutes.'),
  ],
  hidden: [[1, 1], [1, 10], [3, 5], [5, 20], [10, 40], [20, 3], [40, 60], [8, 15]].map(([u, k], i) => pds(evCsv(events(1681 + i, u!, k!)))),
  params: ['events'],
  body:
    "    df = events.copy()\n    df['ts'] = pd.to_datetime(df['ts'])\n    df = df.sort_values(['user_id', 'ts'])\n" +
    "    gap = df.groupby('user_id')['ts'].diff()\n    df['session'] = (gap.isna() | (gap > pd.Timedelta(minutes=30))).cumsum()\n" +
    "    s = df.groupby(['user_id', 'session'])['ts'].agg(['min', 'max'])\n    s['minutes'] = ((s['max'] - s['min']).dt.total_seconds() // 60).astype(int)\n" +
    "    out = s.reset_index().groupby('user_id', as_index=False).agg(sessions=('session', 'count'), longest_minutes=('minutes', 'max'))\n" +
    "    return out.sort_values('user_id').reset_index(drop=True)\n",
});

export const PANDAS: DbQuestionInput[] = [monthlyRevenue, wellPaid, deptStats, bonuses, cityRevenue, regionPivot, latestContact, movingAvg, topTwoSalaries, sessions];
