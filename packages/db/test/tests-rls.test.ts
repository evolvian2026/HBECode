/**
 * Phase 4 RLS: tests, attempts and proctoring tables, run as the `hbe_app` role so they prove the
 * database layer on its own (independent of the API's guards).
 */
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYSTEM, withContext, type DbContext } from '../src/client.js';
import * as s from '../src/schema.js';
import { createTestDb, type TestDb } from './helpers.js';

let t: TestDb;
const id = () => randomUUID();
const ids = {
  tenantA: id(), tenantB: id(),
  teacherA: id(), teacherB: id(), associateA: id(), adminA: id(),
  studentA: id(), studentA2: id(), studentB: id(),
  batchA: id(),
  qA: id(), vA: id(), qB: id(), vB: id(),
  testA: id(), testDraftA: id(), testB: id(),
  attemptB: id(),
};
const ctx = (role: DbContext['role'], userId: string, tenantId: string): DbContext => ({ role, userId, tenantId });
const teacherA = ctx('teacher', ids.teacherA, ids.tenantA);
const teacherB = ctx('teacher', ids.teacherB, ids.tenantB);
const associateA = ctx('associate', ids.associateA, ids.tenantA);
const studentA = ctx('student', ids.studentA, ids.tenantA);
const studentA2 = ctx('student', ids.studentA2, ids.tenantA);
const studentB = ctx('student', ids.studentB, ids.tenantB);

const as = <T>(c: DbContext, fn: Parameters<typeof withContext<T>>[2]) => withContext(t.db, c, fn);
async function expectPgError(p: Promise<unknown>, re: RegExp) {
  const err = await p.then(() => null, (e: unknown) => e as Error & { cause?: Error });
  expect(err, 'expected the query to fail').not.toBeNull();
  expect(err!.cause?.message ?? err!.message).toMatch(re);
}
const future = (min: number) => new Date(Date.now() + min * 60_000);

beforeAll(async () => {
  t = await createTestDb();
  await as(SYSTEM, async (tx) => {
    await tx.insert(s.tenants).values([{ id: ids.tenantA, name: 'A', slug: 'a' }, { id: ids.tenantB, name: 'B', slug: 'b' }]);
    const users = ['teacherA', 'teacherB', 'associateA', 'adminA', 'studentA', 'studentA2', 'studentB'] as const;
    await tx.insert(s.users).values(users.map((k) => ({ id: ids[k], email: `${k}@x.edu`, name: k, status: 'active' as const })));
    await tx.insert(s.memberships).values([
      { userId: ids.teacherA, tenantId: ids.tenantA, role: 'teacher' }, { userId: ids.teacherB, tenantId: ids.tenantB, role: 'teacher' },
      { userId: ids.associateA, tenantId: ids.tenantA, role: 'associate' }, { userId: ids.adminA, tenantId: ids.tenantA, role: 'client_admin' },
      { userId: ids.studentA, tenantId: ids.tenantA, role: 'student' }, { userId: ids.studentA2, tenantId: ids.tenantA, role: 'student' },
      { userId: ids.studentB, tenantId: ids.tenantB, role: 'student' },
    ]);
    await tx.insert(s.batches).values({ id: ids.batchA, tenantId: ids.tenantA, name: 'CSE' });
    await tx.insert(s.batchMembers).values({ batchId: ids.batchA, userId: ids.studentA, tenantId: ids.tenantA });
    // Exam-only questions (not practice): students must not see them outside an attempt.
    for (const [q, v, tenantId] of [[ids.qA, ids.vA, ids.tenantA], [ids.qB, ids.vB, ids.tenantB]] as const) {
      await tx.insert(s.questions).values({ id: q, tenantId, slug: `q-${q.slice(0, 4)}`, status: 'published', isPractice: false, latestVersionId: v, publishedVersionId: v });
      await tx.insert(s.questionVersions).values({ id: v, questionId: q, versionNo: 1, title: 'exam q', statement: 'x', difficulty: 'easy', baseTimeLimitMs: 1000, memoryLimitMb: 256, compare: { mode: 'exact' }, publishedAt: new Date() });
      await tx.insert(s.testCases).values([
        { versionId: v, visibility: 'sample', ordinal: 1, input: 'sample-in', expected: 'sample-out' },
        { versionId: v, visibility: 'hidden', ordinal: 1, input: 'SECRET-IN', expected: 'SECRET-OUT' },
      ]);
      await tx.insert(s.languageStubs).values({ versionId: v, runtime: 'python', stub: 'def f(): pass' });
      await tx.insert(s.languageSecrets).values({ versionId: v, runtime: 'python', driver: 'DRIVER', solution: 'SOLUTION' });
    }
    const test = (tid: string, tenantId: string, status: s.TestStatus) => ({ id: tid, tenantId, title: tid, status, startsAt: new Date(Date.now() - 60_000), endsAt: future(120), durationMin: 60 });
    await tx.insert(s.tests).values([test(ids.testA, ids.tenantA, 'published'), test(ids.testDraftA, ids.tenantA, 'draft'), test(ids.testB, ids.tenantB, 'published')]);
    await tx.insert(s.testQuestions).values([
      { testId: ids.testA, questionId: ids.qA, versionId: ids.vA, ordinal: 1 },
      { testId: ids.testDraftA, questionId: ids.qA, versionId: ids.vA, ordinal: 1 },
      { testId: ids.testB, questionId: ids.qB, versionId: ids.vB, ordinal: 1 },
    ]);
    await tx.insert(s.testAssignments).values([
      { testId: ids.testA, batchId: ids.batchA },
      { testId: ids.testDraftA, userId: ids.studentA },
      { testId: ids.testB, userId: ids.studentB },
    ]);
    await tx.insert(s.attempts).values({ id: ids.attemptB, testId: ids.testB, userId: ids.studentB, deadlineAt: future(60) });
    await tx.insert(s.proctorEvents).values({ attemptId: ids.attemptB, type: 'tab_hidden', severity: 'medium', counted: true });
  });
});
afterAll(async () => {
  await t?.drop();
});

