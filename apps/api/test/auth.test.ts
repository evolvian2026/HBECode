import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { totpAt, currentStep } from '../src/auth/totp.js';
import { PASSWORD, seedOrg, systemQuery, type Org } from './fixtures.js';
import { Client, startApp, type TestApp } from './harness.js';

let t: TestApp;
let org: Org;
beforeAll(async () => {
  t = await startApp();
  org = await seedOrg(t);
});
afterAll(async () => {
  await t?.close();
});

describe('CSRF and origin', () => {
  it('rejects unsafe requests without the double-submit token', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: org.users.studentA.email, password: PASSWORD } });
    expect(r.statusCode).toBe(403);
  });
  it('rejects a foreign Origin even with a valid token', async () => {
    const c = new Client(t);
    await c.get('/api/v1/auth/csrf').then((r) => (c.csrf = r.json().csrfToken));
    const r = await c.req('POST', '/api/v1/auth/login', { email: org.users.studentA.email, password: PASSWORD }, { origin: 'https://evil.example' });
    expect(r.statusCode).toBe(403);
  });
  it('API responses carry security headers', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/healthz' });
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('login', () => {
  it('sets httpOnly SameSite=Strict cookies and returns the session user', async () => {
    const c = new Client(t);
    const r = await c.post('/api/v1/auth/login', { email: org.users.studentA.email, password: PASSWORD });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ status: 'ok', user: { role: 'student', tenantId: org.tenantA, tenantName: 'Alpha University' } });
    const set = ([] as string[]).concat(r.headers['set-cookie'] as string[]);
    for (const name of ['hb_at', 'hb_rt']) {
      const cookie = set.find((s) => s.startsWith(`${name}=`))!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
    }
    expect((await c.get('/api/v1/auth/me')).json()).toMatchObject({ id: org.users.studentA.id, role: 'student' });
  });
  it('gives the same generic error for unknown email and wrong password', async () => {
    const c = new Client(t);
    const a = await c.post('/api/v1/auth/login', { email: 'nobody@alpha.edu', password: 'whatever-123' });
    const b = await c.post('/api/v1/auth/login', { email: org.users.studentA2.email, password: 'wrong-password-1' });
    expect([a.statusCode, b.statusCode]).toEqual([401, 401]);
    expect(a.json().detail).toBe(b.json().detail);
  });
  it('locks the account after 10 failures, even for the right password', async () => {
    const c = new Client(t);
    for (let i = 0; i < 10; i++) await c.post('/api/v1/auth/login', { email: org.users.studentB.email, password: `bad-password-${i}` });
    const r = await c.post('/api/v1/auth/login', { email: org.users.studentB.email, password: PASSWORD });
    expect(r.statusCode).toBe(401);
    const audit = await systemQuery<{ action: string }>(t, `SELECT action FROM hbe.audit_logs WHERE actor_id = $1 ORDER BY id`, [org.users.studentB.id]);
    expect(audit.map((x) => x.action)).toContain('auth.account_locked');
  });
});

describe('refresh tokens', () => {
  it('rotate on every use, and reuse of an old token revokes the whole session', async () => {
    const c = new Client(t);
    await c.login(org.users.teacherA.email, PASSWORD);
    const firstRefresh = c.cookies.get('hb_rt')!;
    expect((await c.post('/api/v1/auth/refresh')).statusCode).toBe(200);
    const secondRefresh = c.cookies.get('hb_rt')!;
    expect(secondRefresh).not.toBe(firstRefresh);
    expect((await c.get('/api/v1/auth/me')).statusCode).toBe(200);

    // An attacker replays the first (already rotated) refresh token.
    const attacker = new Client(t);
    attacker.cookies.set('hb_rt', firstRefresh);
    expect((await attacker.post('/api/v1/auth/refresh')).statusCode).toBe(401);

    // The legitimate session is now dead too: access token rejected, refresh rejected.
    expect((await c.get('/api/v1/auth/me')).statusCode).toBe(401);
    expect((await c.post('/api/v1/auth/refresh')).statusCode).toBe(401);
  });
  it('logout revokes the session immediately', async () => {
    const c = new Client(t);
    await c.login(org.users.associateA.email, PASSWORD);
    const access = c.cookies.get('hb_at')!;
    // Use the token first, so its verification is cached: revocation must still win.
    expect((await c.get('/api/v1/auth/me')).statusCode).toBe(200);
    expect((await c.post('/api/v1/auth/logout')).statusCode).toBe(204);
    const stale = new Client(t);
    stale.cookies.set('hb_at', access);
    expect((await stale.get('/api/v1/auth/me')).statusCode).toBe(401);
  });
  it('rejects tampered access tokens', async () => {
    const c = new Client(t);
    await c.login(org.users.studentA.email, PASSWORD);
    const [h, p, s] = c.cookies.get('hb_at')!.split('.');
    const claims = JSON.parse(Buffer.from(p!, 'base64url').toString());
    claims.role = 'super_admin';
    c.cookies.set('hb_at', [h, Buffer.from(JSON.stringify(claims)).toString('base64url'), s].join('.'));
    expect((await c.get('/api/v1/auth/me')).statusCode).toBe(401);
  });
});

describe('MFA for admins', () => {
  it('super admin must enrol MFA before using the platform, then logs in with a code', async () => {
    const c = new Client(t);
    const first = await c.login(org.users.admin.email, PASSWORD);
    expect(first.user.mfaSetupRequired).toBe(true);
    expect((await c.get('/api/v1/tenants')).statusCode).toBe(403);

    const setup = (await c.post('/api/v1/auth/mfa/setup')).json() as { secret: string; otpauthUri: string };
    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect((await c.post('/api/v1/auth/mfa/enable', { code: '000000' })).statusCode).toBe(400);
    const code = totpAt(setup.secret, currentStep());
    const enabled = await c.post('/api/v1/auth/mfa/enable', { code });
    expect(enabled.statusCode).toBe(200);
    expect((await c.get('/api/v1/tenants')).statusCode).toBe(200);

    // Next login needs the second factor.
    const c2 = new Client(t);
    const r = await c2.login(org.users.admin.email, PASSWORD);
    expect(r.status).toBe('mfa_required');
    expect(c2.cookies.has('hb_at')).toBe(false);
    // The code already used for enrolment cannot be replayed.
    expect((await c2.post('/api/v1/auth/mfa/verify', { mfaToken: r.mfaToken, code })).statusCode).toBe(401);
    const next = totpAt(setup.secret, currentStep() + 1);
    const ok = await c2.post('/api/v1/auth/mfa/verify', { mfaToken: r.mfaToken, code: next });
    expect(ok.statusCode).toBe(200);
    expect((await c2.get('/api/v1/tenants')).statusCode).toBe(200);
  });
});

describe('guest', () => {
  it('gets a tenant-less session that can only practice', async () => {
    const g = new Client(t);
    const r = await g.post('/api/v1/auth/guest');
    expect(r.json().user).toMatchObject({ role: 'guest', tenantId: null });
    expect((await g.get('/api/v1/practice/questions')).statusCode).toBe(200);
    expect((await g.get('/api/v1/questions')).statusCode).toBe(403);
    expect((await g.get('/api/v1/users')).statusCode).toBe(403);
  });
});
