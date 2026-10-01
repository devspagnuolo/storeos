import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
@Injectable() export class JwtAuthGuard implements CanActivate { constructor(private readonly jwt: JwtService) {} async canActivate(context: ExecutionContext) { const request = context.switchToHttp().getRequest(); const token = request.headers.authorization?.replace('Bearer ', ''); if (!token) throw new UnauthorizedException(); try { request.user = await this.jwt.verifyAsync(token); return true; } catch { throw new UnauthorizedException(); } } }
