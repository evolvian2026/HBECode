import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  /** Connection string for the hbe_app role (RLS-enforced). */
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  REDIS_PREFIX: z.string().default('hbe:'),
  /** Comma-separated browser origins allowed to call the API with credentials. */
  WEB_ORIGINS: z.string().default('http://localhost:3000'),
  /** Public URL of the web app, used in invite links. */
  WEB_URL: z.string().default('http://localhost:3000'),
  /** ES256 private key (PKCS#8 PEM). Generated per process in development if absent. */
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_ISSUER: z.string().default('hbecode'),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().default(600),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(14),
  /** 32-byte key, base64. Encrypts TOTP secrets at rest. */
  MFA_ENCRYPTION_KEY: z.string().optional(),
  /** Comma-separated bearer tokens accepted from executor agents (>= 32 chars each). */
  EXECUTOR_TOKENS: z.string().default(''),
  COOKIE_SECURE: bool.optional(),
  /** Trust X-Forwarded-For from the platform load balancer (Render/ALB). */
  TRUST_PROXY: bool.default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SWEEPER_INTERVAL_MS: z.coerce.number().int().default(10_000),
  /** Sign-ins per IP per 5 minutes. A lab of students behind one NAT shares an IP. */
  LOGIN_RATE_LIMIT_PER_IP: z.coerce.number().int().min(5).default(300),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = Env.parse(env);
  const prod = e.NODE_ENV === 'production';
  const executorTokens = e.EXECUTOR_TOKENS.split(',').map((t) => t.trim()).filter(Boolean);
  if (executorTokens.some((t) => t.length < 32)) throw new Error('each EXECUTOR_TOKENS entry must be at least 32 characters');
  if (prod) {
    if (!e.JWT_PRIVATE_KEY) throw new Error('JWT_PRIVATE_KEY is required in production');
    if (!e.MFA_ENCRYPTION_KEY) throw new Error('MFA_ENCRYPTION_KEY is required in production');
    if (executorTokens.length === 0) throw new Error('EXECUTOR_TOKENS is required in production');
  }
  return {
    ...e,
    prod,
    executorTokens,
    webOrigins: e.WEB_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    cookieSecure: e.COOKIE_SECURE ?? prod,
  };
}

export const CONFIG = Symbol('CONFIG');
