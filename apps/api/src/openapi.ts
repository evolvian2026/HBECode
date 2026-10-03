/**
 * OpenAPI 3.1 document built from the same Zod schemas the API validates with.
 * Served at GET /api/v1/openapi.json and written to docs/openapi.json by `pnpm openapi`.
 */
import {
  AcceptInviteRequest, BatchMembersRequest, ChangePasswordRequest, QuestionInput, CreateBatchRequest, CreateSubmissionRequest,
  CreateTenantRequest, CreateUserRequest, LoginRequest, MfaEnableRequest, MfaVerifyRequest, QuestionListQuery, SaveDraftRequest,
  SessionUser, SwitchTenantRequest, UpdateMembershipRequest, UpdateTenantRequest, UserListQuery,
  AssignTestRequest, ExtendRequest, HeartbeatRequest, ProctorEventsRequest, SaveAttemptDraftRequest, SnapshotRequest, StartAttemptRequest,
  TerminateRequest, TestInput, WarnRequest,
} from '@hbe/shared';
import { z } from 'zod';

type Op = { method: 'get' | 'post' | 'put' | 'patch' | 'delete'; path: string; summary: string; tag: string; auth?: 'none' | 'session'; body?: z.ZodType; query?: z.ZodObject; status?: number; perm?: string };

