import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { batches, batchMembers, memberships, tenants, users } from '@hbe/db';
import { grantableRoles, type CreateUserRequest, type Page, type TenantRole } from '@hbe/shared';
import { and, desc, eq, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import { AuthService } from '../auth/auth.service.js';
import { AuditService } from '../common/audit.service.js';
import { dbCtx, type AuthUser, type RequestMeta } from '../common/decorators.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { Mailer, pagination } from '../common/mailer.js';
import { DbService } from '../infra/infra.module.js';

export interface UserListItem {
  id: string;
  email: string | null;
  name: string;
  role: TenantRole;
  status: string;
  membershipStatus: string;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

@Injectable()
export class OrgService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly mailer: Mailer,
  ) {}

  // ------------------------------------------------------------ tenants (super admin)
  listTenants(u: AuthUser) {
    return this.db.run(dbCtx(u), (tx) => tx.select().from(tenants).orderBy(desc(tenants.createdAt)).limit(500));
  }

  createTenant(u: AuthUser, body: { name: string; slug: string }, meta: RequestMeta) {
    return this.db.run(dbCtx(u), async (tx) => {
      const [t] = await tx.insert(tenants).values(body).returning();
      await this.audit.record(tx, { tenantId: t!.id, actorId: u.id, action: 'tenant.create', entityType: 'tenant', entityId: t!.id, data: body }, meta);
      return t!;
    });
  }

  updateTenant(u: AuthUser, id: string, body: { name?: string; status?: 'active' | 'suspended' }, meta: RequestMeta) {
    return this.db.run(dbCtx(u), async (tx) => {
      const [t] = await tx.update(tenants).set(body).where(eq(tenants.id, id)).returning();
      if (!t) throw notFound('Institution');
      await this.audit.record(tx, { tenantId: id, actorId: u.id, action: 'tenant.update', entityType: 'tenant', entityId: id, data: body }, meta);
      return t;
    });
  }

  // ------------------------------------------------------------ users
  private scopeTenant(u: AuthUser, requested?: string): string {
    if (u.role === 'super_admin') {
      if (!requested) throw badRequest('tenantId is required for super admins');
      return requested;
    }
    if (!u.tenantId) throw forbidden();
    if (requested && requested !== u.tenantId) throw forbidden();
    return u.tenantId;
  }

  async listUsers(u: AuthUser, q: { q?: string; role?: TenantRole; cursor?: string; limit: number; tenantId?: string }): Promise<Page<UserListItem>> {
    const tenantId = this.scopeTenant(u, q.tenantId);
    const cur = pagination.decode(q.cursor);
    return this.db.run(dbCtx(u), async (tx) => {
      const rows = await tx
        .select({
          id: users.id, email: users.email, name: users.name, status: users.status, lockedUntil: users.lockedUntil,
          lastLoginAt: users.lastLoginAt, role: memberships.role, membershipStatus: memberships.status, createdAt: memberships.createdAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.tenantId, tenantId),
            q.role ? eq(memberships.role, q.role) : undefined,
            q.q ? or(ilike(users.name, `%${q.q.replace(/[%_\\]/g, '\\$&')}%`), ilike(users.email, `%${q.q.replace(/[%_\\]/g, '\\$&')}%`)) : undefined,
            cur ? or(lt(memberships.createdAt, cur.createdAt), and(eq(memberships.createdAt, cur.createdAt), lt(users.id, cur.id))) : undefined,
          ),
        )
        .orderBy(desc(memberships.createdAt), desc(users.id))
        .limit(q.limit + 1);
      const items = rows.slice(0, q.limit).map((r) => ({
        ...r,
        lockedUntil: r.lockedUntil?.toISOString() ?? null,
        lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }));
      const last = rows[q.limit - 1];
      return { items, nextCursor: rows.length > q.limit && last ? pagination.encode(last.createdAt, last.id) : null };
    });
  }

  /**
   * Create a user in the active tenant (or attach an existing account) and send an invite link.
   * RLS forbids reading users outside your tenant, so the email lookup runs in system context
   * and returns only the id.
   */
  async createUser(u: AuthUser, body: CreateUserRequest, meta: RequestMeta): Promise<{ id: string; inviteUrl: string | null }> {
    const tenantId = this.scopeTenant(u, body.tenantId);
    if (!grantableRoles(u.role).includes(body.role)) throw forbidden(`You cannot grant the ${body.role} role.`);
    const existing = await this.db.system(async (tx) => {
      const [row] = await tx.select({ id: users.id, status: users.status }).from(users).where(eq(users.email, body.email));
      return row;
    });
    const created = await this.db.run(dbCtx(u), async (tx) => {
      let userId = existing?.id;
      if (!userId) {
        userId = randomUUID();
        // No RETURNING: the creator cannot SELECT the row until the membership exists.
        await tx.insert(users).values({ id: userId, email: body.email, name: body.name, status: 'invited' });
      }
      const [dup] = await tx.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)));
      if (dup) throw conflict('This user is already a member of the institution.');
      await tx.insert(memberships).values({ userId, tenantId, role: body.role });
      await this.audit.record(tx, { tenantId, actorId: u.id, action: 'membership.create', entityType: 'user', entityId: userId, data: { role: body.role, email: body.email } }, meta);
      return { userId, needsInvite: !existing || existing.status === 'invited' };
    });
    // After commit: invite rows are system-only and reference the user row created above.
    let inviteUrl: string | null = null;
    if (created.needsInvite) {
      inviteUrl = await this.db.system((stx) => this.auth.createInvite(stx, created.userId, 'invite'));
      await this.mailer.send(body.email, 'You have been invited to HBECode', `Set your password: ${inviteUrl}`);
    }
    return { id: created.userId, inviteUrl };
  }

  async updateMembership(u: AuthUser, userId: string, body: { role?: TenantRole; status?: 'active' | 'disabled' }, meta: RequestMeta, tenantIdParam?: string) {
    const tenantId = this.scopeTenant(u, tenantIdParam);
    if (body.role && !grantableRoles(u.role).includes(body.role)) throw forbidden(`You cannot grant the ${body.role} role.`);
    if (userId === u.id) throw badRequest('You cannot change your own membership.');
    return this.db.run(dbCtx(u), async (tx) => {
      const [before] = await tx.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)));
      if (!before) throw notFound('User');
      if (!grantableRoles(u.role).includes(before.role)) throw forbidden();
      const [m] = await tx.update(memberships).set(body).where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId))).returning();
      await this.audit.record(tx, { tenantId, actorId: u.id, action: 'membership.update', entityType: 'user', entityId: userId, data: { before: { role: before.role, status: before.status }, after: body } }, meta);
      return m;
    });
  }

  async resetPassword(u: AuthUser, userId: string, meta: RequestMeta, tenantIdParam?: string): Promise<{ resetUrl: string }> {
    const tenantId = this.scopeTenant(u, tenantIdParam);
    const target = await this.db.run(dbCtx(u), async (tx) => {
      const [row] = await tx
        .select({ id: users.id, email: users.email, role: memberships.role })
        .from(users)
        .innerJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.tenantId, tenantId)))
        .where(eq(users.id, userId));
      if (!row) throw notFound('User');
      if (!grantableRoles(u.role).includes(row.role)) throw forbidden();
      await this.audit.record(tx, { tenantId, actorId: u.id, action: 'user.password_reset_issued', entityType: 'user', entityId: userId }, meta);
      return row;
    });
    const resetUrl = await this.db.system(async (tx) => {
      await tx.update(users).set({ lockedUntil: null, failedLogins: 0 }).where(eq(users.id, userId));
      return this.auth.createInvite(tx, userId, 'password_reset');
    });
    await this.mailer.send(target.email ?? '', 'Reset your HBECode password', resetUrl);
    return { resetUrl };
  }

  // ------------------------------------------------------------ batches
  listBatches(u: AuthUser) {
    if (!u.tenantId) throw forbidden();
    return this.db.run(dbCtx(u), (tx) =>
      tx
        .select({ id: batches.id, name: batches.name, year: batches.year, createdAt: batches.createdAt, members: sql<number>`(select count(*)::int from hbe.batch_members bm where bm.batch_id = ${batches.id})` })
        .from(batches)
        .where(eq(batches.tenantId, u.tenantId!))
        .orderBy(desc(batches.createdAt)),
    );
  }

  createBatch(u: AuthUser, body: { name: string; year?: number }, meta: RequestMeta) {
    if (!u.tenantId) throw forbidden();
    return this.db.run(dbCtx(u), async (tx) => {
      const [b] = await tx.insert(batches).values({ ...body, tenantId: u.tenantId!, createdBy: u.id }).returning();
      await this.audit.record(tx, { tenantId: u.tenantId, actorId: u.id, action: 'batch.create', entityType: 'batch', entityId: b!.id, data: body }, meta);
      return b!;
    });
  }

  deleteBatch(u: AuthUser, id: string, meta: RequestMeta) {
    return this.db.run(dbCtx(u), async (tx) => {
      const r = await tx.delete(batches).where(eq(batches.id, id)).returning({ id: batches.id });
      if (r.length === 0) throw notFound('Batch');
      await this.audit.record(tx, { tenantId: u.tenantId, actorId: u.id, action: 'batch.delete', entityType: 'batch', entityId: id }, meta);
    });
  }

  addBatchMembers(u: AuthUser, batchId: string, userIds: string[], meta: RequestMeta) {
    return this.db.run(dbCtx(u), async (tx) => {
      const [b] = await tx.select().from(batches).where(eq(batches.id, batchId));
      if (!b) throw notFound('Batch');
      const students = await tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.tenantId, b.tenantId), eq(memberships.role, 'student'), inArray(memberships.userId, userIds)));
      if (students.length !== new Set(userIds).size) throw badRequest('Every member must be a student of this institution.');
      await tx.insert(batchMembers).values(students.map((s) => ({ batchId, userId: s.userId, tenantId: b.tenantId }))).onConflictDoNothing();
      await this.audit.record(tx, { tenantId: b.tenantId, actorId: u.id, action: 'batch.members_add', entityType: 'batch', entityId: batchId, data: { count: students.length } }, meta);
      return { added: students.length };
    });
  }

  removeBatchMembers(u: AuthUser, batchId: string, userIds: string[], meta: RequestMeta) {
    return this.db.run(dbCtx(u), async (tx) => {
      const r = await tx.delete(batchMembers).where(and(eq(batchMembers.batchId, batchId), inArray(batchMembers.userId, userIds))).returning();
      await this.audit.record(tx, { tenantId: u.tenantId, actorId: u.id, action: 'batch.members_remove', entityType: 'batch', entityId: batchId, data: { count: r.length } }, meta);
      return { removed: r.length };
    });
  }

  listBatchMembers(u: AuthUser, batchId: string) {
    return this.db.run(dbCtx(u), async (tx) => {
      const [b] = await tx.select().from(batches).where(eq(batches.id, batchId));
      if (!b) throw notFound('Batch');
      return tx
        .select({ id: users.id, name: users.name, email: users.email })
        .from(batchMembers)
        .innerJoin(users, eq(users.id, batchMembers.userId))
        .where(eq(batchMembers.batchId, batchId))
        .orderBy(users.name);
    });
  }
}
