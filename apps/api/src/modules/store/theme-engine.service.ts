import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
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
      if (definition) {
        validateAt(definition.settingsSchema, section.settings, `$.templates.${pageType}.sections[${index}].settings`, `${releaseKey}:${section.type}`);
        const blockDefinitions = new Map((definition.blockDefinitions ?? []).map(block => [block.type, block]));
        section.blocks.forEach((block, blockIndex) => {
          const blockDefinition = blockDefinitions.get(block.type);
          if (blockDefinition) validateAt(
            blockDefinition.settingsSchema,
            block.settings,
            `$.templates.${pageType}.sections[${index}].blocks[${blockIndex}].settings`,
            `${releaseKey}:${section.type}:${block.type}`,
          );
        });
      }
    });
    for (const definition of manifest.sections.filter(item => item.required && item.allowedPageTypes.some(type => type === pageType))) {
      const requiredSection = template.sections.find(section => section.type === definition.type && section.enabled);
      if (!requiredSection) {
        issues.push({
          path: `$.templates.${pageType}.sections`,
          code: 'INVALID_SECTION',
          message: `A seção obrigatória “${definition.title}” precisa permanecer visível.`,
        });
      }
    }
  }
  const publicHomeComponents = new Set([
    'storeos.announcement.v1',
    'storeos.header.v1',
    'storeos.hero.v1',
    'storeos.category-grid.v1',
    'storeos.product-collection.v1',
    'storeos.benefits.v1',
    'storeos.rich-text.v1',
    'storeos.newsletter.v1',
    'storeos.footer.v1',
  ]);
  for (const [index, section] of (typed.templates.home?.sections ?? []).entries()) {
    if (section.enabled && !publicHomeComponents.has(section.type)) {
      issues.push({
        path: `$.templates.home.sections[${index}].type`,
        code: 'INVALID_SECTION',
        message: 'Este componente ainda não está disponível na vitrine pública. Oculte-o ou aguarde a próxima versão do runtime.',
      });
    }
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
      // Reinstalar não pode tirar do ar um tema ativo: só reativa como inativo uma instalação removida.
      const existing = await tx.themeInstallation.findUnique({ where: { storeId_releaseId: { storeId, releaseId } } });
      const installation = existing
        ? (existing.status === 'REMOVED' ? await tx.themeInstallation.update({ where: { id_storeId: { id: existing.id, storeId } }, data: { status: 'INACTIVE' } }) : existing)
        : await tx.themeInstallation.create({ data: { storeId, releaseId, status: 'INACTIVE' } });
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
    const issues = settingsIssues(document, manifest);
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
 
  async publish(storeId: string, installationId: string, expectedRevision: number, actorId: string) {
    const current = await this.getDraft(storeId, installationId);
    if (current.draft.revision !== expectedRevision) {
      throw new ConflictException('O rascunho mudou em outra sessão. Recarregue antes de publicar.');
    }
    const manifest = current.installation.release.manifest as unknown as ThemeReleaseManifest;
    const issues = settingsIssues(current.draft.document, manifest);
    if (issues.length) {
      throw new UnprocessableEntityException({ message: 'Revise o layout antes de publicar.', issues });
    }
    const serialized = JSON.stringify(current.draft.document);
    const documentHash = createHash('sha256').update(serialized).digest('hex');

    return this.prisma.$transaction(async tx => {
      const latestDraft = await tx.themeDraft.findFirst({
        where: { id: current.draft.id, storeId, installationId, status: 'DRAFT', revision: expectedRevision },
        select: { id: true },
      });
      if (!latestDraft) throw new ConflictException('O rascunho mudou em outra sessão. Recarregue antes de publicar.');

      const previous = await tx.themeEnginePublication.findFirst({
        where: { storeId }, orderBy: { version: 'desc' }, select: { version: true },
      });
      const version = (previous?.version ?? 0) + 1;
      const publication = await tx.themeEnginePublication.create({
        data: {
          storeId,
          installationId,
          version,
          document: current.draft.document as Prisma.InputJsonValue,
          documentHash,
          actorId,
        },
      });
      await tx.themeInstallation.updateMany({
        where: { storeId, status: 'ACTIVE', id: { not: installationId } },
        data: { status: 'INACTIVE' },
      });
      await tx.themeInstallation.update({
        where: { id_storeId: { id: installationId, storeId } },
        data: { status: 'ACTIVE' },
      });
      return publication;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /** Desativa o tema do motor: a página inicial volta a obedecer ao editor da loja. Publicações ficam no histórico. */
  async deactivate(storeId: string, installationId: string) {
    const result = await this.prisma.themeInstallation.updateMany({
      where: { id: installationId, storeId, status: 'ACTIVE' },
      data: { status: 'INACTIVE' },
    });
    if (result.count !== 1) throw new NotFoundException('Nenhum tema ativo com este identificador.');
    return { ok: true };
  }
}
