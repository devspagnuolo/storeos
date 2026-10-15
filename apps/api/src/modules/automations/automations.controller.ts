import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { Action, Conditions, MAX_DELAY_MINUTES } from './automation-rules';
import { AutomationsService } from './automations.service';

class RuleDto {
  @IsString() @Length(3, 80) name!: string;
  @IsString() @MaxLength(80) trigger!: string;
  @IsOptional() @IsObject() conditions?: Conditions;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_DELAY_MINUTES) delayMinutes?: number;
  @IsArray() actions!: Action[];
  @IsOptional() @IsBoolean() active?: boolean;
}
class UpdateRuleDto {
  @IsOptional() @IsString() @Length(3, 80) name?: string;
  @IsOptional() @IsString() @MaxLength(80) trigger?: string;
  @IsOptional() @IsObject() conditions?: Conditions;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_DELAY_MINUTES) delayMinutes?: number;
  @IsOptional() @IsArray() actions?: Action[];
  @IsOptional() @IsBoolean() active?: boolean;
}

@ApiTags('Automações') @Controller('automations') @RequirePermissions(Permissions.MARKETING_WRITE) export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}
  @Get() list(@CurrentStore() storeId: string) { return this.automations.list(storeId); }
  @Get('presets') presets() { return this.automations.presets(); }
  @Get('runs') runs(@CurrentStore() storeId: string, @Query('ruleId') ruleId?: string) { return this.automations.runs(storeId, ruleId); }
  @Post() create(@CurrentStore() storeId: string, @Body() dto: RuleDto) { return this.automations.create(storeId, dto, dto.active ?? false); }
  @Post('presets/:key') createFromPreset(@CurrentStore() storeId: string, @Param('key') key: string) { return this.automations.createFromPreset(storeId, key); }
  @Patch(':id') update(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: UpdateRuleDto) { return this.automations.update(storeId, id, dto); }
  @Delete(':id') @HttpCode(200) remove(@CurrentStore() storeId: string, @Param('id') id: string) { return this.automations.remove(storeId, id); }
}
