import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { RequirePermissions } from '../../shared/auth/permissions';
import { AuthService } from './auth.service';
class LoginDto { @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() email!: string; @IsString() @MinLength(8) password!: string; @IsString() storeSlug!: string; }
class ChangePasswordDto { @IsString() @MaxLength(200) currentPassword!: string; @IsString() @MinLength(12) @MaxLength(200) newPassword!: string; }
class RefreshDto { @IsString() @MinLength(20) refreshToken!: string; }
@ApiTags('Auth') @Controller('auth') export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('login') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60_000 } }) login(@Body() dto: LoginDto) { return this.auth.login(dto); }
  @Post('refresh') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } }) refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto.refreshToken); }
  @Post('password') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60_000 } }) @RequirePermissions() changePassword(@Req() req: { user: { sub: string } }, @Body() dto: ChangePasswordDto) { return this.auth.changePassword(req.user.sub, dto); }
  @Post('logout') @HttpCode(204) async logout(@Body() dto: RefreshDto) { await this.auth.logout(dto.refreshToken); }
}
