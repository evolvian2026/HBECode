import { Inject, Injectable, Logger } from '@nestjs/common';
import { invites, memberships, refreshTokens, tenants, users, type Tx } from '@hbe/db';
import { MFA_REQUIRED_ROLES, type Role, type SessionUser } from '@hbe/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { CONFIG, type AppConfig } from '../config.js';
import { AuditService } from '../common/audit.service.js';
import { decrypt, encrypt, randomToken, sha256 } from '../common/crypto.js';
import type { AuthUser, RequestMeta } from '../common/decorators.js';
import { badRequest, forbidden, unauthorized } from '../common/errors.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { DbService, REDIS } from '../infra/infra.module.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { newTotpSecret, otpauthUri, verifyTotp } from './totp.js';

const LOCK_AFTER = 10;
const LOCK_MINUTES = 15;
const BAD_LOGIN = 'Invalid email or password.';

export interface IssuedSession {
  user: SessionUser;
  access: string;
  refresh: string;
}

type UserRow = typeof users.$inferSelect;

@Injectable()
export class AuthService {
  private readonly log = new Logger('AuthService');
  private readonly mfaKey: Buffer;

  constructor(
    private readonly db: DbService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly limits: RateLimitService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {
    if (cfg.MFA_ENCRYPTION_KEY) {
      this.mfaKey = Buffer.from(cfg.MFA_ENCRYPTION_KEY, 'base64');
      if (this.mfaKey.length !== 32) throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes (base64)');
    } else {
      this.log.warn('MFA_ENCRYPTION_KEY not set: using a development key');
      this.mfaKey = Buffer.from(sha256('hbe-dev-only-mfa-key'), 'hex');
    }
  }

  // ------------------------------------------------------------------ sessions
  /** Role + tenant for a user: platform admins have no tenant; others use an active membership. */
  private async resolveRole(tx: Tx, user: UserRow, preferredTenant?: string | null): Promise<{ role: Role; tenantId: string | null } | null> {
    if (user.kind === 'guest') return { role: 'guest', tenantId: null };
    if (user.isPlatformAdmin) return { role: 'super_admin', tenantId: null };
    const rows = await tx
      .select({ tenantId: memberships.tenantId, role: memberships.role, tenantStatus: tenants.status })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(and(eq(memberships.userId, user.id), eq(memberships.status, 'active')))
      .orderBy(asc(memberships.createdAt));
    const active = rows.filter((r) => r.tenantStatus === 'active');
    const pick = active.find((r) => r.tenantId === preferredTenant) ?? active[0];
    return pick ? { role: pick.role, tenantId: pick.tenantId } : null;
  }

  async sessionUser(tx: Tx, user: UserRow, role: Role, tenantId: string | null): Promise<SessionUser> {
    const ms =
      user.kind === 'guest'
        ? []
        : await tx
            .select({ tenantId: memberships.tenantId, tenantName: tenants.name, role: memberships.role })
            .from(memberships)
            .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
            .where(and(eq(memberships.userId, user.id), eq(memberships.status, 'active')));
    return {
      id: user.id,
      email: user.email ?? '',
      name: user.name,
      role,
      tenantId,
      tenantName: ms.find((m) => m.tenantId === tenantId)?.tenantName ?? null,
      mfaEnabled: user.mfaEnabled,
      mfaSetupRequired: MFA_REQUIRED_ROLES.includes(role) && !user.mfaEnabled,
      memberships: ms,
    };
  }

  private async issue(tx: Tx, user: UserRow, role: Role, tenantId: string | null, mfa: boolean, meta: RequestMeta, familyId?: string): Promise<IssuedSession> {
    const { raw, familyId: sid } = await this.tokens.issueRefresh(tx, { userId: user.id, tenantId, familyId, mfa, ip: meta.ip, userAgent: meta.userAgent });
    const su = await this.sessionUser(tx, user, role, tenantId);
    const access = await this.tokens.signAccess({ sub: user.id, role, tid: tenantId, sid, mfa, msr: su.mfaSetupRequired });
    return { user: su, access, refresh: raw };
  }

  // ------------------------------------------------------------------ login
  async login(email: string, password: string, meta: RequestMeta): Promise<{ mfaToken: string } | IssuedSession> {
    await this.limits.enforce(`login:ip:${meta.ip}`, 30, 300);
    await this.limits.enforce(`login:email:${sha256(email)}`, 20, 900);

    // Failure paths return instead of throwing so the failed-attempt counter and the audit
    // entry commit; the error is raised after the transaction.
    const r = await this.db.system(async (tx): Promise<{ mfaToken: string } | IssuedSession | { fail: Error }> => {
      const [user] = await tx.select().from(users).where(and(eq(users.email, email), eq(users.kind, 'user')));
      if (!user || !user.passwordHash) {
        await this.passwords.burn(password);
        await this.audit.record(tx, { tenantId: null, actorId: null, action: 'auth.login_failed', data: { reason: 'unknown_email' } }, meta);
        return { fail: unauthorized(BAD_LOGIN) };
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        await this.passwords.burn(password);
        await this.audit.record(tx, { tenantId: null, actorId: user.id, action: 'auth.login_failed', data: { reason: 'locked' } }, meta);
        return { fail: unauthorized(BAD_LOGIN) };
      }
      const ok = await this.passwords.verify(user.passwordHash, password);
      if (!ok) {
        const failed = user.failedLogins + 1;
        const lock = failed >= LOCK_AFTER;
        await tx
          .update(users)
          .set({ failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil })
          .where(eq(users.id, user.id));
        await this.audit.record(tx, { tenantId: null, actorId: user.id, action: lock ? 'auth.account_locked' : 'auth.login_failed', data: { reason: 'bad_password', failed } }, meta);
        return { fail: unauthorized(BAD_LOGIN) };
      }
      if (user.status !== 'active') return { fail: unauthorized(BAD_LOGIN) };
      const rr = await this.resolveRole(tx, user);
      if (!rr) return { fail: forbidden('Your account has no active institution membership.') };

      const updates: Partial<UserRow> = { failedLogins: 0, lockedUntil: null };
      if (this.passwords.needsRehash(user.passwordHash)) updates.passwordHash = await this.passwords.hash(password);
      await tx.update(users).set(updates).where(eq(users.id, user.id));

      if (user.mfaEnabled) {
        await this.audit.record(tx, { tenantId: rr.tenantId, actorId: user.id, action: 'auth.password_ok_mfa_pending' }, meta);
        return { mfaToken: await this.tokens.signMfaChallenge(user.id) };
      }
      await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      await this.audit.record(tx, { tenantId: rr.tenantId, actorId: user.id, action: 'auth.login', data: { role: rr.role, mfa: false } }, meta);
      return this.issue(tx, user, rr.role, rr.tenantId, false, meta);
    });
    if ('fail' in r) throw r.fail;
    return r;
  }

  private async checkTotp(userId: string, secretEnc: string, code: string): Promise<boolean> {
    await this.limits.enforce(`mfa:${userId}`, 6, 300);
    const step = verifyTotp(decrypt(this.mfaKey, secretEnc), code);
    if (step === null) return false;
    // Each code is single-use: remember the last accepted step.
    const ok = await this.redis.set(`totp-used:${userId}:${step}`, '1', 'EX', 120, 'NX');
    return ok === 'OK';
  }

  async verifyMfa(mfaToken: string, code: string, meta: RequestMeta): Promise<IssuedSession> {
    const userId = await this.tokens.verifyMfaChallenge(mfaToken);
    if (!userId) throw unauthorized('MFA challenge expired. Sign in again.');
    const r = await this.db.system(async (tx): Promise<IssuedSession | { fail: Error }> => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      if (!user?.mfaEnabled || !user.mfaSecretEnc || user.status !== 'active') return { fail: unauthorized() };
      if (!(await this.checkTotp(user.id, user.mfaSecretEnc, code))) {
        await this.audit.record(tx, { tenantId: null, actorId: user.id, action: 'auth.mfa_failed' }, meta);
        return { fail: unauthorized('Invalid code.') };
      }
      const rr = await this.resolveRole(tx, user);
      if (!rr) return { fail: forbidden('Your account has no active institution membership.') };
      await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      await this.audit.record(tx, { tenantId: rr.tenantId, actorId: user.id, action: 'auth.login', data: { role: rr.role, mfa: true } }, meta);
      return this.issue(tx, user, rr.role, rr.tenantId, true, meta);
    });
    if ('fail' in r) throw r.fail;
    return r;
  }

