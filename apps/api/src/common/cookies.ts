import type { FastifyReply } from 'fastify';
import type { AppConfig } from '../config.js';

export const ACCESS_COOKIE = 'hb_at';
export const REFRESH_COOKIE = 'hb_rt';
export const CSRF_COOKIE = 'hb_csrf';
export const REFRESH_PATH = '/api/v1/auth';

/** httpOnly + SameSite=Strict everywhere; Secure outside local development. */
export function setSessionCookies(reply: FastifyReply, cfg: AppConfig, access: string, refresh: string) {
  const base = { httpOnly: true, secure: cfg.cookieSecure, sameSite: 'strict' as const };
  void reply.setCookie(ACCESS_COOKIE, access, { ...base, path: '/', maxAge: cfg.ACCESS_TOKEN_TTL_SEC });
  void reply.setCookie(REFRESH_COOKIE, refresh, { ...base, path: REFRESH_PATH, maxAge: cfg.REFRESH_TOKEN_TTL_DAYS * 86_400 });
}

export function clearSessionCookies(reply: FastifyReply, cfg: AppConfig) {
  const base = { httpOnly: true, secure: cfg.cookieSecure, sameSite: 'strict' as const };
  void reply.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  void reply.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH });
}
