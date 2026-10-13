import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CacheService } from '../../shared/infrastructure/cache/cache.service';
import { RabbitMqService } from '../../shared/infrastructure/messaging/rabbitmq.service';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { Public } from '../../shared/presentation/decorators/auth.decorators';

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly rabbit: RabbitMqService,
  ) {}

  /** Liveness: o processo responde. */
  @Get('live')
  live() {
    return { status: 'ok', service: 'storeos-api', uptimeSeconds: Math.round(process.uptime()) };
  }

  /** Readiness: dependências críticas respondem. */
  @Get()
  async ready() {
    const checks = {
      database: await this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      cache: await this.cache.ping(),
      messaging: this.rabbit.isConnected(),
    };
    const status = checks.database ? 'ok' : 'down';
    if (status !== 'ok') throw new ServiceUnavailableException({ status, checks });
    return { status, checks, cacheBackend: this.cache.backend, messaging: this.rabbit.enabled ? 'rabbitmq' : 'disabled' };
  }
}
