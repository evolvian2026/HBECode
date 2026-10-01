import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Apply pending SQL migrations in filename order, each in its own transaction, as the schema
 * owner. Applied files are checksummed: editing an already-applied migration is an error.
 */
export async function runMigrations(adminUrl: string, log: (m: string) => void = console.log): Promise<string[]> {
  const client = new pg.Client({
    connectionString: adminUrl,
    ssl: /sslmode=(require|verify-full)/.test(adminUrl) ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS public.hbe_schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    await client.query('REVOKE ALL ON public.hbe_schema_migrations FROM PUBLIC');
    const done = new Map(
      (await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM public.hbe_schema_migrations')).rows.map(
        (r) => [r.name, r.checksum],
      ),
    );
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const body = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = createHash('sha256').update(body).digest('hex');
      const prev = done.get(file);
      if (prev) {
        if (prev !== checksum) throw new Error(`migration ${file} was modified after being applied`);
        continue;
      }
      log(`applying ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(body);
        await client.query('INSERT INTO public.hbe_schema_migrations (name, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${file} failed: ${(e as Error).message}`);
      }
      applied.push(file);
    }
  } finally {
    await client.end();
  }
  return applied;
}

/** Give the app role a login password (kept out of migrations so no secret is in the repo). */
export async function provisionAppRole(adminUrl: string, password: string): Promise<void> {
  if (password.length < 16) throw new Error('HBE_APP_DB_PASSWORD must be at least 16 characters');
  const client = new pg.Client({
    connectionString: adminUrl,
    ssl: /sslmode=(require|verify-full)/.test(adminUrl) ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    // Identifiers cannot be bound; the role name is a constant and the password is escaped by format().
    const { rows } = await client.query<{ q: string }>(`SELECT format('ALTER ROLE hbe_app LOGIN PASSWORD %L', $1::text) AS q`, [password]);
    await client.query(rows[0]!.q);
  } finally {
    await client.end();
  }
}
