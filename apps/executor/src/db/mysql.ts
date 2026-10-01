import { randomBytes } from 'node:crypto';
import type { ResultSet } from '@hbe/shared';
import mysql from 'mysql2/promise';
import type { SqlOutcome } from './postgres.js';

/**
 * MySQL runner. MySQL DDL is not transactional, so every run builds its own schema from the
 * setup script and gets a one-off user with privileges on that schema only. The server runs with
 * local_infile=OFF and secure_file_priv=NULL; the user has no FILE/PROCESS/SUPER privilege.
 * Query mode: single statement (multipleStatements off) inside a READ ONLY transaction.
 * Deadlines are enforced from the admin connection with KILL.
 */
const ROW_CAP = 1000;

export class MysqlRunner {
  private admin: mysql.Pool;
  private readonly host: string;
  private readonly port: number;

  constructor(url: string) {
    const u = new URL(url);
    this.host = u.hostname;
    this.port = Number(u.port || 3306);
    // The client never offers LOCAL INFILE (and the server runs with local_infile=OFF).
    this.admin = mysql.createPool({ uri: url, connectionLimit: 4, multipleStatements: true, flags: ['-LOCAL_FILES'] });
  }

  async run(opts: { setup: string; code: string; mode: 'query' | 'dml'; stateQuery?: string; timeLimitMs: number }): Promise<SqlOutcome> {
    const t0 = Date.now();
    const id = randomBytes(8).toString('hex');
    const db = `run_${id}`;
    const user = `r_${id}`;
    const password = randomBytes(18).toString('base64url');
    let student: mysql.Connection | null = null;
    try {
      const setupConn = await this.admin.getConnection();
      try {
        await setupConn.query(`CREATE DATABASE \`${db}\``);
        await setupConn.changeUser({ database: db });
        try {
          await setupConn.query(opts.setup);
        } catch (e) {
          return { ok: false, error: `dataset setup failed: ${(e as Error).message}`, wallMs: Date.now() - t0 };
        }
        const privs = opts.mode === 'dml' ? 'SELECT, INSERT, UPDATE, DELETE' : 'SELECT';
        await setupConn.query(`CREATE USER '${user}'@'%' IDENTIFIED BY '${password}' WITH MAX_USER_CONNECTIONS 2 MAX_QUERIES_PER_HOUR 2000`);
        await setupConn.query(`GRANT ${privs} ON \`${db}\`.* TO '${user}'@'%'`);
      } finally {
        await setupConn.changeUser({ database: '' }).catch(() => undefined);
        setupConn.release();
      }
      student = await mysql.createConnection({ host: this.host, port: this.port, user, password, database: db, multipleStatements: opts.mode === 'dml', flags: ['-LOCAL_FILES'], connectTimeout: 5000 });
      const [[{ cid }]] = (await student.query('SELECT CONNECTION_ID() AS cid')) as unknown as [[{ cid: number }]];
      const killer = setTimeout(() => void this.admin.query(`KILL ${Number(cid)}`).catch(() => undefined), opts.timeLimitMs);
      // max_execution_time can interrupt a statement without an error (SLEEP() just returns 1),
      // so the deadline itself decides TLE, not only the error text.
      const started = Date.now();
      const deadline = () => {
        if (Date.now() - started >= opts.timeLimitMs) throw new Error('killed: time limit exceeded');
      };
      try {
        if (opts.mode === 'query') {
          await student.query(`SET SESSION max_execution_time = ${Math.max(100, opts.timeLimitMs)}`);
          await student.query('SET SESSION TRANSACTION READ ONLY');
          await student.query('START TRANSACTION');
          const result = await this.capped(student, opts.code);
          deadline();
          await student.query('ROLLBACK').catch(() => undefined);
          return { ok: true, result, wallMs: Date.now() - t0 };
        }
        await student.query(opts.code);
        deadline();
        return { ok: true, result: await this.capped(student, opts.stateQuery!), wallMs: Date.now() - t0 };
      } finally {
        clearTimeout(killer);
      }
    } catch (e) {
      const msg = (e as Error).message;
      const timedOut = /max_execution_time|Query execution was interrupted|connection.*closed|lost connection|killed/i.test(msg);
      return { ok: false, error: timedOut ? 'time limit exceeded' : msg, timedOut, wallMs: Date.now() - t0 };
    } finally {
      // destroy(), not end(): the connection may already be killed or torn down by the row cap.
      student?.destroy();
      await this.admin.query(`DROP USER IF EXISTS '${user}'@'%'`).catch(() => undefined);
      await this.admin.query(`DROP DATABASE IF EXISTS \`${db}\``).catch(() => undefined);
    }
  }

  /** Stream rows and stop at ROW_CAP+1 so a huge result cannot exhaust agent memory. */
  private async capped(conn: mysql.Connection, sql: string): Promise<ResultSet> {
    const core = (conn as unknown as { connection: { query: (o: { sql: string; rowsAsArray: boolean }) => NodeJS.EventEmitter & { stream: () => NodeJS.ReadableStream } } }).connection;
    return new Promise((resolve, reject) => {
      const rows: unknown[][] = [];
      let columns: string[] = [];
      let done = false;
      const q = core.query({ sql, rowsAsArray: true });
      q.on('fields', (f: { name: string }[]) => {
        columns = (f ?? []).map((x) => x.name);
      });
      q.on('result', (row: unknown) => {
        if (done) return;
        if (Array.isArray(row)) rows.push(row);
        if (rows.length > ROW_CAP) {
          done = true;
          resolve({ columns, rows: rows.slice(0, ROW_CAP), truncated: true });
          conn.destroy();
        }
      });
      const fail = (e: Error) => {
        if (!done) reject(e);
        done = true;
      };
      q.on('error', fail);
      // A KILL from the admin connection surfaces on the connection, not the query.
      (conn as unknown as NodeJS.EventEmitter).once('error', fail);
      (conn as unknown as { connection: NodeJS.EventEmitter }).connection.once('end', () => fail(new Error('connection closed (killed)')));
      q.on('end', () => {
        if (!done) resolve({ columns, rows });
        done = true;
      });
    });
  }

  async version(): Promise<string> {
    const [rows] = (await this.admin.query('SELECT VERSION() AS v')) as unknown as [[{ v: string }]];
    return `MySQL ${rows[0].v}`;
  }

  async close() {
    await this.admin.end();
  }
}
