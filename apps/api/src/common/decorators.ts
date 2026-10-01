import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Permission, Role } from '@hbe/shared';
import type { FastifyRequest } from 'fastify';

export const PUBLIC = 'hbe:public';
export const PERMISSION = 'hbe:permission';
export const ROLES_META = 'hbe:roles';
export const ALLOW_MFA_SETUP = 'hbe:allow-mfa-setup';
export const INTERNAL = 'hbe:internal';

/** No session required (login, health). CSRF/Origin checks still apply to unsafe methods. */
export const Public = () => SetMetadata(PUBLIC, true);
/** Executor endpoints: bearer token, no cookies, no CSRF. */
export const Internal = () => SetMetadata(INTERNAL, true);
export const RequirePermission = (p: Permission) => SetMetadata(PERMISSION, p);
export const RequireRoles = (...roles: Role[]) => SetMetadata(ROLES_META, roles);
/** Reachable while an admin still has to enrol MFA. */
export const AllowDuringMfaSetup = () => SetMetadata(ALLOW_MFA_SETUP, true);

export interface AuthUser {
  id: string;
  role: Role;
  tenantId: string | null;
  sessionId: string;
  mfa: boolean;
  mfaSetupRequired: boolean;
}

export interface RequestMeta {
  ip: string;
  userAgent: string;
  requestId: string;
}

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
  return req.user!;
});

export const Meta = createParamDecorator((_d: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  return { ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300), requestId: String(req.id) };
});

export function dbCtx(u: AuthUser) {
  return { role: u.role, tenantId: u.tenantId, userId: u.id };
}
