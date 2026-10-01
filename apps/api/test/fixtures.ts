import { randomUUID } from 'node:crypto';
import { memberships, SYSTEM, tenants, users, withContext } from '@hbe/db';
import argon2 from 'argon2';
import { currentStep, totpAt } from '../src/auth/totp.js';
import type { Client, TestApp } from './harness.js';

/** Enrol TOTP for the signed-in client (required for super/client admins). Returns the secret. */
export async function enrollMfa(c: Client): Promise<string> {
  const { secret } = (await c.post('/api/v1/auth/mfa/setup')).json() as { secret: string };
  const r = await c.post('/api/v1/auth/mfa/enable', { code: totpAt(secret, currentStep()) });
  if (r.statusCode !== 200) throw new Error(`mfa enable failed: ${r.body}`);
  return secret;
}

/** Read through the app role in system context (the table owner sees nothing under FORCE RLS). */
export function systemQuery<T>(t: TestApp, text: string, params: unknown[] = []): Promise<T[]> {
  return withContext(t.db.db, SYSTEM, async (tx) => {
    const client = (tx as unknown as { session: { client: { query: (q: string, p: unknown[]) => Promise<{ rows: T[] }> } } }).session.client;
    return (await client.query(text, params)).rows;
  });
}

export const PASSWORD = 'correct horse battery staple';

export interface Org {
  tenantA: string;
  tenantB: string;
  users: Record<'admin' | 'clientAdminA' | 'teacherA' | 'associateA' | 'studentA' | 'studentA2' | 'clientAdminB' | 'teacherB' | 'studentB', { id: string; email: string }>;
}

/** Two institutions with one user per role, plus a super admin (MFA not yet enrolled). */
export async function seedOrg(t: TestApp): Promise<Org> {
  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const mk = (email: string) => ({ id: randomUUID(), email });
  const u = {
    admin: mk('root@platform.test'),
    clientAdminA: mk('admin@alpha.edu'),
    teacherA: mk('teacher@alpha.edu'),
    associateA: mk('ta@alpha.edu'),
    studentA: mk('student@alpha.edu'),
    studentA2: mk('student2@alpha.edu'),
    clientAdminB: mk('admin@beta.edu'),
    teacherB: mk('teacher@beta.edu'),
    studentB: mk('student@beta.edu'),
  };
  await withContext(t.db.db, SYSTEM, async (tx) => {
    await tx.insert(tenants).values([
      { id: tenantA, name: 'Alpha University', slug: 'alpha' },
      { id: tenantB, name: 'Beta College', slug: 'beta' },
    ]);
    await tx.insert(users).values(Object.values(u).map((x) => ({ id: x.id, email: x.email, name: x.email.split('@')[0]!, passwordHash: hash, status: 'active' as const, isPlatformAdmin: x === u.admin })));
    const m = (x: { id: string }, tenantId: string, role: 'client_admin' | 'teacher' | 'associate' | 'student') => ({ userId: x.id, tenantId, role });
    await tx.insert(memberships).values([
      m(u.clientAdminA, tenantA, 'client_admin'), m(u.teacherA, tenantA, 'teacher'), m(u.associateA, tenantA, 'associate'),
      m(u.studentA, tenantA, 'student'), m(u.studentA2, tenantA, 'student'),
      m(u.clientAdminB, tenantB, 'client_admin'), m(u.teacherB, tenantB, 'teacher'), m(u.studentB, tenantB, 'student'),
    ]);
  });
  return { tenantA, tenantB, users: u };
}
