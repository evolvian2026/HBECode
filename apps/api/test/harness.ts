import { randomBytes } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestDb, type TestDb } from '../../../packages/db/test/helpers.js';

export const EXECUTOR_TOKEN = 'test-executor-token-0123456789abcdef-xyz';
export const ORIGIN = 'http://localhost:3000';

export interface TestApp {
  app: NestFastifyApplication;
  db: TestDb;
  close(): Promise<void>;
}

/** Boot the compiled API (decorator metadata requires tsc output) against a fresh database. */
export async function startApp(extraEnv: Record<string, string> = {}): Promise<TestApp> {
  const db = await createTestDb();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: db.appUrl,
    REDIS_PREFIX: `hbetest-${randomBytes(4).toString('hex')}:`,
    EXECUTOR_TOKENS: EXECUTOR_TOKEN,
    WEB_ORIGINS: ORIGIN,
    LOG_LEVEL: 'silent',
    SWEEPER_INTERVAL_MS: '0',
    ...extraEnv,
  });
  const { createApp } = await import('../dist/bootstrap.js');
  const app = await createApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return {
    app,
    db,
    async close() {
      await app.close();
      await db.drop();
    },
  };
}

/** A browser-like client: keeps cookies, sends Origin and the CSRF token. */
export class Client {
  cookies = new Map<string, string>();
  csrf = '';
  constructor(private readonly t: TestApp) {}

  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    if (!this.csrf && method !== 'GET') {
      const r = await this.req('GET', '/api/v1/auth/csrf');
      this.csrf = (r.json() as { csrfToken: string }).csrfToken;
    }
    const res = await this.t.app.inject({
      method: method as 'GET',
      url,
      payload: body === undefined ? undefined : (body as object),
      headers: {
        origin: ORIGIN,
        ...(this.csrf ? { 'x-csrf-token': this.csrf } : {}),
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...headers,
      },
    });
    for (const c of res.cookies as { name: string; value: string; maxAge?: number; expires?: Date }[]) {
      if (c.value === '' || (c.expires && c.expires.getTime() < Date.now())) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
    return res;
  }
  get = (url: string) => this.req('GET', url);
  post = (url: string, body?: unknown) => this.req('POST', url, body ?? {});
  put = (url: string, body?: unknown) => this.req('PUT', url, body ?? {});
  patch = (url: string, body?: unknown) => this.req('PATCH', url, body ?? {});
  del = (url: string) => this.req('DELETE', url);

  async login(email: string, password: string) {
    const r = await this.post('/api/v1/auth/login', { email, password });
    if (r.statusCode !== 200) throw new Error(`login failed ${r.statusCode} ${r.body}`);
    return r.json();
  }
}

export function executor(t: TestApp) {
  const h = { authorization: `Bearer ${EXECUTOR_TOKEN}` };
  return {
    claim: (runtimes: string[] = ['c', 'cpp', 'java', 'python', 'javascript', 'go', 'rust', 'csharp']) =>
      t.app.inject({ method: 'POST', url: '/api/v1/internal/executor/claim', headers: h, payload: { executorId: 'fake-1', runtimes } }),
    result: (body: Record<string, unknown>) =>
      t.app.inject({ method: 'POST', url: `/api/v1/internal/executor/jobs/${body.jobId as string}/result`, headers: h, payload: { executorId: 'fake-1', ...body } }),
  };
}
