import { z } from 'zod';
import { Email, Password, Uuid } from './common.js';
import { ROLES } from '../roles.js';

export const LoginRequest = z.object({
  email: Email,
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const MfaVerifyRequest = z.object({
  mfaToken: z.string().min(10).max(2000),
  code: z.string().regex(/^\d{6}$/),
});

export const MfaEnableRequest = z.object({ code: z.string().regex(/^\d{6}$/) });

export const AcceptInviteRequest = z.object({
  token: z.string().min(20).max(200),
  password: Password,
});

export const ChangePasswordRequest = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: Password,
});

export const SwitchTenantRequest = z.object({ tenantId: Uuid });

export const SessionUser = z.object({
  id: Uuid,
  email: z.string(),
  name: z.string(),
  role: z.enum(ROLES),
  tenantId: Uuid.nullable(),
  tenantName: z.string().nullable(),
  mfaEnabled: z.boolean(),
  /** True when the role requires MFA and it is not yet set up: only MFA setup endpoints work. */
  mfaSetupRequired: z.boolean(),
  memberships: z.array(z.object({ tenantId: Uuid, tenantName: z.string(), role: z.enum(ROLES) })),
});
export type SessionUser = z.infer<typeof SessionUser>;

export type LoginResponse =
  | { status: 'ok'; user: SessionUser }
  | { status: 'mfa_required'; mfaToken: string };
