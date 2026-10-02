import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, Res } from '@nestjs/common';
import {
  AssignTestRequest,
  ATTEMPT_TOKEN_HEADER,
  DRAFT_KEYS,
  ExtendRequest,
  HeartbeatRequest,
  ProctorEventsRequest,
  SaveAttemptDraftRequest,
  SnapshotRequest,
  StartAttemptRequest,
  TerminateRequest,
  TestInput,
  WarnRequest,
} from '@hbe/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { CurrentUser, Meta, RequirePermission, type AuthUser, type RequestMeta } from '../common/decorators.js';
import { zp } from '../common/zod.pipe.js';
import { AttemptsService } from './attempts.service.js';
import { TestsService } from './tests.service.js';

/** Test authoring and scheduling (teachers) and the live monitor (all proctoring staff). */
@Controller('tests')
export class TestsController {
  constructor(
    private readonly tests: TestsService,
    private readonly attempts: AttemptsService,
  ) {}

  @RequirePermission('test:proctor')
  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.tests.list(u);
  }

  @RequirePermission('test:manage')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body(zp(TestInput)) body: TestInput, @Meta() meta: RequestMeta) {
    return this.tests.create(u, body, meta);
  }

  @RequirePermission('test:proctor')
  @Get(':id')
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tests.detail(u, id);
  }

  @RequirePermission('test:manage')
  @Put(':id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zp(TestInput)) body: TestInput, @Meta() meta: RequestMeta) {
    return this.tests.update(u, id, body, meta);
  }

  @RequirePermission('test:manage')
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Meta() meta: RequestMeta) {
    await this.tests.remove(u, id, meta);
  }

  @RequirePermission('test:manage')
  @Post(':id/assign')
  @HttpCode(200)
  assign(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zp(AssignTestRequest)) body: z.infer<typeof AssignTestRequest>, @Meta() meta: RequestMeta) {
    return this.tests.assign(u, id, body, meta);
  }

  @RequirePermission('test:manage')
  @Post(':id/publish')
  @HttpCode(200)
  publish(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Meta() meta: RequestMeta) {
    return this.tests.publish(u, id, meta);
  }

  @RequirePermission('test:manage')
  @Post(':id/close')
  @HttpCode(200)
  close(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Meta() meta: RequestMeta) {
    return this.attempts.closeTest(u, id, meta);
  }

  @RequirePermission('test:proctor')
  @Get(':id/live')
  live(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tests.live(u, id);
  }

  // ---------------------------------------------------------------- student
  @RequirePermission('test:attempt')
  @Post(':id/attempt')
  @HttpCode(200)
  start(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zp(StartAttemptRequest)) body: z.infer<typeof StartAttemptRequest>,
    @Headers(ATTEMPT_TOKEN_HEADER) token: string | undefined,
    @Meta() meta: RequestMeta,
  ) {
    return this.attempts.start(u, id, token, body.fingerprint, meta);
  }
}

@Controller('my')
export class MyTestsController {
  constructor(private readonly tests: TestsService) {}

  @RequirePermission('test:attempt')
  @Get('tests')
  list(@CurrentUser() u: AuthUser) {
    return this.tests.myTests(u);
  }
}

const Token = (): ParameterDecorator => Headers(ATTEMPT_TOKEN_HEADER);

