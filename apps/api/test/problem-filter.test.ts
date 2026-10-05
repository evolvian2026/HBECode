import { describe, expect, it } from 'vitest';
import { ProblemFilter } from '../src/common/problem.filter.js';

/** The filter on its own, with a minimal Fastify reply/request double. */
function run(err: unknown) {
  const sent: { status?: number; headers: Record<string, string>; body?: Record<string, unknown> } = { headers: {} };
  const reply = {
    status(s: number) { sent.status = s; return this; },
    header(k: string, v: string) { sent.headers[k.toLowerCase()] = v; return this; },
    send(b: Record<string, unknown>) { sent.body = b; return this; },
  };
  const req = { id: 'req-1', log: { error: () => undefined } };
  const host = { switchToHttp: () => ({ getResponse: () => reply, getRequest: () => req }) };
  new ProblemFilter().catch(err, host as never);
  return sent;
}

describe('ProblemFilter', () => {
  it('a full database pool is a retryable 503 with Retry-After, not a 500', () => {
    const r = run(new Error('timeout exceeded when trying to connect'));
    expect(r.status).toBe(503);
    expect(r.headers['retry-after']).toBe('2');
    expect(r.body).toMatchObject({ title: 'Service busy', requestId: 'req-1' });
  });
  it('other unexpected errors stay a 500 and leak nothing', () => {
    const r = run(new Error('relation "secret_table" does not exist'));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('secret_table');
  });
});
