import { randomBytes } from 'node:crypto';
import { documentsToResult, parseMongoQuery, MongoQueryError, type ResultSet } from '@hbe/shared';
import { BSON, MongoClient } from 'mongodb';

const { EJSON } = BSON;
import type { SqlOutcome } from './postgres.js';

/**
 * MongoDB runner. Student input is JSON (validated by parseMongoQuery: no $where/$function/
 * $accumulator/$out/$merge/server-inspection stages) and the server runs with --noscripting.
 * Each run gets its own database and a one-off user with the `read` role on it only.
 */
const DOC_CAP = 1000;

export class MongoRunner {
  private admin: MongoClient;

  constructor(private readonly url: string) {
    this.admin = new MongoClient(url, { maxPoolSize: 4, serverSelectionTimeoutMS: 5000 });
  }

  async run(opts: { setup: string; code: string; timeLimitMs: number; ignoreId: boolean }): Promise<SqlOutcome> {
    const t0 = Date.now();
    let query;
    try {
      query = parseMongoQuery(opts.code);
    } catch (e) {
      if (e instanceof MongoQueryError) return { ok: false, error: e.message, wallMs: Date.now() - t0 };
      throw e;
    }
    const id = randomBytes(8).toString('hex');
    const dbName = `run_${id}`;
    const user = `r_${id}`;
    const password = randomBytes(18).toString('base64url');
    await this.admin.connect();
    const db = this.admin.db(dbName);
    let student: MongoClient | null = null;
    try {
      let data: Record<string, unknown[]>;
      try {
        data = EJSON.parse(opts.setup, { relaxed: true }) as Record<string, unknown[]>;
        for (const [coll, docs] of Object.entries(data)) {
          if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(coll) || !Array.isArray(docs)) throw new Error(`bad collection ${coll}`);
          if (docs.length) await db.collection(coll).insertMany(docs as never[]);
          else await db.createCollection(coll);
        }
      } catch (e) {
        return { ok: false, error: `dataset setup failed: ${(e as Error).message}`, wallMs: Date.now() - t0 };
      }
      await db.command({ createUser: user, pwd: password, roles: [{ role: 'read', db: dbName }] });
      const u = new URL(this.url);
      u.username = user;
      u.password = password;
      u.pathname = `/${dbName}`;
      u.searchParams.set('authSource', dbName);
      student = new MongoClient(u.toString(), { maxPoolSize: 1, serverSelectionTimeoutMS: 5000 });
      await student.connect();
      const coll = student.db(dbName).collection(query.collection);
      let docs: Record<string, unknown>[];
      if (query.pipeline) {
        docs = await coll.aggregate([...query.pipeline, { $limit: DOC_CAP + 1 }], { maxTimeMS: opts.timeLimitMs, allowDiskUse: false }).toArray();
      } else {
        const f = query.find!;
        let cur = coll.find(f.filter ?? {}, { projection: f.projection, maxTimeMS: opts.timeLimitMs });
        if (f.sort) cur = cur.sort(f.sort as never);
        if (f.skip) cur = cur.skip(f.skip);
        cur = cur.limit(Math.min(f.limit ?? DOC_CAP + 1, DOC_CAP + 1));
        docs = await cur.toArray();
      }
      const plain = docs.slice(0, DOC_CAP).map((d) => EJSON.serialize(d, { relaxed: true }) as Record<string, unknown>);
      const result: ResultSet = { ...documentsToResult(plain, opts.ignoreId), truncated: docs.length > DOC_CAP };
      return { ok: true, result, wallMs: Date.now() - t0 };
    } catch (e) {
      const msg = (e as Error).message;
      const timedOut = /exceeded time limit|MaxTimeMSExpired|operation exceeded/i.test(msg);
      return { ok: false, error: timedOut ? 'time limit exceeded' : msg, timedOut, wallMs: Date.now() - t0 };
    } finally {
      await student?.close().catch(() => undefined);
      await db.command({ dropUser: user }).catch(() => undefined);
      await db.dropDatabase().catch(() => undefined);
    }
  }

  async version(): Promise<string> {
    await this.admin.connect();
    const info = await this.admin.db('admin').command({ buildInfo: 1 });
    return `MongoDB ${info.version as string}`;
  }

  async close() {
    await this.admin.close();
  }
}