@Controller('attempts')
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  // ---------------------------------------------------------------- student (active device only)
  @RequirePermission('test:attempt')
  @Get(':id')
  view(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Token() token?: string) {
    return this.attempts.view(u, id, token);
  }

  @RequirePermission('test:attempt')
  @Get(':id/questions/:questionId')
  question(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('questionId', ParseUUIDPipe) questionId: string, @Token() token?: string) {
    return this.attempts.question(u, id, token, questionId);
  }

  @RequirePermission('test:attempt')
  @Get(':id/drafts/:questionId')
  drafts(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('questionId', ParseUUIDPipe) questionId: string, @Token() token?: string) {
    return this.attempts.drafts(u, id, token, questionId);
  }

  @RequirePermission('test:attempt')
  @Put(':id/drafts/:questionId/:runtime')
  @HttpCode(204)
  async saveDraft(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Param('runtime', zp(z.enum(DRAFT_KEYS))) runtime: string,
    @Body(zp(SaveAttemptDraftRequest)) body: z.infer<typeof SaveAttemptDraftRequest>,
    @Token() token?: string,
  ) {
    await this.attempts.saveDraft(u, id, token, questionId, runtime, body.code);
  }

  @RequirePermission('test:attempt')
  @Post(':id/heartbeat')
  @HttpCode(200)
  heartbeat(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zp(HeartbeatRequest)) body: z.infer<typeof HeartbeatRequest>, @Token() token?: string) {
    return this.attempts.heartbeat(u, id, token, body);
  }

  @RequirePermission('test:attempt')
  @Post(':id/events')
  @HttpCode(200)
  events(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zp(ProctorEventsRequest)) body: z.infer<typeof ProctorEventsRequest>, @Token() token?: string) {
    return this.attempts.events(u, id, token, body.events);
  }

  @RequirePermission('test:attempt')
  @Post(':id/snapshots')
  @HttpCode(201)
  snapshot(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zp(SnapshotRequest)) body: z.infer<typeof SnapshotRequest>, @Token() token?: string) {
    return this.attempts.snapshot(u, id, token, body);
  }

  @RequirePermission('test:attempt')
  @Post(':id/submit')
  @HttpCode(200)
  submit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Meta() meta: RequestMeta, @Token() token?: string) {
    return this.attempts.submit(u, id, token, meta);
  }

  // ---------------------------------------------------------------- proctors
  @RequirePermission('test:proctor')
  @Get(':id/timeline')
  timeline(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.attempts.timeline(u, id);
  }

  @RequirePermission('test:proctor')
  @Post(':id/devices/:requestId/approve')
  @HttpCode(200)
  approve(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('requestId', ParseUUIDPipe) requestId: string, @Meta() meta: RequestMeta) {
    return this.attempts.decideDevice(u, id, requestId, true, meta);
  }

  @RequirePermission('test:proctor')
  @Post(':id/devices/:requestId/deny')
  @HttpCode(200)
  deny(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('requestId', ParseUUIDPipe) requestId: string, @Meta() meta: RequestMeta) {
    return this.attempts.decideDevice(u, id, requestId, false, meta);
  }

  @RequirePermission('test:proctor')
  @Post(':id/warn')
  @HttpCode(200)
  warn(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zp(WarnRequest)) body: z.infer<typeof WarnRequest>, @Meta() meta: RequestMeta) {
    return this.attempts.warn(u, id, body.message, meta);
  }

  @RequirePermission('test:proctor')
  @Post(':id/extend')
  @HttpCode(200)
  extend(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zp(ExtendRequest)) body: z.infer<typeof ExtendRequest>, @Meta() meta: RequestMeta) {
    return this.attempts.extend(u, id, body.minutes, meta);
  }

  @RequirePermission('test:proctor')
  @Post(':id/terminate')
  @HttpCode(200)
  terminate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zp(TerminateRequest)) body: z.infer<typeof TerminateRequest>, @Meta() meta: RequestMeta) {
    return this.attempts.terminate(u, id, body.reason, meta);
  }

  @RequirePermission('test:proctor')
  @Get(':id/snapshots/:snapshotId')
  async snapshotImage(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('snapshotId', ParseUUIDPipe) snapshotId: string, @Meta() meta: RequestMeta, @Res() reply: FastifyReply) {
    const img = await this.attempts.snapshotImage(u, id, snapshotId, meta);
    await reply.header('content-type', 'image/jpeg').header('cache-control', 'private, no-store').send(img);
  }
}
