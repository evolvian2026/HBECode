import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createDb, createPool, type Db } from '../src/client.js';
import { provisionAppRole, runMigrations } from '../src/migrate.js';

/** Server-level URL for a role that may CREATE DATABASE (non-superuser, like Supabase's `postgres`). */
export const OWNER_URL = process.env.TEST_OWNER_URL ?? 'postgres://hbe_owner:hbe_owner@127.0.0.1:5432/postgres';
export const APP_PASSWORD = process.env.TEST_APP_PASSWORD ?? 'hbe_app_test_password';

export interface TestDb {
  name: string;
  adminUrl: string;
  appUrl: string;
  appPool: pg.Pool;
  adminPool: pg.Pool;
  db: Db;
  drop(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const name = `hbe_test_${randomBytes(4).toString('hex')}`;
  const server = new pg.Client({ connectionString: OWNER_URL });
  await server.connect();
  await server.query(`CREATE DATABASE ${name}`);
  await server.end();
  const adminUrl = OWNER_URL.replace(/\/[^/]*$/, `/${name}`);
  await runMigrations(adminUrl, () => {});
  await provisionAppRole(adminUrl, APP_PASSWORD);
  const appUrl = adminUrl.replace(/\/\/[^@]+@/, `//hbe_app:${APP_PASSWORD}@`);
  const appPool = createPool(appUrl, 5);
  const adminPool = createPool(adminUrl, 2);
  return {
    name,
    adminUrl,
    appUrl,
    appPool,
    adminPool,
    db: createDb(appPool),
    async drop() {
      await appPool.end();
      await adminPool.end();
      const s = new pg.Client({ connectionString: OWNER_URL });
      await s.connect();
      await s.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await s.end();
    },
  };
}
