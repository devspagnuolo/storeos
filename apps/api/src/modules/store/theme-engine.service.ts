import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ThemeReleaseManifest, validateThemeDocument } from '@storeos/contracts';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

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
    const issues = validateThemeDocument(manifest.defaultDocument, manifest);
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
