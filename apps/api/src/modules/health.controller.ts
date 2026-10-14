import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../shared/infrastructure/prisma.service';

@ApiExcludeController()
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: o processo responde. Não toca o banco, para o Render não reiniciar o serviço por uma falha do banco. */
  @Get('health')
  health() { return { status: 'ok', service: 'storeos-api' }; }

  /** Readiness: o banco responde. */
  @Get('ready')
  async ready() {
    try { await this.prisma.$queryRaw`SELECT 1`; } catch { throw new ServiceUnavailableException({ status: 'unavailable', database: 'down' }); }
    return { status: 'ok', database: 'up' };
  }
}
