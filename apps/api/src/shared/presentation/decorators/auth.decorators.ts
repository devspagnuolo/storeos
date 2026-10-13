import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@storeos/contracts';
import { NotFoundError, UnauthorizedError } from '../../domain/errors';
import type { AppRequest, AuthContext, StoreContext } from '../request.types';

export const IS_PUBLIC = 'storeos:is_public';
export const AUTH_KIND = 'storeos:auth_kind';
export const PERMISSIONS_KEY = 'storeos:permissions';

/** Rota sem exigência de autenticação (token opcional é lido se presente). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Rota autenticada como cliente final da loja (conta do storefront). */
export const CustomerAuth = () => SetMetadata(AUTH_KIND, 'customer');
/** Exige todas as permissões RBAC informadas (staff). */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
});

/** Autenticação opcional (rotas @Public que personalizam a resposta quando há token). */
export const CurrentAuthOptional = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext | undefined => {
  return ctx.switchToHttp().getRequest<AppRequest>().auth;
});

/** storeId do token do staff/cliente autenticado. */
export const AuthStoreId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth) throw new UnauthorizedError();
  return req.auth.storeId;
});

/** Loja resolvida a partir de header/host/query em rotas públicas do storefront. */
export const PublicStore = createParamDecorator((_: unknown, ctx: ExecutionContext): StoreContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.store) throw new NotFoundError('Loja não encontrada. Informe o header x-store-slug.', 'STORE_NOT_FOUND');
  return req.store;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string | undefined => {
  return ctx.switchToHttp().getRequest<AppRequest>().ip;
});

export const UserAgent = createParamDecorator((_: unknown, ctx: ExecutionContext): string | undefined => {
  return ctx.switchToHttp().getRequest<AppRequest>().headers['user-agent'];
});
