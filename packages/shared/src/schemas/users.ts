import { z } from 'zod';
import { Email, Slug, Uuid } from './common.js';
import { TENANT_ROLES } from '../roles.js';

export const CreateTenantRequest = z.object({
  name: z.string().trim().min(2).max(200),
  slug: Slug,
});
export const UpdateTenantRequest = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

export const CreateUserRequest = z.object({
  email: Email,
  name: z.string().trim().min(1).max(200),
  role: z.enum(TENANT_ROLES),
  /** Super admin only: which tenant. Others always use their active tenant. */
  tenantId: Uuid.optional(),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequest>;

export const UpdateMembershipRequest = z.object({
  role: z.enum(TENANT_ROLES).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

export const UserListQuery = z.object({
  q: z.string().max(100).optional(),
  role: z.enum(TENANT_ROLES).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const CreateBatchRequest = z.object({
  name: z.string().trim().min(1).max(200),
  year: z.number().int().min(2000).max(2100).optional(),
});
export const BatchMembersRequest = z.object({ userIds: z.array(Uuid).min(1).max(500) });
