/**
 * DB/data questions against real runner servers (PostgreSQL, MySQL, MongoDB) and the pandas jail.
 * Student code must only ever see its own throwaway database, as a low-privilege user.
 */
import type { DbJob, ExecResult } from '@hbe/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextId, Sandbox, startRunners, stopRunners } from './harness.js';

let sb: Sandbox;
beforeAll(async () => {
  await startRunners();
  sb = await Sandbox.start({ runners: true });
});
afterAll(async () => {
  await sb?.stop();
  await stopRunners();
});

const cmp = { orderSensitive: false, columnNames: 'ignore_case' as const, floatEpsilon: 1e-6, ignoreMongoId: true };
const SQL_SETUP = `CREATE TABLE employees (id INT PRIMARY KEY, name VARCHAR(50), dept VARCHAR(20), salary NUMERIC(10,2));
INSERT INTO employees VALUES (1,'Asha','eng',120000),(2,'Ravi','eng',95000),(3,'Meera','sales',70000),(4,'Kabir','sales',82000);`;
const EXPECTED = { columns: ['dept', 'avg_salary'], rows: [['eng', 107500], ['sales', 76000]] };

const db = (dialect: DbJob['dialect'], code: string, datasets: Partial<DbJob['datasets'][number]>[], over: Partial<DbJob> = {}): DbJob => ({
  type: 'db', jobId: nextId(), kind: 'run', dialect, mode: 'query', code,
  datasets: datasets.map((d, i) => ({ id: `d${i + 1}`, ordinal: i + 1, hidden: false, setup: SQL_SETUP, ...d })),
  compare: cmp, timeLimitMs: 2000, ...over,
});
const one = async (j: DbJob) => {
  const r: ExecResult = await sb.run(j);
  expect(r.internalError).toBeUndefined();
  return r.tests[0]!;
};

describe.each(['postgres', 'mysql'] as const)('%s', (dialect) => {
  const avg = 'SELECT dept, AVG(salary) AS avg_salary FROM employees GROUP BY dept';

  it('accepts a correct query (row order ignored) and returns the result for visible datasets', async () => {
    const t = await one(db(dialect, `${avg} ORDER BY dept DESC`, [{ expected: EXPECTED }]));
    expect([t.verdict, t.detail]).toEqual(['AC', undefined]);
    expect(t.result?.columns).toEqual(['dept', 'avg_salary']);
  });
  it('reports wrong answers with a safe reason; hidden datasets reveal nothing', async () => {
    const v = await one(db(dialect, 'SELECT dept, MAX(salary) AS avg_salary FROM employees GROUP BY dept', [{ expected: EXPECTED }]));
    expect([v.verdict, v.detail]).toEqual(['WA', 'some rows differ']);
    const h = await one(db(dialect, 'SELECT dept, MAX(salary) AS avg_salary FROM employees GROUP BY dept', [{ expected: EXPECTED, hidden: true }]));
    expect([h.verdict, h.detail, h.result]).toEqual(['WA', undefined, undefined]);
  });
  it('validation runs return the full result (it becomes the expected output)', async () => {
    const t = await one(db(dialect, avg, [{ hidden: true }], { kind: 'validate' }));
    expect(t.verdict).toBe('AC');
    expect(t.result?.rows.length).toBe(2);
  });
  it('DML: statements run, then the state query is compared', async () => {
    const j = db(dialect, "UPDATE employees SET salary = salary * 1.1 WHERE dept = 'sales'; DELETE FROM employees WHERE id = 2;", [
      { stateQuery: 'SELECT id, salary FROM employees', expected: { columns: ['id', 'salary'], rows: [[1, 120000], [3, 77000], [4, 90200]] } },
    ], { mode: 'dml' });
    expect((await one(j)).verdict).toBe('AC');
  });
  it('query mode is single-statement and read-only', async () => {
    const multi = await one(db(dialect, 'SELECT 1; DROP TABLE employees', [{ expected: EXPECTED }]));
    expect(multi.verdict).toBe('RE');
    const write = await one(db(dialect, "INSERT INTO employees VALUES (9,'x','x',1)", [{ expected: EXPECTED }]));
    expect(write.verdict).toBe('RE');
  });
  it('slow queries hit the time limit; huge results are capped', async () => {
    const sleep = dialect === 'postgres' ? 'SELECT pg_sleep(20)' : 'SELECT SLEEP(20)';
    const t0 = Date.now();
    expect((await one(db(dialect, sleep, [{ expected: EXPECTED }]))).verdict).toBe('TLE');
    expect(Date.now() - t0).toBeLessThan(10_000);
    const big = dialect === 'postgres' ? 'SELECT generate_series(1, 5000000) AS n' : 'SELECT a.id FROM employees a, employees b, employees c, employees d, employees e, employees f';
    const r = await one(db(dialect, big, [{ expected: { columns: ['n'], rows: [[1]] } }]));
    expect(['WA', 'TLE']).toContain(r.verdict);
  });
});

