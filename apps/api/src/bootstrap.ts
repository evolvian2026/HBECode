import 'reflect-metadata';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ATTEMPT_TOKEN_HEADER } from '@hbe/shared';
import { AppModule } from './app.module.js';
import { RealtimeGateway } from './realtime/realtime.gateway.js';
import { CSRF_COOKIE } from './common/cookies.js';
import { safeEqual } from './common/crypto.js';
import { ProblemFilter } from './common/problem.filter.js';
import { loadConfig } from './config.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function createApp(): Promise<NestFastifyApplication> {
  const cfg = loadConfig();
  const adapter = new FastifyAdapter({
    trustProxy: cfg.TRUST_PROXY,
    bodyLimit: 32 * 1024 * 1024, // question uploads with stress tests; zod caps each field
    logger: {
      level: cfg.LOG_LEVEL,
      redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'], remove: true },
    },
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: false,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { logger: cfg.LOG_LEVEL === 'silent' ? false : ['error', 'warn', 'log'] });
  const fastify = app.getHttpAdapter().getInstance();

  await app.register(fastifyCookie);
  // JSON API: lock everything down. (The web app sets its own CSP.)
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: cfg.prod ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
  });
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || cfg.webOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'x-csrf-token', ATTEMPT_TOKEN_HEADER],
    maxAge: 600,
  });

  /**
   * CSRF defence for cookie-authenticated requests: unsafe methods must come from an allowed
   * Origin (when the browser sends one) and echo the double-submit token. Executor endpoints use
   * bearer tokens and no cookies, so they are exempt.
   */
  fastify.addHook('onRequest', async (req, reply) => {
    if (!UNSAFE.has(req.method) || req.url.startsWith('/api/v1/internal/')) return;
    const origin = req.headers.origin;
    if (origin && !cfg.webOrigins.includes(origin)) {
      return reply.code(403).header('content-type', 'application/problem+json').send({ type: 'about:blank', title: 'Forbidden', status: 403, detail: 'origin not allowed' });
    }
    const header = req.headers['x-csrf-token'];
    const cookie = req.cookies?.[CSRF_COOKIE];
    if (typeof header !== 'string' || !cookie || !safeEqual(header, cookie)) {
      return reply.code(403).header('content-type', 'application/problem+json').send({ type: 'about:blank', title: 'Forbidden', status: 403, detail: 'csrf token missing or invalid' });
    }
  });

  app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
  // WebSocket upgrades are handled outside Fastify's router (see RealtimeGateway).
  app.get(RealtimeGateway).attach(app.getHttpServer());
  return app;
}
