/** Phase 6 RLS: report rollups and plagiarism results. */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYSTEM, withContext, type DbContext } from '../src/client.js';
import * as s from '../src/schema.js';
import { createTestDb, type TestDb } from './helpers.js';

let t: TestDb;
const id = () => randomUUID();
const ids = { tA: id(), tB: id(), teacherA: id(), teacherB: id(), assocA: id(), adminA: id(), s1: id(), s2: id(), q: id(), v: id(), test: id(), sub1: id(), sub2: id(), run: id() };
const ctx = (role: DbContext['role'], userId: string, tenantId: string | null): DbContext => ({ role, userId, tenantId });
const teacherA = ctx('teacher', ids.teacherA, ids.tA);
const teacherB = ctx('teacher', ids.teacherB, ids.tB);
const assocA = ctx('associate', ids.assocA, ids.tA);
const adminA = ctx('client_admin', ids.adminA, ids.tA);
const s1 = ctx('student', ids.s1, ids.tA);
const s2 = ctx('student', ids.s2, ids.tA);
const as = <T>(c: DbContext, fn: Parameters<typeof withContext<T>>[2]) => withContext(t.db, c, fn);
const count = (c: DbContext, table: Parameters<ReturnType<typeof t.db.select>['from']>[0]) =>
  as(c, async (tx) => (await tx.select({ n: sql<number>`count(*)::int` }).from(table))[0]!.n);
async function pgError(p: Promise<unknown>) {
  return p.then(() => null, (e: Error & { cause?: Error }) => e.cause?.message ?? e.message);
}

beforeAll(async () => {
  t = await createTestDb();
  await as(SYSTEM, async (tx) => {
    await tx.insert(s.tenants).values([{ id: ids.tA, name: 'A', slug: 'a' }, { id: ids.tB, name: 'B', slug: 'b' }]);
    await tx.insert(s.users).values(['teacherA', 'teacherB', 'assocA', 'adminA', 's1', 's2'].map((k) => ({ id: ids[k as keyof typeof ids], email: `${k}@x`, name: k, status: 'active' as const })));
    await tx.insert(s.questions).values({ id: ids.q, tenantId: ids.tA, slug: 'q', status: 'published', latestVersionId: ids.v, publishedVersionId: ids.v });
    await tx.insert(s.questionVersions).values({ id: ids.v, questionId: ids.q, versionNo: 1, title: 'q', statement: 's', difficulty: 'easy', baseTimeLimitMs: 1000, memoryLimitMb: 256, compare: { mode: 'exact' }, publishedAt: new Date() });
    await tx.insert(s.tests).values({ id: ids.test, tenantId: ids.tA, title: 'T', startsAt: new Date(), endsAt: new Date(Date.now() + 3600_000), durationMin: 30 });
    for (const [sub, u] of [[ids.sub1, ids.s1], [ids.sub2, ids.s2]] as const) {
      await tx.insert(s.submissions).values({ id: sub, tenantId: ids.tA, userId: u, questionId: ids.q, versionId: ids.v, runtime: 'python', kind: 'submit', code: 'x' });
    }
    const day = '2026-10-01';
    await tx.insert(s.rptQuestionDaily).values({ tenantId: ids.tA, questionId: ids.q, day, runtime: 'python', submits: 2 });
    await tx.insert(s.rptStudentQuestion).values([
      { tenantId: ids.tA, userId: ids.s1, questionId: ids.q, submits: 1, lastAt: new Date() },
      { tenantId: ids.tA, userId: ids.s2, questionId: ids.q, submits: 1, lastAt: new Date() },
    ]);
    await tx.insert(s.rptTenantDaily).values({ tenantId: ids.tA, day, submits: 2 });
    await tx.insert(s.rptTenantDailyUsers).values({ tenantId: ids.tA, day, userId: ids.s1 });
    await tx.insert(s.rptPlatformDaily).values({ day, submits: 2 });
    await tx.insert(s.rptUserActivity).values({ tenantId: ids.tA, userId: ids.s1, lastAt: new Date() });
    await tx.insert(s.rptQuestionTotals).values({ tenantId: ids.tA, questionId: ids.q, students: 2, solved: 1 });
    await tx.insert(s.plagiarismRuns).values({ id: ids.run, testId: ids.test, status: 'done' });
    await tx.insert(s.plagiarismPairs).values({ runId: ids.run, questionId: ids.q, subA: ids.sub1, subB: ids.sub2, userA: ids.s1, userB: ids.s2, similarity: '0.95', matched: 40 });
  });
});
afterAll(async () => {
  await t?.drop();
});

