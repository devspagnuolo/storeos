import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions';

const contextFor = (permissions: string[] | undefined) => ({
  getHandler: () => undefined,
  getClass: () => undefined,
  switchToHttp: () => ({ getRequest: () => ({ user: permissions && { permissions } }) }),
}) as unknown as ExecutionContext;

describe('PermissionsGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector & { getAllAndOverride: jest.Mock };
  const guard = new PermissionsGuard(reflector);

  it('libera quando o token tem todas as permissões', () => {
    reflector.getAllAndOverride.mockReturnValue(['catalog.write']);
    expect(guard.canActivate(contextFor(['catalog.write', 'orders.read']))).toBe(true);
  });

  it('bloqueia quando falta permissão', () => {
    reflector.getAllAndOverride.mockReturnValue(['catalog.write']);
    expect(() => guard.canActivate(contextFor(['orders.read']))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });
});
