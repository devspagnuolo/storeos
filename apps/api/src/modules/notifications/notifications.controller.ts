import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Put, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { isTemplateKey, renderMail, SAMPLE_VARS, TEMPLATE_DEFS, TemplateKey, validateTemplate, VARIABLES } from './email-templates';

class PageQuery { @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number; }

class TemplateDto { @IsString() @MaxLength(400) subject!: string; @IsString() @MaxLength(4000) body!: string; @IsOptional() @IsBoolean() enabled?: boolean; }
class PreviewDto { @IsString() @MaxLength(400) subject!: string; @IsString() @MaxLength(4000) body!: string; }

function keyOf(raw: string): TemplateKey {
  if (!isTemplateKey(raw)) throw new NotFoundException('Modelo de e-mail não encontrado');
  return raw;
}

@ApiTags('Notifications') @Controller('notifications') export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('emails') @RequirePermissions(Permissions.SETTINGS_WRITE) async emails(@CurrentStore() storeId: string, @Query() { page = 1, pageSize = 25 }: PageQuery) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.emailLog.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.emailLog.count({ where: { storeId } }),
    ]);
    return { items, total, page, pageSize, provider: process.env.RESEND_API_KEY ? 'resend' : 'simulated' };
  }

  /** Modelos de e-mail: o padrão do sistema e o que a loja personalizou. */
  @Get('templates') @RequirePermissions(Permissions.SETTINGS_WRITE) async templates(@CurrentStore() storeId: string) {
    const saved = await this.prisma.emailTemplate.findMany({ where: { storeId } });
    return (Object.keys(TEMPLATE_DEFS) as TemplateKey[]).map(key => {
      const def = TEMPLATE_DEFS[key]; const row = saved.find(t => t.key === key);
      return { key, label: def.label, description: def.description, variables: def.variables.map(name => ({ name, description: VARIABLES[name] })), defaultSubject: def.subject, defaultBody: def.body, subject: row?.subject ?? def.subject, body: row?.body ?? def.body, enabled: row?.enabled ?? true, customized: Boolean(row) };
    });
  }

  @Put('templates/:key') @RequirePermissions(Permissions.SETTINGS_WRITE) async saveTemplate(@CurrentStore() storeId: string, @Param('key') raw: string, @Body() dto: TemplateDto) {
    const key = keyOf(raw);
    const problem = validateTemplate(key, dto.subject, dto.body);
    if (problem) throw new BadRequestException(problem);
    const data = { subject: dto.subject.trim(), body: dto.body.replace(/\r\n/g, '\n').trim(), enabled: dto.enabled ?? true };
    await this.prisma.emailTemplate.upsert({ where: { storeId_key: { storeId, key } }, create: { storeId, key, ...data }, update: data });
    return { saved: true };
  }

  /** Volta ao texto padrão do sistema. */
  @Delete('templates/:key') @HttpCode(204) @RequirePermissions(Permissions.SETTINGS_WRITE) async restoreTemplate(@CurrentStore() storeId: string, @Param('key') raw: string) {
    await this.prisma.emailTemplate.deleteMany({ where: { storeId, key: keyOf(raw) } });
  }

  /** Mostra como o e-mail ficará, com dados de exemplo e sem gravar nada. */
  @Post('templates/:key/preview') @HttpCode(200) @RequirePermissions(Permissions.SETTINGS_WRITE) async previewTemplate(@CurrentStore() storeId: string, @Param('key') raw: string, @Body() dto: PreviewDto) {
    const key = keyOf(raw);
    const problem = validateTemplate(key, dto.subject, dto.body);
    if (problem) throw new BadRequestException(problem);
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true } });
    const mail = renderMail(key, { ...SAMPLE_VARS, loja: store.name }, { override: { subject: dto.subject, body: dto.body, enabled: true }, footer: key === 'cart-reminder' ? { text: 'Não quer receber este lembrete? https://loja.exemplo.com.br/recuperar/abc123?sair=1', html: '<a href="https://loja.exemplo.com.br/recuperar/abc123?sair=1" style="color:#94a3b8">Não quero receber este lembrete</a>' } : undefined });
    return { subject: mail!.subject, text: mail!.text, html: mail!.html };
  }
}