const testIds = (c: DbContext) => as(c, async (tx) => (await tx.select({ id: s.tests.id }).from(s.tests)).map((r) => r.id).sort());
const visibleQuestion = (c: DbContext) =>
  as(c, async (tx) => ({
    questions: (await tx.select({ id: s.questions.id }).from(s.questions)).map((r) => r.id),
    versions: (await tx.select({ id: s.questionVersions.id }).from(s.questionVersions)).map((r) => r.id),
    cases: (await tx.select().from(s.testCases)).map((r) => r.input),
    stubs: (await tx.select().from(s.languageStubs)).length,
    secrets: (await tx.select().from(s.languageSecrets)).length,
  }));

describe('tests and assignments', () => {
  it('tenant inheritance: child rows take the test’s tenant', async () => {
    const rows = await as(SYSTEM, (tx) => tx.select().from(s.testQuestions).where(eq(s.testQuestions.testId, ids.testB)));
    expect(rows[0]!.tenantId).toBe(ids.tenantB);
  });
  it('staff see their own tenant’s tests only', async () => {
    expect(await testIds(teacherA)).toEqual([ids.testA, ids.testDraftA].sort());
    expect(await testIds(associateA)).toEqual([ids.testA, ids.testDraftA].sort());
    expect(await testIds(teacherB)).toEqual([ids.testB]);
  });
  it('students see published tests assigned to them (directly or by batch), never drafts', async () => {
    expect(await testIds(studentA)).toEqual([ids.testA]);
    expect(await testIds(studentA2)).toEqual([]);
    expect(await testIds(studentB)).toEqual([ids.testB]);
  });
  it('only teachers of the tenant write tests, questions lists and assignments', async () => {
    await expectPgError(as(studentA, (tx) => tx.insert(s.tests).values({ tenantId: ids.tenantA, title: 'x', startsAt: new Date(), endsAt: future(5), durationMin: 5 })), /row-level security/);
    await expectPgError(as(associateA, (tx) => tx.insert(s.tests).values({ tenantId: ids.tenantA, title: 'x', startsAt: new Date(), endsAt: future(5), durationMin: 5 })), /row-level security/);
    await expectPgError(as(teacherA, (tx) => tx.insert(s.tests).values({ tenantId: ids.tenantB, title: 'x', startsAt: new Date(), endsAt: future(5), durationMin: 5 })), /row-level security/);
    expect(await as(teacherB, (tx) => tx.update(s.tests).set({ title: 'pwned' }).where(eq(s.tests.id, ids.testA)).returning())).toHaveLength(0);
    // Attaching rows to another tenant's test: the inherited tenant is invisible → rejected.
    await expectPgError(as(teacherA, (tx) => tx.insert(s.testAssignments).values({ testId: ids.testB, userId: ids.studentA })), /row-level security/);
    await expectPgError(as(studentA, (tx) => tx.insert(s.testAssignments).values({ testId: ids.testA, userId: ids.studentA2 })), /row-level security/);
  });
});

