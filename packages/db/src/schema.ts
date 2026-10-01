/**
 * Typed mirror of migrations/*.sql (the SQL files are authoritative — they also hold RLS).
 * `test/schema-drift.test.ts` fails if a column here does not exist in the migrated database.
 */
import {
  bigint,
  boolean,
  customType,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const hbe = pgSchema('hbe');

const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const inet = customType<{ data: string }>({ dataType: () => 'inet' });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const tenants = hbe.table('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  status: text('status').$type<'active' | 'suspended'>().notNull().default('active'),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const users = hbe.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').$type<'user' | 'guest'>().notNull().default('user'),
  email: citext('email'),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  status: text('status').$type<'invited' | 'active' | 'disabled'>().notNull().default('invited'),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: ts('locked_until'),
  mfaSecretEnc: text('mfa_secret_enc'),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  lastLoginAt: ts('last_login_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const memberships = hbe.table(
  'memberships',
  {
    userId: uuid('user_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    role: text('role').$type<'client_admin' | 'teacher' | 'associate' | 'student'>().notNull(),
    status: text('status').$type<'active' | 'disabled'>().notNull().default('active'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tenantId] })],
);

export const refreshTokens = hbe.table('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  familyId: uuid('family_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  tenantId: uuid('tenant_id'),
  expiresAt: ts('expires_at').notNull(),
  rotatedAt: ts('rotated_at'),
  revokedAt: ts('revoked_at'),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const invites = hbe.table('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  purpose: text('purpose').$type<'invite' | 'password_reset'>().notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const batches = hbe.table('batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  year: integer('year'),
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const batchMembers = hbe.table(
  'batch_members',
  {
    batchId: uuid('batch_id').notNull(),
    userId: uuid('user_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.batchId, t.userId] })],
);

export const questions = hbe.table('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  type: text('type').$type<'coding' | 'web' | 'db'>().notNull().default('coding'),
  status: text('status').$type<'draft' | 'validating' | 'invalid' | 'published' | 'archived'>().notNull().default('draft'),
  isPractice: boolean('is_practice').notNull().default(false),
  slug: text('slug').notNull(),
  latestVersionId: uuid('latest_version_id'),
  publishedVersionId: uuid('published_version_id'),
  contentHash: text('content_hash'),
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export interface ValidationReport {
  ok: boolean;
  checkedAt: string;
  problems: string[];
  /** runtime -> per-test verdict summary */
  runtimes: Record<string, { ok: boolean; maxCpuMs: number; limitMs: number; verdicts: string[]; compileOutput?: string }>;
}

export const questionVersions = hbe.table('question_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id').notNull(),
  tenantId: uuid('tenant_id'),
  versionNo: integer('version_no').notNull(),
  title: text('title').notNull(),
  statement: text('statement').notNull(),
  constraints: text('constraints').notNull().default(''),
  inputFormat: text('input_format').notNull().default(''),
  outputFormat: text('output_format').notNull().default(''),
  difficulty: text('difficulty').$type<'easy' | 'moderate' | 'hard'>().notNull(),
  tags: text('tags').array().notNull().default([]),
  timeComplexity: text('time_complexity').notNull().default(''),
  spaceComplexity: text('space_complexity').notNull().default(''),
  baseTimeLimitMs: integer('base_time_limit_ms').notNull(),
  memoryLimitMb: integer('memory_limit_mb').notNull(),
  compare: jsonb('compare').$type<{ mode: 'exact' | 'trim_trailing' | 'unordered_lines' | 'float'; epsilon?: number }>().notNull(),
  validation: jsonb('validation').$type<ValidationReport>(),
  publishedAt: ts('published_at'),
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const testCases = hbe.table('test_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  versionId: uuid('version_id').notNull(),
  tenantId: uuid('tenant_id'),
  visibility: text('visibility').$type<'sample' | 'hidden'>().notNull(),
  ordinal: integer('ordinal').notNull(),
  input: text('input').notNull(),
  expected: text('expected').notNull(),
  explanation: text('explanation').notNull().default(''),
  weight: integer('weight').notNull().default(1),
  isStress: boolean('is_stress').notNull().default(false),
});

export const languageStubs = hbe.table(
  'language_stubs',
  {
    versionId: uuid('version_id').notNull(),
    tenantId: uuid('tenant_id'),
    runtime: text('runtime').notNull(),
    stub: text('stub').notNull(),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.runtime] })],
);

export const languageSecrets = hbe.table(
  'language_secrets',
  {
    versionId: uuid('version_id').notNull(),
    tenantId: uuid('tenant_id'),
    runtime: text('runtime').notNull(),
    driver: text('driver').notNull(),
    solution: text('solution').notNull(),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.runtime] })],
);

export const submissions = hbe.table('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  userId: uuid('user_id').notNull(),
  questionId: uuid('question_id').notNull(),
  versionId: uuid('version_id').notNull(),
  runtime: text('runtime').notNull(),
  kind: text('kind').$type<'run' | 'submit' | 'validate'>().notNull(),
  priority: text('priority').$type<'run' | 'submit' | 'practice' | 'validate'>().notNull().default('practice'),
  code: text('code').notNull(),
  customInput: text('custom_input'),
  status: text('status').$type<'queued' | 'running' | 'done' | 'failed'>().notNull().default('queued'),
  verdict: text('verdict'),
  passed: integer('passed').notNull().default(0),
  total: integer('total').notNull().default(0),
  score: numeric('score', { precision: 6, scale: 2 }),
  compileOutput: text('compile_output'),
  maxCpuMs: integer('max_cpu_ms'),
  maxMemKb: integer('max_mem_kb'),
  dispatchCount: integer('dispatch_count').notNull().default(0),
  leaseUntil: ts('lease_until'),
  executorId: text('executor_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  startedAt: ts('started_at'),
  finishedAt: ts('finished_at'),
});

export const submissionResults = hbe.table(
  'submission_results',
  {
    submissionId: uuid('submission_id').notNull(),
    tenantId: uuid('tenant_id'),
    ordinal: integer('ordinal').notNull(),
    testCaseId: uuid('test_case_id'),
    hidden: boolean('hidden').notNull(),
    verdict: text('verdict').notNull(),
    cpuMs: integer('cpu_ms').notNull(),
    wallMs: integer('wall_ms').notNull(),
    memKb: integer('mem_kb').notNull(),
    stdout: text('stdout'),
    stderr: text('stderr'),
  },
  (t) => [primaryKey({ columns: [t.submissionId, t.ordinal] })],
);

export const drafts = hbe.table(
  'drafts',
  {
    userId: uuid('user_id').notNull(),
    questionId: uuid('question_id').notNull(),
    runtime: text('runtime').notNull(),
    tenantId: uuid('tenant_id'),
    code: text('code').notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.questionId, t.runtime] })],
);

export const auditLogs = hbe.table('audit_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid('tenant_id'),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  requestId: text('request_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const allTables = {
  tenants,
  users,
  memberships,
  refreshTokens,
  invites,
  batches,
  batchMembers,
  questions,
  questionVersions,
  testCases,
  languageStubs,
  languageSecrets,
  submissions,
  submissionResults,
  drafts,
  auditLogs,
};
