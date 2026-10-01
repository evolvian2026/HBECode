import type { DbDataset, DbQuestionInput } from '@hbe/shared';
import { mulberry32 } from './rng.js';

/**
 * Seed DB questions. Expected results are never written here: validation runs the reference
 * solutions on every dataset (and checks the dialects agree), so only the inputs are generated.
 */

const DEPTS = ['Analytics', 'Billing', 'Compliance', 'Design', 'Engineering', 'Facilities', 'Growth', 'Hiring'];
const PEOPLE = ['Aarav', 'Bhavna', 'Chirag', 'Divya', 'Eshan', 'Farah', 'Gaurav', 'Heena', 'Ishaan', 'Jaya', 'Kabir', 'Lata', 'Manav', 'Nisha', 'Om', 'Pooja', 'Rohan', 'Sana', 'Tarun', 'Uma', 'Varun', 'Waqar', 'Yamini', 'Zoya'];

function topEarnerSetup(depts: string[], emps: { name: string; dept: number | null; salary: number }[]): DbDataset['setup'] {
  const d = depts.map((n, i) => `(${i + 1}, '${n}')`).join(', ');
  const e = emps.map((x, i) => `(${i + 1}, '${x.name}', ${x.dept ?? 'NULL'}, ${x.salary})`).join(',\n  ');
  return {
    sql:
      'CREATE TABLE departments (id INT PRIMARY KEY, name VARCHAR(50) NOT NULL);\n' +
      'CREATE TABLE employees (id INT PRIMARY KEY, name VARCHAR(50) NOT NULL, dept_id INT REFERENCES departments (id), salary INT NOT NULL);\n' +
      `INSERT INTO departments (id, name) VALUES ${d};\n` +
      (emps.length ? `INSERT INTO employees (id, name, dept_id, salary) VALUES\n  ${e};\n` : ''),
  };
}

function randomTopEarner(seed: number, opts: { depts: number; emps: number; ties?: boolean; nulls?: boolean }): DbDataset {
  const rnd = mulberry32(seed);
  const depts = DEPTS.slice(0, opts.depts);
  const emps = Array.from({ length: opts.emps }, (_, i) => ({
    name: `${PEOPLE[Math.floor(rnd() * PEOPLE.length)]} ${String.fromCharCode(65 + (i % 26))}.`,
    dept: opts.nulls && rnd() < 0.15 ? null : 1 + Math.floor(rnd() * depts.length),
    salary: opts.ties ? 40_000 + 5_000 * Math.floor(rnd() * 4) : 30_000 + Math.floor(rnd() * 120) * 1_000,
  }));
  return { setup: topEarnerSetup(depts, emps), explanation: '', weight: 1 };
}

const TOP_EARNER_SQL = `SELECT d.name AS department, e.name AS employee, e.salary
FROM departments d
JOIN employees e ON e.dept_id = d.id
WHERE NOT EXISTS (
  SELECT 1 FROM employees x
  WHERE x.dept_id = e.dept_id AND (x.salary > e.salary OR (x.salary = e.salary AND x.id < e.id))
)
ORDER BY d.name;
`;

export const topEarner: DbQuestionInput = {
  type: 'db',
  title: 'Top Earner per Department',
  statement:
    'For every department that has at least one employee, return the department name, the name of its highest-paid employee and that salary.\n\n' +
    'If several employees share the highest salary in a department, return the one with the **lowest employee id**. Employees without a department are ignored.\n\n' +
    'Return the columns `department`, `employee`, `salary`, ordered by `department` (A→Z).',
  difficulty: 'moderate',
  tags: ['sql', 'joins', 'subqueries'],
  isPractice: true,
  dialects: ['postgres', 'mysql'],
  mode: 'query',
  schemaDisplay:
    '**departments**\n\n| column | type |\n|---|---|\n| id | INT (primary key) |\n| name | VARCHAR(50) |\n\n' +
    '**employees**\n\n| column | type |\n|---|---|\n| id | INT (primary key) |\n| name | VARCHAR(50) |\n| dept_id | INT, nullable → departments.id |\n| salary | INT |',
  samples: [
    {
      setup: topEarnerSetup(['Engineering', 'Sales', 'Support'], [
        { name: 'Asha', dept: 1, salary: 95_000 },
        { name: 'Ravi', dept: 1, salary: 120_000 },
        { name: 'Meera', dept: 2, salary: 70_000 },
        { name: 'Kiran', dept: 2, salary: 82_000 },
      ]),
      explanation: 'Ravi earns the most in Engineering and Kiran in Sales. Support has no employees, so it is not listed.',
      weight: 1,
    },
    {
      setup: topEarnerSetup(['Design', 'Marketing'], [
        { name: 'Neha', dept: 1, salary: 60_000 },
        { name: 'Arjun', dept: 1, salary: 60_000 },
        { name: 'Sara', dept: 2, salary: 55_000 },
        { name: 'Dev', dept: null, salary: 99_000 },
      ]),
      explanation: 'Neha and Arjun tie in Design; Neha has the lower id. Dev has no department and is ignored.',
      weight: 1,
    },
  ],
  hidden: [
    { setup: topEarnerSetup(['Analytics'], [{ name: 'Solo', dept: 1, salary: 50_000 }]), explanation: 'single employee', weight: 1 },
    { setup: topEarnerSetup(['Analytics', 'Billing'], []), explanation: 'no employees at all', weight: 1 },
    { setup: topEarnerSetup(['Analytics', 'Billing'], [{ name: 'Nobody', dept: null, salary: 10_000 }]), explanation: 'only unassigned employees', weight: 1 },
    randomTopEarner(11, { depts: 3, emps: 12, ties: true }),
    randomTopEarner(12, { depts: 5, emps: 30 }),
    randomTopEarner(13, { depts: 8, emps: 40, nulls: true }),
    randomTopEarner(14, { depts: 4, emps: 25, ties: true, nulls: true }),
    randomTopEarner(15, { depts: 6, emps: 8 }),
    randomTopEarner(16, { depts: 2, emps: 200, ties: true }),
    randomTopEarner(17, { depts: 8, emps: 500, nulls: true }),
  ],
  compare: { orderSensitive: true, columnNames: 'ignore_case', floatEpsilon: 1e-6, ignoreMongoId: true },
  starters: { postgres: '-- departments(id, name), employees(id, name, dept_id, salary)\nSELECT\n', mysql: '-- departments(id, name), employees(id, name, dept_id, salary)\nSELECT\n' },
  solutions: { postgres: TOP_EARNER_SQL, mysql: TOP_EARNER_SQL },
  timeLimitMs: 2000,
};

