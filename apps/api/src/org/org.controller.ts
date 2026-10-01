import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { BatchMembersRequest, CreateBatchRequest, CreateTenantRequest, CreateUserRequest, UpdateMembershipRequest, UpdateTenantRequest, UserListQuery } from '@hbe/shared';
import { z } from 'zod';
import { CurrentUser, Meta, RequirePermission, RequireRoles, type AuthUser, type RequestMeta } from '../common/decorators.js';
import { zp } from '../common/zod.pipe.js';
import { OrgService } from './org.service.js';

const TenantQuery = z.object({ tenantId: z.uuid().optional() });

@Controller('tenants')
export class TenantsController {
  constructor(private readonly org: OrgService) {}

  @RequirePermission('tenant:manage')
  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.org.listTenants(u);
  }

  @RequirePermission('tenant:manage')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body(zp(CreateTenantRequest)) body: z.infer<typeof CreateTenantRequest>, @Meta() meta: RequestMeta) {
    return this.org.createTenant(u, body, meta);
  }

  @RequirePermission('tenant:manage')
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zp(UpdateTenantRequest)) body: z.infer<typeof UpdateTenantRequest>, @Meta() meta: RequestMeta) {
    return this.org.updateTenant(u, id, body, meta);
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly org: OrgService) {}

  /** Staff can list members of their institution (teachers need this to build batches). */
  @RequireRoles('super_admin', 'client_admin', 'teacher', 'associate')
  @Get()
  list(@CurrentUser() u: AuthUser, @Query(zp(UserListQuery.extend({ tenantId: z.uuid().optional() }))) q: z.infer<typeof UserListQuery> & { tenantId?: string }) {
    return this.org.listUsers(u, q);
  }

  @RequirePermission('user:manage')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body(zp(CreateUserRequest)) body: z.infer<typeof CreateUserRequest>, @Meta() meta: RequestMeta) {
    return this.org.createUser(u, body, meta);
  }

  @RequirePermission('user:manage')
  @Patch(':id/membership')
  update(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zp(UpdateMembershipRequest)) body: z.infer<typeof UpdateMembershipRequest>,
    @Query(zp(TenantQuery)) q: z.infer<typeof TenantQuery>,
    @Meta() meta: RequestMeta,
  ) {
    return this.org.updateMembership(u, id, body, meta, q.tenantId);
  }

  @RequirePermission('user:manage')
  @Post(':id/reset-password')
  @HttpCode(200)
  reset(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query(zp(TenantQuery)) q: z.infer<typeof TenantQuery>, @Meta() meta: RequestMeta) {
    return this.org.resetPassword(u, id, meta, q.tenantId);
  }
}

@Controller('batches')
export class BatchesController {
  constructor(private readonly org: OrgService) {}

  @RequireRoles('client_admin', 'teacher', 'associate')
  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.org.listBatches(u);
  }

  @RequirePermission('batch:manage')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body(zp(CreateBatchRequest)) body: z.infer<typeof CreateBatchRequest>, @Meta() meta: RequestMeta) {
    return this.org.createBatch(u, body, meta);
  }

  @RequirePermission('batch:manage')
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Meta() meta: RequestMeta) {
    return this.org.deleteBatch(u, id, meta);
  }

  @RequireRoles('client_admin', 'teacher', 'associate')
  @Get(':id/members')
  members(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.org.listBatchMembers(u, id);
  }

  @RequirePermission('batch:manage')
  @Post(':id/members')
  add(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zp(BatchMembersRequest)) body: z.infer<typeof BatchMembersRequest>, @Meta() meta: RequestMeta) {
    return this.org.addBatchMembers(u, id, body.userIds, meta);
  }

  @RequirePermission('batch:manage')
  @Post(':id/members/remove')
  @HttpCode(200)
  removeMembers(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zp(BatchMembersRequest)) body: z.infer<typeof BatchMembersRequest>, @Meta() meta: RequestMeta) {
    return this.org.removeBatchMembers(u, id, body.userIds, meta);
  }
}
