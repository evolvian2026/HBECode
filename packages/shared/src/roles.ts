/**
 * Roles and permissions. This is the single source of truth for RBAC; the API guard and
 * the web UI both read from here. Postgres RLS enforces tenant boundaries independently.
 */
export const ROLES = ['super_admin', 'client_admin', 'teacher', 'associate', 'student', 'guest'] as const;
export type Role = (typeof ROLES)[number];

/** Roles that exist as tenant memberships (super_admin and guest are not tenant roles). */
export const TENANT_ROLES = ['client_admin', 'teacher', 'associate', 'student'] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const PERMISSIONS = [
  'tenant:manage', // create/update/delete institutions
  'user:manage', // create/update users and memberships within scope
  'batch:manage', // create batches, add/remove members
  'question:read_full', // see hidden tests (authors/associates) — never drivers/solutions unless also question:write
  'question:write', // create/edit/delete/publish questions; read drivers + solutions
  'submission:read_any', // read other users' submissions within scope
  'practice:use', // practice compiler + published practice questions
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  client_admin: ['user:manage', 'batch:manage', 'submission:read_any', 'practice:use', 'audit:read'],
  teacher: ['batch:manage', 'question:read_full', 'question:write', 'submission:read_any', 'practice:use'],
  associate: ['question:read_full', 'submission:read_any', 'practice:use'],
  student: ['practice:use'],
  guest: ['practice:use'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** Roles that must have MFA enrolled before they can do anything else. */
export const MFA_REQUIRED_ROLES: readonly Role[] = ['super_admin', 'client_admin'];

/** Which tenant roles a given role may grant. Super admin may grant any tenant role. */
export function grantableRoles(role: Role): readonly TenantRole[] {
  if (role === 'super_admin') return TENANT_ROLES;
  if (role === 'client_admin') return ['teacher', 'associate', 'student'];
  return [];
}
