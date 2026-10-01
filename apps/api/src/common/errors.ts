import { HttpException, HttpStatus } from '@nestjs/common';

/** RFC 9457 problem details. `detail` must never contain hidden test data or driver code. */
export class Problem extends HttpException {
  constructor(status: number, title: string, detail?: string, extra?: Record<string, unknown>) {
    super({ type: 'about:blank', title, status, detail, ...extra }, status);
  }
}

export const notFound = (what = 'Resource') => new Problem(HttpStatus.NOT_FOUND, `${what} not found`);
export const forbidden = (detail?: string) => new Problem(HttpStatus.FORBIDDEN, 'Forbidden', detail);
export const unauthorized = (detail?: string) => new Problem(HttpStatus.UNAUTHORIZED, 'Unauthorized', detail);
export const badRequest = (detail: string, extra?: Record<string, unknown>) => new Problem(HttpStatus.BAD_REQUEST, 'Bad request', detail, extra);
export const conflict = (detail: string) => new Problem(HttpStatus.CONFLICT, 'Conflict', detail);
export const tooMany = (retryAfterSec: number) =>
  new Problem(HttpStatus.TOO_MANY_REQUESTS, 'Too many requests', `Try again in ${retryAfterSec} s.`, { retryAfter: retryAfterSec });
