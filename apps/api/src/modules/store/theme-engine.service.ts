import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Ajv, { ValidateFunction } from 'ajv';
import { ThemeDocument, ThemeDocumentIssue, ThemeReleaseManifest, validateThemeDocument } from '@storeos/contracts';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

const ajv = new Ajv({ allErrors: true, strict: true, validateFormats: false, addUsedSchema: false });
const schemaCache = new Map<string, ValidateFunction>();

function settingsIssues(document: unknown, manifest: ThemeReleaseManifest): ThemeDocumentIssue[] {
  const issues = validateThemeDocument(document, manifest);
  if (issues.length || !document || typeof document !== 'object') return issues;
  const typed = document as ThemeDocument;
  const validateAt = (schema: Record<string, unknown>, value: unknown, path: string, cacheKey: string) => {
    try {
      let validate = schemaCache.get(cacheKey);
      if (!validate) { validate = ajv.compile(schema); schemaCache.set(cacheKey, validate); }
      if (!validate(value)) {
        for (const error of validate.errors ?? []) {
          issues.push({ path: `${path}${error.instancePath}`, code: 'INVALID_SETTINGS', message: 'A configuração não corresponde aos campos aceitos por este tema.' });
        }
      }
    } catch {
      issues.push({ path, code: 'INVALID_SETTINGS', message: 'O schema de configurações deste tema é inválido.' });
    }
  };
  const releaseKey = `${manifest.slug}@${manifest.version}`;
  validateAt(manifest.globalSettingsSchema, typed.global.settings, '$.global.settings', `${releaseKey}:global`);
  for (const [pageType, template] of Object.entries(typed.templates)) {
    template.sections.forEach((section, index) => {
      const definition = manifest.sections.find(item => item.type === section.type);
      if (definition) validateAt(definition.settingsSchema, section.settings, `$.templates.${pageType}.sections[${index}].settings`, `${releaseKey}:${section.type}`);
    });
  }
  return issues;
}

@Injectable()
export class ThemeEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async listLibrary() {
    return this.prisma.themeRelease.findMany({
      where: { status: 'PUBLISHED', package: { status: 'LISTED' } },
      include: { package: { select: { key: true, name: true, description: true } } },
      orderBy: [{ package: { name: 'asc' } }, { publishedAt: 'desc' }],
    });
  }

  async listInstallations(storeId: string) {
    return this.prisma.themeInstallation.findMany({
      where: { storeId, status: { not: 'REMOVED' } },
      include: {
        release: { include: { package: { select: { key: true, name: true } } } },
        drafts: { where: { status: 'DRAFT' }, orderBy: { updatedAt: 'desc' }, take: 1 },
      },
      orderBy: { installedAt: 'desc' },
    });
  }

  async install(storeId: string, releaseId: string, actorId: string) {
    const release = await this.prisma.themeRelease.findFirst({
      where: { id: releaseId, status: 'PUBLISHED', package: { status: 'LISTED' } },
      include: { package: true },
    });
    if (!release) throw new NotFoundException('Tema publicado não encontrado.');
    const manifest = release.manifest as unknown as ThemeReleaseManifest;
    const issues = settingsIssues(manifest.defaultDocument, manifest);
    if (issues.length) throw new UnprocessableEntityException({ message: 'O tema publicado contém um layout inicial inválido.', issues });

    return this.prisma.$transaction(async tx => {
      const installation = await tx.themeInstallation.upsert({
        where: { storeId_releaseId: { storeId, releaseId } },
        create: { storeId, releaseId, status: 'INACTIVE' },
        update: { status: 'INACTIVE' },
      });
      const existingDraft = await tx.themeDraft.findFirst({
        where: { storeId, installationId: installation.id, status: 'DRAFT' },
        orderBy: { updatedAt: 'desc' },
      });
      const draft = existingDraft ?? await tx.themeDraft.create({
        data: {
          storeId,
          installationId: installation.id,
          document: manifest.defaultDocument as unknown as Prisma.InputJsonValue,
          updatedBy: actorId,
        },
      });
      return { installation, draft };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async getDraft(storeId: string, installationId: string) {
    const installation = await this.prisma.themeInstallation.findFirst({
      where: { id: installationId, storeId, status: { not: 'REMOVED' } },
      include: {
        release: { include: { package: { select: { key: true, name: true } } } },
        drafts: { where: { status: 'DRAFT' }, orderBy: { updatedAt: 'desc' }, take: 1 },
      },
    });
    if (!installation) throw new NotFoundException('Tema instalado não encontrado.');
    const draft = installation.drafts[0];
    if (!draft) throw new NotFoundException('Este tema ainda não possui rascunho.');
    return { installation, draft };
  }

  async saveDraft(storeId: string, installationId: string, expectedRevision: number, document: unknown, actorId: string) {
    const current = await this.getDraft(storeId, installationId);
    const manifest = current.installation.release.manifest as unknown as ThemeReleaseManifest;
    const issues = validateThemeDocument(document, manifest);
    if (issues.length) throw new UnprocessableEntityException({ message: 'Revise as configurações do tema.', issues });
    const updated = await this.prisma.themeDraft.updateMany({
      where: { id: current.draft.id, storeId, revision: expectedRevision, status: 'DRAFT' },
      data: {
        document: document as Prisma.InputJsonValue,
        revision: { increment: 1 },
        updatedBy: actorId,
      },
    });
    if (updated.count !== 1) throw new ConflictException('O rascunho mudou em outra sessão. Recarregue antes de salvar.');
    return this.prisma.themeDraft.findUniqueOrThrow({ where: { id: current.draft.id } });
  }
}
