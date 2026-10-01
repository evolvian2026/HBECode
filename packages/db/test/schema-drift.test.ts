import { getTableColumns, getTableName } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import * as s from '../src/schema.js';
import { createTestDb, type TestDb } from './helpers.js';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t?.drop();
});

it('every column in the Drizzle schema exists in the migrated database', async () => {
  const { rows } = await t.adminPool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'hbe'`,
  );
  const actual = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const missing: string[] = [];
  for (const table of Object.values(s.allTables)) {
    for (const col of Object.values(getTableColumns(table))) {
      const key = `${getTableName(table)}.${col.name}`;
      if (!actual.has(key)) missing.push(key);
    }
  }
  expect(missing).toEqual([]);
});
