import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { resolveJwtSecret } from '../../shared/auth/jwt-secret';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
@Module({ imports: [JwtModule.registerAsync({ global: true, useFactory: () => ({ secret: resolveJwtSecret(), signOptions: { expiresIn: '15m' } }) })], controllers: [AuthController], providers: [AuthService] }) export class AuthModule {}