const ops: Op[] = [
  { method: 'get', path: '/auth/csrf', summary: 'Get a CSRF token (double-submit)', tag: 'auth', auth: 'none' },
  { method: 'post', path: '/auth/login', summary: 'Sign in (may return mfa_required)', tag: 'auth', auth: 'none', body: LoginRequest, status: 200 },
  { method: 'post', path: '/auth/mfa/verify', summary: 'Complete sign-in with a TOTP code', tag: 'auth', auth: 'none', body: MfaVerifyRequest, status: 200 },
  { method: 'post', path: '/auth/refresh', summary: 'Rotate the refresh token', tag: 'auth', auth: 'none', status: 200 },
  { method: 'post', path: '/auth/logout', summary: 'End the session', tag: 'auth', auth: 'none', status: 204 },
  { method: 'post', path: '/auth/guest', summary: 'Start a guest session (practice only)', tag: 'auth', auth: 'none', status: 200 },
  { method: 'post', path: '/auth/accept-invite', summary: 'Set a password from an invite/reset link', tag: 'auth', auth: 'none', body: AcceptInviteRequest, status: 204 },
  { method: 'get', path: '/auth/me', summary: 'Current session user', tag: 'auth' },
  { method: 'post', path: '/auth/switch-tenant', summary: 'Switch active institution', tag: 'auth', body: SwitchTenantRequest, status: 200 },
  { method: 'post', path: '/auth/password', summary: 'Change password (ends other sessions)', tag: 'auth', body: ChangePasswordRequest, status: 200 },
  { method: 'post', path: '/auth/mfa/setup', summary: 'Start TOTP enrolment', tag: 'auth', status: 200 },
  { method: 'post', path: '/auth/mfa/enable', summary: 'Confirm TOTP enrolment', tag: 'auth', body: MfaEnableRequest, status: 200 },
  { method: 'get', path: '/tenants', summary: 'List institutions', tag: 'org', perm: 'tenant:manage' },
  { method: 'post', path: '/tenants', summary: 'Create an institution', tag: 'org', perm: 'tenant:manage', body: CreateTenantRequest, status: 201 },
  { method: 'patch', path: '/tenants/{id}', summary: 'Update an institution', tag: 'org', perm: 'tenant:manage', body: UpdateTenantRequest },
  { method: 'get', path: '/users', summary: 'List members of the active institution', tag: 'org', query: UserListQuery },
  { method: 'post', path: '/users', summary: 'Invite a user', tag: 'org', perm: 'user:manage', body: CreateUserRequest, status: 201 },
  { method: 'patch', path: '/users/{id}/membership', summary: 'Change role or disable', tag: 'org', perm: 'user:manage', body: UpdateMembershipRequest },
  { method: 'post', path: '/users/{id}/reset-password', summary: 'Issue a password reset link', tag: 'org', perm: 'user:manage', status: 200 },
  { method: 'get', path: '/batches', summary: 'List batches', tag: 'org' },
  { method: 'post', path: '/batches', summary: 'Create a batch', tag: 'org', perm: 'batch:manage', body: CreateBatchRequest, status: 201 },
  { method: 'delete', path: '/batches/{id}', summary: 'Delete a batch', tag: 'org', perm: 'batch:manage', status: 204 },
  { method: 'get', path: '/batches/{id}/members', summary: 'List batch members', tag: 'org' },
  { method: 'post', path: '/batches/{id}/members', summary: 'Add students', tag: 'org', perm: 'batch:manage', body: BatchMembersRequest, status: 201 },
  { method: 'post', path: '/batches/{id}/members/remove', summary: 'Remove students', tag: 'org', perm: 'batch:manage', body: BatchMembersRequest, status: 200 },
  { method: 'get', path: '/questions', summary: 'Question bank (staff)', tag: 'questions', perm: 'question:read_full', query: QuestionListQuery },
  { method: 'post', path: '/questions', summary: 'Create a question (coding, web or db)', tag: 'questions', perm: 'question:write', body: QuestionInput, status: 201 },
  { method: 'get', path: '/questions/{id}', summary: 'Authoring view (drivers/solutions for authors only)', tag: 'questions', perm: 'question:read_full' },
  { method: 'put', path: '/questions/{id}', summary: 'Update (creates a new version if published)', tag: 'questions', perm: 'question:write', body: QuestionInput },
  { method: 'delete', path: '/questions/{id}', summary: 'Delete draft / archive published', tag: 'questions', perm: 'question:write' },
  { method: 'post', path: '/questions/{id}/validate', summary: 'Run reference solutions in the sandbox', tag: 'questions', perm: 'question:write', body: z.object({ publishIfValid: z.boolean().default(false) }), status: 202 },
  { method: 'post', path: '/questions/{id}/publish', summary: 'Publish the validated latest version', tag: 'questions', perm: 'question:write', status: 200 },
  { method: 'get', path: '/practice/questions', summary: 'Published practice questions', tag: 'practice', perm: 'practice:use' },
  { method: 'get', path: '/practice/questions/{id}', summary: 'Learner view (no hidden data)', tag: 'practice', perm: 'practice:use' },
  { method: 'post', path: '/submissions', summary: 'Run (samples/custom input) or submit (hidden tests)', tag: 'submissions', perm: 'practice:use', body: CreateSubmissionRequest, status: 202 },
  { method: 'get', path: '/submissions', summary: 'My recent submissions for a question', tag: 'submissions', query: z.object({ questionId: z.uuid() }) },
  { method: 'get', path: '/submissions/{id}', summary: 'Submission result (hidden tests: verdict only)', tag: 'submissions' },
  { method: 'get', path: '/submissions/{id}/events', summary: 'Server-Sent Events stream of status changes', tag: 'submissions' },
  { method: 'get', path: '/drafts/{questionId}', summary: 'Autosaved drafts', tag: 'submissions' },
  { method: 'put', path: '/drafts/{questionId}/{runtime}', summary: 'Autosave a draft', tag: 'submissions', body: SaveDraftRequest, status: 204 },
  { method: 'get', path: '/runtimes', summary: 'Pinned language versions', tag: 'meta', auth: 'none' },
  // Phase 4: tests, attempts, proctoring. Student attempt calls carry the device token in the
  // `x-attempt-token` header (returned by POST /tests/{id}/attempt); other devices get 409.
  { method: 'get', path: '/tests', summary: 'Tests of the active institution', tag: 'tests', perm: 'test:proctor' },
  { method: 'post', path: '/tests', summary: 'Create a draft test (window, duration, questions, proctoring settings)', tag: 'tests', perm: 'test:manage', body: TestInput, status: 201 },
  { method: 'get', path: '/tests/{id}', summary: 'Test details', tag: 'tests', perm: 'test:proctor' },
  { method: 'put', path: '/tests/{id}', summary: 'Edit a draft test', tag: 'tests', perm: 'test:manage', body: TestInput },
  { method: 'delete', path: '/tests/{id}', summary: 'Delete a draft test', tag: 'tests', perm: 'test:manage', status: 204 },
  { method: 'post', path: '/tests/{id}/assign', summary: 'Replace the assigned batches/students', tag: 'tests', perm: 'test:manage', body: AssignTestRequest },
  { method: 'post', path: '/tests/{id}/publish', summary: 'Publish (pins every question version)', tag: 'tests', perm: 'test:manage' },
  { method: 'post', path: '/tests/{id}/close', summary: 'Close now; open attempts are submitted', tag: 'tests', perm: 'test:manage' },
  { method: 'get', path: '/tests/{id}/live', summary: 'Live monitor snapshot (attempts, flags, device requests)', tag: 'tests', perm: 'test:proctor' },
  { method: 'post', path: '/tests/{id}/attempt', summary: 'Start or resume (active), or request approval for a new device (pending)', tag: 'attempts', perm: 'test:attempt', body: StartAttemptRequest },
  { method: 'get', path: '/my/tests', summary: 'Tests assigned to me, with my attempt', tag: 'attempts', perm: 'test:attempt' },
  { method: 'get', path: '/attempts/{id}', summary: 'My attempt (active device only)', tag: 'attempts', perm: 'test:attempt' },
  { method: 'get', path: '/attempts/{id}/questions/{questionId}', summary: 'Question of the test (pinned version, no hidden data)', tag: 'attempts', perm: 'test:attempt' },
  { method: 'get', path: '/attempts/{id}/drafts/{questionId}', summary: 'Autosaved drafts in this attempt', tag: 'attempts', perm: 'test:attempt' },
  { method: 'put', path: '/attempts/{id}/drafts/{questionId}/{runtime}', summary: 'Autosave (refused after the deadline)', tag: 'attempts', perm: 'test:attempt', body: SaveAttemptDraftRequest, status: 204 },
  { method: 'post', path: '/attempts/{id}/heartbeat', summary: 'Heartbeat (every 15 s); returns server time, deadline, notices', tag: 'attempts', perm: 'test:attempt', body: HeartbeatRequest },
  { method: 'post', path: '/attempts/{id}/events', summary: 'Batched proctoring events (severity decided server-side)', tag: 'attempts', perm: 'test:attempt', body: ProctorEventsRequest },
  { method: 'post', path: '/attempts/{id}/snapshots', summary: 'Webcam frame after a flagged event (tests with webcam=flagged only)', tag: 'attempts', perm: 'test:attempt', body: SnapshotRequest, status: 201 },
  { method: 'post', path: '/attempts/{id}/submit', summary: 'Finish the test (final drafts are graded)', tag: 'attempts', perm: 'test:attempt' },
  { method: 'get', path: '/attempts/{id}/timeline', summary: 'Proctoring timeline, devices, snapshots, submissions', tag: 'proctoring', perm: 'test:proctor' },
  { method: 'post', path: '/attempts/{id}/devices/{requestId}/approve', summary: 'Approve a second device (the old one is locked out)', tag: 'proctoring', perm: 'test:proctor' },
  { method: 'post', path: '/attempts/{id}/devices/{requestId}/deny', summary: 'Deny a second device', tag: 'proctoring', perm: 'test:proctor' },
  { method: 'post', path: '/attempts/{id}/warn', summary: 'Send a warning to the student', tag: 'proctoring', perm: 'test:proctor', body: WarnRequest },
  { method: 'post', path: '/attempts/{id}/extend', summary: 'Extend the deadline', tag: 'proctoring', perm: 'test:proctor', body: ExtendRequest },
  { method: 'post', path: '/attempts/{id}/terminate', summary: 'End the attempt', tag: 'proctoring', perm: 'test:proctor', body: TerminateRequest },
  // Phase 5: bulk upload and export. Uploads take the raw file as the body (application/octet-stream).
  { method: 'get', path: '/uploads/templates/{format}', summary: 'Excel or Word template (format = xlsx | docx) with instructions and examples', tag: 'uploads', perm: 'question:write' },
  { method: 'post', path: '/uploads', summary: 'Upload a question file (raw body; ?format=xlsx|docx|json&filename=); parsed in the background', tag: 'uploads', perm: 'question:write', query: z.object({ format: z.enum(['xlsx', 'docx', 'json']), filename: z.string().optional() }), status: 202 },
  { method: 'get', path: '/uploads', summary: 'Recent uploads', tag: 'uploads', perm: 'question:write' },
  { method: 'get', path: '/uploads/{id}', summary: 'Upload status and per-row preview (errors, warnings, duplicates, updates)', tag: 'uploads', perm: 'question:write' },
  { method: 'get', path: '/uploads/{id}/report', summary: 'Problem report (xlsx)', tag: 'uploads', perm: 'question:write' },
  { method: 'post', path: '/uploads/{id}/confirm', summary: 'Import the ready rows (optionally validate + publish)', tag: 'uploads', perm: 'question:write', body: z.object({ publish: z.boolean().default(false) }), status: 202 },
  { method: 'delete', path: '/uploads/{id}', summary: 'Discard an upload', tag: 'uploads', perm: 'question:write', status: 204 },
  { method: 'get', path: '/exports/questions', summary: 'Export questions with hidden tests and solutions (editable questions only; audited)', tag: 'uploads', perm: 'question:write', query: z.object({ format: z.enum(['xlsx', 'docx', 'json']), ids: z.string() }) },
  { method: 'get', path: '/reports/overview', summary: 'Institution dashboard: people, content, 30-day activity, recent tests, flagged questions', tag: 'reports', perm: 'role client_admin | teacher | associate' },
  { method: 'get', path: '/reports/tests/{id}', summary: 'Test report: summary, score distribution, per-question and per-student results, similarity summary', tag: 'reports', perm: 'role client_admin | teacher | associate' },
  { method: 'get', path: '/reports/tests/{id}/export', summary: 'Test report as CSV or Excel (audited)', tag: 'reports', perm: 'role client_admin | teacher | associate', query: z.object({ format: z.enum(['csv', 'xlsx']) }) },
  { method: 'get', path: '/reports/questions/{id}', summary: 'Question report: acceptance, solve rate, by language, verdicts, 30-day activity, tests', tag: 'reports', perm: 'role client_admin | teacher | associate' },
  { method: 'get', path: '/reports/batches/{id}', summary: 'Batch report: students × tests grid', tag: 'reports', perm: 'role client_admin | teacher | associate' },
  { method: 'get', path: '/reports/batches/{id}/export', summary: 'Batch report as CSV or Excel (audited)', tag: 'reports', perm: 'role client_admin | teacher | associate', query: z.object({ format: z.enum(['csv', 'xlsx']) }) },
  { method: 'get', path: '/reports/students/{id}', summary: 'Student progress (staff of the institution, or the student themselves)', tag: 'reports', perm: 'report:view' },
  { method: 'get', path: '/reports/me', summary: 'My progress (scores only where the test releases results)', tag: 'reports', perm: 'report:view' },
  { method: 'get', path: '/reports/platform', summary: 'Platform health: institutions, daily totals, queue depth, executors', tag: 'reports', perm: 'role super_admin' },
  { method: 'post', path: '/reports/rebuild', summary: 'Recompute all report rollups from raw data (audited)', tag: 'reports', perm: 'role super_admin' },
  { method: 'post', path: '/tests/{id}/plagiarism', summary: 'Start a code-similarity check for a test (runs in the background; audited)', tag: 'reports', perm: 'test:manage', status: 202 },
  { method: 'get', path: '/tests/{id}/plagiarism', summary: 'Latest similarity check and its flagged pairs', tag: 'reports', perm: 'test:proctor' },
  { method: 'get', path: '/plagiarism/{runId}/pairs/{questionId}/{subA}/{subB}', summary: 'Both submissions of a flagged pair with matching line ranges', tag: 'reports', perm: 'test:proctor' },
  { method: 'get', path: '/attempts/{id}/snapshots/{snapshotId}', summary: 'Webcam snapshot (image/jpeg; viewing is audited)', tag: 'proctoring', perm: 'test:proctor' },
];

