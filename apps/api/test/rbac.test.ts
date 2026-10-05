import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sumArray } from '../../../packages/db/src/seed/questions/sum-array.js';
import { enrollMfa, PASSWORD, seedOrg, systemQuery, type Org } from './fixtures.js';
import { Client, startApp, type TestApp } from './harness.js';

let t: TestApp;
let org: Org;
const as: Record<string, Client> = {};

beforeAll(async () => {
  t = await startApp();
  org = await seedOrg(t);
  for (const k of ['clientAdminA', 'teacherA', 'associateA', 'studentA', 'clientAdminB', 'teacherB'] as const) {
    as[k] = new Client(t);
    await as[k].login(org.users[k].email, PASSWORD);
    if (k.startsWith('clientAdmin')) await enrollMfa(as[k]);
  }
});
afterAll(async () => {
  await t?.close();
});

const small = { ...sumArray, title: 'RBAC probe question', hidden: sumArray.hidden.slice(0, 10) };

describe('question authoring is limited to teachers (and super admins)', () => {
  it.each(['studentA', 'associateA', 'clientAdminA'])('%s cannot create questions', async (who) => {
    expect((await as[who]!.post('/api/v1/questions', small)).statusCode).toBe(403);
  });
  it('teacher can create; the question belongs to their tenant only', async () => {
    const r = await as.teacherA!.post('/api/v1/questions', small);
    expect(r.statusCode).toBe(201);
    const id = r.json().id as string;
    expect((await as.teacherA!.get(`/api/v1/questions/${id}`)).statusCode).toBe(200);
    // Another tenant's teacher cannot see, edit or delete it — and gets 404, not 403.
    expect((await as.teacherB!.get(`/api/v1/questions/${id}`)).statusCode).toBe(404);
    expect((await as.teacherB!.put(`/api/v1/questions/${id}`, small)).statusCode).toBe(404);
    expect((await as.teacherB!.del(`/api/v1/questions/${id}`)).statusCode).toBe(404);
    // Associates read hidden tests but never drivers or solutions.
    const ta = (await as.associateA!.get(`/api/v1/questions/${id}`)).json();
    expect(ta.question.hidden.length).toBe(10);
    expect(JSON.stringify(ta.question.templates)).not.toContain('"driver"');
    expect(JSON.stringify(ta.question.templates)).not.toContain('"solution"');
  });
  it('teachers cannot create global questions', async () => {
    expect((await as.teacherA!.post('/api/v1/questions', { ...small, title: 'global attempt', global: true })).statusCode).toBe(403);
  });
  it('duplicate questions are rejected', async () => {
    expect((await as.teacherA!.post('/api/v1/questions', small)).statusCode).toBe(409);
  });
});

describe('user management', () => {
  it('client admin invites a student who then signs in', async () => {
    const r = await as.clientAdminA!.post('/api/v1/users', { email: 'new.student@alpha.edu', name: 'New Student', role: 'student' });
    expect(r.statusCode).toBe(201);
    const url = new URL(r.json().inviteUrl as string);
    const fresh = new Client(t);
    expect((await fresh.post('/api/v1/auth/accept-invite', { token: url.searchParams.get('token'), password: 'a-brand-new-passphrase' })).statusCode).toBe(204);
    // Invite links are single-use.
    expect((await fresh.post('/api/v1/auth/accept-invite', { token: url.searchParams.get('token'), password: 'another-passphrase-2' })).statusCode).toBe(400);
    expect((await fresh.login('new.student@alpha.edu', 'a-brand-new-passphrase')).user.role).toBe('student');
  });
  it('client admin cannot grant client_admin', async () => {
    expect((await as.clientAdminA!.post('/api/v1/users', { email: 'x@alpha.edu', name: 'X', role: 'client_admin' })).statusCode).toBe(403);
  });
  it('client admin cannot list or change another tenant’s users', async () => {
    expect((await as.clientAdminA!.get(`/api/v1/users?tenantId=${org.tenantB}`)).statusCode).toBe(403);
    const r = await as.clientAdminA!.patch(`/api/v1/users/${org.users.studentB.id}/membership`, { status: 'disabled' });
    expect(r.statusCode).toBe(404);
  });
  it('lists only the active tenant’s members', async () => {
    const list = (await as.clientAdminA!.get('/api/v1/users?limit=100')).json();
    const emails = list.items.map((i: { email: string }) => i.email);
    expect(emails).toContain(org.users.studentA.email);
    expect(emails).not.toContain(org.users.studentB.email);
  });
  it.each(['studentA', 'teacherA', 'associateA'])('%s cannot create users', async (who) => {
    expect((await as[who]!.post('/api/v1/users', { email: 'y@alpha.edu', name: 'Y', role: 'student' })).statusCode).toBe(403);
  });
  it('disabling a membership blocks login', async () => {
    expect((await as.clientAdminA!.patch(`/api/v1/users/${org.users.studentA2.id}/membership`, { status: 'disabled' })).statusCode).toBe(200);
    const c = new Client(t);
    expect((await c.post('/api/v1/auth/login', { email: org.users.studentA2.email, password: PASSWORD })).statusCode).toBe(403);
  });
});

