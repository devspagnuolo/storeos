import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { AccountService } from './account.service';

class RequestCodeDto {
  @IsString() @Length(1, 80) storeSlug!: string;
  @IsEmail() @MaxLength(200) email!: string;
}

class VerifyCodeDto extends RequestCodeDto {
  @IsString() @Matches(/^\s*\d{3}\s?\d{3}\s*$/) code!: string;
}

class UpdateAccountDto {
  @IsOptional() @IsString() @Length(3, 120) name?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string | null;
  @IsOptional() @IsBoolean() marketingOptIn?: boolean;
}

/** O token da sessão do cliente chega no cabeçalho x-customer-token (a vitrine o guarda num cookie httpOnly). */
@ApiTags('Account')
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  // As telas chamam estas rotas pelo servidor do site, então o IP é o mesmo para todas as clientes:
  // o limite por IP fica folgado e a proteção real é por e-mail (3 códigos a cada 15 min, 5 tentativas por código).
  @Post('login/request') @HttpCode(202) @Throttle({ default: { limit: 60, ttl: 60_000 } })
  request(@Body() dto: RequestCodeDto) { return this.account.requestCode(dto.storeSlug, dto.email); }

  @Post('login/verify') @HttpCode(200) @Throttle({ default: { limit: 120, ttl: 60_000 } })
  verify(@Body() dto: VerifyCodeDto) { return this.account.verifyCode(dto.storeSlug, dto.email, dto.code); }

  @Post('logout') @HttpCode(200)
  async logout(@Headers('x-customer-token') token?: string) { return this.account.logout(await this.account.authenticate(token)); }

  @Get('me')
  async me(@Headers('x-customer-token') token?: string) { return this.account.me(await this.account.authenticate(token)); }

  @Patch('me')
  async update(@Body() dto: UpdateAccountDto, @Headers('x-customer-token') token?: string) { return this.account.update(await this.account.authenticate(token), dto); }

  @Get('orders')
  async orders(@Headers('x-customer-token') token?: string) { return this.account.orders(await this.account.authenticate(token)); }

  @Get('orders/:number')
  async order(@Param('number') number: string, @Headers('x-customer-token') token?: string) { return this.account.order(await this.account.authenticate(token), number); }
}
