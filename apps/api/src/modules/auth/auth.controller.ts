import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RequirePermissions } from '../../shared/auth/permissions';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
class LoginDto { @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() email!: string; @IsString() @MinLength(8) password!: string; @IsString() storeSlug!: string; @IsOptional() @IsString() @MaxLength(32) code?: string; }
class CodeDto { @IsString() @MaxLength(32) code!: string; }
class DisableMfaDto { @IsString() @MaxLength(200) password!: string; @IsString() @MaxLength(32) code!: string; }
class ChangePasswordDto { @IsString() @MaxLength(200) currentPassword!: string; @IsString() @MinLength(12) @MaxLength(200) newPassword!: string; }
class RefreshDto { @IsString() @MinLength(20) refreshToken!: string; }
type UserRequest = { user: { sub: string } };
type HttpRequest = { ip?: string; headers: Record<string, string | undefined> };
@ApiTags('Auth') @Controller('auth') export class AuthController {
  constructor(private readonly auth: AuthService, private readonly audit: AuditService) {}
  // O painel entra pelo servidor do site, então todos os administradores dividem o mesmo IP: o limite por IP é folgado
  // e a proteção contra adivinhar senha é o bloqueio por conta (AuthService.MAX_FAILED_LOGINS).
  @Post('login') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } }) async login(@Req() req: HttpRequest, @Body() dto: LoginDto) {
    const context = { ip: req.ip, userAgent: req.headers['user-agent']?.slice(0, 300), requestId: req.headers['x-request-id'] };
    try {
      const session = await this.auth.login(dto, { ip: req.ip, userAgent: context.userAgent });
      await this.audit.record({ ...context, storeId: session.user.store.id, actorId: session.user.id, action: 'auth.login', entity: 'session', outcome: 'SUCCESS' });
      return session;
    } catch (error) {
      // O e-mail tentado ajuda a investigar ataques; a senha nunca é gravada. Loja desconhecida fica sem storeId.
      const store = await this.audit.findStoreId(dto.storeSlug);
      await this.audit.record({ ...context, storeId: store, action: 'auth.login', entity: 'session', outcome: 'DENIED', statusCode: 401, metadata: { email: dto.email, storeSlug: dto.storeSlug } });
      throw error;
    }
  }
  @Post('refresh') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } }) refresh(@Req() req: HttpRequest, @Body() dto: RefreshDto) { return this.auth.refresh(dto.refreshToken, { ip: req.ip, userAgent: req.headers['user-agent']?.slice(0, 300) }); }
  @Post('password') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60_000 } }) @RequirePermissions() changePassword(@Req() req: { user: { sub: string } }, @Body() dto: ChangePasswordDto) { return this.auth.changePassword(req.user.sub, dto); }
  @Post('logout') @HttpCode(204) async logout(@Body() dto: RefreshDto) { await this.auth.logout(dto.refreshToken); }
  @Get('mfa') @RequirePermissions() mfaStatus(@Req() req: UserRequest) { return this.auth.mfaStatus(req.user.sub); }
  @Post('mfa/setup') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } }) @RequirePermissions() mfaSetup(@Req() req: UserRequest) { return this.auth.mfaSetup(req.user.sub); }
  @Post('mfa/enable') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } }) @RequirePermissions() mfaEnable(@Req() req: UserRequest, @Body() dto: CodeDto) { return this.auth.mfaEnable(req.user.sub, dto.code); }
  @Post('mfa/disable') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60_000 } }) @RequirePermissions() mfaDisable(@Req() req: UserRequest, @Body() dto: DisableMfaDto) { return this.auth.mfaDisable(req.user.sub, dto); }
  @Get('sessions') @RequirePermissions() sessions(@Req() req: UserRequest) { return this.auth.listSessions(req.user.sub); }
  @Delete('sessions') @HttpCode(200) @RequirePermissions() revokeAll(@Req() req: UserRequest) { return this.auth.revokeAllSessions(req.user.sub); }
  @Delete('sessions/:id') @HttpCode(204) @RequirePermissions() async revoke(@Req() req: UserRequest, @Param('id') id: string) { await this.auth.revokeSession(req.user.sub, id); }
}
