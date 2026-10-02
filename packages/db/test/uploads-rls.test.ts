/** Phase 5 RLS: upload jobs and rows hold hidden tests and solutions — authors only. */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { SYSTEM, withContext, type DbContext } from '../src/client.js';
import * as s from '../src/schema.js';
import { createTestDb, type TestDb } from './helpers.js';

let t: TestDb;
const id = () => randomUUID();
const ids = { tA: id(), tB: id(), teacherA: id(), teacherB: id(), assocA: id(), adminA: id(), studentA: id(), jobA: id(), jobGlobal: id() };
const ctx = (role: DbContext['role'], userId: string, tenantId: string | null): DbContext => ({ role, userId, tenantId });
const as = <T>(c: DbContext, fn: Parameters<typeof withContext<T>>[2]) => withContext(t.db, c, fn);
const actor = (uid: string, tenantId: string | null) => ({ id: uid, role: 'teacher' as const, tenantId });

beforeAll(async () => {
  t = await createTestDb();
  await as(SYSTEM, async (tx) => {
    await tx.insert(s.tenants).values([{ id: ids.tA, name: 'A', slug: 'a' }, { id: ids.tB, name: 'B', slug: 'b' }]);
    await tx.insert(s.users).values(['teacherA', 'teacherB', 'assocA', 'adminA', 'studentA'].map((k) => ({ id: ids[k as keyof typeof ids], email: `${k}@x`, name: k, status: 'active' as const })));
    await tx.insert(s.uploadJobs).values([
      { id: ids.jobA, tenantId: ids.tA, createdBy: ids.teacherA, filename: 'a.xlsx', format: 'xlsx', sizeBytes: 1, actor: actor(ids.teacherA, ids.tA) },
      { id: ids.jobGlobal, tenantId: null, filename: 'g.json', format: 'json', sizeBytes: 1, actor: { id: ids.teacherA, role: 'super_admin', tenantId: null } },
    ]);
    await tx.insert(s.uploadRows).values({ jobId: ids.jobA, rowNo: 1, key: 'Q1', status: 'ready', payload: { secret: 'SOLUTION' } });
  });
});
afterAll(async () => {
  await t?.drop();
});

const jobs = (c: DbContext) => as(c, async (tx) => (await tx.select({ id: s.uploadJobs.id }).from(s.uploadJobs)).map((r) => r.id).sort());
const rows = (c: DbContext) => as(c, async (tx) => tx.select().from(s.uploadRows));

it('rows inherit the job’s tenant', async () => {
  expect((await rows(SYSTEM))[0]!.tenantId).toBe(ids.tA);
});
it('only teachers of the tenant see its uploads; global uploads are platform-only', async () => {
  expect(await jobs(ctx('teacher', ids.teacherA, ids.tA))).toEqual([ids.jobA]);
  expect(await rows(ctx('teacher', ids.teacherA, ids.tA))).toHaveLength(1);
  for (const c of [ctx('teacher', ids.teacherB, ids.tB), ctx('associate', ids.assocA, ids.tA), ctx('client_admin', ids.adminA, ids.tA), ctx('student', ids.studentA, ids.tA)]) {
    expect(await jobs(c)).toEqual([]);
    expect(await rows(c)).toEqual([]);
  }
  expect(await jobs(ctx('super_admin', ids.teacherA, null))).toEqual([ids.jobA, ids.jobGlobal].sort());
});
it('nobody else can write or attach rows to another tenant’s upload', async () => {
  const err = await as(ctx('teacher', ids.teacherB, ids.tB), (tx) => tx.insert(s.uploadRows).values({ jobId: ids.jobA, rowNo: 2, key: 'X', status: 'ready' })).then(() => null, (e: Error & { cause?: Error }) => e.cause?.message ?? e.message);
  expect(err).toMatch(/row-level security/);
  const upd = await as(ctx('teacher', ids.teacherB, ids.tB), (tx) => tx.update(s.uploadJobs).set({ status: 'done' }).where(eq(s.uploadJobs.id, ids.jobA)).returning());
  expect(upd).toHaveLength(0);
  const err2 = await as(ctx('teacher', ids.teacherA, ids.tA), (tx) => tx.insert(s.uploadJobs).values({ tenantId: ids.tB, filename: 'x', format: 'json', sizeBytes: 1, actor: actor(ids.teacherA, ids.tB) })).then(() => null, (e: Error & { cause?: Error }) => e.cause?.message ?? e.message);
  expect(err2).toMatch(/row-level security/);
});
