import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByLogin(login: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { login } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Nomes dos perfis (papéis) atribuídos ao usuário, ex.: ['SOLICITANTE','APROVADOR']. */
  async getPerfis(userId: string): Promise<string[]> {
    const rows = await this.prisma.userPerfil.findMany({
      where: { userId },
      include: { perfil: true },
    });
    return rows.map((r) => r.perfil.nome);
  }
}
