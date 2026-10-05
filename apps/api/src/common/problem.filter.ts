import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

function pgCode(e: unknown): string | undefined {
  const c = (e as { code?: string; cause?: { code?: string } }) ?? {};
  return c.code ?? c.cause?.code;
}

/** Maps every error to application/problem+json. Internal details are logged, never returned. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();
    let status = 500;
    let body: Record<string, unknown> = { type: 'about:blank', title: 'Internal server error', status: 500 };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      body = typeof r === 'object' ? { type: 'about:blank', status, ...(r as object) } : { type: 'about:blank', title: String(r), status };
      if ('message' in body && !('title' in body)) body.title = body.message;
      delete body.message;
      delete body.error;
      delete body.statusCode;
    } else {
      const code = pgCode(exception);
      if (code === '42501') {
        // insufficient_privilege / RLS violation: do not reveal whether the row exists elsewhere
        status = 403;
        body = { type: 'about:blank', title: 'Forbidden', status };
      } else if (code === '23505') {
        status = 409;
        body = { type: 'about:blank', title: 'Conflict', status, detail: 'A record with the same unique value already exists.' };
      } else if (code === '23514' || code === '22P02') {
        status = 400;
        body = { type: 'about:blank', title: 'Bad request', status };
      } else if (exception instanceof Error && /timeout exceeded when trying to connect/.test(exception.message)) {
        // Every pooled DB connection is busy (overload, measured in the Phase 8 load test): a
        // retryable 503, not a 500 that looks like a bug.
        status = 503;
        body = { type: 'about:blank', title: 'Service busy', status, detail: 'The server is busy. Please retry in a moment.', retryAfter: 2 };
      } else {
        req.log.error({ err: exception }, 'unhandled error');
      }
    }
    if (status >= 500) req.log.error({ err: exception }, 'request failed');
    if ((status === 429 || status === 503) && typeof body.retryAfter === 'number') void reply.header('retry-after', String(body.retryAfter));
    void reply.status(status).header('content-type', 'application/problem+json').send({ ...body, requestId: req.id });
  }
}
