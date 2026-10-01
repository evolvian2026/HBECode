import { createHash, randomBytes } from 'node:crypto';
import type { ResultSet } from '@hbe/shared';
import pg from 'pg';

/**
 * PostgreSQL runner. The runner server holds only throwaway question data. Per dataset:
 *  - a template database is built once from the setup script (cached by content hash);
 *  - each run gets `CREATE DATABASE run_x TEMPLATE tpl_y` and is dropped afterwards;
 *  - student SQL runs as `hbe_sbx` (no superuser, no CREATE, no file/program access);
 *  - query mode: exactly one statement (extended protocol), READ ONLY transaction, row cap;
 *  - every statement has a deadline enforced from the admin connection (pg_terminate_backend).
 */
const SBX = 'hbe_sbx';
const ROW_CAP = 1000;

export interface SqlOutcome {
  ok: boolean;
  result?: ResultSet;
  error?: string;
  timedOut?: boolean;
  wallMs: number;
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

export class PostgresRunner {
  private admin: pg.Pool;
  private sbxPassword = randomBytes(18).toString('base64url');
  private ready: Promise<void> | null = null;
  private building = new Map<string, Promise<string>>();

  constructor(private readonly url: string) {
    this.admin = new pg.Pool({ connectionString: url, max: 4 });
  }

  private urlFor(db: string, user?: { name: string; password: string }) {
    const u = new URL(this.url);
    u.pathname = `/${db}`;
    if (user) {
      u.username = user.name;
      u.password = user.password;
    }
    return u.toString();
  }

  init(): Promise<void> {
    this.ready ??= (async () => {
      const c = await this.admin.connect();
      try {
        await c.query(`DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${SBX}') THEN
            CREATE ROLE ${SBX} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 32;
          END IF; END $$`);
        await c.query(`ALTER ROLE ${SBX} WITH PASSWORD '${this.sbxPassword}'`);
        await c.query(`ALTER ROLE ${SBX} SET statement_timeout = '10s'`);
        await c.query(`ALTER ROLE ${SBX} SET idle_in_transaction_session_timeout = '10s'`);
        await c.query(`ALTER ROLE ${SBX} SET work_mem = '16MB'`);
        await c.query(`ALTER ROLE ${SBX} SET temp_file_limit = '64MB'`);
        // Nothing but the run databases is reachable for the sandbox role.
        await c.query(`REVOKE CONNECT, TEMPORARY ON DATABASE postgres FROM PUBLIC`);
        await c.query(`REVOKE CONNECT, TEMPORARY ON DATABASE template1 FROM PUBLIC`);
      } finally {
        c.release();
      }
    })();
    return this.ready;
  }

  /** Build (once) a template database holding the dataset. */
  private template(setup: string): Promise<string> {
    const name = `tpl_${createHash('sha256').update(setup).digest('hex').slice(0, 24)}`;
    let p = this.building.get(name);
    if (!p) {
      p = (async () => {
        const exists = await this.admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
        if (exists.rowCount) return name;
        const tmp = `${name}_b${randomBytes(3).toString('hex')}`;
        await this.admin.query(`CREATE DATABASE ${ident(tmp)}`);
        const c = new pg.Client({ connectionString: this.urlFor(tmp) });
        await c.connect();
        try {
          await c.query(`REVOKE ALL ON DATABASE ${ident(tmp)} FROM PUBLIC`);
          await c.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
          await c.query(setup);
          await c.query(`GRANT USAGE ON SCHEMA public TO ${SBX}`);
          await c.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${SBX}`);
        } finally {
          await c.end();
        }
        await this.admin.query(`ALTER DATABASE ${ident(tmp)} RENAME TO ${ident(name)}`).catch(async (e) => {
          // Another executor built it first.
          await this.admin.query(`DROP DATABASE IF EXISTS ${ident(tmp)} WITH (FORCE)`);
          if (!String(e.message).includes('already exists')) throw e;
        });
        return name;
      })();
      p.catch(() => this.building.delete(name));
      this.building.set(name, p);
    }
    return p;
  }

  /** Validate a setup script by building its template (authoring-time errors surface here). */
  async run(opts: { setup: string; code: string; mode: 'query' | 'dml'; stateQuery?: string; timeLimitMs: number }): Promise<SqlOutcome> {
    await this.init();
    const t0 = Date.now();
    let tpl: string;
    try {
      tpl = await this.template(opts.setup);
    } catch (e) {
      return { ok: false, error: `dataset setup failed: ${(e as Error).message}`, wallMs: Date.now() - t0 };
    }
    const db = `run_${randomBytes(8).toString('hex')}`;
    await this.admin.query(`CREATE DATABASE ${ident(db)} TEMPLATE ${ident(tpl)}`);
    const student = new pg.Client({ connectionString: this.urlFor(db, { name: SBX, password: this.sbxPassword }), statement_timeout: opts.timeLimitMs, query_timeout: opts.timeLimitMs + 1000, connectionTimeoutMillis: 5000 });
    try {
      // Database ACLs are not copied from the template: lock the new database down explicitly.
      await this.admin.query(`REVOKE ALL ON DATABASE ${ident(db)} FROM PUBLIC`);
      await this.admin.query(`GRANT CONNECT ON DATABASE ${ident(db)} TO ${SBX}`);
      if (opts.mode === 'dml') {
        const c = new pg.Client({ connectionString: this.urlFor(db) });
        await c.connect();
        await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${SBX}; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${SBX}`);
        await c.end();
      }
      await student.connect();
      const pid = (await student.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      const killer = setTimeout(() => void this.admin.query('SELECT pg_terminate_backend($1)', [pid]).catch(() => undefined), opts.timeLimitMs + 500);
      try {
        if (opts.mode === 'query') {
          await student.query('BEGIN TRANSACTION READ ONLY');
          // `rows` forces the extended protocol: exactly one statement, at most ROW_CAP+1 rows.
          const r = await student.query({ text: opts.code, rowMode: 'array', rows: ROW_CAP + 1 } as pg.QueryConfig & { rows: number });
          await student.query('ROLLBACK').catch(() => undefined);
          return { ok: true, result: toResult(r), wallMs: Date.now() - t0 };
        }
        await student.query(opts.code); // DML: multiple statements allowed, own database only
        const state = await student.query({ text: opts.stateQuery!, rowMode: 'array', rows: ROW_CAP + 1 } as pg.QueryConfig & { rows: number });
        return { ok: true, result: toResult(state), wallMs: Date.now() - t0 };
      } finally {
        clearTimeout(killer);
      }
    } catch (e) {
      const msg = (e as Error).message;
      const timedOut = /statement timeout|canceling statement|terminating connection|Query read timeout|Connection terminated/i.test(msg);
      return { ok: false, error: timedOut ? 'time limit exceeded' : msg, timedOut, wallMs: Date.now() - t0 };
    } finally {
      await student.end().catch(() => undefined);
      await this.admin.query(`DROP DATABASE IF EXISTS ${ident(db)} WITH (FORCE)`).catch(() => undefined);
    }
  }

  async version(): Promise<string> {
    await this.init();
    const r = await this.admin.query<{ v: string }>('SHOW server_version');
    return `PostgreSQL ${r.rows[0]!.v}`;
  }

  async close() {
    await this.admin.end();
  }
}

function toResult(r: pg.QueryResult<unknown[]>): ResultSet {
  const rows = r.rows.slice(0, ROW_CAP);
  return { columns: r.fields.map((f) => f.name), rows, truncated: r.rows.length > ROW_CAP };
}
