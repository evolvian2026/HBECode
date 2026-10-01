import { Body, Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import { ClaimRequest, ExecResult } from '@hbe/shared';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import { Internal } from '../common/decorators.js';
import { badRequest, conflict } from '../common/errors.js';
import { zp } from '../common/zod.pipe.js';
import { DispatchService } from './dispatch.service.js';

/** Executor agents only (bearer token). Never reachable with a browser session. */
@Internal()
@Controller('internal/executor')
export class ExecutorController {
  constructor(private readonly dispatch: DispatchService) {}

  @Post('claim')
  @HttpCode(200)
  async claim(@Body(zp(ClaimRequest)) body: z.infer<typeof ClaimRequest>, @Res({ passthrough: true }) reply: FastifyReply) {
    const job = await this.dispatch.claim(body.executorId, body.runtimes);
    if (!job) {
      void reply.status(204);
      return undefined;
    }
    return job;
  }

  @Post('jobs/:id/result')
  @HttpCode(200)
  async result(@Param('id') id: string, @Body(zp(ExecResult)) body: z.infer<typeof ExecResult>) {
    if (body.jobId !== id) throw badRequest('jobId mismatch');
    const r = await this.dispatch.complete(body.executorId, body);
    if (r === 'stale') throw conflict('lease lost');
    return { ok: true };
  }
}
