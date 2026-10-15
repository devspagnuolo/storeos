import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ensureOwnerRole } from '../../shared/access/store-owner';
import { MAIL_PROVIDER, MailProvider } from '../notifications/mail-provider';
import { hashToken, isValidSlug, newVerificationToken, parseProfile, pickSlug, signupProblem, SignupInput, verificationMail } from './onboarding-rules';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService, @Inject(MAIL_PROVIDER) private readonly mail: MailProvider) {}

  enabled() { return process.env.SIGNUP_ENABLED === 'true'; }

  private ensureEnabled() {
    if (!this.enabled()) throw new NotFoundException('O cadastro de novas lojas está fechado no momento.');
  }

  private siteUrl() {
    const url = process.env.PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
    if (!url) throw new ServiceUnavailableException('Endereço do site não configurado (PUBLIC_SITE_URL).');
    return url.replace(/\/$/, '');
  }

  status() { return { enabled: this.enabled() }; }

  async slugAvailable(slug: string) {
    if (!isValidSlug(slug)) return { available: false };
    return { available: !(await this.prisma.store.findUnique({ where: { slug }, select: { id: true } })) };
  }

  async signup(input: SignupInput) {
    this.ensureEnabled();
    const site = this.siteUrl();
    const problem = signupProblem(input);
    if (problem) throw new BadRequestException(problem);
    const email = input.email.trim().toLowerCase();
    const similar = await this.prisma.store.findMany({ where: { slug: { startsWith: pickSlug(input.storeName, new Set()) ?? '-' } }, select: { slug: true } });
    const slug = pickSlug(input.storeName, new Set(similar.map(s => s.slug)));
    if (!slug) throw new BadRequestException('Não foi possível criar um endereço para esse nome de loja. Tente outro nome.');
    const owner = await ensureOwnerRole(this.prisma);
    const { token, hash, expiresAt } = newVerificationToken();
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    try {
      await this.prisma.$transaction(async tx => {
        const store = await tx.store.create({ data: { slug, name: input.storeName.trim(), storefrontOpen: false } });
        const user = await tx.user.create({ data: { storeId: store.id, email, name: input.ownerName.trim(), passwordHash, verificationHash: hash, verificationExpiresAt: expiresAt } });
        await tx.userRole.create({ data: { userId: user.id, roleId: owner.id } });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Esse endereço de loja acabou de ser usado. Tente novamente.');
      throw error;
    }
    await this.sendMail({ email, ownerName: input.ownerName, storeName: input.storeName.trim(), link: `${site}/criar-loja/confirmar?token=${token}` });
    return { storeSlug: slug, email };
  }

  async verify(token: string) {
    const user = await this.prisma.user.findFirst({ where: { verificationHash: hashToken(token) }, include: { store: { select: { slug: true, name: true } } } });
    if (!user) throw new BadRequestException('Link inválido ou já usado.');
    if (user.verificationExpiresAt && user.verificationExpiresAt < new Date()) throw new BadRequestException('Este link expirou. Peça um novo na tela de entrada.');
    await this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), verificationHash: null, verificationExpiresAt: null } });
    return { storeSlug: user.store.slug, storeName: user.store.name };
  }

  /** Resposta sempre igual, exista a conta ou não, para não revelar quem está cadastrado. */
  async resend(storeSlug: string, emailRaw: string) {
    this.ensureEnabled();
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { email, store: { slug: storeSlug }, verificationHash: { not: null } }, include: { store: { select: { name: true } } } });
    if (user) {
      const { token, hash, expiresAt } = newVerificationToken();
      await this.prisma.user.update({ where: { id: user.id }, data: { verificationHash: hash, verificationExpiresAt: expiresAt } });
      await this.sendMail({ email, ownerName: user.name, storeName: user.store.name, link: `${this.siteUrl()}/criar-loja/confirmar?token=${token}` });
    }
    return { sent: true };
  }

  async profile(storeId: string) {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { businessProfile: true } });
    return (store.businessProfile as Record<string, unknown> | null) ?? {};
  }

  async saveProfile(storeId: string, raw: unknown) {
    const parsed = parseProfile((raw ?? {}) as Record<string, unknown>);
    if (!parsed.ok) throw new BadRequestException(parsed.error);
    await this.prisma.store.update({ where: { id: storeId }, data: { businessProfile: parsed.profile } });
    return parsed.profile;
  }

  private async sendMail(input: { email: string; ownerName: string; storeName: string; link: string }) {
    const message = verificationMail(input);
    try {
      await this.mail.send({ to: input.email, subject: message.subject, text: message.text, html: message.html, from: process.env.MAIL_FROM ?? 'StoreOS <nao-responda@example.com>' });
    } catch {
      // A conta já existe; a pessoa pode pedir novo envio na tela de entrada.
    }
  }
}
