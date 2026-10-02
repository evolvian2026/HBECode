import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  attemptDrafts,
  attempts,
  attemptSessions,
  languageStubs,
  proctorEvents,
  proctorSnapshots,
  questions,
  questionVersions,
  submissions,
  testQuestions,
  tests,
  type AttemptBreakdown,
  type Tx,
} from '@hbe/db';
import { EVENT_RULES, type AttemptNotice, type AttemptStatus, type AttemptView, type ClientEventType, type HeartbeatResponse, type StartAttemptResult } from '@hbe/shared';
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { AuditService } from '../common/audit.service.js';
import { randomToken, sha256 } from '../common/crypto.js';
import { dbCtx, type AuthUser, type RequestMeta } from '../common/decorators.js';
import { badRequest, conflict, forbidden, notFound, Problem } from '../common/errors.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { CONFIG, type AppConfig } from '../config.js';
import { DispatchService } from '../executor/dispatch.service.js';
import { DbService, REDIS } from '../infra/infra.module.js';
import { QuestionsService } from '../questions/questions.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { settingsOf, TestsService } from './tests.service.js';

type Attempt = typeof attempts.$inferSelect;
type FinalReason = 'student' | 'deadline' | 'violations' | 'proctor' | 'test_closed';

/** Requests arriving this long after the deadline (network latency) are still accepted. */
const GRACE_MS = 2_000;
/** No heartbeat for this long flags the attempt (heartbeats are sent every 15 s). */
const HEARTBEAT_GAP_MS = 45_000;
/** A counted event of the same type within this window is logged but not counted again. */
const SAME_TYPE_WINDOW_MS = 3_000;
const MAX_SNAPSHOT_BYTES = 150 * 1024;
const DEFAULT_SNAPSHOT_RETENTION_DAYS = 30;

const statusFor = (r: FinalReason): AttemptStatus => (r === 'student' ? 'submitted' : r === 'proctor' ? 'terminated' : 'auto_submitted');

/**
 * Attempt lifecycle with server-owned time and a single active device per attempt.
 *
 * Every student request on an attempt carries the device token (header `x-attempt-token`). The
 * server keeps only its sha256. A device whose token is not the active one gets 409, and a new
 * device creates a `pending` session that a proctor must approve (owner decision Q3: block).
 */