// ---------------------------------------------------------------------------------------------

type Order = { _id: number; customer: string; status: 'paid' | 'pending' | 'cancelled'; items: { sku: string; qty: number; price: number }[] };
const CUSTOMERS = ['acme', 'birla', 'cipla', 'dabur', 'emami', 'futura', 'godrej'];
const ordersSetup = (orders: Order[]): DbDataset['setup'] => ({ mongodb: JSON.stringify({ orders }) });

function randomOrders(seed: number, n: number, customers: number): DbDataset {
  const rnd = mulberry32(seed);
  const statuses = ['paid', 'paid', 'paid', 'pending', 'cancelled'] as const;
  const orders: Order[] = Array.from({ length: n }, (_, i) => ({
    _id: i + 1,
    customer: CUSTOMERS[Math.floor(rnd() * customers)]!,
    status: statuses[Math.floor(rnd() * statuses.length)]!,
    items: Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => ({ sku: `SKU-${1 + Math.floor(rnd() * 30)}`, qty: 1 + Math.floor(rnd() * 5), price: 50 + Math.floor(rnd() * 200) * 5 })),
  }));
  return { setup: ordersSetup(orders), explanation: '', weight: 1 };
}

export const customerTotals: DbQuestionInput = {
  type: 'db',
  title: 'Paid Order Totals by Customer',
  statement:
    'The `orders` collection stores one document per order with a list of line items. For **paid** orders only, compute for each customer:\n\n' +
    '- `total`: the sum of `qty × price` over all items of their paid orders\n- `orders`: how many paid orders they placed\n\n' +
    'Return documents `{ customer, total, orders }` (no `_id`), sorted by `total` descending, then `customer` ascending.',
  difficulty: 'moderate',
  tags: ['mongodb', 'aggregation'],
  isPractice: true,
  dialects: ['mongodb'],
  mode: 'query',
  schemaDisplay:
    '**orders**\n\n```json\n{ "_id": 1, "customer": "acme", "status": "paid", "items": [ { "sku": "SKU-7", "qty": 2, "price": 150 } ] }\n```\n\n' +
    '`status` is one of `paid`, `pending`, `cancelled`. Every order has at least one item. Prices are whole numbers.',
  samples: [
    {
      setup: ordersSetup([
        { _id: 1, customer: 'acme', status: 'paid', items: [{ sku: 'A', qty: 2, price: 100 }, { sku: 'B', qty: 1, price: 50 }] },
        { _id: 2, customer: 'birla', status: 'paid', items: [{ sku: 'A', qty: 1, price: 100 }] },
        { _id: 3, customer: 'acme', status: 'pending', items: [{ sku: 'C', qty: 9, price: 999 }] },
      ]),
      explanation: 'acme: 2×100 + 1×50 = 250 from one paid order (the pending order is ignored); birla: 100.',
      weight: 1,
    },
    {
      setup: ordersSetup([
        { _id: 1, customer: 'cipla', status: 'paid', items: [{ sku: 'X', qty: 1, price: 300 }] },
        { _id: 2, customer: 'dabur', status: 'paid', items: [{ sku: 'Y', qty: 3, price: 100 }] },
        { _id: 3, customer: 'dabur', status: 'cancelled', items: [{ sku: 'Y', qty: 1, price: 100 }] },
      ]),
      explanation: 'Both customers total 300, so they are ordered by name.',
      weight: 1,
    },
  ],
  hidden: [
    { setup: ordersSetup([{ _id: 1, customer: 'emami', status: 'pending', items: [{ sku: 'Z', qty: 1, price: 10 }] }]), explanation: 'no paid orders', weight: 1 },
    { setup: ordersSetup([{ _id: 1, customer: 'emami', status: 'paid', items: [{ sku: 'Z', qty: 4, price: 25 }] }]), explanation: 'single order', weight: 1 },
    randomOrders(21, 10, 3),
    randomOrders(22, 25, 5),
    randomOrders(23, 60, 7),
    randomOrders(24, 15, 2),
    randomOrders(25, 120, 7),
    randomOrders(26, 40, 4),
    randomOrders(27, 400, 7),
  ],
  compare: { orderSensitive: true, columnNames: 'ignore_case', floatEpsilon: 1e-6, ignoreMongoId: true },
  starters: { mongodb: '{\n  "collection": "orders",\n  "pipeline": [\n  ]\n}\n' },
  solutions: {
    mongodb: JSON.stringify(
      {
        collection: 'orders',
        pipeline: [
          { $match: { status: 'paid' } },
          { $project: { customer: 1, value: { $sum: { $map: { input: '$items', as: 'i', in: { $multiply: ['$$i.qty', '$$i.price'] } } } } } },
          { $group: { _id: '$customer', total: { $sum: '$value' }, orders: { $sum: 1 } } },
          { $project: { _id: 0, customer: '$_id', total: 1, orders: 1 } },
          { $sort: { total: -1, customer: 1 } },
        ],
      },
      null,
      2,
    ),
  },
  timeLimitMs: 2000,
};

