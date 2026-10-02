import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ATTEMPT_TOKEN_HEADER, CreateSubmissionRequest, DRAFT_KEYS, SaveDraftRequest } from '@hbe/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CONFIG, type AppConfig } from '../config.js';
import { CurrentUser, RequirePermission, type AuthUser } from '../common/decorators.js';
import { zp } from '../common/zod.pipe.js';
import { DispatchService } from '../executor/dispatch.service.js';
import { SubmissionsService } from './submissions.service.js';

const SSE_MAX_MS = 120_000;

@Controller()
export class SubmissionsController {
  constructor(
    private readonly subs: SubmissionsService,
    private readonly dispatch: DispatchService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  @RequirePermission('practice:use')
  @Post('submissions')
  @HttpCode(202)
  create(@CurrentUser() u: AuthUser, @Body(zp(CreateSubmissionRequest)) body: z.infer<typeof CreateSubmissionRequest>, @Headers(ATTEMPT_TOKEN_HEADER) token?: string) {
    return this.subs.create(u, body, token);
  }

  @RequirePermission('practice:use')
  @Get('submissions')
  list(@CurrentUser() u: AuthUser, @Query(zp(z.object({ questionId: z.uuid() }))) q: { questionId: string }) {
    return this.subs.list(u, q.questionId);
  }

  @Get('submissions/:id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.subs.get(u, id);
  }

  /**
   * Server-Sent Events: pushes the (viewer-filtered) submission on every status change and
   * closes when it finishes. Clients fall back to polling GET /submissions/:id.
   */
  @Get('submissions/:id/events')
  async events(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const first = await this.subs.get(u, id); // authorises (404 if not visible)
    const origin = req.headers.origin;
    const headers: Record<string, string> = {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    };
    // The reply is hijacked, so CORS headers must be written here.
    if (origin && this.cfg.webOrigins.includes(origin)) {
      headers['access-control-allow-origin'] = origin;
      headers['access-control-allow-credentials'] = 'true';
      headers.vary = 'Origin';
    }
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, headers);
    let closed = false;
    const send = (data: unknown) => {
      if (!closed) raw.write(`event: submission\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const sub: { off?: () => Promise<void> } = {};
    const close = async () => {
      if (closed) return;
      closed = true;
      clearInterval(ping);
      clearTimeout(timeout);
      await sub.off?.();
      raw.end();
    };
    const ping = setInterval(() => raw.write(': ping\n\n'), 15_000);
    const timeout = setTimeout(() => void close(), SSE_MAX_MS);
    req.raw.on('close', () => void close());
    sub.off = await this.dispatch.subscribe(id, () => {
      void this.subs.get(u, id).then((s) => {
        send(s);
        if (s.status === 'done' || s.status === 'failed') void close();
      });
    });
    if (closed) {
      // The client went away while we were subscribing.
      await sub.off();
      return;
    }
    send(first);
    if (first.status === 'done' || first.status === 'failed') await close();
  }

  @RequirePermission('practice:use')
  @Get('drafts/:questionId')
  drafts(@CurrentUser() u: AuthUser, @Param('questionId', ParseUUIDPipe) questionId: string) {
    return this.subs.getDrafts(u, questionId);
  }

  @RequirePermission('practice:use')
  @Put('drafts/:questionId/:runtime')
  @HttpCode(204)
  async saveDraft(
    @CurrentUser() u: AuthUser,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Param('runtime', zp(z.enum(DRAFT_KEYS))) runtime: string,
    @Body(zp(SaveDraftRequest)) body: z.infer<typeof SaveDraftRequest>,
  ) {
    await this.subs.saveDraft(u, questionId, runtime, body.code);
  }
}
