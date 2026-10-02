import { Injectable } from '@nestjs/common';
import { attempts, attemptSessions, batches, batchMembers, memberships, proctorEvents, questions, questionVersions, testAssignments, testQuestions, tests, users, type Tx } from '@hbe/db';
import { EVENT_RULES, TestSettings, type TestInput } from '@hbe/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { AuditService } from '../common/audit.service.js';
import { dbCtx, type AuthUser, type RequestMeta } from '../common/decorators.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { DbService } from '../infra/infra.module.js';
import { RealtimeService } from '../realtime/realtime.service.js';

export const settingsOf = (t: { settings: Record<string, unknown> }) => TestSettings.parse(t.settings ?? {});
const ONLINE_MS = 40_000;

function requireTenant(u: AuthUser): string {
  if (!u.tenantId) throw forbidden('tests belong to an institution; switch to one first');
  return u.tenantId;
}

/** Test authoring, scheduling and assignment (teachers), the student list, and the live monitor. */
@Injectable()
export class TestsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly rt: RealtimeService,
  ) {}

  // ------------------------------------------------------------------ staff
  list(u: AuthUser) {
    requireTenant(u);
    return this.db.run(dbCtx(u), async (tx) => {
      const rows = await tx.select().from(tests).orderBy(desc(tests.startsAt)).limit(200);
      const ids = rows.map((r) => r.id);
      const counts = ids.length
        ? await tx
            .select({ testId: attempts.testId, total: sql<number>`count(*)::int`, open: sql<number>`count(*) FILTER (WHERE ${attempts.status} = 'in_progress')::int` })
            .from(attempts)
            .where(inArray(attempts.testId, ids))
            .groupBy(attempts.testId)
        : [];
      const qn = ids.length
        ? await tx.select({ testId: testQuestions.testId, n: sql<number>`count(*)::int` }).from(testQuestions).where(inArray(testQuestions.testId, ids)).groupBy(testQuestions.testId)
        : [];
      return rows.map((t) => ({
        id: t.id, title: t.title, status: t.status, startsAt: t.startsAt.toISOString(), endsAt: t.endsAt.toISOString(), durationMin: t.durationMin,
        questionCount: qn.find((c) => c.testId === t.id)?.n ?? 0,
        attempts: counts.find((c) => c.testId === t.id)?.total ?? 0,
        inProgress: counts.find((c) => c.testId === t.id)?.open ?? 0,
      }));
    });
  }

  private async checkQuestions(tx: Tx, ids: string[]) {
    const rows = await tx.select({ id: questions.id, status: questions.status }).from(questions).where(inArray(questions.id, ids));
    if (rows.length !== ids.length) throw badRequest('Some questions do not exist or are not visible to you.');
    if (rows.some((r) => r.status === 'archived')) throw badRequest('Archived questions cannot be used in a test.');
  }

  async create(u: AuthUser, body: TestInput, meta: RequestMeta) {
    const tenantId = requireTenant(u);
    return this.db.run(dbCtx(u), async (tx) => {
      await this.checkQuestions(tx, body.questions.map((q) => q.questionId));
      const [t] = await tx
        .insert(tests)
        .values({ tenantId, title: body.title, description: body.description, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), durationMin: body.durationMin, settings: body.settings, createdBy: u.id })
        .returning();
      await tx.insert(testQuestions).values(body.questions.map((q, i) => ({ testId: t!.id, questionId: q.questionId, ordinal: i + 1, points: String(q.points) })));
      await this.audit.record(tx, { tenantId, actorId: u.id, action: 'test.create', entityType: 'test', entityId: t!.id, data: { title: body.title, questions: body.questions.length } }, meta);
      return { id: t!.id };
    });
  }

  async update(u: AuthUser, id: string, body: TestInput, meta: RequestMeta) {
    requireTenant(u);
    return this.db.run(dbCtx(u), async (tx) => {
      const [t] = await tx.select().from(tests).where(eq(tests.id, id)).for('update');
      if (!t) throw notFound('Test');
      if (t.status !== 'draft') throw conflict('Only draft tests can be edited. Close it and create a new one, or extend attempts from the monitor.');
      await this.checkQuestions(tx, body.questions.map((q) => q.questionId));
      await tx.update(tests).set({ title: body.title, description: body.description, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), durationMin: body.durationMin, settings: body.settings }).where(eq(tests.id, id));
      await tx.delete(testQuestions).where(eq(testQuestions.testId, id));
      await tx.insert(testQuestions).values(body.questions.map((q, i) => ({ testId: id, questionId: q.questionId, ordinal: i + 1, points: String(q.points) })));
      await this.audit.record(tx, { tenantId: t.tenantId, actorId: u.id, action: 'test.update', entityType: 'test', entityId: id, data: { title: body.title } }, meta);
      return { id };
    });
  }

  async remove(u: AuthUser, id: string, meta: RequestMeta) {
    requireTenant(u);
    await this.db.run(dbCtx(u), async (tx) => {
      const [t] = await tx.select().from(tests).where(eq(tests.id, id));
      if (!t) throw notFound('Test');
      if (t.status !== 'draft') throw conflict('Only draft tests can be deleted.');
      await tx.delete(tests).where(eq(tests.id, id));
      await this.audit.record(tx, { tenantId: t.tenantId, actorId: u.id, action: 'test.delete', entityType: 'test', entityId: id, data: { title: t.title } }, meta);
    });
  }

  async detail(u: AuthUser, id: string) {
    requireTenant(u);
    return this.db.run(dbCtx(u), async (tx) => {
      const [t] = await tx.select().from(tests).where(eq(tests.id, id));
      if (!t) throw notFound('Test');
      const qs = await tx
        .select({ questionId: testQuestions.questionId, versionId: testQuestions.versionId, ordinal: testQuestions.ordinal, points: testQuestions.points, title: questionVersions.title, type: questions.type, difficulty: questionVersions.difficulty, status: questions.status })
        .from(testQuestions)
        .innerJoin(questions, eq(questions.id, testQuestions.questionId))
        .innerJoin(questionVersions, eq(questionVersions.id, sql`coalesce(${testQuestions.versionId}, ${questions.publishedVersionId}, ${questions.latestVersionId})`))
        .where(eq(testQuestions.testId, id))
        .orderBy(asc(testQuestions.ordinal));
      const assigned = await tx.select().from(testAssignments).where(eq(testAssignments.testId, id));
      return {
        id: t.id, title: t.title, description: t.description, status: t.status, startsAt: t.startsAt.toISOString(), endsAt: t.endsAt.toISOString(),
        durationMin: t.durationMin, settings: settingsOf(t), publishedAt: t.publishedAt?.toISOString() ?? null, closedAt: t.closedAt?.toISOString() ?? null,
        questions: qs.map((q) => ({ ...q, points: Number(q.points) })),
        batchIds: assigned.filter((a) => a.batchId).map((a) => a.batchId!),
        userIds: assigned.filter((a) => a.userId).map((a) => a.userId!),
      };
    });
  }

  async assign(u: AuthUser, id: string, body: { batchIds: string[]; userIds: string[] }, meta: RequestMeta) {
    const tenantId = requireTenant(u);
    return this.db.run(dbCtx(u), async (tx) => {
      const [t] = await tx.select().from(tests).where(eq(tests.id, id));
      if (!t) throw notFound('Test');
      if (t.status === 'closed') throw conflict('This test is closed.');
      if (body.batchIds.length) {
        const found = await tx.select({ id: batches.id }).from(batches).where(and(inArray(batches.id, body.batchIds), eq(batches.tenantId, tenantId)));
        if (found.length !== new Set(body.batchIds).size) throw badRequest('Unknown batch.');
      }
      if (body.userIds.length) {
        const found = await tx
          .select({ id: memberships.userId })
          .from(memberships)
          .where(and(inArray(memberships.userId, body.userIds), eq(memberships.tenantId, tenantId), eq(memberships.role, 'student')));
        if (found.length !== new Set(body.userIds).size) throw badRequest('Tests can be assigned to students of this institution only.');
      }
      await tx.delete(testAssignments).where(eq(testAssignments.testId, id));
      const rows: (typeof testAssignments.$inferInsert)[] = [
        ...[...new Set(body.batchIds)].map((batchId) => ({ testId: id, batchId })),
        ...[...new Set(body.userIds)].map((userId) => ({ testId: id, userId })),
      ];
      if (rows.length) await tx.insert(testAssignments).values(rows);
      await this.audit.record(tx, { tenantId, actorId: u.id, action: 'test.assign', entityType: 'test', entityId: id, data: { batches: body.batchIds.length, users: body.userIds.length } }, meta);
      return { batches: body.batchIds.length, users: body.userIds.length };
    });
  }

  /** Pins every question to its published version: later edits never change a scheduled test. */
  async publish(u: AuthUser, id: string, meta: RequestMeta) {
    requireTenant(u);
    return this.db.run(dbCtx(u), async (tx) => {
      const [t] = await tx.select().from(tests).where(eq(tests.id, id)).for('update');
      if (!t) throw notFound('Test');
      if (t.status !== 'draft') throw conflict('The test is already published.');
      if (t.endsAt.getTime() <= Date.now()) throw badRequest('The test window has already ended.');
      const qs = await tx
        .select({ questionId: testQuestions.questionId, published: questions.publishedVersionId, status: questions.status })
        .from(testQuestions)
        .leftJoin(questions, eq(questions.id, testQuestions.questionId))
        .where(eq(testQuestions.testId, id));
      if (qs.length === 0) throw badRequest('Add at least one question.');
      const unpublished = qs.filter((q) => !q.published || q.status !== 'published');
      if (unpublished.length) throw badRequest(`${unpublished.length} question(s) are not published (validated) yet.`);
      for (const q of qs) await tx.update(testQuestions).set({ versionId: q.published }).where(and(eq(testQuestions.testId, id), eq(testQuestions.questionId, q.questionId)));
      const assigned = await tx.select({ id: testAssignments.id }).from(testAssignments).where(eq(testAssignments.testId, id));
      if (assigned.length === 0) throw badRequest('Assign the test to at least one batch or student first.');
      await tx.update(tests).set({ status: 'published', publishedAt: new Date() }).where(eq(tests.id, id));
      await this.audit.record(tx, { tenantId: t.tenantId, actorId: u.id, action: 'test.publish', entityType: 'test', entityId: id, data: { questions: qs.length } }, meta);
      return { status: 'published' as const };
    });
  }

  /** Marks the test closed; open attempts are finalised by AttemptsService.closeTest. */
  async markClosed(u: AuthUser, id: string, meta: RequestMeta) {
    requireTenant(u);
    return this.db.run(dbCtx(u), async (tx) => {
      const [t] = await tx.select().from(tests).where(eq(tests.id, id)).for('update');
      if (!t) throw notFound('Test');
      if (t.status !== 'published') throw conflict('Only a published test can be closed.');
      await tx.update(tests).set({ status: 'closed', closedAt: new Date() }).where(eq(tests.id, id));
      await this.audit.record(tx, { tenantId: t.tenantId, actorId: u.id, action: 'test.close', entityType: 'test', entityId: id }, meta);
    });
  }

  // ------------------------------------------------------------------ students
  /** Published tests assigned to the student (RLS decides) with their own attempt, if any. */
  async myTests(u: AuthUser) {
    requireTenant(u);
    return this.db.run(dbCtx(u), async (tx) => {
      const rows = await tx.select().from(tests).orderBy(asc(tests.startsAt)).limit(200);
      const ids = rows.map((r) => r.id);
      const mine = ids.length ? await tx.select().from(attempts).where(and(inArray(attempts.testId, ids), eq(attempts.userId, u.id))) : [];
      const qn = ids.length
        ? await tx.select({ testId: testQuestions.testId, n: sql<number>`count(*)::int` }).from(testQuestions).where(inArray(testQuestions.testId, ids)).groupBy(testQuestions.testId)
        : [];
      return rows.map((t) => {
        const a = mine.find((m) => m.testId === t.id);
        const show = settingsOf(t).showResults && a && a.status !== 'in_progress';
        return {
          id: t.id, title: t.title, description: t.description, status: t.status, startsAt: t.startsAt.toISOString(), endsAt: t.endsAt.toISOString(),
          durationMin: t.durationMin, questionCount: qn.find((c) => c.testId === t.id)?.n ?? 0, settings: settingsOf(t),
          attempt: a ? { id: a.id, status: a.status, deadlineAt: a.deadlineAt.toISOString(), submittedAt: a.submittedAt?.toISOString() ?? null, score: show && a.score !== null ? Number(a.score) : null, maxScore: show && a.maxScore !== null ? Number(a.maxScore) : null } : null,
        };
      });
    });
  }

  // ------------------------------------------------------------------ live monitor
  async live(u: AuthUser, id: string) {
    requireTenant(u);
    return this.db.run(dbCtx(u), async (tx) => {
      const [t] = await tx.select().from(tests).where(eq(tests.id, id));
      if (!t) throw notFound('Test');
      const assigned = await tx.select().from(testAssignments).where(eq(testAssignments.testId, id));
      const batchIds = assigned.filter((a) => a.batchId).map((a) => a.batchId!);
      const fromBatches = batchIds.length ? await tx.select({ userId: batchMembers.userId }).from(batchMembers).where(inArray(batchMembers.batchId, batchIds)) : [];
      const all = await tx.select().from(attempts).where(eq(attempts.testId, id));
      const userIds = [...new Set([...assigned.filter((a) => a.userId).map((a) => a.userId!), ...fromBatches.map((b) => b.userId), ...all.map((a) => a.userId)])];
      const people = userIds.length ? await tx.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, userIds)) : [];
      const attemptIds = all.map((a) => a.id);
      const pending = attemptIds.length
        ? await tx.select().from(attemptSessions).where(and(inArray(attemptSessions.attemptId, attemptIds), eq(attemptSessions.status, 'pending'))).orderBy(asc(attemptSessions.createdAt))
        : [];
      // Latest flagged (counted or high-severity) event per attempt.
      const flags = attemptIds.length
        ? await tx
            .selectDistinctOn([proctorEvents.attemptId], { attemptId: proctorEvents.attemptId, type: proctorEvents.type, at: proctorEvents.serverTs })
            .from(proctorEvents)
            .where(and(inArray(proctorEvents.attemptId, attemptIds), sql`(${proctorEvents.counted} OR ${proctorEvents.severity} = 'high')`))
            .orderBy(proctorEvents.attemptId, desc(proctorEvents.serverTs))
        : [];
      const qCount = (await tx.select({ n: sql<number>`count(*)::int` }).from(testQuestions).where(eq(testQuestions.testId, id)))[0]?.n ?? 0;
      const now = Date.now();
      const rows = people
        .map((p) => {
          const a = all.find((x) => x.userId === p.id);
          const flag = a ? flags.find((f) => f.attemptId === a.id) : undefined;
          return {
            userId: p.id, name: p.name, email: p.email,
            attempt: a
              ? {
                  id: a.id, status: a.status, startedAt: a.startedAt.toISOString(), deadlineAt: a.deadlineAt.toISOString(), submittedAt: a.submittedAt?.toISOString() ?? null,
                  submitReason: a.submitReason, score: a.score === null ? null : Number(a.score), maxScore: a.maxScore === null ? null : Number(a.maxScore),
                  answered: Object.values(a.breakdown ?? {}).filter((b) => b.submissions > 0).length, violationCount: a.violationCount, warningLevel: a.warningLevel,
                  extraMinutes: a.extraMinutes, lastHeartbeatAt: a.lastHeartbeatAt?.toISOString() ?? null,
                  online: a.status === 'in_progress' && !!a.lastHeartbeatAt && now - a.lastHeartbeatAt.getTime() < ONLINE_MS,
                  heartbeatGap: a.heartbeatGapOpen,
                  lastFlag: flag ? { type: flag.type, label: EVENT_RULES[flag.type]?.label ?? flag.type, at: flag.at.toISOString() } : null,
                  pendingDevices: pending.filter((s) => s.attemptId === a.id).map((s) => ({ id: s.id, createdAt: s.createdAt.toISOString(), ip: s.ip, userAgent: s.userAgent, fingerprint: s.fingerprint })),
                }
              : null,
          };
        })
        .sort((x, y) => x.name.localeCompare(y.name));
      return {
        test: { id: t.id, title: t.title, status: t.status, startsAt: t.startsAt.toISOString(), endsAt: t.endsAt.toISOString(), durationMin: t.durationMin, questionCount: qCount, settings: settingsOf(t) },
        serverNow: new Date(now).toISOString(),
        rows,
      };
    });
  }

  pingMonitor(testId: string, attemptId: string | null, userId: string | null) {
    return this.rt.publish(`monitor:${testId}`, { type: 'attempt_changed', attemptId, userId });
  }
}
