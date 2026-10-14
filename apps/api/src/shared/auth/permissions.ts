import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';

export const PERMISSIONS_KEY = 'storeos:permissions';

export const Permissions = {
  CATALOG_WRITE: 'catalog.write',
  ORDERS_READ: 'orders.read',
  ORDERS_WRITE: 'orders.write',
  SETTINGS_WRITE: 'settings.write',
  AUDIT_READ: 'audit.read',
  MARKETING_WRITE: 'marketing.write',
} as const;

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const granted: string[] = context.switchToHttp().getRequest().user?.permissions ?? [];
    if (required.every(permission => granted.includes(permission))) return true;
    throw new ForbiddenException('Permissão insuficiente');
  }
}

/** Exige token válido e todas as permissões informadas. */
export function RequirePermissions(...permissions: string[]) {
  return applyDecorators(SetMetadata(PERMISSIONS_KEY, permissions), UseGuards(JwtAuthGuard, PermissionsGuard), ApiBearerAuth());
}
