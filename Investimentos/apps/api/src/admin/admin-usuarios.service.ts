import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { PERFIS } from '../common/constants/perfis';
import { registrarEvento } from '../common/auditoria';
import type {
  AdminUsuarioCreate,
  AdminUsuarioUpdate,
} from '@investimentos/shared';

@Injectable()
export class AdminUsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async list() {
    const users = await this.prisma.user.findMany({
      orderBy: { nome: 'asc' },
      include: { perfis: { include: { perfil: true } } },
    });
    return users.map((u) => this.toDto(u));
  }

  async create(dto: AdminUsuarioCreate) {
    const [existingLogin, existingEmail] = await Promise.all([
      this.prisma.user.findUnique({ where: { login: dto.login } }),
      this.prisma.user.findUnique({ where: { email: dto.email } }),
    ]);
    if (existingLogin) throw new ConflictException('Login já cadastrado');
    if (existingEmail) throw new ConflictException('E-mail já cadastrado');

    const tempPassword = this.generateTempPassword();
    const senhaHash = await this.auth.hashPassword(tempPassword);

    const perfilRows = dto.perfis.length
      ? await this.prisma.perfil.findMany({ where: { nome: { in: dto.perfis } } })
      : [];

    const user = await this.prisma.user.create({
      data: {
        login: dto.login,
        nome: dto.nome,
        email: dto.email,
        senhaHash,
        mustChangePwd: true,
        perfis: { create: perfilRows.map((p) => ({ perfilId: p.id })) },
      },
      include: { perfis: { include: { perfil: true } } },
    });

    return { ...this.toDto(user), tempPassword };
  }

  async update(id: string, dto: AdminUsuarioUpdate) {
    await this.ensureExists(id);
    if (dto.email) {
      const conflito = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id } },
      });
      if (conflito) throw new ConflictException('E-mail já cadastrado por outro usuário');
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      include: { perfis: { include: { perfil: true } } },
    });
    return this.toDto(user);
  }

  async setAtivo(id: string, ativo: boolean, requestingUserId: string) {
    if (id === requestingUserId && !ativo) {
      throw new BadRequestException('Não é possível desativar o próprio usuário');
    }
    await this.ensureExists(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { ativo },
      include: { perfis: { include: { perfil: true } } },
    });
    return this.toDto(user);
  }

  async setPerfis(id: string, perfis: string[], requestingUserId: string) {
    await this.ensureExists(id);
    if (id === requestingUserId && !perfis.includes(PERFIS.ADMIN)) {
      throw new BadRequestException(
        'Não é possível remover seu próprio perfil de Administrador',
      );
    }
    const perfilRows = perfis.length
      ? await this.prisma.perfil.findMany({ where: { nome: { in: perfis } } })
      : [];

    await this.prisma.$transaction([
      this.prisma.userPerfil.deleteMany({ where: { userId: id } }),
      this.prisma.userPerfil.createMany({
        data: perfilRows.map((p) => ({ userId: id, perfilId: p.id })),
      }),
    ]);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: { perfis: { include: { perfil: true } } },
    });
    return this.toDto(user);
  }

  async resetSenha(id: string) {
    await this.ensureExists(id);
    const tempPassword = this.generateTempPassword();
    const senhaHash = await this.auth.hashPassword(tempPassword);
    await this.prisma.user.update({
      where: { id },
      data: { senhaHash, mustChangePwd: true },
    });
    return { tempPassword };
  }

  /**
   * Registra na trilha de auditoria o início de uma simulação de usuário
   * (admin "vira" outro usuário, só-leitura). O front chama isso ANTES de
   * ativar o header `x-simulate-user`, então esta chamada em si não é
   * bloqueada pelo interceptor de simulação (é POST, mas sem o header ainda).
   */
  async simular(id: string, adminId: string, adminLogin: string) {
    const alvo = await this.ensureExists(id);
    await registrarEvento(this.prisma, {
      entidade: 'Simulacao',
      entidadeId: id,
      usuarioId: adminId,
      acao: 'SIMULACAO_INICIADA',
      dados: { alvo: id, adminLogin },
    });
    return { ok: true, alvo: { id: alvo.id, login: alvo.login, nome: alvo.nome } };
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  /** Gera senha temporária que já satisfaz a política (maiúscula/minúscula/dígito/símbolo/12+). */
  private generateTempPassword(): string {
    return 'Aa1!' + randomBytes(10).toString('base64url');
  }

  private toDto(user: {
    id: string;
    login: string;
    nome: string;
    email: string;
    ativo: boolean;
    mustChangePwd: boolean;
    dtCriacao: Date;
    perfis: { perfil: { nome: string } }[];
  }) {
    return {
      id: user.id,
      login: user.login,
      nome: user.nome,
      email: user.email,
      ativo: user.ativo,
      mustChangePwd: user.mustChangePwd,
      dtCriacao: user.dtCriacao,
      perfis: user.perfis.map((p) => p.perfil.nome),
    };
  }
}