describe('question visibility through attempts', () => {
  it('before an attempt, a student cannot see an exam-only question', async () => {
    const v = await visibleQuestion(studentA);
    expect(v.questions).toEqual([]);
    expect(v.versions).toEqual([]);
    expect(v.cases).toEqual([]);
  });
  it('a student cannot start an attempt on an unassigned, draft or foreign test, or for someone else', async () => {
    await expectPgError(as(studentA2, (tx) => tx.insert(s.attempts).values({ testId: ids.testA, userId: ids.studentA2, deadlineAt: future(60) })), /row-level security/);
    await expectPgError(as(studentA, (tx) => tx.insert(s.attempts).values({ testId: ids.testDraftA, userId: ids.studentA, deadlineAt: future(60) })), /row-level security/);
    await expectPgError(as(studentA, (tx) => tx.insert(s.attempts).values({ testId: ids.testB, userId: ids.studentA, deadlineAt: future(60) })), /row-level security/);
    await expectPgError(as(studentA, (tx) => tx.insert(s.attempts).values({ testId: ids.testA, userId: ids.studentA2, deadlineAt: future(60) })), /row-level security/);
    await expectPgError(as(studentA, (tx) => tx.insert(s.attempts).values({ testId: ids.testA, userId: ids.studentA, deadlineAt: future(60), score: '100' })), /row-level security/);
  });
  let attemptA: string;
  it('during an attempt: the pinned question, samples and stubs — never hidden tests or secrets', async () => {
    const [a] = await as(studentA, (tx) => tx.insert(s.attempts).values({ testId: ids.testA, userId: ids.studentA, deadlineAt: future(60) }).returning());
    attemptA = a!.id;
    expect(a!.tenantId).toBe(ids.tenantA);
    const v = await visibleQuestion(studentA);
    expect(v.questions).toEqual([ids.qA]);
    expect(v.versions).toEqual([ids.vA]);
    expect(v.cases).toEqual(['sample-in']);
    expect(v.stubs).toBe(1);
    expect(v.secrets).toBe(0);
    // A classmate without an attempt still sees nothing.
    expect((await visibleQuestion(studentA2)).questions).toEqual([]);
  });
  it('a student can never update their attempt (deadline, score, status, session)', async () => {
    for (const set of [{ deadlineAt: future(600) }, { score: '100' }, { status: 'submitted' as const }, { activeSessionHash: 'x' }, { violationCount: 0 }]) {
      expect(await as(studentA, (tx) => tx.update(s.attempts).set(set).where(eq(s.attempts.id, attemptA)).returning())).toHaveLength(0);
    }
    expect(await as(studentA, (tx) => tx.delete(s.attempts).where(eq(s.attempts.id, attemptA)).returning())).toHaveLength(0);
  });
  it('drafts and submissions are refused by RLS after the server deadline', async () => {
    await as(studentA, (tx) => tx.insert(s.attemptDrafts).values({ attemptId: attemptA, questionId: ids.qA, runtime: 'python', code: 'early' }));
    await as(studentA, (tx) => tx.insert(s.submissions).values({ tenantId: ids.tenantA, userId: ids.studentA, questionId: ids.qA, versionId: ids.vA, runtime: 'python', kind: 'submit', code: 'x', attemptId: attemptA }));
    await as(SYSTEM, (tx) => tx.update(s.attempts).set({ deadlineAt: new Date(Date.now() - 1000) }).where(eq(s.attempts.id, attemptA)));
    await expectPgError(as(studentA, (tx) => tx.insert(s.attemptDrafts).values({ attemptId: attemptA, questionId: ids.qA, runtime: 'c', code: 'late' })), /row-level security/);
    expect(await as(studentA, (tx) => tx.update(s.attemptDrafts).set({ code: 'late' }).where(eq(s.attemptDrafts.attemptId, attemptA)).returning())).toHaveLength(0);
    await expectPgError(as(studentA, (tx) => tx.insert(s.submissions).values({ tenantId: ids.tenantA, userId: ids.studentA, questionId: ids.qA, versionId: ids.vA, runtime: 'python', kind: 'submit', code: 'late', attemptId: attemptA })), /row-level security/);
  });
  it('a submission cannot name someone else’s attempt', async () => {
    await expectPgError(as(studentA2, (tx) => tx.insert(s.submissions).values({ tenantId: ids.tenantA, userId: ids.studentA2, questionId: ids.qA, versionId: ids.vA, runtime: 'python', kind: 'run', code: 'x', attemptId: attemptA })), /row-level security/);
  });
  it('after the attempt ends, the question is hidden again', async () => {
    await as(SYSTEM, (tx) => tx.update(s.attempts).set({ status: 'submitted', deadlineAt: future(60) }).where(eq(s.attempts.id, attemptA)));
    expect((await visibleQuestion(studentA)).questions).toEqual([]);
  });
  it('tenant staff (associate) can extend an attempt in their tenant; another tenant cannot touch it', async () => {
    expect(await as(associateA, (tx) => tx.update(s.attempts).set({ extraMinutes: 10 }).where(eq(s.attempts.id, attemptA)).returning())).toHaveLength(1);
    expect(await as(teacherB, (tx) => tx.update(s.attempts).set({ extraMinutes: 99 }).where(eq(s.attempts.id, attemptA)).returning())).toHaveLength(0);
    expect(await as(teacherB, (tx) => tx.select().from(s.attempts).where(eq(s.attempts.id, attemptA)))).toHaveLength(0);
    expect(await as(studentA2, (tx) => tx.select().from(s.attempts).where(eq(s.attempts.id, attemptA)))).toHaveLength(0);
  });
});

