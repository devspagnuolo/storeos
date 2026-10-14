import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
class LoginDto { @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() email!: string; @IsString() @MinLength(8) password!: string; @IsString() storeSlug!: string; }
@ApiTags('Auth') @Controller('auth') export class AuthController { constructor(private readonly auth: AuthService) {} @Post('login') @Throttle({ default: { limit: 5, ttl: 60_000 } }) login(@Body() dto: LoginDto) { return this.auth.login(dto); } }
