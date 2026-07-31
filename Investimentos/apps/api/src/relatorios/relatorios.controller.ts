import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RelatoriosService } from './relatorios.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveEffective } from '../common/effective-user';

interface AuthRequest extends Request {
  user: { sub: string; login: string; perfis?: string[] };
}

@Controller('relatorios')
@UseGuards(JwtAuthGuard)
export class RelatoriosController {
  constructor(
    private readonly service: RelatoriosService,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * KPIs da tela inicial (ano corrente). Usuário comum vê só o seu; admin
   * (real ou efetivo, via simulação) vê o de todos.
   */
  @Get('dashboard')
  async dashboard(@Req() req: AuthRequest) {
    const efetivo = await resolveEffective(req, this.users, this.prisma);
    // Admin e Viewer enxergam TODAS as solicitações; demais, só as próprias.
    const verTudo =
      efetivo.perfis.includes('ADMIN') || efetivo.perfis.includes('VIEWER');
    return this.service.dashboard({
      userId: efetivo.id,
      isAdmin: verTudo,
    });
  }

  @Get('pendencias-por-etapa')
  pendencias() {
    return this.service.pendenciasPorEtapa();
  }

  @Get('valores-por-grupo')
  valores() {
    return this.service.valoresPorGrupo();
  }

  @Get('tempo-medio-aprovacao')
  tempoMedio() {
    return this.service.tempoMedioAprovacao();
  }
}
