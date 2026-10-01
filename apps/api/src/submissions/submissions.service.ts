import { Injectable } from '@nestjs/common';
import { drafts, languageStubs, questions, questionVersions, submissionResults, submissions, testCases } from '@hbe/db';
import { hasPermission, MAX_SOURCE_BYTES, RUNTIME_IDS, WebFiles, type ClientSubmission, type CreateSubmissionRequest, type Verdict } from '@hbe/shared';
import { dbSpec, expectedOf, questionType, webCheckOf, webSpec } from '../questions/question-types.js';
import { and, asc, desc, eq } from 'drizzle-orm';
import { dbCtx, type AuthUser } from '../common/decorators.js';
import { badRequest, notFound } from '../common/errors.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { DispatchService, type Priority } from '../executor/dispatch.service.js';
import { DbService } from '../infra/infra.module.js';

/** Per-user limits (per minute). Guests share a stricter budget. */
const LIMITS = {
  run: Number(process.env.RATE_LIMIT_RUN_PER_MIN ?? 30),
  submit: Number(process.env.RATE_LIMIT_SUBMIT_PER_MIN ?? 10),
  guest: Number(process.env.RATE_LIMIT_GUEST_PER_MIN ?? 10),
};

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly db: DbService,
    private readonly dispatch: DispatchService,
    private readonly limits: RateLimitService,
  ) {}

  async create(u: AuthUser, body: CreateSubmissionRequest): Promise<{ id: string }> {
    if (body.customInput !== undefined && body.kind !== 'run') throw badRequest('customInput is only allowed for run');
    if (u.role === 'guest') await this.limits.enforce(`sub:guest:${u.id}`, LIMITS.guest, 60);
    await this.limits.enforce(`sub:${body.kind}:${u.id}`, LIMITS[body.kind], 60);

    const staff = hasPermission(u.role, 'question:read_full');
    const id = await this.db.run(dbCtx(u), async (tx) => {
      // RLS decides visibility: learners only see published practice questions.
      const [q] = await tx.select().from(questions).where(eq(questions.id, body.questionId));
      if (!q) throw notFound('Question');
      const versionId = q.publishedVersionId ?? (staff ? q.latestVersionId : null);
      if (!versionId) throw notFound('Question');
      const [v] = await tx.select({ spec: questionVersions.spec }).from(questionVersions).where(eq(questionVersions.id, versionId));
      const type = questionType(v!);
      if (type !== 'coding' && body.customInput !== undefined) throw badRequest('Custom input is only available for coding questions.');
      if (type === 'coding' && (!(RUNTIME_IDS as readonly string[]).includes(body.runtime) || Buffer.byteLength(body.code) > MAX_SOURCE_BYTES)) {
        throw badRequest('Choose a programming language; code is limited to 64 KB.');
      }
      if (type === 'web') {
        if (body.runtime !== webSpec(v!).framework) throw badRequest('Wrong framework for this question.');
        let files: unknown;
        try {
          files = JSON.parse(body.code);
        } catch {
          throw badRequest('Web submissions are a JSON array of files.');
        }
        const r = WebFiles.safeParse(files);
        if (!r.success) throw badRequest(`Invalid files: ${r.error.issues[0]?.message ?? 'bad format'}`);
      }
      if (type === 'db') {
        if (!dbSpec(v!).dialects.includes(body.runtime as never)) throw badRequest(`${body.runtime} is not available for this question`);
        if (Buffer.byteLength(body.code) > MAX_SOURCE_BYTES) throw badRequest('Queries are limited to 64 KB.');
      }
      const [stub] = await tx.select().from(languageStubs).where(and(eq(languageStubs.versionId, versionId), eq(languageStubs.runtime, body.runtime)));
      if (!stub) throw badRequest(`${body.runtime} is not available for this question`);
      const priority: Priority = u.role === 'guest' ? 'practice' : body.kind;
      const [s] = await tx
        .insert(submissions)
        .values({
          tenantId: u.tenantId, userId: u.id, questionId: q.id, versionId, runtime: body.runtime, kind: body.kind, priority,
          code: body.code, customInput: body.kind === 'run' ? (body.customInput ?? null) : null,
        })
        .returning({ id: submissions.id, priority: submissions.priority });
      return s!;
    });
    // Enqueue after commit so the executor's claim can see the row.
    await this.dispatch.enqueue(id.priority, id.id);
    return { id: id.id };
  }

  /** What a viewer may see. Hidden tests expose the verdict only — never input, output or timing. */
  async get(u: AuthUser, id: string): Promise<ClientSubmission> {
    return this.db.run(dbCtx(u), async (tx) => {
      const [s] = await tx.select().from(submissions).where(eq(submissions.id, id));
      if (!s || s.kind === 'validate') throw notFound('Submission');
      const results = await tx.select().from(submissionResults).where(eq(submissionResults.submissionId, id)).orderBy(asc(submissionResults.ordinal));
      // Sample inputs/expected outputs are already visible to the student in the statement.
      const samples = s.kind === 'run' && s.customInput !== null
        ? []
        : await tx
            .select({ id: testCases.id, input: testCases.input, expected: testCases.expected, spec: testCases.spec })
            .from(testCases)
            .where(and(eq(testCases.versionId, s.versionId), eq(testCases.visibility, 'sample')));
      const sampleById = new Map(samples.map((t) => [t.id, t]));
      const [v] = await tx.select({ spec: questionVersions.spec }).from(questionVersions).where(eq(questionVersions.id, s.versionId));
      const type = v ? questionType(v) : 'coding';
      return {
        id: s.id,
        questionId: s.questionId,
        runtime: s.runtime,
        kind: s.kind as 'run' | 'submit',
        status: s.status,
        verdict: (s.verdict as Verdict | null) ?? null,
        passed: s.passed,
        total: s.total,
        score: s.score === null ? null : Number(s.score),
        compileOutput: s.compileOutput,
        tests: results.map((r) => {
          if (r.hidden) return { ordinal: r.ordinal, hidden: true, verdict: r.verdict as Verdict };
          const tc = r.testCaseId ? sampleById.get(r.testCaseId) : undefined;
          const common = { ordinal: r.ordinal, hidden: false, verdict: r.verdict as Verdict, cpuMs: r.cpuMs, memKb: r.memKb, stdout: r.stdout ?? '', stderr: r.stderr ?? '', detail: r.detail ?? undefined };
          if (type === 'web') return { ...common, title: tc ? webCheckOf(tc).title : undefined };
          if (type === 'db') return { ...common, result: r.result ?? undefined, expectedResult: tc ? expectedOf(tc)[s.runtime as never] : undefined };
          return { ...common, input: tc?.input ?? (s.customInput ?? undefined), expected: tc?.expected };
        }),
        createdAt: s.createdAt.toISOString(),
        finishedAt: s.finishedAt?.toISOString() ?? null,
      };
    });
  }

  list(u: AuthUser, questionId: string) {
    return this.db.run(dbCtx(u), (tx) =>
      tx
        .select({ id: submissions.id, kind: submissions.kind, runtime: submissions.runtime, status: submissions.status, verdict: submissions.verdict, passed: submissions.passed, total: submissions.total, score: submissions.score, createdAt: submissions.createdAt })
        .from(submissions)
        .where(and(eq(submissions.userId, u.id), eq(submissions.questionId, questionId)))
        .orderBy(desc(submissions.createdAt))
        .limit(20),
    );
  }

  // ------------------------------------------------------------------ drafts (debounced autosave)
  async saveDraft(u: AuthUser, questionId: string, runtime: string, code: string) {
    await this.limits.enforce(`draft:${u.id}`, 120, 60);
    await this.db.run(dbCtx(u), async (tx) => {
      const [q] = await tx.select({ id: questions.id }).from(questions).where(eq(questions.id, questionId));
      if (!q) throw notFound('Question');
      await tx
        .insert(drafts)
        .values({ userId: u.id, questionId, runtime, tenantId: u.tenantId, code })
        .onConflictDoUpdate({ target: [drafts.userId, drafts.questionId, drafts.runtime], set: { code, updatedAt: new Date() } });
    });
  }

  getDrafts(u: AuthUser, questionId: string) {
    return this.db.run(dbCtx(u), (tx) =>
      tx.select({ runtime: drafts.runtime, code: drafts.code, updatedAt: drafts.updatedAt }).from(drafts).where(and(eq(drafts.userId, u.id), eq(drafts.questionId, questionId))),
    );
  }
}