@Injectable()
export class AttemptsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Attempts');
  private sweeper?: NodeJS.Timeout;

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly dispatch: DispatchService,
    private readonly questionsSvc: QuestionsService,
    private readonly testsSvc: TestsService,
    private readonly rt: RealtimeService,
    private readonly limits: RateLimitService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {
    dispatch.onAttemptSubmissionDone((id) => this.rescore(id));
  }

  onModuleInit() {
    if (this.cfg.SWEEPER_INTERVAL_MS > 0) {
      this.sweeper = setInterval(() => void this.sweep().catch((e) => this.log.error(`attempt sweep failed: ${(e as Error).message}`)), this.cfg.SWEEPER_INTERVAL_MS);
      this.sweeper.unref();
    }
  }
  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  // ------------------------------------------------------------------ start / resume / device control
  async start(u: AuthUser, testId: string, token: string | undefined, fingerprint: string | undefined, meta: RequestMeta): Promise<StartAttemptResult> {
    if (!u.tenantId) throw forbidden();
    await this.limits.enforce(`attempt-start:${u.id}`, 20, 60);
    // RLS: the student sees only published/closed tests assigned to them.
    const found = await this.db.run(dbCtx(u), async (tx) => {
      const [t] = await tx.select().from(tests).where(eq(tests.id, testId));
      if (!t) throw notFound('Test');
      const [a] = await tx.select().from(attempts).where(and(eq(attempts.testId, testId), eq(attempts.userId, u.id)));
      return { t, a };
    });
    let { a } = found;
    const { t } = found;
    const device = { fingerprint: fingerprint ?? null, ip: meta.ip || null, userAgent: meta.userAgent || null };

    if (!a) {
      const now = Date.now();
      if (t.status !== 'published') throw conflict('This test is closed.');
      if (now < t.startsAt.getTime()) throw conflict('This test has not started yet.');
      if (now >= t.endsAt.getTime()) throw conflict('The test window has ended.');
      const deadline = new Date(Math.min(now + t.durationMin * 60_000, t.endsAt.getTime()));
      const newToken = randomToken(32);
      try {
        // Inserted as the student: RLS re-checks the assignment and published status.
        a = await this.db.run(dbCtx(u), async (tx) => {
          const [row] = await tx
            .insert(attempts)
            .values({ testId, userId: u.id, deadlineAt: deadline, activeSessionHash: sha256(newToken), ip: device.ip, userAgent: device.userAgent, lastHeartbeatAt: new Date() })
            .returning();
          return row!;
        });
      } catch (e) {
        // Two devices pressed Start at the same moment: the other one won. Fall through as a second device.
        const [existing] = await this.db.run(dbCtx(u), (tx) => tx.select().from(attempts).where(and(eq(attempts.testId, testId), eq(attempts.userId, u.id))));
        if (!existing) throw e;
        return this.secondDevice(u, existing, device, meta);
      }
      await this.db.system(async (tx) => {
        await tx.insert(attemptSessions).values({ attemptId: a!.id, tokenHash: sha256(newToken), status: 'active', ...device });
        await this.event(tx, a!.id, 'attempt_started', 'server', { deadlineAt: deadline.toISOString() });
        await this.audit.record(tx, { tenantId: u.tenantId, actorId: u.id, action: 'attempt.start', entityType: 'attempt', entityId: a!.id, data: { testId } }, meta);
      });
      await this.testsSvc.pingMonitor(testId, a.id, u.id);
      return { state: 'active', attemptId: a.id, token: newToken };
    }

    if (a.status === 'in_progress' && a.deadlineAt.getTime() + GRACE_MS < Date.now()) {
      await this.finalize(a.id, 'deadline');
      return { state: 'ended', attemptId: a.id, status: 'auto_submitted' };
    }
    if (a.status !== 'in_progress') return { state: 'ended', attemptId: a.id, status: a.status };

    if (token) {
      const hash = sha256(token);
      if (hash === a.activeSessionHash) {
        await this.db.system((tx) => this.event(tx, a!.id, 'attempt_resumed', 'server', {}));
        return { state: 'active', attemptId: a.id, token };
      }
      const [s] = await this.db.system((tx) => tx.select().from(attemptSessions).where(and(eq(attemptSessions.attemptId, a!.id), eq(attemptSessions.tokenHash, hash))));
      if (s?.status === 'pending') return { state: 'pending', attemptId: a.id, token, requestId: s.id };
      if (s?.status === 'denied') return { state: 'denied', attemptId: a.id };
    }
    return this.secondDevice(u, a, device, meta);
  }

  /** A device that is not the active one: record a pending request and tell the proctors. */
  private async secondDevice(u: AuthUser, a: Attempt, device: { fingerprint: string | null; ip: string | null; userAgent: string | null }, meta: RequestMeta): Promise<StartAttemptResult> {
    await this.limits.enforce(`attempt-device:${a.id}`, 5, 600);
    const token = randomToken(32);
    const [s] = await this.db.system(async (tx) => {
      const rows = await tx.insert(attemptSessions).values({ attemptId: a.id, tokenHash: sha256(token), status: 'pending', ...device }).returning();
      await this.event(tx, a.id, 'device_request', 'server', { requestId: rows[0]!.id, ip: device.ip ?? '', userAgent: (device.userAgent ?? '').slice(0, 200) });
      await this.audit.record(tx, { tenantId: a.tenantId, actorId: u.id, action: 'attempt.device_request', entityType: 'attempt', entityId: a.id, data: { requestId: rows[0]!.id } }, meta);
      return rows;
    });
    await this.testsSvc.pingMonitor(a.testId, a.id, a.userId);
    return { state: 'pending', attemptId: a.id, token, requestId: s!.id };
  }

  /**
   * Resolve a student request to its attempt. Only the owner's active device passes; with
   * `open`, the attempt must also be in progress and before its deadline (+ grace).
   */
  async authorize(u: AuthUser, attemptId: string, token: string | undefined, open: boolean): Promise<Attempt> {
    const [a] = await this.db.run(dbCtx(u), (tx) => tx.select().from(attempts).where(and(eq(attempts.id, attemptId), eq(attempts.userId, u.id))));
    if (!a) throw notFound('Attempt');
    const hash = token ? sha256(token) : '';
    if (!token || hash !== a.activeSessionHash) {
      // Unknown tokens (not a pending/replaced device of this attempt) are worth a flag.
      const [s] = token ? await this.db.system((tx) => tx.select({ status: attemptSessions.status }).from(attemptSessions).where(and(eq(attemptSessions.attemptId, a.id), eq(attemptSessions.tokenHash, hash)))) : [];
      if (!s && a.status === 'in_progress') {
        const fresh = await this.redis.set(`attempt-rejected:${a.id}`, '1', 'EX', 60, 'NX');
        if (fresh === 'OK') await this.db.system((tx) => this.event(tx, a.id, 'session_rejected', 'server', { reason: token ? 'unknown token' : 'missing token' }));
      }
      throw new Problem(409, 'Conflict', s?.status === 'replaced' ? 'session_replaced' : 'session_inactive');
    }
    if (open) {
      if (a.status === 'in_progress' && a.deadlineAt.getTime() + GRACE_MS < Date.now()) {
        await this.finalize(a.id, 'deadline');
        throw new Problem(409, 'Conflict', 'attempt_closed');
      }
      if (a.status !== 'in_progress') throw new Problem(409, 'Conflict', 'attempt_closed');
    }
    return a;
  }

  // ------------------------------------------------------------------ student views
  async view(u: AuthUser, attemptId: string, token: string | undefined): Promise<AttemptView> {
    const a = await this.authorize(u, attemptId, token, false);
    return this.db.run(dbCtx(u), async (tx) => {
      const [t] = await tx.select().from(tests).where(eq(tests.id, a.testId));
      if (!t) throw notFound('Test');
      const settings = settingsOf(t);
      const open = a.status === 'in_progress';
      // Titles come through RLS: while the attempt is open the student can read pinned versions.
      const qs = await tx
        .select({ questionId: testQuestions.questionId, versionId: testQuestions.versionId, ordinal: testQuestions.ordinal, points: testQuestions.points })
        .from(testQuestions)
        .where(eq(testQuestions.testId, a.testId))
        .orderBy(asc(testQuestions.ordinal));
      const versions = open && qs.length
        ? await tx.select({ id: questionVersions.id, title: questionVersions.title, difficulty: questionVersions.difficulty, spec: questionVersions.spec }).from(questionVersions).where(inArray(questionVersions.id, qs.map((q) => q.versionId!)))
        : [];
      const types = open && qs.length ? await tx.select({ id: questions.id, type: questions.type }).from(questions).where(inArray(questions.id, qs.map((q) => q.questionId))) : [];
      const show = settings.showResults || open;
      return {
        id: a.id, testId: a.testId, title: t.title, description: t.description, status: a.status, startedAt: a.startedAt.toISOString(), deadlineAt: a.deadlineAt.toISOString(),
        serverNow: new Date().toISOString(), violationCount: a.violationCount, warningLevel: a.warningLevel, settings,
        questions: qs.map((q, i) => {
          const v = versions.find((x) => x.id === q.versionId);
          const b = a.breakdown?.[q.questionId];
          return {
            questionId: q.questionId, ordinal: q.ordinal, points: Number(q.points), title: v?.title ?? `Question ${i + 1}`,
            type: types.find((x) => x.id === q.questionId)?.type ?? 'coding', difficulty: v?.difficulty ?? '',
            bestScore: show && b ? b.score : null, submissions: b?.submissions ?? 0,
          };
        }),
        score: !open && settings.showResults && a.score !== null ? Number(a.score) : null,
        maxScore: !open && settings.showResults && a.maxScore !== null ? Number(a.maxScore) : null,
        notices: await this.notices(a.id),
      };
    });
  }

  /** Learner view of a question in the test (its pinned version), under the student's RLS. */
  async question(u: AuthUser, attemptId: string, token: string | undefined, questionId: string) {
    const a = await this.authorize(u, attemptId, token, true);
    return this.db.run(dbCtx(u), async (tx) => {
      const [tq] = await tx.select().from(testQuestions).where(and(eq(testQuestions.testId, a.testId), eq(testQuestions.questionId, questionId)));
      if (!tq?.versionId) throw notFound('Question');
      const [row] = await tx.select().from(questions).where(eq(questions.id, questionId));
      if (!row) throw notFound('Question');
      const view = await this.questionsSvc.studentViewOf(tx, row, tq.versionId, false);
      return { ...view, preview: false };
    });
  }

  /** The pinned version for a question in this attempt's test (used by SubmissionsService). */
  async pinnedVersion(u: AuthUser, a: Attempt, questionId: string): Promise<string> {
    const [tq] = await this.db.run(dbCtx(u), (tx) => tx.select().from(testQuestions).where(and(eq(testQuestions.testId, a.testId), eq(testQuestions.questionId, questionId))));
    if (!tq?.versionId) throw notFound('Question');
    return tq.versionId;
  }

  async drafts(u: AuthUser, attemptId: string, token: string | undefined, questionId: string) {
    await this.authorize(u, attemptId, token, false);
    return this.db.run(dbCtx(u), (tx) =>
      tx.select({ runtime: attemptDrafts.runtime, code: attemptDrafts.code, updatedAt: attemptDrafts.updatedAt }).from(attemptDrafts).where(and(eq(attemptDrafts.attemptId, attemptId), eq(attemptDrafts.questionId, questionId))),
    );
  }

  async saveDraft(u: AuthUser, attemptId: string, token: string | undefined, questionId: string, runtime: string, code: string) {
    await this.limits.enforce(`attempt-draft:${u.id}`, 120, 60);
    const a = await this.authorize(u, attemptId, token, true);
    await this.pinnedVersion(u, a, questionId);
    // RLS also refuses the write once the deadline has passed.
    await this.db.run(dbCtx(u), (tx) =>
      tx
        .insert(attemptDrafts)
        .values({ attemptId, questionId, runtime, code })
        .onConflictDoUpdate({ target: [attemptDrafts.attemptId, attemptDrafts.questionId, attemptDrafts.runtime], set: { code, updatedAt: new Date() } }),
    );
  }

  // ------------------------------------------------------------------ heartbeat & proctoring events
  async heartbeat(u: AuthUser, attemptId: string, token: string | undefined, body: { visible: boolean; focused: boolean; fullscreen: boolean; eventsSent: number }): Promise<HeartbeatResponse> {
    await this.limits.enforce(`attempt-hb:${attemptId}`, 20, 60);
    const a = await this.authorize(u, attemptId, token, true);
    const received = Number((await this.redis.get(`attempt-events:${sha256(token!)}`)) ?? 0);
    await this.db.system(async (tx) => {
      await tx.update(attempts).set({ lastHeartbeatAt: new Date(), heartbeatGapOpen: false }).where(eq(attempts.id, a.id));
      if (a.heartbeatGapOpen) await this.event(tx, a.id, 'heartbeat_resumed', 'server', { gapSec: Math.round((Date.now() - (a.lastHeartbeatAt?.getTime() ?? Date.now())) / 1000) });
      // The client flushes its event queue before each heartbeat. If it says it sent more events
      // than we stored, something dropped or blocked them (T3: a tampered agent). Flag once.
      if (body.eventsSent > received) {
        const first = await this.redis.set(`attempt-missing:${a.id}`, '1', 'EX', 600, 'NX');
        if (first === 'OK') await this.event(tx, a.id, 'events_missing', 'server', { claimed: body.eventsSent, received });
      }
    });
    if (a.heartbeatGapOpen) await this.testsSvc.pingMonitor(a.testId, a.id, a.userId);
    return { status: a.status, deadlineAt: a.deadlineAt.toISOString(), serverNow: new Date().toISOString(), violationCount: a.violationCount, warningLevel: a.warningLevel, notices: await this.notices(a.id) };
  }

  async events(u: AuthUser, attemptId: string, token: string | undefined, events: { type: ClientEventType; clientTs: string; data?: Record<string, string | number | boolean> }[]) {
    await this.limits.enforce(`attempt-events:${attemptId}`, 60, 60);
    const a = await this.authorize(u, attemptId, token, true);
    await this.redis.incrby(`attempt-events:${sha256(token!)}`, events.length);
    await this.redis.expire(`attempt-events:${sha256(token!)}`, 86_400);
    const t = await this.testOf(a.testId);
    const policy = settingsOf(t).violations;
    const sorted = [...events].sort((x, y) => Date.parse(x.clientTs) - Date.parse(y.clientTs));
    const now = Date.now();
    let counted = 0;
    const rows: (typeof proctorEvents.$inferInsert)[] = [];
    for (const e of sorted) {
      const rule = EVENT_RULES[e.type]!;
      let isCounted = rule.counted;
      const ts = Date.parse(e.clientTs);
      // A tab switch also blurs the window: count that pair once.
      if (isCounted && e.type === 'window_blur' && sorted.some((o) => o.type === 'tab_hidden' && Math.abs(Date.parse(o.clientTs) - ts) <= 2_000)) isCounted = false;
      if (isCounted) {
        const fresh = await this.redis.set(`attempt-ev:${a.id}:${e.type}`, '1', 'PX', SAME_TYPE_WINDOW_MS, 'NX');
        if (fresh !== 'OK') isCounted = false;
      }
      if (isCounted) counted++;
      // Client clocks are untrusted: keep the claim, but only if it is plausible.
      const plausible = Number.isFinite(ts) && Math.abs(ts - now) < 86_400_000;
      rows.push({ attemptId: a.id, type: e.type, severity: rule.severity, counted: isCounted, source: 'client', clientTs: plausible ? new Date(ts) : null, data: e.data ?? {} });
    }
    const outcome = await this.db.system(async (tx) => {
      await tx.insert(proctorEvents).values(rows);
      if (!counted) return { violationCount: a.violationCount, warningLevel: a.warningLevel, autoSubmit: false, warned: false };
      const [upd] = await tx
        .update(attempts)
        .set({ violationCount: sql`${attempts.violationCount} + ${counted}` })
        .where(eq(attempts.id, a.id))
        .returning({ violationCount: attempts.violationCount, warningLevel: attempts.warningLevel });
      const vc = upd!.violationCount;
      const level = vc >= policy.finalWarnAt ? 2 : vc >= policy.warnAt ? 1 : 0;
      let warned = false;
      if (level > upd!.warningLevel) {
        await tx.update(attempts).set({ warningLevel: level }).where(eq(attempts.id, a.id));
        const left = policy.autoSubmitAt > 0 ? policy.autoSubmitAt - vc : null;
        const message = level === 2
          ? `Final warning: ${vc} proctoring violations recorded.${left !== null ? ` The test is submitted automatically after ${left} more.` : ''}`
          : `Warning: ${vc} proctoring violations recorded (leaving the test, fullscreen or clipboard use). Your proctor can see them.`;
        await this.event(tx, a.id, 'warning_issued', 'server', { level, message });
        warned = true;
      }
      return { violationCount: vc, warningLevel: Math.max(level, upd!.warningLevel), autoSubmit: policy.autoSubmitAt > 0 && vc >= policy.autoSubmitAt, warned };
    });
    if (counted) await this.rt.publish(`attempt:${a.id}`, { type: 'violations', violationCount: outcome.violationCount, warningLevel: outcome.warningLevel });
    if (outcome.warned) {
      const [n] = await this.notices(a.id);
      if (n) await this.rt.publish(`attempt:${a.id}`, { type: 'notice', notice: n });
    }
    if (outcome.autoSubmit) await this.finalize(a.id, 'violations');
    else if (counted) await this.testsSvc.pingMonitor(a.testId, a.id, a.userId);
    return { violationCount: outcome.violationCount, warningLevel: outcome.warningLevel, status: outcome.autoSubmit ? ('auto_submitted' as const) : a.status };
  }

  /** One webcam frame, only if the test enables it and a counted event happened in the last minute. */
  async snapshot(u: AuthUser, attemptId: string, token: string | undefined, body: { eventType: string; image: string }) {
    await this.limits.enforce(`attempt-snap:${attemptId}`, 10, 600);
    const a = await this.authorize(u, attemptId, token, true);
    const t = await this.testOf(a.testId);
    if (settingsOf(t).webcam !== 'flagged') throw forbidden('webcam snapshots are not enabled for this test');
    const img = Buffer.from(body.image, 'base64');
    if (img.length === 0 || img.length > MAX_SNAPSHOT_BYTES) throw badRequest('Snapshot must be a JPEG of at most 150 KB.');
    if (!(img[0] === 0xff && img[1] === 0xd8 && img[2] === 0xff)) throw badRequest('Snapshot must be a JPEG.');
    return this.db.system(async (tx) => {
      const [recent] = await tx
        .select({ id: proctorEvents.id })
        .from(proctorEvents)
        .where(and(eq(proctorEvents.attemptId, a.id), eq(proctorEvents.counted, true), gt(proctorEvents.serverTs, new Date(Date.now() - 60_000))))
        .limit(1);
      if (!recent) throw conflict('Snapshots are accepted only right after a flagged event.');
      const [s] = await tx.insert(proctorSnapshots).values({ attemptId: a.id, eventType: body.eventType, contentType: 'image/jpeg', image: img, sizeBytes: img.length }).returning({ id: proctorSnapshots.id });
      await this.event(tx, a.id, 'snapshot', 'server', { snapshotId: s!.id, eventType: body.eventType });
      return { id: s!.id };
    });
  }

  async submit(u: AuthUser, attemptId: string, token: string | undefined, meta: RequestMeta) {
    const a = await this.authorize(u, attemptId, token, false);
    if (a.status !== 'in_progress') return { status: a.status };
    const late = a.deadlineAt.getTime() + GRACE_MS < Date.now();
    await this.finalize(a.id, late ? 'deadline' : 'student', u.id, meta);
    return { status: late ? ('auto_submitted' as const) : ('submitted' as const) };
  }

  // ------------------------------------------------------------------ proctor actions (staff RLS)
  private async staffAttempt(tx: Tx, attemptId: string) {
    const [a] = await tx.select().from(attempts).where(eq(attempts.id, attemptId));
    if (!a) throw notFound('Attempt');
    return a;
  }

  async decideDevice(u: AuthUser, attemptId: string, requestId: string, approve: boolean, meta: RequestMeta) {
    const r = await this.db.run(dbCtx(u), async (tx) => {
      const a = await this.staffAttempt(tx, attemptId);
      const [s] = await tx.select().from(attemptSessions).where(and(eq(attemptSessions.id, requestId), eq(attemptSessions.attemptId, attemptId))).for('update');
      if (!s) throw notFound('Device request');
      if (s.status !== 'pending') throw conflict(`This request was already ${s.status}.`);
      if (approve && a.status !== 'in_progress') throw conflict('The attempt is no longer in progress.');
      const decided = { decidedBy: u.id, decidedAt: new Date() };
      if (approve) {
        await tx.update(attemptSessions).set({ status: 'replaced' }).where(and(eq(attemptSessions.attemptId, attemptId), eq(attemptSessions.status, 'active')));
        await tx.update(attemptSessions).set({ status: 'active', ...decided }).where(eq(attemptSessions.id, requestId));
        await tx.update(attempts).set({ activeSessionHash: s.tokenHash }).where(eq(attempts.id, attemptId));
      } else {
        await tx.update(attemptSessions).set({ status: 'denied', ...decided }).where(eq(attemptSessions.id, requestId));
      }
      await tx.insert(proctorEvents).values({ attemptId, type: approve ? 'device_approved' : 'device_denied', severity: 'info', source: 'proctor', data: { requestId, by: u.id } });
      await this.audit.record(tx, { tenantId: a.tenantId, actorId: u.id, action: approve ? 'attempt.device_approve' : 'attempt.device_deny', entityType: 'attempt', entityId: attemptId, data: { requestId } }, meta);
      return a;
    });
    if (approve) await this.rt.publish(`attempt:${attemptId}`, { type: 'session_replaced' });
    await this.testsSvc.pingMonitor(r.testId, attemptId, r.userId);
    return { status: approve ? 'approved' : 'denied' };
  }

  async warn(u: AuthUser, attemptId: string, message: string, meta: RequestMeta) {
    const r = await this.db.run(dbCtx(u), async (tx) => {
      const a = await this.staffAttempt(tx, attemptId);
      if (a.status !== 'in_progress') throw conflict('The attempt is no longer in progress.');
      const [e] = await tx.insert(proctorEvents).values({ attemptId, type: 'proctor_warn', severity: 'info', source: 'proctor', data: { message, by: u.id } }).returning();
      await this.audit.record(tx, { tenantId: a.tenantId, actorId: u.id, action: 'attempt.warn', entityType: 'attempt', entityId: attemptId, data: { message } }, meta);
      return { a, e: e! };
    });
    await this.rt.publish(`attempt:${attemptId}`, { type: 'notice', notice: { id: String(r.e.id), message, at: r.e.serverTs.toISOString() } });
    await this.testsSvc.pingMonitor(r.a.testId, attemptId, r.a.userId);
    return { ok: true };
  }

  async extend(u: AuthUser, attemptId: string, minutes: number, meta: RequestMeta) {
    const r = await this.db.run(dbCtx(u), async (tx) => {
      const a = await this.staffAttempt(tx, attemptId);
      if (a.status !== 'in_progress') throw conflict('The attempt is no longer in progress.');
      const [upd] = await tx
        .update(attempts)
        .set({ deadlineAt: sql`${attempts.deadlineAt} + make_interval(mins => ${minutes})`, extraMinutes: sql`${attempts.extraMinutes} + ${minutes}` })
        .where(eq(attempts.id, attemptId))
        .returning();
      await tx.insert(proctorEvents).values({ attemptId, type: 'time_extended', severity: 'info', source: 'proctor', data: { minutes, by: u.id, deadlineAt: upd!.deadlineAt.toISOString() } });
      await this.audit.record(tx, { tenantId: a.tenantId, actorId: u.id, action: 'attempt.extend', entityType: 'attempt', entityId: attemptId, data: { minutes } }, meta);
      return upd!;
    });
    await this.rt.publish(`attempt:${attemptId}`, { type: 'deadline', deadlineAt: r.deadlineAt.toISOString() });
    await this.testsSvc.pingMonitor(r.testId, attemptId, r.userId);
    return { deadlineAt: r.deadlineAt.toISOString() };
  }

  async terminate(u: AuthUser, attemptId: string, reason: string, meta: RequestMeta) {
    const a = await this.db.run(dbCtx(u), (tx) => this.staffAttempt(tx, attemptId));
    if (a.status !== 'in_progress') throw conflict('The attempt is no longer in progress.');
    await this.finalize(attemptId, 'proctor', u.id, meta, reason);
    return { status: 'terminated' as const };
  }

  async timeline(u: AuthUser, attemptId: string) {
    return this.db.run(dbCtx(u), async (tx) => {
      const a = await this.staffAttempt(tx, attemptId);
      const events = await tx.select().from(proctorEvents).where(eq(proctorEvents.attemptId, attemptId)).orderBy(asc(proctorEvents.serverTs), asc(proctorEvents.id)).limit(2000);
      const sessions = await tx.select().from(attemptSessions).where(eq(attemptSessions.attemptId, attemptId)).orderBy(asc(attemptSessions.createdAt));
      const snaps = await tx.select({ id: proctorSnapshots.id, eventType: proctorSnapshots.eventType, createdAt: proctorSnapshots.createdAt, sizeBytes: proctorSnapshots.sizeBytes }).from(proctorSnapshots).where(eq(proctorSnapshots.attemptId, attemptId));
      const subs = await tx
        .select({ id: submissions.id, questionId: submissions.questionId, kind: submissions.kind, runtime: submissions.runtime, status: submissions.status, verdict: submissions.verdict, score: submissions.score, createdAt: submissions.createdAt })
        .from(submissions)
        .where(eq(submissions.attemptId, attemptId))
        .orderBy(asc(submissions.createdAt));
      return {
        attempt: { id: a.id, testId: a.testId, userId: a.userId, status: a.status, startedAt: a.startedAt, deadlineAt: a.deadlineAt, submittedAt: a.submittedAt, submitReason: a.submitReason, score: a.score === null ? null : Number(a.score), maxScore: a.maxScore === null ? null : Number(a.maxScore), violationCount: a.violationCount, breakdown: a.breakdown },
        events: events.map((e) => ({ id: e.id, type: e.type, label: EVENT_RULES[e.type]?.label ?? e.type, severity: e.severity, counted: e.counted, source: e.source, clientTs: e.clientTs, serverTs: e.serverTs, data: e.data })),
        sessions: sessions.map((s) => ({ id: s.id, status: s.status, ip: s.ip, userAgent: s.userAgent, fingerprint: s.fingerprint, createdAt: s.createdAt, decidedAt: s.decidedAt })),
        snapshots: snaps,
        submissions: subs.map((s) => ({ ...s, score: s.score === null ? null : Number(s.score) })),
      };
    });
  }

  async snapshotImage(u: AuthUser, attemptId: string, snapshotId: string, meta: RequestMeta) {
    return this.db.run(dbCtx(u), async (tx) => {
      const [s] = await tx.select().from(proctorSnapshots).where(and(eq(proctorSnapshots.id, snapshotId), eq(proctorSnapshots.attemptId, attemptId)));
      if (!s) throw notFound('Snapshot');
      // Viewing personal data is itself audited.
      await this.audit.record(tx, { tenantId: s.tenantId, actorId: u.id, action: 'snapshot.view', entityType: 'attempt', entityId: attemptId, data: { snapshotId } }, meta);
      return s.image;
    });
  }

  async closeTest(u: AuthUser, testId: string, meta: RequestMeta) {
    await this.testsSvc.markClosed(u, testId, meta);
    const open = await this.db.run(dbCtx(u), (tx) => tx.select({ id: attempts.id }).from(attempts).where(and(eq(attempts.testId, testId), eq(attempts.status, 'in_progress'))));
    for (const o of open) await this.finalize(o.id, 'test_closed', u.id, meta);
    await this.testsSvc.pingMonitor(testId, null, null);
    return { status: 'closed' as const, finalized: open.length };
  }

  // ------------------------------------------------------------------ finalize & scoring (system)
  /**
   * End an attempt once. Final drafts that are newer than the last submit (and differ from the
   * starter) are submitted for grading, so nothing typed before the deadline is lost.
   */
  async finalize(attemptId: string, reason: FinalReason, actorId: string | null = null, meta?: RequestMeta, note?: string): Promise<boolean> {
    const done = await this.db.system(async (tx) => {
      const [a] = await tx.select().from(attempts).where(eq(attempts.id, attemptId)).for('update');
      if (!a || a.status !== 'in_progress') return null;
      const status = statusFor(reason);
      await tx.update(attempts).set({ status, submittedAt: new Date(), submitReason: reason }).where(eq(attempts.id, attemptId));
      const tqs = await tx.select().from(testQuestions).where(eq(testQuestions.testId, a.testId));
      const drafts = await tx.select().from(attemptDrafts).where(eq(attemptDrafts.attemptId, attemptId)).orderBy(desc(attemptDrafts.updatedAt));
      const lastSubmits = await tx
        .select({ questionId: submissions.questionId, at: sql<Date>`max(${submissions.createdAt})` })
        .from(submissions)
        .where(and(eq(submissions.attemptId, attemptId), eq(submissions.kind, 'submit')))
        .groupBy(submissions.questionId);
      const created: { id: string; priority: 'submit' }[] = [];
      for (const tq of tqs) {
        const d = drafts.find((x) => x.questionId === tq.questionId);
        if (!d || !tq.versionId) continue;
        const last = lastSubmits.find((s) => s.questionId === tq.questionId);
        if (last && new Date(last.at).getTime() >= d.updatedAt.getTime()) continue;
        const [stub] = await tx.select({ stub: languageStubs.stub }).from(languageStubs).where(and(eq(languageStubs.versionId, tq.versionId), eq(languageStubs.runtime, d.runtime)));
        if (!stub || stub.stub.trim() === d.code.trim()) continue; // untouched starter code
        const [s] = await tx
          .insert(submissions)
          .values({ tenantId: a.tenantId, userId: a.userId, questionId: tq.questionId, versionId: tq.versionId, runtime: d.runtime, kind: 'submit', priority: 'submit', code: d.code, attemptId })
          .returning({ id: submissions.id });
        created.push({ id: s!.id, priority: 'submit' });
      }
      const type = reason === 'student' ? 'attempt_submitted' : reason === 'proctor' ? 'terminated' : 'auto_submitted';
      await this.event(tx, attemptId, type, reason === 'proctor' ? 'proctor' : 'server', { reason, finalDraftsGraded: created.length, ...(note ? { note } : {}) });
      await this.audit.record(tx, { tenantId: a.tenantId, actorId, action: `attempt.${reason === 'student' ? 'submit' : reason === 'proctor' ? 'terminate' : 'auto_submit'}`, entityType: 'attempt', entityId: attemptId, data: { reason, finalDraftsGraded: created.length } }, meta);
      return { a, status, created };
    });
    if (!done) return false;
    for (const c of done.created) await this.dispatch.enqueue(c.priority, c.id);
    await this.rescore(attemptId);
    await this.rt.publish(`attempt:${attemptId}`, { type: 'ended', status: done.status });
    await this.testsSvc.pingMonitor(done.a.testId, attemptId, done.a.userId);
    return true;
  }

  /** Best submit score per question × points. Runs whenever an attempt submission finishes. */
  async rescore(attemptId: string): Promise<void> {
    const r = await this.db.system(async (tx) => {
      const [a] = await tx.select().from(attempts).where(eq(attempts.id, attemptId));
      if (!a) return null;
      const tqs = await tx.select().from(testQuestions).where(eq(testQuestions.testId, a.testId));
      const subs = await tx
        .select({ questionId: submissions.questionId, status: submissions.status, score: submissions.score })
        .from(submissions)
        .where(and(eq(submissions.attemptId, attemptId), eq(submissions.kind, 'submit')));
      const breakdown: AttemptBreakdown = {};
      let total = 0;
      let max = 0;
      for (const tq of tqs) {
        const mine = subs.filter((s) => s.questionId === tq.questionId);
        const best = Math.max(0, ...mine.filter((s) => s.status === 'done' && s.score !== null).map((s) => Number(s.score)));
        const points = Number(tq.points);
        const earned = Math.round(points * best) / 100;
        breakdown[tq.questionId] = { score: best, points, earned, submissions: mine.length };
        total += earned;
        max += points;
      }
      await tx.update(attempts).set({ breakdown, score: String(Math.round(total * 100) / 100), maxScore: String(max) }).where(eq(attempts.id, attemptId));
      return a;
    });
    if (r) await this.testsSvc.pingMonitor(r.testId, attemptId, r.userId);
  }

  /**
   * One replica at a time: auto-submit attempts past their deadline, flag missing heartbeats,
   * close tests whose window ended, and delete expired webcam snapshots.
   */
  async sweep(): Promise<{ finalized: number; gaps: number; snapshotsDeleted: number }> {
    const lock = await this.redis.set('attempt-sweeper-lock', '1', 'PX', Math.max(30_000, this.cfg.SWEEPER_INTERVAL_MS), 'NX');
    if (lock !== 'OK') return { finalized: 0, gaps: 0, snapshotsDeleted: 0 };
    try {
      return await this.sweepLocked();
    } finally {
      await this.redis.del('attempt-sweeper-lock');
    }
  }

  private async sweepLocked(): Promise<{ finalized: number; gaps: number; snapshotsDeleted: number }> {
    const now = new Date();
    const expired = await this.db.system((tx) =>
      tx.select({ id: attempts.id }).from(attempts).where(and(eq(attempts.status, 'in_progress'), lt(attempts.deadlineAt, new Date(now.getTime() - GRACE_MS)))).limit(500),
    );
    let finalized = 0;
    for (const e of expired) if (await this.finalize(e.id, 'deadline')) finalized++;

    const gaps = await this.db.system(async (tx) => {
      const rows = await tx
        .update(attempts)
        .set({ heartbeatGapOpen: true })
        .where(and(eq(attempts.status, 'in_progress'), eq(attempts.heartbeatGapOpen, false), or(lt(attempts.lastHeartbeatAt, new Date(now.getTime() - HEARTBEAT_GAP_MS)), and(isNull(attempts.lastHeartbeatAt), lt(attempts.startedAt, new Date(now.getTime() - HEARTBEAT_GAP_MS))))))
        .returning({ id: attempts.id, testId: attempts.testId, userId: attempts.userId, last: attempts.lastHeartbeatAt });
      for (const r of rows) await this.event(tx, r.id, 'heartbeat_gap', 'server', { lastHeartbeatAt: r.last?.toISOString() ?? '' });
      // Tests whose window ended and that have no open attempt left are closed.
      await tx.update(tests).set({ status: 'closed', closedAt: now }).where(and(eq(tests.status, 'published'), lt(tests.endsAt, now), sql`NOT EXISTS (SELECT 1 FROM hbe.attempts a WHERE a.test_id = ${tests.id} AND a.status = 'in_progress')`));
      return rows;
    });
    for (const g of gaps) await this.testsSvc.pingMonitor(g.testId, g.id, g.userId);

    // I6: snapshot retention per institution (settings.snapshotRetentionDays, default 30).
    const deleted = await this.db.system(async (tx) => {
      const res = await tx.execute(sql`
        DELETE FROM hbe.proctor_snapshots s USING hbe.tenants t
        WHERE t.id = s.tenant_id
          AND s.created_at < now() - make_interval(days => coalesce((t.settings->>'snapshotRetentionDays')::int, ${DEFAULT_SNAPSHOT_RETENTION_DAYS}))`);
      return res.rowCount ?? 0;
    });
    return { finalized, gaps: gaps.length, snapshotsDeleted: deleted };
  }

  // ------------------------------------------------------------------ helpers
  private async testOf(testId: string) {
    const [t] = await this.db.system((tx) => tx.select().from(tests).where(eq(tests.id, testId)));
    if (!t) throw notFound('Test');
    return t;
  }

  private async event(tx: Tx, attemptId: string, type: string, source: 'server' | 'proctor', data: Record<string, unknown>) {
    const rule = EVENT_RULES[type] ?? { severity: 'info' as const };
    await tx.insert(proctorEvents).values({ attemptId, type, severity: rule.severity, counted: false, source, data });
  }

  /** Last proctor/automatic warnings for the student (shown once; the client dedupes by id). */
  private async notices(attemptId: string): Promise<AttemptNotice[]> {
    const rows = await this.db.system((tx) =>
      tx
        .select({ id: proctorEvents.id, data: proctorEvents.data, at: proctorEvents.serverTs })
        .from(proctorEvents)
        .where(and(eq(proctorEvents.attemptId, attemptId), inArray(proctorEvents.type, ['proctor_warn', 'warning_issued'])))
        .orderBy(desc(proctorEvents.id))
        .limit(5),
    );
    return rows.map((r) => ({ id: String(r.id), message: String(r.data.message ?? ''), at: r.at.toISOString() }));
  }
}
