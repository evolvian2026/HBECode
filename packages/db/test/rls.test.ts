/**
 * Tenant-isolation and role tests run directly against Postgres as the `hbe_app` role, so they
 * prove the RLS layer on its own — independent of the API's guards and service checks.
 */
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYSTEM, withContext, type DbContext } from '../src/client.js';
import * as s from '../src/schema.js';
import { createTestDb, type TestDb } from './helpers.js';

let t: TestDb;
const ids = {
  tenantA: randomUUID(),
  tenantB: randomUUID(),
  teacherA: randomUUID(),
  teacherB: randomUUID(),
  studentA: randomUUID(),
  studentA2: randomUUID(),
  associateA: randomUUID(),
  adminA: randomUUID(),
  guest: randomUUID(),
  qA: randomUUID(),
  qB: randomUUID(),
  qGlobal: randomUUID(),
  qDraftA: randomUUID(),
  vA: randomUUID(),
  vB: randomUUID(),
  vGlobal: randomUUID(),
  vDraftA: randomUUID(),
  subA: randomUUID(),
  subB: randomUUID(),
};

const ctx = (role: DbContext['role'], userId: string | null, tenantId: string | null): DbContext => ({ role, userId, tenantId });
const teacherA = ctx('teacher', ids.teacherA, ids.tenantA);
const teacherB = ctx('teacher', ids.teacherB, ids.tenantB);
const studentA = ctx('student', ids.studentA, ids.tenantA);
const studentA2 = ctx('student', ids.studentA2, ids.tenantA);
const associateA = ctx('associate', ids.associateA, ids.tenantA);
const adminA = ctx('client_admin', ids.adminA, ids.tenantA);
const guest = ctx('guest', ids.guest, null);
const nobody: DbContext = { role: '' as DbContext['role'], userId: null, tenantId: null };

async function seed() {
  await withContext(t.db, SYSTEM, async (tx) => {
    await tx.insert(s.tenants).values([
      { id: ids.tenantA, name: 'Alpha University', slug: 'alpha' },
      { id: ids.tenantB, name: 'Beta College', slug: 'beta' },
    ]);
    const u = (id: string, email: string, kind: 'user' | 'guest' = 'user') => ({ id, email: kind === 'guest' ? null : email, name: email, kind, status: 'active' as const });
    await tx.insert(s.users).values([
      u(ids.teacherA, 'ta@a.edu'), u(ids.teacherB, 'tb@b.edu'), u(ids.studentA, 'sa@a.edu'), u(ids.studentA2, 'sa2@a.edu'),
      u(ids.associateA, 'aa@a.edu'), u(ids.adminA, 'admin@a.edu'), u(ids.guest, 'guest', 'guest'),
    ]);
    await tx.insert(s.memberships).values([
      { userId: ids.teacherA, tenantId: ids.tenantA, role: 'teacher' },
      { userId: ids.teacherB, tenantId: ids.tenantB, role: 'teacher' },
      { userId: ids.studentA, tenantId: ids.tenantA, role: 'student' },
      { userId: ids.studentA2, tenantId: ids.tenantA, role: 'student' },
      { userId: ids.associateA, tenantId: ids.tenantA, role: 'associate' },
      { userId: ids.adminA, tenantId: ids.tenantA, role: 'client_admin' },
    ]);
    const q = (id: string, tenantId: string | null, slug: string, vid: string, published: boolean) => ({
      id, tenantId, slug, status: published ? ('published' as const) : ('draft' as const), isPractice: true,
      latestVersionId: vid, publishedVersionId: published ? vid : null,
    });
    await tx.insert(s.questions).values([
      q(ids.qA, ids.tenantA, 'qa', ids.vA, true),
      q(ids.qB, ids.tenantB, 'qb', ids.vB, true),
      q(ids.qGlobal, null, 'qg', ids.vGlobal, true),
      q(ids.qDraftA, ids.tenantA, 'qdraft', ids.vDraftA, false),
    ]);
    const v = (id: string, questionId: string, published: boolean) => ({
      id, questionId, versionNo: 1, title: `title ${questionId.slice(0, 4)}`, statement: 'x', difficulty: 'easy' as const,
      baseTimeLimitMs: 1000, memoryLimitMb: 256, compare: { mode: 'exact' as const }, publishedAt: published ? new Date() : null,
    });
    await tx.insert(s.questionVersions).values([v(ids.vA, ids.qA, true), v(ids.vB, ids.qB, true), v(ids.vGlobal, ids.qGlobal, true), v(ids.vDraftA, ids.qDraftA, false)]);
    for (const vid of [ids.vA, ids.vB, ids.vGlobal, ids.vDraftA]) {
      await tx.insert(s.testCases).values([
        { versionId: vid, visibility: 'sample', ordinal: 1, input: 'sample-in', expected: 'sample-out' },
        { versionId: vid, visibility: 'hidden', ordinal: 1, input: 'SECRET-IN', expected: 'SECRET-OUT' },
      ]);
      await tx.insert(s.languageStubs).values({ versionId: vid, runtime: 'python', stub: 'def f(): pass' });
      await tx.insert(s.languageSecrets).values({ versionId: vid, runtime: 'python', driver: 'DRIVER', solution: 'SOLUTION' });
    }
    await tx.insert(s.submissions).values([
      { id: ids.subA, tenantId: ids.tenantA, userId: ids.studentA, questionId: ids.qA, versionId: ids.vA, runtime: 'python', kind: 'submit', code: 'A-CODE' },
      { id: ids.subB, tenantId: ids.tenantB, userId: ids.teacherB, questionId: ids.qB, versionId: ids.vB, runtime: 'python', kind: 'submit', code: 'B-CODE' },
    ]);
  });
}

