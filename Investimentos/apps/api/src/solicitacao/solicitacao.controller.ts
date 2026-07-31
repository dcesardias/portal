import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SolicitacaoService } from './solicitacao.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PERFIS } from '../common/constants/perfis';
import {
  SolicitacaoCreateSchema,
  EnviarLoteSchema,
  type SolicitacaoCreate,
  type EnviarLoteInput,
} from '@investimentos/shared';
import { ZodValidationPipe } from '../common/pipes/zod.pipe';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveEffective } from '../common/effective-user';

// Perfis que podem CRIAR/EDITAR solicitações (tudo menos o VIEWER, que é só-leitura).
const PODE_SOLICITAR = [
  PERFIS.SOLICITANTE,
  PERFIS.APROVADOR,
  PERFIS.APROVADOR_FINAL,
  PERFIS.ADMIN,
] as const;

interface AuthRequest extends Request {
  user: { sub: string; login: string; perfis?: string[] };
}

@Controller('solicitacoes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SolicitacaoController {
  constructor(
    private readonly service: SolicitacaoService,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Roles(...PODE_SOLICITAR)
  async create(
    @Req() req: AuthRequest,
    @Body(new ZodValidationPipe(SolicitacaoCreateSchema)) dto: SolicitacaoCreate,
  ) {
    // Admin em simulação CRIA como o usuário simulado; simuladoPorId marca o admin real.
    const ef = await resolveEffective(req, this.users, this.prisma);
    return this.service.create(ef.id, dto, ef.simulando ? ef.real.id : null);
  }

  @Get('minhas')
  async minhas(@Req() req: AuthRequest, @Query('status') status?: string) {
    const efetivo = await resolveEffective(req, this.users, this.prisma);
    // Admin e Viewer veem TODAS; demais, só as próprias.
    const verTudo =
      efetivo.perfis.includes('ADMIN') || efetivo.perfis.includes('VIEWER');
    return this.service.findMinhas(efetivo.id, {
      isAdmin: verTudo,
      status,
    });
  }

  // Rota estática — precisa vir ANTES de ':id' para não ser capturada como param.
  @Post('enviar-lote')
  @Roles(...PODE_SOLICITAR)
  async enviarLote(
    @Req() req: AuthRequest,
    @Body(new ZodValidationPipe(EnviarLoteSchema)) dto: EnviarLoteInput,
  ) {
    const ef = await resolveEffective(req, this.users, this.prisma);
    return this.service.enviarLote(ef.id, dto.ids);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.detalhe(id);
  }

  @Put(':id')
  @Roles(...PODE_SOLICITAR)
  async update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SolicitacaoCreateSchema)) dto: SolicitacaoCreate,
  ) {
    const ef = await resolveEffective(req, this.users, this.prisma);
    return this.service.update(id, ef.id, dto);
  }

  @Post(':id/enviar')
  @Roles(...PODE_SOLICITAR)
  async enviar(@Req() req: AuthRequest, @Param('id') id: string) {
    const ef = await resolveEffective(req, this.users, this.prisma);
    return this.service.enviar(id, ef.id);
  }

  @Post(':id/cancelar')
  @Roles(...PODE_SOLICITAR)
  async cancelar(@Req() req: AuthRequest, @Param('id') id: string) {
    const ef = await resolveEffective(req, this.users, this.prisma);
    return this.service.cancelar(id, ef.id);
  }
}
