import { Controller, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { resolveEffective } from '../common/effective-user';

interface AuthRequest extends Request {
  user: { sub: string; login: string; perfis?: string[] };
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Identidade EFETIVA do usuário autenticado — usado pelo front para
   * saudação e RBAC de UI. Se um admin estiver simulando (header
   * `x-simulate-user`), retorna os dados do usuário simulado, com o bloco
   * `simulacao` indicando isso e trazendo a identidade real do admin.
   */
  @Get('me')
  async me(@Req() req: AuthRequest) {
    const efetivo = await resolveEffective(req, this.users, this.prisma);
    const user = await this.users.findById(efetivo.id);
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return {
      id: user.id,
      login: user.login,
      nome: user.nome,
      email: user.email,
      mustChangePwd: user.mustChangePwd,
      perfis: efetivo.perfis,
      simulacao: {
        simulando: efetivo.simulando,
        real: efetivo.real,
      },
    };
  }
}