describe('proctoring data', () => {
  it('students cannot read sessions, events or snapshots — not even their own', async () => {
    for (const table of [s.attemptSessions, s.proctorEvents, s.proctorSnapshots]) {
      const rows = await as(studentB, (tx) => tx.select({ n: sql<number>`count(*)::int` }).from(table));
      expect(rows[0]!.n).toBe(0);
    }
  });
  it('students cannot write events, sessions or snapshots directly', async () => {
    await expectPgError(as(studentB, (tx) => tx.insert(s.proctorEvents).values({ attemptId: ids.attemptB, type: 'x', severity: 'info' })), /row-level security/);
    await expectPgError(as(studentB, (tx) => tx.insert(s.attemptSessions).values({ attemptId: ids.attemptB, tokenHash: 'h', status: 'active' })), /row-level security/);
    await expectPgError(as(studentB, (tx) => tx.insert(s.proctorSnapshots).values({ attemptId: ids.attemptB, eventType: 'x', contentType: 'image/jpeg', image: Buffer.from('x'), sizeBytes: 1 })), /row-level security/);
  });
  it('events are tenant-isolated and append-only', async () => {
    expect(await as(teacherA, (tx) => tx.select().from(s.proctorEvents))).toHaveLength(0);
    expect(await as(teacherB, (tx) => tx.select().from(s.proctorEvents))).toHaveLength(1);
    await expectPgError(as(SYSTEM, (tx) => tx.update(s.proctorEvents).set({ counted: false })), /permission denied/);
    expect(await as(teacherB, (tx) => tx.delete(s.proctorEvents).returning())).toHaveLength(0);
  });
  it('proctors may add proctor-sourced events only, in their tenant', async () => {
    await as(teacherB, (tx) => tx.insert(s.proctorEvents).values({ attemptId: ids.attemptB, type: 'warn', severity: 'info', source: 'proctor' }));
    await expectPgError(as(teacherB, (tx) => tx.insert(s.proctorEvents).values({ attemptId: ids.attemptB, type: 'tab_hidden', severity: 'high', source: 'client' })), /row-level security/);
    await expectPgError(as(teacherA, (tx) => tx.insert(s.proctorEvents).values({ attemptId: ids.attemptB, type: 'warn', severity: 'info', source: 'proctor' })), /row-level security/);
  });
});