describe('postgres isolation', () => {
  const attempt = (code: string) => one(db('postgres', code, [{ expected: EXPECTED }]));
  it.each([
    ["COPY (SELECT 1) TO PROGRAM 'id'", /permission denied|must be superuser|pg_execute_server_program/i],
    ["SELECT pg_read_file('/etc/passwd')", /permission denied/i],
    ["SELECT * FROM pg_authid", /permission denied/i],
    ['SELECT lo_import(\'/etc/passwd\')', /permission denied|read-only/i],
    ['CREATE EXTENSION dblink', /permission denied|read-only|not available/i],
    ['SET ROLE runner_admin', /permission denied/i],
    ['CREATE TABLE stolen (x int)', /read-only|permission denied/i],
    ["SELECT * FROM dblink('dbname=postgres', 'select 1') AS t(x int)", /does not exist/i],
  ])('%s is refused', async (code, re) => {
    const t = await attempt(code);
    expect(t.verdict).toBe('RE');
    expect(t.detail).toMatch(re);
  });
  it('runs never see each other’s databases, and run databases are dropped', async () => {
    await attempt('SELECT 1');
    const t = await one(db('postgres', "SELECT datname AS n FROM pg_database WHERE datname LIKE 'run\\_%'", [{ expected: { columns: ['n'], rows: [['x']] } }]));
    expect(t.result?.rows.length, JSON.stringify(t.result?.rows)).toBe(1); // only the current run database exists
  });
});

describe('mysql isolation', () => {
  const attempt = (code: string) => one(db('mysql', code, [{ expected: EXPECTED }]));
  it('cannot read server files, other schemas or the user table', async () => {
    const lf = await one(db('mysql', "SELECT LOAD_FILE('/etc/passwd') AS f", [{ expected: { columns: ['f'], rows: [[null]] } }]));
    expect(lf.verdict).toBe('AC'); // NULL: no FILE privilege, secure_file_priv=NULL
    expect((await attempt('SELECT * FROM mysql.user')).verdict).toBe('RE');
    expect((await attempt("SELECT 1 INTO OUTFILE '/tmp/x'")).verdict).toBe('RE');
    const dbs = await one(db('mysql', 'SHOW DATABASES', [{ expected: { columns: ['Database'], rows: [['information_schema']] } }]));
    // Only the shared read-only schemas and the run's own schema are visible: no `mysql`, no other runs.
    const names = (dbs.result?.rows ?? []).map((r) => String(r[0]));
    expect(names.filter((n) => !['information_schema', 'performance_schema'].includes(n))).toHaveLength(1);
    expect(names.filter((n) => n.startsWith('run_'))).toHaveLength(1);
    expect(names).not.toContain('mysql');
  });
});

