import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const CurrentStore = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user.storeId as string);
