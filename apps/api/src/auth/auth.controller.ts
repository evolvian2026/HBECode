import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { AcceptInviteRequest, ChangePasswordRequest, LoginRequest, MfaEnableRequest, MfaVerifyRequest, SwitchTenantRequest, type LoginResponse, type SessionUser } from '@hbe/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { CONFIG, type AppConfig } from '../config.js';
import { clearSessionCookies, CSRF_COOKIE, REFRESH_COOKIE, setSessionCookies } from '../common/cookies.js';
import { randomToken } from '../common/crypto.js';
import { AllowDuringMfaSetup, CurrentUser, Meta, Public, type AuthUser, type RequestMeta } from '../common/decorators.js';
import { zp } from '../common/zod.pipe.js';
import { AuthService, type IssuedSession } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  private send(reply: FastifyReply, s: IssuedSession): SessionUser {
    setSessionCookies(reply, this.cfg, s.access, s.refresh);
    return s.user;
  }

  /** Double-submit CSRF token: httpOnly cookie + value the SPA echoes in `x-csrf-token`. */
  @Public()
  @Get('csrf')
  csrf(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const token = req.cookies?.[CSRF_COOKIE] ?? randomToken(24);
    void reply.setCookie(CSRF_COOKIE, token, { httpOnly: true, secure: this.cfg.cookieSecure, sameSite: 'strict', path: '/' });
    return { csrfToken: token };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body(zp(LoginRequest)) body: z.infer<typeof LoginRequest>, @Meta() meta: RequestMeta, @Res({ passthrough: true }) reply: FastifyReply): Promise<LoginResponse> {
    const r = await this.auth.login(body.email, body.password, meta);
    if ('mfaToken' in r) return { status: 'mfa_required', mfaToken: r.mfaToken };
    return { status: 'ok', user: this.send(reply, r) };
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  async mfaVerify(@Body(zp(MfaVerifyRequest)) body: z.infer<typeof MfaVerifyRequest>, @Meta() meta: RequestMeta, @Res({ passthrough: true }) reply: FastifyReply): Promise<LoginResponse> {
    return { status: 'ok', user: this.send(reply, await this.auth.verifyMfa(body.mfaToken, body.code, meta)) };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: FastifyRequest, @Meta() meta: RequestMeta, @Res({ passthrough: true }) reply: FastifyReply) {
    try {
      return { user: this.send(reply, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], meta)) };
    } catch (e) {
      clearSessionCookies(reply, this.cfg);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: FastifyRequest & { user?: AuthUser }, @Meta() meta: RequestMeta, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(req.user, req.cookies?.[REFRESH_COOKIE], meta);
    clearSessionCookies(reply, this.cfg);
  }

  @Public()
  @Post('guest')
  @HttpCode(200)
  async guest(@Meta() meta: RequestMeta, @Res({ passthrough: true }) reply: FastifyReply) {
    return { user: this.send(reply, await this.auth.guest(meta)) };
  }

  @Public()
  @Post('accept-invite')
  @HttpCode(204)
  async acceptInvite(@Body(zp(AcceptInviteRequest)) body: z.infer<typeof AcceptInviteRequest>, @Meta() meta: RequestMeta) {
    await this.auth.acceptInvite(body.token, body.password, meta);
  }

  @AllowDuringMfaSetup()
  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.auth.me(u);
  }

  @Post('switch-tenant')
  @HttpCode(200)
  async switchTenant(@CurrentUser() u: AuthUser, @Body(zp(SwitchTenantRequest)) body: z.infer<typeof SwitchTenantRequest>, @Meta() meta: RequestMeta, @Res({ passthrough: true }) reply: FastifyReply) {
    return { user: this.send(reply, await this.auth.switchTenant(u, body.tenantId, meta)) };
  }

  @AllowDuringMfaSetup()
  @Post('password')
  @HttpCode(200)
  async changePassword(@CurrentUser() u: AuthUser, @Body(zp(ChangePasswordRequest)) body: z.infer<typeof ChangePasswordRequest>, @Meta() meta: RequestMeta, @Res({ passthrough: true }) reply: FastifyReply) {
    return { user: this.send(reply, await this.auth.changePassword(u, body.currentPassword, body.newPassword, meta)) };
  }

  @AllowDuringMfaSetup()
  @Post('mfa/setup')
  @HttpCode(200)
  mfaSetup(@CurrentUser() u: AuthUser) {
    return this.auth.mfaSetup(u);
  }

  @AllowDuringMfaSetup()
  @Post('mfa/enable')
  @HttpCode(200)
  async mfaEnable(@CurrentUser() u: AuthUser, @Body(zp(MfaEnableRequest)) body: z.infer<typeof MfaEnableRequest>, @Meta() meta: RequestMeta, @Res({ passthrough: true }) reply: FastifyReply) {
    return { user: this.send(reply, await this.auth.mfaEnable(u, body.code, meta)) };
  }
}