// ---------------------------------------------------------------------------------------------

const REGIONS = ['east', 'north', 'south', 'west'];
const salesCsv = (rows: [string, string, number][]) => ({ pandas: { sales: `date,region,amount\n${rows.map((r) => r.join(',')).join('\n')}\n` } });

function randomSales(seed: number, n: number, months: number, regions: number): DbDataset {
  const rnd = mulberry32(seed);
  const rows: [string, string, number][] = Array.from({ length: n }, () => {
    const m = 1 + Math.floor(rnd() * months);
    const year = 2024 + Math.floor((m - 1) / 12);
    const day = 1 + Math.floor(rnd() * 28);
    return [`${year}-${String(((m - 1) % 12) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, REGIONS[Math.floor(rnd() * regions)]!, 100 + Math.floor(rnd() * 5000)];
  });
  return { setup: salesCsv(rows), explanation: '', weight: 1 };
}

export const monthlyRevenue: DbQuestionInput = {
  type: 'db',
  title: 'Monthly Revenue by Region',
  statement:
    'You are given a `sales` DataFrame with one row per sale. Implement `solve(sales)` returning a DataFrame with the total revenue per calendar month and region.\n\n' +
    'Columns: `month` (text, `YYYY-MM`), `region`, `revenue` (sum of `amount`). Sort by `month`, then `region`. Months or regions without sales do not appear.',
  difficulty: 'easy',
  tags: ['pandas', 'groupby', 'dates'],
  isPractice: true,
  dialects: ['pandas'],
  mode: 'query',
  schemaDisplay: '**sales**\n\n| column | type |\n|---|---|\n| date | text, `YYYY-MM-DD` |\n| region | text |\n| amount | integer |',
  samples: [
    { setup: salesCsv([['2024-01-05', 'north', 100], ['2024-01-20', 'north', 50], ['2024-01-21', 'south', 70], ['2024-02-01', 'north', 30]]), explanation: 'January north = 100 + 50 = 150.', weight: 1 },
    { setup: salesCsv([['2024-03-31', 'west', 10], ['2024-04-01', 'west', 20], ['2024-03-01', 'east', 5]]), explanation: 'Dates on month boundaries fall in their own month.', weight: 1 },
  ],
  hidden: [
    { setup: salesCsv([['2024-06-15', 'east', 999]]), explanation: 'single sale', weight: 1 },
    { setup: salesCsv([['2024-12-31', 'north', 1], ['2025-01-01', 'north', 2]]), explanation: 'year boundary', weight: 1 },
    randomSales(31, 20, 3, 2),
    randomSales(32, 80, 6, 4),
    randomSales(33, 200, 12, 4),
    randomSales(34, 50, 18, 3),
    randomSales(35, 1000, 24, 4),
    randomSales(36, 30, 1, 4),
  ],
  compare: { orderSensitive: true, columnNames: 'ignore_case', floatEpsilon: 1e-6, ignoreMongoId: true },
  starters: { pandas: 'import pandas as pd\n\n\ndef solve(sales: pd.DataFrame) -> pd.DataFrame:\n    ...\n' },
  solutions: {
    pandas:
      'import pandas as pd\n\n\ndef solve(sales: pd.DataFrame) -> pd.DataFrame:\n' +
      "    df = sales.copy()\n    df['month'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m')\n" +
      "    out = df.groupby(['month', 'region'], as_index=False)['amount'].sum().rename(columns={'amount': 'revenue'})\n" +
      "    return out.sort_values(['month', 'region']).reset_index(drop=True)[['month', 'region', 'revenue']]\n",
  },
  timeLimitMs: 3000,
};
