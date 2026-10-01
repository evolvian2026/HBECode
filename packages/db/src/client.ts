import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import type { Role } from '@hbe/shared';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Request context applied as transaction-local GUCs that RLS policies read. */
export interface DbContext {
  role: Role | 'system';
  tenantId: string | null;
  userId: string | null;
}

export const SYSTEM: DbContext = { role: 'system', tenantId: null, userId: null };

export function createPool(connectionString: string, max = 10): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Supabase / managed Postgres require TLS; local dev does not.
    ssl: /sslmode=(require|verify-full)/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
  pool.on('error', () => {
    /* idle client errors are retried by the pool; logged by the API's pool listener */
  });
  return pool;
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}

/**
 * Run `fn` in one transaction with the RLS context set. Every database access from request
 * handlers goes through here; there is no code path that queries without a context.
 * Works with transaction-mode poolers (Supavisor/PgBouncer) because the settings are LOCAL.
 */
export async function withContext<T>(db: Db, ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.role', ${ctx.role}, true), set_config('app.tenant_id', ${ctx.tenantId ?? ''}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true)`,
    );
    return fn(tx);
  });
}
