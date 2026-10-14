import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { DomainsService } from './domains.service';

class AddDomainDto { @IsString() @MaxLength(300) hostname!: string; }

@ApiTags('Domínios')
@Controller('store')
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get('domains') @RequirePermissions(Permissions.SETTINGS_WRITE)
  @ApiOperation({ summary: 'Domínios da loja, registros DNS a criar e estado de cada um' })
  list(@CurrentStore() storeId: string) { return this.domains.list(storeId); }

  @Post('domains') @RequirePermissions(Permissions.SETTINGS_WRITE)
  @ApiOperation({ summary: 'Cadastrar domínio próprio (fica pendente até validar DNS e HTTPS)' })
  add(@CurrentStore() storeId: string, @Body() dto: AddDomainDto) { return this.domains.add(storeId, dto.hostname); }

  @Post('domains/:id/verify') @HttpCode(200) @RequirePermissions(Permissions.SETTINGS_WRITE)
  @ApiOperation({ summary: 'Verificar posse (TXT), apontamento (CNAME/A) e certificado HTTPS' })
  verify(@CurrentStore() storeId: string, @Param('id') id: string) { return this.domains.verify(storeId, id); }

  @Post('domains/:id/primary') @HttpCode(200) @RequirePermissions(Permissions.SETTINGS_WRITE)
  @ApiOperation({ summary: 'Definir o domínio principal (somente ativo)' })
  primary(@CurrentStore() storeId: string, @Param('id') id: string) { return this.domains.makePrimary(storeId, id); }

  @Delete('domains/:id') @RequirePermissions(Permissions.SETTINGS_WRITE)
  @ApiOperation({ summary: 'Remover domínio' })
  remove(@CurrentStore() storeId: string, @Param('id') id: string) { return this.domains.remove(storeId, id); }

  @Get('by-host')
  @ApiOperation({ summary: 'Qual loja atende este domínio (somente domínios ativos)' })
  byHost(@Query('host') host: string) { return this.domains.storeSlugByHost(host); }
}
