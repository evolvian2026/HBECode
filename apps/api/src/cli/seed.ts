/**
 * Seed a fresh database:
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD   super admin (required)
 *   SEED_DEMO_PASSWORD                       if set, also creates "Demo University" with a
 *                                            client admin, teacher, associate and student
 * Seed questions are inserted as drafts and queued for validation with publish-on-success, so
 * nothing is published until the real sandbox has run every reference solution on every test.
 * Idempotent: existing users/questions are left alone.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { memberships, questions, questionVersions, tenants, users } from '@hbe/db';
import { sumArray } from '@hbe/db/seed';
import { and, eq, isNull } from 'drizzle-orm';
import { AppModule } from '../app.module.js';
import { PasswordService } from '../auth/password.service.js';
import type { AuthUser } from '../common/decorators.js';
import { DbService } from '../infra/infra.module.js';
import { QuestionsService } from '../questions/questions.service.js';

const SEED_QUESTIONS = [sumArray];

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
  for (const [role, email] of [['client_admin', 'admin@demo.edu'], ['teacher', 'teacher@demo.edu'], ['associate', 'ta@demo.edu'], ['student', 'student@demo.edu']] as const) {
    const id = await ensureUser(email, `Demo ${role.replace('_', ' ')}`, p);
    await db.system((tx) => tx.insert(memberships).values({ userId: id, tenantId, role }).onConflictDoNothing());
  }
}

const admin: AuthUser = { id: adminId, role: 'super_admin', tenantId: null, sessionId: 'seed', mfa: true, mfaSetupRequired: false };
const meta = { ip: '127.0.0.1', userAgent: 'seed', requestId: 'seed' };
for (const q of SEED_QUESTIONS) {
  const existing = await db.system(async (tx) => {
    const rows = await tx
      .select({ id: questions.id, status: questions.status })
      .from(questions)
      .innerJoin(questionVersions, eq(questionVersions.id, questions.latestVersionId))
      .where(and(isNull(questions.tenantId), eq(questionVersions.title, q.title)))
      .limit(1);
    return rows[0];
  });
  if (existing?.status === 'published') {
    console.log(`"${q.title}": already published`);
    continue;
  }
  let id = existing?.id;
  if (!id) {
    try {
      id = (await qs.create(admin, { ...q, global: true }, meta)).id;
    } catch (e) {
      console.log(`skipped "${q.title}": ${(e as Error).message}`);
      continue;
    }
  }
  const v = await qs.validate(admin, id, true, meta);
  console.log(`"${q.title}": ${v.status}${v.problems.length ? ` (${v.problems.join('; ')})` : ' — publishes automatically once an executor validates it'}`);
}
await app.close();
