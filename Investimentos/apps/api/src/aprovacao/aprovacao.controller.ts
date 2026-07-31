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
import { AprovacaoService } from './aprovacao.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PERFIS } from '../common/constants/perfis';
import { ZodValidationPipe } from '../common/pipes/zod.pipe';
import { csvNums, csvStrs } from '../common/query';
import {
  AprovacaoInputSchema,
  AprovacaoLoteSchema,
  AnotacaoGFSchema,
  AnotacaoGPESchema,
  AprovadorEditSchema,
  type AprovacaoInput,
  type AprovacaoLoteInput,
  type AnotacaoGF,
  type AnotacaoGPE,
  type AprovadorEdit,
} from '@investimentos/shared';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveEffective } from '../common/effective-user';

interface AuthRequest extends Request {
  user: { sub: string; login: string; perfis?: string[] };
}

@Controller('aprovacoes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(PERFIS.APROVADOR, PERFIS.APROVADOR_FINAL, PERFIS.ADMIN)
export class AprovacaoController {
  constructor(
    private readonly service: AprovacaoService,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('pendentes')
  async pendentes(@Req() req: AuthRequest) {
    const efetivo = await resolveEffective(req, this.users, this.prisma);
    return this.service.pendentes(
      efetivo.login,
      efetivo.id,
      efetivo.perfis.includes('ADMIN'),
    );
  }

  // Histórico das decisões do próprio aprovador (aprovado/reprovado/revisão).
  @Get('minhas-decisoes')
  async minhasDecisoes(@Req() req: AuthRequest) {
    const efetivo = await resolveEffective(req, this.users, this.prisma);
    return this.service.minhasDecisoes(efetivo.id);
  }

  // Mesa de Aprovação Final: itens das solicitações na etapa final, para pivô/drill.
  @Get('mesa-final')
  @Roles(PERFIS.APROVADOR_FINAL, PERFIS.ADMIN)
  mesaFinal() {
    return this.service.mesaFinal();
  }

  // Relatório item-a-item no escopo do aprovador (fila dele + o que ele já decidiu).
  @Get('relatorio')
  async relatorio(
    @Req() req: AuthRequest,
    @Query('situacao') situacao?: string | string[],
    @Query('grupoId') grupoId?: string | string[],
    @Query('q') q?: string,
    @Query('dataDe') dataDe?: string,
    @Query('dataAte') dataAte?: string,
  ) {
    const efetivo = await resolveEffective(req, this.users, this.prisma);
    return this.service.relatorio(efetivo.login, efetivo.id, {
      situacoes: csvStrs(situacao),
      grupoIds: csvNums(grupoId),
      q: q || undefined,
      dataDe: dataDe || undefined,
      dataAte: dataAte || undefined,
    });
  }

  @Post('solicitacoes/:id/decidir')
  async decidir(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AprovacaoInputSchema)) dto: AprovacaoInput,
  ) {
    // Admin em simulação DECIDE como o aprovador simulado: usa perfil/alçada DELE
    // (isAdmin pelo perfil efetivo — assim testa de fato os níveis 1 e 2, sem
    // o override de admin). simuladoPorId marca o admin real na trilha.
    const ef = await resolveEffective(req, this.users, this.prisma);
    return this.service.decidir(
      id,
      ef.id,
      ef.login,
      dto,
      ef.perfis.includes('ADMIN'),
      ef.simulando ? ef.real.id : null,
    );
  }

  // Decisão em lote (Mesa de Aprovação Final): aprova/reprova/devolve várias
  // solicitações de uma vez (ex.: um grupo ou agrupamento inteiro).
  @Post('decidir-lote')
  @Roles(PERFIS.APROVADOR_FINAL, PERFIS.ADMIN)
  async decidirLote(
    @Req() req: AuthRequest,
    @Body(new ZodValidationPipe(AprovacaoLoteSchema)) dto: AprovacaoLoteInput,
  ) {
    const ef = await resolveEffective(req, this.users, this.prisma);
    return this.service.decidirLote(
      dto.ids,
      ef.id,
      ef.login,
      { decisao: dto.decisao, justificativa: dto.justificativa },
      ef.perfis.includes('ADMIN'),
      ef.simulando ? ef.real.id : null,
    );
  }

  // Edição de campos opcionais + valor unitário dos itens (Gestor Focal/admin).
  @Put('solicitacoes/:id/itens')
  async editarItens(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AprovadorEditSchema)) dto: AprovadorEdit,
  ) {
    const ef = await resolveEffective(req, this.users, this.prisma);
    return this.service.editarItens(
      id,
      ef.id,
      ef.login,
      ef.perfis.includes('ADMIN'),
      dto,
    );
  }

  // Observação do Gestor Focal — aprovador/aprovador final (e admin).
  @Post('solicitacoes/:id/obs-gf')
  async salvarObsGF(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AnotacaoGFSchema)) dto: AnotacaoGF,
  ) {
    const ef = await resolveEffective(req, this.users, this.prisma);
    return this.service.salvarObsGF(id, dto.obsGF, ef.id);
  }

  // Observação GPE + Validação — só admin (GPE).
  @Post('solicitacoes/:id/anotacao-gpe')
  @Roles(PERFIS.ADMIN)
  async salvarAnotacaoGPE(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AnotacaoGPESchema)) dto: AnotacaoGPE,
  ) {
    const ef = await resolveEffective(req, this.users, this.prisma);
    return this.service.salvarAnotacaoGPE(id, dto, ef.id);
  }
}