beforeAll(async () => {
  t = await createTestDb();
  await seed();
});
afterAll(async () => {
  await t?.drop();
});

/** Drizzle wraps driver errors; the Postgres message lives on `cause`. */
async function expectPgError(p: Promise<unknown>, re: RegExp) {
  const err = await p.then(() => null, (e: unknown) => e as Error & { cause?: Error });
  expect(err, 'expected the query to fail').not.toBeNull();
  expect(err!.cause?.message ?? err!.message).toMatch(re);
}

const as = <T>(c: DbContext, fn: Parameters<typeof withContext<T>>[2]) => withContext(t.db, c, fn);
const questionIds = (c: DbContext) => as(c, async (tx) => (await tx.select({ id: s.questions.id }).from(s.questions)).map((r) => r.id).sort());

describe('catalog', () => {
  it('every hbe table has RLS enabled and forced', async () => {
    const { rows } = await t.adminPool.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'hbe' AND c.relkind = 'r'`,
    );
    expect(rows.length).toBe(Object.keys(s.allTables).length);
    for (const r of rows) expect([r.relname, r.relrowsecurity, r.relforcerowsecurity]).toEqual([r.relname, true, true]);
  });
  it('hbe_app is not the owner and cannot bypass RLS', async () => {
    const { rows } = await t.adminPool.query(`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'hbe_app'`);
    expect(rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
    const owners = await t.adminPool.query(`SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'hbe'`);
    expect(owners.rows.map((r) => r.tableowner)).not.toContain('hbe_app');
  });
  it('the PUBLIC pseudo-role (e.g. Supabase anon) has no access to schema hbe', async () => {
    const { rows } = await t.adminPool.query(`SELECT has_schema_privilege('public', 'hbe', 'USAGE') AS u`);
    expect(rows[0].u).toBe(false);
  });
});

describe('no context', () => {
  it('sees nothing in any table', async () => {
    for (const [name, table] of Object.entries(s.allTables)) {
      const rows = await as(nobody, (tx) => tx.select({ n: sql<number>`count(*)::int` }).from(table));
      expect([name, rows[0]!.n]).toEqual([name, 0]);
    }
  });
});

describe('question bank isolation', () => {
  it('teacher sees own tenant + global questions only', async () => {
    expect(await questionIds(teacherA)).toEqual([ids.qA, ids.qGlobal, ids.qDraftA].sort());
    expect(await questionIds(teacherB)).toEqual([ids.qB, ids.qGlobal].sort());
  });
  it('student sees published practice questions of own tenant + global, never drafts', async () => {
    expect(await questionIds(studentA)).toEqual([ids.qA, ids.qGlobal].sort());
  });
  it('guest sees global published practice questions only', async () => {
    expect(await questionIds(guest)).toEqual([ids.qGlobal]);
  });
  it('teacher cannot update or delete another tenant’s question', async () => {
    const upd = await as(teacherA, (tx) => tx.update(s.questions).set({ slug: 'pwned' }).where(eq(s.questions.id, ids.qB)).returning());
    expect(upd).toHaveLength(0);
    const del = await as(teacherA, (tx) => tx.delete(s.questions).where(eq(s.questions.id, ids.qB)).returning());
    expect(del).toHaveLength(0);
    const delGlobal = await as(teacherA, (tx) => tx.delete(s.questions).where(eq(s.questions.id, ids.qGlobal)).returning());
    expect(delGlobal).toHaveLength(0);
  });
  it('teacher cannot create a question in another tenant or in the global bank', async () => {
    await expectPgError(as(teacherA, (tx) => tx.insert(s.questions).values({ tenantId: ids.tenantB, slug: 'x' })), /row-level security/);
    await expectPgError(as(teacherA, (tx) => tx.insert(s.questions).values({ tenantId: null, slug: 'y' })), /row-level security/);
  });
  it('students and associates cannot write questions', async () => {
    await expectPgError(as(studentA, (tx) => tx.insert(s.questions).values({ tenantId: ids.tenantA, slug: 's' })), /row-level security/);
    await expectPgError(as(associateA, (tx) => tx.insert(s.questions).values({ tenantId: ids.tenantA, slug: 'a' })), /row-level security/);
  });
  it('child rows take tenant_id from the parent; a teacher cannot attach rows to another tenant’s version', async () => {
    await expectPgError(as(teacherA, (tx) => tx.insert(s.testCases).values({ versionId: ids.vB, tenantId: ids.tenantA, visibility: 'hidden', ordinal: 9, input: 'x', expected: 'y' })), /row-level security/);
    await expectPgError(as(teacherA, (tx) => tx.insert(s.questionVersions).values({ questionId: ids.qB, tenantId: ids.tenantA, versionNo: 2, title: 't', statement: 's', difficulty: 'easy', baseTimeLimitMs: 1, memoryLimitMb: 1, compare: { mode: 'exact' } })), /row-level security/);
  });
});

describe('hidden data', () => {
  const hiddenInputs = (c: DbContext) => as(c, async (tx) => (await tx.select().from(s.testCases)).filter((r) => r.visibility === 'hidden').length);
  const secrets = (c: DbContext) => as(c, async (tx) => (await tx.select().from(s.languageSecrets)).length);

  it('students and guests never see hidden tests, drivers or solutions', async () => {
    expect(await hiddenInputs(studentA)).toBe(0);
    expect(await hiddenInputs(guest)).toBe(0);
    expect(await secrets(studentA)).toBe(0);
    expect(await secrets(guest)).toBe(0);
  });
  it('students see sample tests and stubs of visible questions only', async () => {
    const samples = await as(studentA, (tx) => tx.select().from(s.testCases));
    expect(new Set(samples.map((r) => r.versionId))).toEqual(new Set([ids.vA, ids.vGlobal]));
    const stubs = await as(studentA, (tx) => tx.select().from(s.languageStubs));
    expect(new Set(stubs.map((r) => r.versionId))).toEqual(new Set([ids.vA, ids.vGlobal]));
  });
  it('associates see hidden tests of their tenant but no drivers/solutions', async () => {
    expect(await hiddenInputs(associateA)).toBe(3); // A, A-draft, global
    expect(await secrets(associateA)).toBe(0);
  });
  it('teachers see secrets of their own tenant only (global secrets are super-admin only)', async () => {
    const rows = await as(teacherA, (tx) => tx.select().from(s.languageSecrets));
    expect(new Set(rows.map((r) => r.versionId))).toEqual(new Set([ids.vA, ids.vDraftA]));
  });
});

describe('published versions', () => {
  it('cannot be edited, even by the owner tenant', async () => {
    await expectPgError(as(teacherA, (tx) => tx.update(s.questionVersions).set({ statement: 'changed' }).where(eq(s.questionVersions.id, ids.vA))), /immutable/);
  });
});

describe('submissions', () => {
  const subIds = (c: DbContext) => as(c, async (tx) => (await tx.select({ id: s.submissions.id }).from(s.submissions)).map((r) => r.id));
  it('students see only their own submissions', async () => {
    expect(await subIds(studentA)).toEqual([ids.subA]);
    expect(await subIds(studentA2)).toEqual([]);
  });
  it('tenant staff see their tenant only', async () => {
    expect(await subIds(teacherA)).toEqual([ids.subA]);
    expect(await subIds(adminA)).toEqual([ids.subA]);
    expect(await subIds(teacherB)).toEqual([ids.subB]);
  });
  it('users cannot set their own verdicts', async () => {
    const r = await as(studentA, (tx) => tx.update(s.submissions).set({ verdict: 'AC', score: '100' }).where(eq(s.submissions.id, ids.subA)).returning());
    expect(r).toHaveLength(0);
  });
  it('users cannot insert submissions for someone else or another tenant', async () => {
    await expectPgError(as(studentA, (tx) => tx.insert(s.submissions).values({ tenantId: ids.tenantA, userId: ids.studentA2, questionId: ids.qA, versionId: ids.vA, runtime: 'c', kind: 'run', code: 'x' })), /row-level security/);
    await expectPgError(as(studentA, (tx) => tx.insert(s.submissions).values({ tenantId: ids.tenantB, userId: ids.studentA, questionId: ids.qA, versionId: ids.vA, runtime: 'c', kind: 'run', code: 'x' })), /row-level security/);
  });
});

describe('users and memberships', () => {
  it('client admin sees users of own tenant only', async () => {
    const rows = await as(adminA, (tx) => tx.select({ id: s.users.id }).from(s.users));
    expect(rows.map((r) => r.id)).not.toContain(ids.teacherB);
    expect(rows.map((r) => r.id)).toContain(ids.studentA);
  });
  it('client admin cannot grant client_admin or touch another tenant', async () => {
    await expectPgError(as(adminA, (tx) => tx.update(s.memberships).set({ role: 'client_admin' }).where(eq(s.memberships.userId, ids.studentA))), /row-level security/);
    const r = await as(adminA, (tx) => tx.update(s.memberships).set({ role: 'student' }).where(eq(s.memberships.userId, ids.teacherB)).returning());
    expect(r).toHaveLength(0);
  });
  it('nobody but platform can make a platform admin', async () => {
    await expectPgError(as(studentA, (tx) => tx.update(s.users).set({ isPlatformAdmin: true }).where(eq(s.users.id, ids.studentA))), /row-level security/);
    await expectPgError(as(adminA, (tx) => tx.insert(s.users).values({ email: 'x@a.edu', name: 'x', isPlatformAdmin: true })), /row-level security/);
  });
  it('students cannot read other students', async () => {
    const rows = await as(studentA, (tx) => tx.select({ id: s.users.id }).from(s.users));
    expect(rows.map((r) => r.id)).toEqual([ids.studentA]);
  });
  it('refresh tokens are invisible outside system context', async () => {
    await as(SYSTEM, (tx) => tx.insert(s.refreshTokens).values({ userId: ids.studentA, familyId: randomUUID(), tokenHash: 'h', expiresAt: new Date(Date.now() + 1e6) }));
    expect(await as(studentA, (tx) => tx.select().from(s.refreshTokens))).toHaveLength(0);
  });
});

describe('audit log', () => {
  it('is append-only for the app role', async () => {
    await as(teacherA, (tx) => tx.insert(s.auditLogs).values({ tenantId: ids.tenantA, actorId: ids.teacherA, action: 'test' }));
    await expectPgError(as(SYSTEM, (tx) => tx.update(s.auditLogs).set({ action: 'tampered' })), /permission denied/);
    await expectPgError(as(SYSTEM, (tx) => tx.delete(s.auditLogs)), /permission denied/);
  });
});