describe('batches', () => {
  it('teacher creates a batch and adds own-tenant students only', async () => {
    const b = (await as.teacherA!.post('/api/v1/batches', { name: 'CSE 2026', year: 2026 })).json();
    expect((await as.teacherA!.post(`/api/v1/batches/${b.id}/members`, { userIds: [org.users.studentA.id] })).json()).toEqual({ added: 1 });
    expect((await as.teacherA!.post(`/api/v1/batches/${b.id}/members`, { userIds: [org.users.studentB.id] })).statusCode).toBe(400);
    expect((await as.teacherB!.get(`/api/v1/batches/${b.id}/members`)).statusCode).toBe(404);
    expect((await as.studentA!.post('/api/v1/batches', { name: 'hack' })).statusCode).toBe(403);
  });
});

describe('tenants', () => {
  it('only super admins manage institutions', async () => {
    expect((await as.clientAdminA!.get('/api/v1/tenants')).statusCode).toBe(403);
    expect((await as.teacherA!.post('/api/v1/tenants', { name: 'Evil', slug: 'evil' })).statusCode).toBe(403);
  });
});

describe('audit log', () => {
  it('records creates, membership changes and logins', async () => {
    const rows = await systemQuery<{ action: string }>(t, `SELECT DISTINCT action FROM hbe.audit_logs`);
    const actions = rows.map((r) => r.action);
    for (const a of ['auth.login', 'question.create', 'membership.create', 'membership.update', 'batch.create', 'batch.members_add', 'auth.invite_accepted']) {
      expect(actions).toContain(a);
    }
  });
});

describe('every route declares who may call it', () => {
  it('each handler has @Public, @Internal, @Authenticated, @RequirePermission or @RequireRoles (no silent defaults)', async () => {
    const { ModulesContainer } = await import('@nestjs/core');
    const { METHOD_METADATA, PATH_METADATA } = await import('@nestjs/common/constants.js');
    const { AUTHENTICATED, INTERNAL, PERMISSION, PUBLIC, ROLES_META } = await import('../src/common/decorators.js');
    const keys = [PUBLIC, INTERNAL, AUTHENTICATED, PERMISSION, ROLES_META];
    const missing: string[] = [];
    let routes = 0;
    for (const mod of t.app.get(ModulesContainer).values()) {
      for (const wrapper of mod.controllers.values()) {
        const cls = wrapper.metatype as (new (...a: unknown[]) => unknown) | undefined;
        if (!cls) continue;
        for (const name of Object.getOwnPropertyNames(cls.prototype)) {
          const handler = (cls.prototype as Record<string, unknown>)[name];
          if (name === 'constructor' || typeof handler !== 'function' || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
          routes++;
          const declared = keys.some((k) => Reflect.getMetadata(k, handler) !== undefined || Reflect.getMetadata(k, cls) !== undefined);
          if (!declared) missing.push(`${cls.name}.${name} (${String(Reflect.getMetadata(PATH_METADATA, handler))})`);
        }
      }
    }
    expect(routes).toBeGreaterThan(80);
    expect(missing).toEqual([]);
  });
});
