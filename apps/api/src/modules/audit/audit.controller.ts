import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { AuditService } from './audit.service';

class ListAuditQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(60) entity?: string;
  @IsOptional() @IsString() @MaxLength(100) action?: string;
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @IsIn(['SUCCESS', 'DENIED', 'FAILURE']) outcome?: string;
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
}

@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get() @RequirePermissions(Permissions.AUDIT_READ)
  list(@CurrentStore() storeId: string, @Query() query: ListAuditQuery) { return this.audit.list(storeId, query); }
}