const json = (s: z.ZodType) => z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' });

export function buildOpenApi(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of ops) {
    const params = [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
    if (op.query) {
      for (const [name, s] of Object.entries(op.query.shape)) params.push({ name, in: 'query', required: false, schema: json(s as z.ZodType) as { type: string } });
    }
    paths[`/api/v1${op.path}`] ??= {};
    paths[`/api/v1${op.path}`]![op.method] = {
      operationId: op.method + op.path.split('/').filter(Boolean).map((seg) => seg.replace(/[{}]/g, '').replace(/(^|-)(\w)/g, (_m, _d, c: string) => c.toUpperCase())).join(''),
      tags: [op.tag],
      summary: op.summary,
      description: op.perm ? (op.perm.startsWith('role ') ? `Requires role ${op.perm.slice(5)}.` : `Requires permission \`${op.perm}\`.`) : undefined,
      security: op.auth === 'none' ? [] : [{ session: [] }],
      parameters: params.length ? params : undefined,
      requestBody: op.body ? { required: true, content: { 'application/json': { schema: json(op.body) } } } : undefined,
      responses: {
        [String(op.status ?? 200)]: { description: 'Success' },
        default: { description: 'Error', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'HBECode API',
      version: '0.6.0',
      description:
        'Cookie-session API. Unsafe methods require the `x-csrf-token` header (from GET /auth/csrf) and an allowed Origin. Executor endpoints (/internal/executor/*) are bearer-token only and are intentionally not documented here. Realtime pushes: WebSocket at /api/v1/ws (session cookie + allowed Origin); send {"op":"sub","channel":"attempt","attemptId","token"} or {"op":"sub","channel":"monitor","testId"}.',
    },
    servers: [{ url: '/' }],
    paths,
    components: {
      securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'hb_at' } },
      schemas: {
        Problem: { type: 'object', properties: { type: { type: 'string' }, title: { type: 'string' }, status: { type: 'integer' }, detail: { type: 'string' }, requestId: { type: 'string' } } },
        SessionUser: json(SessionUser),
      },
    },
  };
}
