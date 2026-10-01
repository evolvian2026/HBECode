import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission, type Role } from '@hbe/shared';
import type { FastifyRequest } from 'fastify';
import { CONFIG, type AppConfig } from '../config.js';
import { TokenService } from '../auth/token.service.js';
import { ACCESS_COOKIE } from './cookies.js';
import { safeEqual } from './crypto.js';
import { ALLOW_MFA_SETUP, INTERNAL, PERMISSION, PUBLIC, ROLES_META, type AuthUser } from './decorators.js';
import { forbidden, unauthorized } from './errors.js';

/**
 * Global guard, deny-by-default: every route needs a valid session unless marked @Public or
 * @Internal. Permissions come from @hbe/shared/roles; tenant context comes only from the token.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser; executorToken?: string }>();

    if (this.reflector.getAllAndOverride<boolean>(INTERNAL, targets)) {
      const auth = req.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const ok = token.length >= 32 && this.cfg.executorTokens.some((t) => safeEqual(t, token));
      if (!ok) throw unauthorized('invalid executor token');
      return true;
    }

    const raw = req.cookies?.[ACCESS_COOKIE];
    const user = raw ? await this.tokens.verifyAccess(raw) : null;
    if (user) req.user = user;
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    if (!user) throw unauthorized();

    if (user.mfaSetupRequired && !this.reflector.getAllAndOverride<boolean>(ALLOW_MFA_SETUP, targets)) {
      throw forbidden('mfa_setup_required');
    }
    const perm = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION, targets);
    if (perm && !hasPermission(user.role, perm)) throw forbidden();
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_META, targets);
    if (roles && !roles.includes(user.role)) throw forbidden();
    return true;
  }
}