describe('rollups', () => {
  it('child rows inherit the tenant (plagiarism)', async () => {
    const [p] = await as(SYSTEM, (tx) => tx.select().from(s.plagiarismPairs));
    expect(p!.tenantId).toBe(ids.tA);
  });
  it('staff of the institution read its rollups; another institution reads nothing', async () => {
    for (const c of [teacherA, assocA, adminA]) {
      expect(await count(c, s.rptQuestionDaily)).toBe(1);
      expect(await count(c, s.rptTenantDaily)).toBe(1);
      expect(await count(c, s.rptStudentQuestion)).toBe(2);
    }
    for (const table of [s.rptQuestionDaily, s.rptTenantDaily, s.rptTenantDailyUsers, s.rptUserActivity, s.rptQuestionTotals, s.rptStudentQuestion, s.plagiarismRuns, s.plagiarismPairs]) {
      expect(await count(teacherB, table)).toBe(0);
    }
    expect(await count(teacherA, s.rptUserActivity)).toBe(1);
    expect(await count(teacherA, s.rptQuestionTotals)).toBe(1);
  });
  it('a student reads only their own progress rows, nothing institution-wide', async () => {
    const mine = await as(s1, (tx) => tx.select().from(s.rptStudentQuestion));
    expect(mine.map((r) => r.userId)).toEqual([ids.s1]);
    expect(await count(s2, s.rptStudentQuestion)).toBe(1);
    for (const table of [s.rptQuestionDaily, s.rptTenantDaily, s.rptTenantDailyUsers, s.rptUserActivity, s.rptQuestionTotals, s.plagiarismRuns, s.plagiarismPairs]) expect(await count(s1, table)).toBe(0);
  });
  it('platform totals are super-admin only', async () => {
    expect(await count(adminA, s.rptPlatformDaily)).toBe(0);
    expect(await count(ctx('super_admin', ids.teacherA, null), s.rptPlatformDaily)).toBe(1);
  });
  it('only system code writes rollups', async () => {
    expect(await pgError(as(teacherA, (tx) => tx.insert(s.rptTenantDaily).values({ tenantId: ids.tA, day: '2026-10-02', submits: 99 })))).toMatch(/row-level security/);
    expect(await as(teacherA, (tx) => tx.update(s.rptStudentQuestion).set({ bestScore: '100' }).returning())).toHaveLength(0);
    expect(await as(s1, (tx) => tx.update(s.rptStudentQuestion).set({ bestScore: '100' }).returning())).toHaveLength(0);
  });
});

describe('plagiarism', () => {
  it('teachers queue runs for their own institution only; associates and students cannot', async () => {
    await as(teacherA, (tx) => tx.insert(s.plagiarismRuns).values({ testId: ids.test }));
    expect(await pgError(as(teacherA, (tx) => tx.insert(s.plagiarismRuns).values({ testId: ids.test, status: 'done' })))).toMatch(/row-level security/);
    expect(await pgError(as(teacherB, (tx) => tx.insert(s.plagiarismRuns).values({ testId: ids.test })))).toMatch(/row-level security/);
    expect(await pgError(as(assocA, (tx) => tx.insert(s.plagiarismRuns).values({ testId: ids.test })))).toMatch(/row-level security/);
    expect(await pgError(as(s1, (tx) => tx.insert(s.plagiarismRuns).values({ testId: ids.test })))).toMatch(/row-level security/);
  });
  it('results are written by system code only', async () => {
    expect(await pgError(as(teacherA, (tx) => tx.insert(s.plagiarismPairs).values({ runId: ids.run, questionId: ids.q, subA: ids.sub2, subB: ids.sub1, userA: ids.s2, userB: ids.s1, similarity: '0.1', matched: 1 })))).toMatch(/row-level security/);
    expect(await as(teacherA, (tx) => tx.update(s.plagiarismRuns).set({ status: 'failed' }).returning())).toHaveLength(0);
  });
});
