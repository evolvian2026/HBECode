import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditService } from '../common/audit.service.js';
import { AuthGuard } from '../common/auth.guard.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, AuditService, RateLimitService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService, PasswordService, TokenService, AuditService, RateLimitService],
})
export class AuthModule {}
