/**
 * Seed a fresh database:
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD   super admin (required)
 *   SEED_DEMO_PASSWORD                       if set, also creates "Demo University" with a
 *                                            client admin, teacher, associate and student
 * The seed bank (17 stacks × 10 questions) is inserted into the global bank as drafts and queued
 * for validation with publish-on-success, so nothing is published until the real sandbox has run
 * every reference solution on every test. Idempotent: users and published questions are left
 * alone; an unpublished seed question is updated to the current bank content and re-validated.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { memberships, questions, questionVersions, tenants, users } from '@hbe/db';
import { BANK_QUESTIONS } from '@hbe/db/seed';
import { and, eq, isNull } from 'drizzle-orm';
import { AppModule } from '../app.module.js';
import { PasswordService } from '../auth/password.service.js';
import type { AuthUser } from '../common/decorators.js';
import { DbService } from '../infra/infra.module.js';
import { QuestionsService } from '../questions/questions.service.js';


const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (!adminEmail || !adminPassword || adminPassword.length < 12) {
  console.error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (>= 12 chars) are required');
  process.exit(1);
}

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
const db = app.get(DbService);
const pw = app.get(PasswordService);
await pw.onModuleInit();
const qs = app.get(QuestionsService);

async function ensureUser(email: string, name: string, password: string, platformAdmin = false): Promise<string> {
  return db.system(async (tx) => {
    const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (u) return u.id;
    const [n] = await tx.insert(users).values({ email, name, passwordHash: await pw.hash(password), status: 'active', isPlatformAdmin: platformAdmin }).returning({ id: users.id });
    console.log(`created ${platformAdmin ? 'super admin' : 'user'} ${email}`);
    return n!.id;
  });
}

const adminId = await ensureUser(adminEmail, 'Platform Admin', adminPassword, true);

if (process.env.SEED_DEMO_PASSWORD) {
  const p = process.env.SEED_DEMO_PASSWORD;
  const tenantId = await db.system(async (tx) => {
    const [t] = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, 'demo'));
    if (t) return t.id;
    const [n] = await tx.insert(tenants).values({ name: 'Demo University', slug: 'demo' }).returning({ id: tenants.id });
    return n!.id;
  });
  for (const [role, email, name] of [
    ['client_admin', 'admin@demo.edu', 'Demo client admin'], ['teacher', 'teacher@demo.edu', 'Demo teacher'], ['associate', 'ta@demo.edu', 'Demo associate'],
    ['student', 'student@demo.edu', 'Demo student'], ['student', 'student2@demo.edu', 'Demo student 2'],
  ] as const) {
    const id = await ensureUser(email, name, p);
    await db.system((tx) => tx.insert(memberships).values({ userId: id, tenantId, role }).onConflictDoNothing());
  }
}

const admin: AuthUser = { id: adminId, role: 'super_admin', tenantId: null, sessionId: 'seed', mfa: true, mfaSetupRequired: false };
const meta = { ip: '127.0.0.1', userAgent: 'seed', requestId: 'seed' };
let queued = 0;
for (const { question: q } of BANK_QUESTIONS) {
  const existing = await db.system(async (tx) => {
    const rows = await tx
      .select({ id: questions.id, status: questions.status })
      .from(questions)
      .innerJoin(questionVersions, eq(questionVersions.id, questions.latestVersionId))
      .where(and(isNull(questions.tenantId), eq(questionVersions.title, q.title)))
      .limit(1);
    return rows[0];
  });
  if (existing?.status === 'published') continue;
  let id = existing?.id;
  try {
    if (id) await qs.update(admin, id, { ...q, global: true }, meta);
    else id = (await qs.create(admin, { ...q, global: true }, meta)).id;
  } catch (e) {
    console.log(`skipped "${q.title}": ${(e as Error).message}`);
    continue;
  }
  const v = await qs.validate(admin, id, true, meta);
  if (v.problems.length) console.log(`"${q.title}": ${v.status} (${v.problems.join('; ')})`);
  else queued++;
}
console.log(`${BANK_QUESTIONS.length} seed questions: ${queued} queued for validation (they publish automatically once an executor validates them); the rest were already published`);
await app.close();
