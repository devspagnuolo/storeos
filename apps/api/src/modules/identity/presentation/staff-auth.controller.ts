import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  acceptInviteSchema,
  inviteUserSchema,
  loginSchema,
  mfaConfirmSchema,
  mfaDisableSchema,
  mfaVerifySchema,
  refreshSchema,
  registerStoreSchema,
  type LoginInput,
  type RegisterStoreInput,
} from '@storeos/contracts';
import { z } from 'zod';
import { Throttle } from '@nestjs/throttler';
import { CurrentAuth, Public, RequirePermissions, UserAgent, ClientIp } from '../../../shared/presentation/decorators/auth.decorators';
import { ZodBody } from '../../../shared/presentation/pipes/zod';
import type { AuthContext } from '../../../shared/presentation/request.types';
import { StaffAuthService } from '../application/staff-auth.service';

const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth (staff)')
@Controller('auth')
export class StaffAuthController {
  constructor(private readonly auth: StaffAuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('register-store')
  @ApiOperation({ summary: 'Cria uma nova loja (tenant) e o usuário proprietário' })
  register(@ZodBody(registerStoreSchema) body: RegisterStoreInput, @ClientIp() ip?: string, @UserAgent() userAgent?: string) {
    return this.auth.registerStore(body, { ip, userAgent });
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('login')
  @ApiOperation({ summary: 'Login do painel (retorna desafio MFA quando ativo)' })
  login(@ZodBody(loginSchema) body: LoginInput, @ClientIp() ip?: string, @UserAgent() userAgent?: string) {
    return this.auth.login(body, { ip, userAgent });
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('mfa/verify')
  verifyMfa(@ZodBody(mfaVerifySchema) body: z.infer<typeof mfaVerifySchema>, @ClientIp() ip?: string, @UserAgent() userAgent?: string) {
    return this.auth.verifyMfa(body.challengeToken, body.code, { ip, userAgent });
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('refresh')
  refresh(@ZodBody(refreshSchema) body: z.infer<typeof refreshSchema>, @ClientIp() ip?: string, @UserAgent() userAgent?: string) {
    return this.auth.refresh(body.refreshToken, { ip, userAgent });
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@ZodBody(refreshSchema) body: z.infer<typeof refreshSchema>) {
    await this.auth.logout(body.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me(auth.subjectId);
  }

  @ApiBearerAuth()
  @Post('mfa/setup')
  setupMfa(@CurrentAuth() auth: AuthContext) {
    return this.auth.beginMfaSetup(auth.subjectId);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('mfa/confirm')
  confirmMfa(@CurrentAuth() auth: AuthContext, @ZodBody(mfaConfirmSchema) body: z.infer<typeof mfaConfirmSchema>) {
    return this.auth.confirmMfaSetup(auth.subjectId, body.code);
  }

  @ApiBearerAuth()
  @HttpCode(204)
  @Post('mfa/disable')
  async disableMfa(@CurrentAuth() auth: AuthContext, @ZodBody(mfaDisableSchema) body: z.infer<typeof mfaDisableSchema>) {
    await this.auth.disableMfa(auth.subjectId, body.password, body.code);
  }

  @ApiBearerAuth()
  @RequirePermissions('users.write')
  @Post('invite')
  invite(@CurrentAuth() auth: AuthContext, @ZodBody(inviteUserSchema) body: z.infer<typeof inviteUserSchema>) {
    return this.auth.inviteUser(auth.storeId, body, auth.subjectId);
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @HttpCode(200)
  @Post('accept-invite')
  acceptInvite(@ZodBody(acceptInviteSchema) body: z.infer<typeof acceptInviteSchema>, @ClientIp() ip?: string, @UserAgent() userAgent?: string) {
    return this.auth.acceptInvite(body.token, body.password, { ip, userAgent });
  }
}
