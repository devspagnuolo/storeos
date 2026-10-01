import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
@Injectable() export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}
  async login(input: { email: string; password: string; storeSlug: string }) { const store = await this.prisma.store.findUnique({ where: { slug: input.storeSlug } }); const user = store && await this.prisma.user.findUnique({ where: { storeId_email: { storeId: store.id, email: input.email } }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } }); if (!user || user.status !== 'ACTIVE' || !(await argon2.verify(user.passwordHash, input.password))) throw new UnauthorizedException('Credenciais inválidas'); const permissions = user.roles.flatMap(x => x.role.permissions.map(p => p.permission.key)); const payload = { sub: user.id, storeId: store.id, permissions }; return { accessToken: await this.jwt.signAsync(payload), expiresIn: 900 }; }
}
