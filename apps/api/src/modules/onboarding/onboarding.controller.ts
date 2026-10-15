import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsEmail, IsObject, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { OnboardingService } from './onboarding.service';

class SignupDto {
  @IsString() @MaxLength(80) ownerName!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MaxLength(200) password!: string;
  @IsString() @MaxLength(60) storeName!: string;
  @IsBoolean() acceptTerms!: boolean;
}
class VerifyDto { @IsString() @Length(20, 200) token!: string; }
class ResendDto { @IsString() @MaxLength(80) storeSlug!: string; @IsEmail() @MaxLength(254) email!: string; }
class SlugQuery { @IsString() @MaxLength(60) slug!: string; }
class ProfileDto { @IsOptional() @IsObject() profile?: Record<string, unknown>; }

@ApiTags('Onboarding') @Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}
  @Get('status') status() { return this.onboarding.status(); }
  @Get('slug') @Throttle({ default: { limit: 30, ttl: 60_000 } }) slug(@Query() { slug }: SlugQuery) { return this.onboarding.slugAvailable(slug.toLowerCase()); }
  @Post('signup') @HttpCode(201) @Throttle({ default: { limit: 5, ttl: 3_600_000 } }) signup(@Body() dto: SignupDto) { return this.onboarding.signup(dto); }
  @Post('verify') @HttpCode(200) @Throttle({ default: { limit: 20, ttl: 60_000 } }) verify(@Body() { token }: VerifyDto) { return this.onboarding.verify(token); }
  @Post('resend') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 3_600_000 } }) resend(@Body() { storeSlug, email }: ResendDto) { return this.onboarding.resend(storeSlug, email); }
  @Get('profile') @RequirePermissions(Permissions.SETTINGS_WRITE) profile(@CurrentStore() storeId: string) { return this.onboarding.profile(storeId); }
  @Put('profile') @RequirePermissions(Permissions.SETTINGS_WRITE) saveProfile(@CurrentStore() storeId: string, @Body() dto: ProfileDto) { return this.onboarding.saveProfile(storeId, dto.profile); }
}
