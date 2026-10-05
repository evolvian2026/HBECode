import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Role } from '@hbe/shared';

export type Db = NodePgDatabase;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Request context applied as transaction-local GUCs that RLS policies read. */
export interface DbContext {
  role: Role | 'system';
  tenantId: string | null;
  userId: string | null;
}

export const SYSTEM: DbContext = { role: 'system', tenantId: null, userId: null };

/**
 * TLS for managed Postgres. With `DATABASE_CA_CERT` (PEM; Supabase publishes its CA) the server
 * certificate and host name are verified. Without it, a `sslmode=require|verify-full` URL is
 * encrypted but not verified (`dbTlsVerified` tells the API to warn at startup).
 */
export function dbTls(connectionString: string, caCert = process.env.DATABASE_CA_CERT): { ssl: pg.PoolConfig['ssl']; verified: boolean } {
  const ca = caCert?.replace(/\\n/g, '\n').trim();
  if (ca) return { ssl: { ca, rejectUnauthorized: true }, verified: true };
  if (/sslmode=(require|verify-ca|verify-full)/.test(connectionString)) return { ssl: { rejectUnauthorized: false }, verified: false };
  return { ssl: undefined, verified: false };
}

export function createPool(connectionString: string, max = 10): pg.Pool {
  const { ssl } = dbTls(connectionString);
  const pool = new pg.Pool({
    // `ssl` decides; an sslmode in the URL would otherwise be re-interpreted by pg itself.
    connectionString: ssl ? connectionString.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '') : connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl,
  });
  pool.on('error', () => {
    /* idle client errors are retried by the pool; logged by the API's pool listener */
  });
  return pool;
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool);
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