  // ------------------------------------------------------------------ refresh / logout
  async refresh(raw: string | undefined, meta: RequestMeta): Promise<IssuedSession> {
    if (!raw) throw unauthorized();
    await this.limits.enforce(`refresh:ip:${meta.ip}`, 120, 60);
    const result = await this.db.system(async (tx) => {
      const [row] = await tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(raw))).for('update');
      if (!row || row.revokedAt || row.expiresAt < new Date()) return { error: 'invalid' as const };
      if (row.rotatedAt) {
        // A rotated token was presented again: assume theft and end the whole session family.
        await this.tokens.revokeFamily(tx, row.familyId);
        await this.audit.record(tx, { tenantId: row.tenantId, actorId: row.userId, action: 'auth.refresh_reuse_detected', entityId: row.familyId }, meta);
        return { error: 'reuse' as const };
      }
      await tx.update(refreshTokens).set({ rotatedAt: new Date() }).where(eq(refreshTokens.id, row.id));
      const [user] = await tx.select().from(users).where(eq(users.id, row.userId));
      if (!user || user.status !== 'active') {
        await this.tokens.revokeFamily(tx, row.familyId);
        return { error: 'invalid' as const };
      }
      const rr = await this.resolveRole(tx, user, row.tenantId);
      if (!rr || rr.tenantId !== row.tenantId) {
        await this.tokens.revokeFamily(tx, row.familyId);
        return { error: 'invalid' as const };
      }
      return { session: await this.issue(tx, user, rr.role, rr.tenantId, row.mfa, meta, row.familyId) };
    });
    if ('error' in result) throw unauthorized();
    return result.session!;
  }

  async logout(user: AuthUser | undefined, rawRefresh: string | undefined, meta: RequestMeta): Promise<void> {
    await this.db.system(async (tx) => {
      let familyId = user?.sessionId;
      if (!familyId && rawRefresh) {
        const [row] = await tx.select({ familyId: refreshTokens.familyId }).from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(rawRefresh)));
        familyId = row?.familyId;
      }
      if (familyId) await this.tokens.revokeFamily(tx, familyId);
      if (user) await this.audit.record(tx, { tenantId: user.tenantId, actorId: user.id, action: 'auth.logout' }, meta);
    });
  }

  async me(u: AuthUser): Promise<SessionUser> {
    return this.db.system(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, u.id));
      if (!user) throw unauthorized();
      return this.sessionUser(tx, user, u.role, u.tenantId);
    });
  }

  async switchTenant(u: AuthUser, tenantId: string, meta: RequestMeta): Promise<IssuedSession> {
    return this.db.system(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, u.id));
      if (!user) throw unauthorized();
      const rr = await this.resolveRole(tx, user, tenantId);
      if (!rr || rr.tenantId !== tenantId) throw forbidden('You are not a member of that institution.');
      await this.tokens.revokeFamily(tx, u.sessionId);
      await this.audit.record(tx, { tenantId, actorId: u.id, action: 'auth.switch_tenant' }, meta);
      return this.issue(tx, user, rr.role, rr.tenantId, u.mfa, meta);
    });
  }

  // ------------------------------------------------------------------ guest
  async guest(meta: RequestMeta): Promise<IssuedSession> {
    await this.limits.enforce(`guest:ip:${meta.ip}`, 5, 3600);
    return this.db.system(async (tx) => {
      const [user] = await tx.insert(users).values({ kind: 'guest', name: 'Guest', status: 'active' }).returning();
      await this.audit.record(tx, { tenantId: null, actorId: user!.id, action: 'auth.guest_created' }, meta);
      return this.issue(tx, user!, 'guest', null, false, meta);
    });
  }

  // ------------------------------------------------------------------ invites & passwords
  async createInvite(tx: Tx, userId: string, purpose: 'invite' | 'password_reset'): Promise<string> {
    const raw = randomToken(32);
    await tx.insert(invites).values({ userId, tokenHash: sha256(raw), purpose, expiresAt: new Date(Date.now() + (purpose === 'invite' ? 72 : 2) * 3_600_000) });
    return `${this.cfg.WEB_URL}/accept-invite?token=${raw}`;
  }

  async acceptInvite(token: string, password: string, meta: RequestMeta): Promise<void> {
    await this.limits.enforce(`invite:ip:${meta.ip}`, 20, 3600);
    await this.db.system(async (tx) => {
      const [inv] = await tx
        .select()
        .from(invites)
        .where(and(eq(invites.tokenHash, sha256(token)), isNull(invites.usedAt)))
        .for('update');
      if (!inv || inv.expiresAt < new Date()) throw badRequest('This link is invalid or has expired.');
      await tx.update(invites).set({ usedAt: new Date() }).where(eq(invites.id, inv.id));
      await tx
        .update(users)
        .set({ passwordHash: await this.passwords.hash(password), status: 'active', failedLogins: 0, lockedUntil: null })
        .where(eq(users.id, inv.userId));
      // A password change ends every existing session.
      const fams = await tx.selectDistinct({ f: refreshTokens.familyId }).from(refreshTokens).where(and(eq(refreshTokens.userId, inv.userId), isNull(refreshTokens.revokedAt)));
      for (const f of fams) await this.tokens.revokeFamily(tx, f.f);
      await this.audit.record(tx, { tenantId: null, actorId: inv.userId, action: inv.purpose === 'invite' ? 'auth.invite_accepted' : 'auth.password_reset' }, meta);
    });
  }

  async changePassword(u: AuthUser, current: string, next: string, meta: RequestMeta): Promise<IssuedSession> {
    return this.db.system(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, u.id));
      if (!user?.passwordHash || !(await this.passwords.verify(user.passwordHash, current))) throw badRequest('Current password is incorrect.');
      await tx.update(users).set({ passwordHash: await this.passwords.hash(next) }).where(eq(users.id, u.id));
      const fams = await tx.selectDistinct({ f: refreshTokens.familyId }).from(refreshTokens).where(and(eq(refreshTokens.userId, u.id), isNull(refreshTokens.revokedAt)));
      for (const f of fams) await this.tokens.revokeFamily(tx, f.f);
      await this.audit.record(tx, { tenantId: u.tenantId, actorId: u.id, action: 'auth.password_changed' }, meta);
      return this.issue(tx, { ...user }, u.role, u.tenantId, u.mfa, meta);
    });
  }

  // ------------------------------------------------------------------ MFA enrolment
  async mfaSetup(u: AuthUser): Promise<{ secret: string; otpauthUri: string }> {
    return this.db.system(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, u.id));
      if (!user || user.kind === 'guest') throw forbidden();
      if (user.mfaEnabled) throw badRequest('MFA is already enabled.');
      const secret = newTotpSecret();
      await tx.update(users).set({ mfaSecretEnc: encrypt(this.mfaKey, secret) }).where(eq(users.id, u.id));
      return { secret, otpauthUri: otpauthUri(secret, user.email ?? user.id) };
    });
  }

  async mfaEnable(u: AuthUser, code: string, meta: RequestMeta): Promise<IssuedSession> {
    return this.db.system(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, u.id));
      if (!user?.mfaSecretEnc || user.mfaEnabled) throw badRequest('Start MFA setup first.');
      if (!(await this.checkTotp(user.id, user.mfaSecretEnc, code))) throw badRequest('Invalid code.');
      await tx.update(users).set({ mfaEnabled: true }).where(eq(users.id, u.id));
      await this.audit.record(tx, { tenantId: u.tenantId, actorId: u.id, action: 'auth.mfa_enabled' }, meta);
      await this.tokens.revokeFamily(tx, u.sessionId);
      return this.issue(tx, { ...user, mfaEnabled: true }, u.role, u.tenantId, true, meta);
    });
  }
}
