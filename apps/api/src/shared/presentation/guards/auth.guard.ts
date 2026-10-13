import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Permission } from '@storeos/contracts';
import { ForbiddenError, UnauthorizedError } from '../../domain/errors';
import { RequestContext } from '../../infrastructure/request-context';
import { AUTH_KIND, IS_PUBLIC, PERMISSIONS_KEY } from '../decorators/auth.decorators';
import type { AccessTokenPayload, AppRequest } from '../request.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets) ?? false;
    const kind = this.reflector.getAllAndOverride<'user' | 'customer'>(AUTH_KIND, targets) ?? 'user';
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, targets) ?? [];
    const req = context.switchToHttp().getRequest<AppRequest>();

    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;

    let payload: AccessTokenPayload | undefined;
    if (token) {
      try {
        payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { issuer: 'storeos' });
      } catch {
        payload = undefined;
      }
    }

    if (isPublic) {
      if (payload && (payload.typ === 'user' || payload.typ === 'customer')) this.attach(req, payload);
      return true;
    }

    if (!payload) throw new UnauthorizedError('Token ausente ou inválido', 'INVALID_TOKEN');
    if (payload.typ !== kind) throw new ForbiddenError('Tipo de credencial inválido para esta rota');

    this.attach(req, payload);
    const permissions = payload.perms ?? [];
    const missing = required.filter((p) => !permissions.includes(p));
    if (missing.length) throw new ForbiddenError(`Permissão necessária: ${missing.join(', ')}`, 'MISSING_PERMISSION');
    return true;
  }

  private attach(req: AppRequest, payload: AccessTokenPayload): void {
    const type = payload.typ === 'customer' ? 'customer' : 'user';
    req.auth = { type, subjectId: payload.sub, storeId: payload.sid, permissions: payload.perms ?? [] };
    RequestContext.set({
      storeId: payload.sid,
      actorType: type === 'customer' ? 'CUSTOMER' : 'USER',
      actorId: payload.sub,
    });
  }
}
