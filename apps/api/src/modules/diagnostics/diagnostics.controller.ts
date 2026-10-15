import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { DiagnosticsService } from './diagnostics.service';

@ApiTags('Diagnóstico')
@Controller('diagnostics')
@RequirePermissions(Permissions.SETTINGS_WRITE)
export class DiagnosticsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  @Get() @ApiOperation({ summary: 'Saúde das integrações (pagamento, frete, e-mail, Bling, fila) sem expor segredos' })
  run(@CurrentStore() storeId: string) { return this.diagnostics.run(storeId); }

  @Get('environment') @ApiOperation({ summary: 'Variáveis do servidor: definidas ou não, e as que o código não reconhece (só nomes, nunca valores)' })
  environment() { return this.diagnostics.environment(); }

  @Post('shipping-test') @HttpCode(200) @ApiOperation({ summary: 'Cotação real de frete para um CEP, com o primeiro produto ativo' })
  shippingTest(@CurrentStore() storeId: string, @Body('zip') zip: unknown) { return this.diagnostics.shippingTest(storeId, zip); }
}
