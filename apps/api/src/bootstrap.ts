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
/**
 * JSON bodies are capped at 2 MB (a 1.1 MB web submission is the largest normal request). Only
 * question create/update (stress tests) and executor results (up to 1 MB of output per test) take
 * more. A small default matters on a 512 MB instance: bodies are parsed before auth guards run.
 */
const DEFAULT_BODY_LIMIT = 2 * 1024 * 1024;
const LARGE_BODY_LIMIT = 32 * 1024 * 1024;
const LARGE_BODY_ROUTES = [/^\/api\/v1\/questions$/, /^\/api\/v1\/questions\/:id$/, /^\/api\/v1\/internal\/executor\/jobs\/:id\/result$/];

export async function createApp(): Promise<NestFastifyApplication> {
  const cfg = loadConfig();
  const adapter = new FastifyAdapter({
    trustProxy: cfg.TRUST_PROXY,
    bodyLimit: DEFAULT_BODY_LIMIT,
    logger: {
      level: cfg.LOG_LEVEL,
      redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'], remove: true },
    },
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: false,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { logger: cfg.LOG_LEVEL === 'silent' ? false : ['error', 'warn', 'log'] });
  const fastify = app.getHttpAdapter().getInstance();
  // Registered before Nest adds its routes (that happens in app.init()/listen()).
  fastify.addHook('onRoute', (route) => {
    if (LARGE_BODY_ROUTES.some((r) => r.test(route.url))) route.bodyLimit = LARGE_BODY_LIMIT;
  });

  await app.register(fastifyCookie);
  // Bulk question uploads arrive as the raw file body (no multipart parsing of untrusted input).
  fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: cfg.UPLOAD_MAX_BYTES }, (_req, body, done) => done(null, body));
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
    exposedHeaders: ['retry-after'],
    maxAge: 600,
  });

  /**
   * CSRF defence for cookie-authenticated requests: unsafe methods must come from an allowed
   * Origin (when the browser sends one) and echo the double-submit token. Executor endpoints use
   * bearer tokens and no cookies, so they are exempt.
   */
  fastify.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/v1/internal/')) {
      // Executor endpoints: check the bearer token before any body is read (the guard checks it again).
      const auth = req.headers.authorization;
      const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (token.length < 32 || !cfg.executorTokens.some((t) => safeEqual(t, token))) {
        return reply.code(401).header('content-type', 'application/problem+json').send({ type: 'about:blank', title: 'Unauthorized', status: 401 });
      }
      return;
    }
    if (!UNSAFE.has(req.method)) return;
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
