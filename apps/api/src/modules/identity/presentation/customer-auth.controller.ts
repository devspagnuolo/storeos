import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { customerLoginSchema, customerRegisterSchema, refreshSchema } from '@storeos/contracts';
import { z } from 'zod';
import { ClientIp, CurrentAuth, CustomerAuth, Public, PublicStore, UserAgent } from '../../../shared/presentation/decorators/auth.decorators';
import { ZodBody } from '../../../shared/presentation/pipes/zod';
import type { AuthContext, StoreContext } from '../../../shared/presentation/request.types';
import { CustomerAuthService } from '../application/customer-auth.service';

@ApiTags('Auth (cliente)')
@ApiHeader({ name: 'x-store-slug', required: false })
@Controller('store/auth')
export class CustomerAuthController {
  constructor(private readonly auth: CustomerAuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post('register')
  register(
    @PublicStore() store: StoreContext,
    @ZodBody(customerRegisterSchema) body: z.infer<typeof customerRegisterSchema>,
    @ClientIp() ip?: string,
    @UserAgent() userAgent?: string,
  ) {
    return this.auth.register({ ...body, storeId: store.id, meta: { ip, userAgent } });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(
    @PublicStore() store: StoreContext,
    @ZodBody(customerLoginSchema) body: z.infer<typeof customerLoginSchema>,
    @ClientIp() ip?: string,
    @UserAgent() userAgent?: string,
  ) {
    return this.auth.login(store.id, body.email, body.password, { ip, userAgent });
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@ZodBody(refreshSchema) body: z.infer<typeof refreshSchema>, @ClientIp() ip?: string, @UserAgent() userAgent?: string) {
    return this.auth.refresh(body.refreshToken, { ip, userAgent });
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@ZodBody(refreshSchema) body: z.infer<typeof refreshSchema>) {
    await this.auth.logout(body.refreshToken);
  }

  @CustomerAuth()
  @ApiBearerAuth()
  @Get('me')
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me(auth.subjectId, auth.storeId);
  }
}
