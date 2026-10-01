import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { refreshTokens, type Tx } from '@hbe/db';
import { ROLES, type Role } from '@hbe/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { importPKCS8, jwtVerify, SignJWT, type CryptoKey, type KeyObject } from 'jose';
import { createPublicKey, createPrivateKey } from 'node:crypto';
import { CONFIG, type AppConfig } from '../config.js';
import { randomToken, sha256 } from '../common/crypto.js';
import type { AuthUser } from '../common/decorators.js';
import { REDIS } from '../infra/infra.module.js';

export interface AccessClaims {
  sub: string;
  role: Role;
  tid: string | null;
  sid: string;
  mfa: boolean;
  msr: boolean;
}

@Injectable()
export class TokenService implements OnModuleInit {
  private readonly log = new Logger('TokenService');
  private privateKey!: CryptoKey | KeyObject;
  private publicKey!: KeyObject;

  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onModuleInit() {
    let pem = this.cfg.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!pem) {
      this.log.warn('JWT_PRIVATE_KEY not set: using an ephemeral key (sessions end when the process restarts)');
      pem = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    }
    this.privateKey = await importPKCS8(pem, 'ES256');
    this.publicKey = createPublicKey(createPrivateKey(pem));
  }

  signAccess(c: AccessClaims): Promise<string> {
    return new SignJWT({ role: c.role, tid: c.tid, sid: c.sid, mfa: c.mfa, msr: c.msr, typ: 'access' })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(c.sub)
      .setIssuer(this.cfg.JWT_ISSUER)
      .setAudience('hbe-api')
      .setIssuedAt()
      .setExpirationTime(`${this.cfg.ACCESS_TOKEN_TTL_SEC}s`)
      .sign(this.privateKey);
  }

  async verifyAccess(token: string): Promise<AuthUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, { issuer: this.cfg.JWT_ISSUER, audience: 'hbe-api', algorithms: ['ES256'] });
      if (payload.typ !== 'access' || typeof payload.sub !== 'string' || !ROLES.includes(payload.role as Role)) return null;
      const sid = String(payload.sid);
      if (await this.redis.exists(`revoked-sid:${sid}`)) return null;
      return {
        id: payload.sub,
        role: payload.role as Role,
        tenantId: (payload.tid as string | null) ?? null,
        sessionId: sid,
        mfa: payload.mfa === true,
        mfaSetupRequired: payload.msr === true,
      };
    } catch {
      return null;
    }
  }

  signMfaChallenge(userId: string): Promise<string> {
    return new SignJWT({ typ: 'mfa' })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(userId)
      .setIssuer(this.cfg.JWT_ISSUER)
      .setAudience('hbe-mfa')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(this.privateKey);
  }

  async verifyMfaChallenge(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, { issuer: this.cfg.JWT_ISSUER, audience: 'hbe-mfa', algorithms: ['ES256'] });
      return payload.typ === 'mfa' && typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }

  /** New refresh token in a (new or existing) family. Returns the raw token for the cookie. */
  async issueRefresh(tx: Tx, p: { userId: string; tenantId: string | null; familyId?: string; mfa: boolean; ip?: string; userAgent?: string }) {
    const raw = randomToken(32);
    const familyId = p.familyId ?? randomUUID();
    await tx.insert(refreshTokens).values({
      userId: p.userId,
      familyId,
      tokenHash: sha256(raw),
      tenantId: p.tenantId,
      mfa: p.mfa,
      expiresAt: new Date(Date.now() + this.cfg.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      ip: p.ip || null,
      userAgent: p.userAgent?.slice(0, 300),
    });
    return { raw, familyId };
  }

  /** Revoke a whole session family (logout, reuse detection, password change). */
  async revokeFamily(tx: Tx, familyId: string): Promise<void> {
    await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
    await this.redis.set(`revoked-sid:${familyId}`, '1', 'EX', this.cfg.ACCESS_TOKEN_TTL_SEC + 60);
  }
}