describe('mongodb', () => {
  const SETUP = JSON.stringify({ orders: [{ _id: 1, customer: 'a', total: 30, status: 'paid' }, { _id: 2, customer: 'b', total: 10, status: 'paid' }, { _id: 3, customer: 'a', total: 5, status: 'void' }] });
  const pipeline = JSON.stringify({ collection: 'orders', pipeline: [{ $match: { status: 'paid' } }, { $group: { _id: '$customer', spent: { $sum: '$total' } } }, { $project: { _id: 0, customer: '$_id', spent: 1 } }] });
  const expected = { columns: ['customer', 'spent'], rows: [['a', 30], ['b', 10]] };

  it('accepts pipelines and find queries', async () => {
    expect((await one(db('mongodb', pipeline, [{ setup: SETUP, expected }]))).verdict).toBe('AC');
    const find = JSON.stringify({ collection: 'orders', find: { filter: { total: { $gt: 8 } }, projection: { _id: 0, customer: 1 } } });
    expect((await one(db('mongodb', find, [{ setup: SETUP, expected: { columns: ['customer'], rows: [['a'], ['b']] } }]))).verdict).toBe('AC');
  });
  it.each([
    [{ collection: 'orders', pipeline: [{ $match: { $where: 'sleep(5000) || true' } }] }, /\$where/],
    [{ collection: 'orders', pipeline: [{ $out: 'x' }] }, /\$out/],
    [{ collection: 'orders', pipeline: [{ $addFields: { x: { $function: { body: 'function(){return 1}', args: [], lang: 'js' } } } }] }, /\$function/],
  ])('refuses %j', async (q, re) => {
    const t = await one(db('mongodb', JSON.stringify(q), [{ setup: SETUP, expected }]));
    expect(t.verdict).toBe('RE');
    expect(t.detail).toMatch(re);
  });
  it('the run user can only read its own database', async () => {
    const other = JSON.stringify({ collection: 'orders', pipeline: [{ $lookup: { from: 'system.users', localField: 'x', foreignField: 'y', as: 'u' } }] });
    const t = await one(db('mongodb', other, [{ setup: SETUP, expected }]));
    expect(['RE', 'WA']).toContain(t.verdict);
  });
});

describe('pandas', () => {
  const tables = { employees: 'id,name,dept,salary\n1,Asha,eng,120000\n2,Ravi,eng,95000\n3,Meera,sales,70000\n4,Kabir,sales,82000\n' };
  const solution = "import pandas as pd\n\ndef solve(employees: pd.DataFrame) -> pd.DataFrame:\n    print('debug line')\n    return employees.groupby('dept', as_index=False)['salary'].mean().rename(columns={'salary': 'avg_salary'})\n";

  it('runs solve() on each dataset and compares the DataFrame', async () => {
    const r = await sb.run(db('pandas', solution, [{ setup: tables, expected: EXPECTED }, { setup: tables, expected: EXPECTED, hidden: true }]));
    expect(r.internalError).toBeUndefined();
    expect(r.tests.map((t) => t.verdict)).toEqual(['AC', 'AC']);
    expect(r.tests[0]!.stdout).toBe('debug line\n');
    expect(r.tests[1]!.stdout).toBe('');
  });
  it('reports wrong answers, exceptions, syntax errors and timeouts', async () => {
    const wrong = await sb.run(db('pandas', "def solve(employees):\n    return employees[['dept']]\n", [{ setup: tables, expected: EXPECTED }]));
    expect(wrong.tests[0]!.verdict).toBe('WA');
    const boom = await sb.run(db('pandas', "def solve(employees):\n    return employees['nope']\n", [{ setup: tables, expected: EXPECTED }]));
    expect([boom.tests[0]!.verdict, boom.tests[0]!.detail]).toEqual(['RE', expect.stringContaining('KeyError')]);
    const syntax = await sb.run(db('pandas', 'def solve(employees)\n    return 1\n', [{ setup: tables, expected: EXPECTED }]));
    expect(syntax.compile.ok).toBe(false);
    expect(syntax.compile.output).toContain('SyntaxError');
    const slow = await sb.run(db('pandas', 'def solve(employees):\n    while True: pass\n', [{ setup: tables, expected: EXPECTED }]));
    expect(slow.tests[0]!.verdict).toBe('TLE');
  });
  it('runs in the sandbox (no host files, no network)', async () => {
    const code = "import os, socket\ndef solve(employees):\n    import pandas as pd\n    try:\n        socket.create_connection(('1.1.1.1', 80), timeout=1); net = 'OPEN'\n    except OSError:\n        net = 'blocked'\n    return pd.DataFrame({'net': [net], 'shadow': [os.path.exists('/etc/shadow')]})\n";
    const t = await sb.run(db('pandas', code, [{ setup: tables, expected: { columns: ['net', 'shadow'], rows: [['blocked', false]] } }]));
    expect(t.tests[0]!.verdict).toBe('AC');
  });
});
