import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

class PageQuery { @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number; }

@ApiTags('Notifications') @Controller('notifications') export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('emails') @RequirePermissions(Permissions.SETTINGS_WRITE) async emails(@CurrentStore() storeId: string, @Query() { page = 1, pageSize = 25 }: PageQuery) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.emailLog.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.emailLog.count({ where: { storeId } }),
    ]);
    return { items, total, page, pageSize, provider: process.env.RESEND_API_KEY ? 'resend' : 'simulated' };
  }
}
