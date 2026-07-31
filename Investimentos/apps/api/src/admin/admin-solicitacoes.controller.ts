import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminSolicitacoesService } from './admin-solicitacoes.service';
import { SolicitacaoService } from '../solicitacao/solicitacao.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PERFIS } from '../common/constants/perfis';
import { ZodValidationPipe } from '../common/pipes/zod.pipe';
import { csvNums, csvStrs } from '../common/query';
import {
  SolicitacaoVerbaBulkSchema,
  type SolicitacaoVerbaBulk,
  SolicitacaoCreateSchema,
  type SolicitacaoCreate,
  AdminSolicitacaoCreateSchema,
  type AdminSolicitacaoCreate,
  AdminStatusSchema,
  type AdminStatusInput,
  AprovacaoInputSchema,
  type AprovacaoInput,
  StatusVerbaPublicaInputSchema,
  type StatusVerbaPublicaInput,
  CarryoverSchema,
  type CarryoverInput,
} from '@investimentos/shared';

interface AuthRequest extends Request {
  user: { sub: string; login: string; perfis?: string[] };
}

@Controller('admin/solicitacoes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(PERFIS.ADMIN)
export class AdminSolicitacoesController {
  constructor(
    private readonly service: AdminSolicitacoesService,
    private readonly solicitacoes: SolicitacaoService,
  ) {}

  @Get()
  list(
    @Query('estabelecimentoId') estabelecimentoId?: string | string[],
    @Query('grupoId') grupoId?: string | string[],
    @Query('tipo') tipo?: string | string[],
    @Query('status') status?: string | string[],
    @Query('verba') verba?: string | string[],
  ) {
    return this.service.list({
      estabelecimentoIds: csvNums(estabelecimentoId),
      grupoIds: csvNums(grupoId),
      tipos: csvStrs(tipo),
      status: csvStrs(status),
      verba: csvStrs(verba),
    });
  }

  /** Relatório completo (lista rica + filtros amplos) para exportação.
   *  Leitura liberada também ao VIEWER (só-leitura de todas as solicitações). */
  @Get('relatorio')
  @Roles(PERFIS.ADMIN, PERFIS.VIEWER)
  relatorio(
    @Query('estabelecimentoId') estabelecimentoId?: string | string[],
    @Query('unidadeNegocioId') unidadeNegocioId?: string | string[],
    @Query('centroCustoCodigo') centroCustoCodigo?: string | string[],
    @Query('grupoId') grupoId?: string | string[],
    @Query('tipo') tipo?: string | string[],
    @Query('status') status?: string | string[],
    @Query('verba') verba?: string | string[],
    @Query('ano') ano?: string | string[],
    @Query('dataDe') dataDe?: string,
    @Query('dataAte') dataAte?: string,
    @Query('valorMin') valorMin?: string,
    @Query('valorMax') valorMax?: string,
    @Query('q') q?: string,
  ) {
    return this.service.relatorio({
      estabelecimentoIds: csvNums(estabelecimentoId),
      unidadeNegocioIds: csvNums(unidadeNegocioId),
      centroCustoCodigos: csvStrs(centroCustoCodigo),
      grupoIds: csvNums(grupoId),
      tipos: csvStrs(tipo),
      status: csvStrs(status),
      verba: csvStrs(verba),
      anos: csvNums(ano),
      dataDe: dataDe || undefined,
      dataAte: dataAte || undefined,
      valorMin: valorMin ? Number(valorMin) : undefined,
      valorMax: valorMax ? Number(valorMax) : undefined,
      q: q || undefined,
    });
  }

  @Put('verba')
  setVerba(@Body(new ZodValidationPipe(SolicitacaoVerbaBulkSchema)) dto: SolicitacaoVerbaBulk) {
    return this.service.setVerbaBulk(dto.ids, dto.tipoVerba);
  }

  /** Cria uma solicitação RETROATIVA já em Aprovação Final (sem fluxo). */
  @Post('nova')
  criarAprovada(
    @Req() req: AuthRequest,
    @Body(new ZodValidationPipe(AdminSolicitacaoCreateSchema)) dto: AdminSolicitacaoCreate,
  ) {
    return this.solicitacoes.adminCreateAprovada(dto, req.user.sub);
  }

  // ── Carryover (cadastro dedicado) ──────────────────────────────────────────
  @Get('carryover/candidatos')
  carryoverCandidatos(@Query('ano') ano?: string) {
    const y = ano ? parseInt(ano, 10) : new Date().getFullYear();
    return this.service.listCarryoverCandidatos(y);
  }

  @Post('carryover')
  criarCarryover(
    @Req() req: AuthRequest,
    @Body(new ZodValidationPipe(CarryoverSchema)) dto: CarryoverInput,
  ) {
    return this.service.criarCarryover(dto, req.user.sub);
  }

  // ── Overrides de admin sobre uma solicitação específica ──────────────────
  // Obs.: rotas literais (ex.: 'verba') são declaradas ANTES de ':id' para não
  // serem capturadas pelo parâmetro.

  /** Edição completa (cabeçalho + itens) de qualquer solicitação. */
  @Put(':id')
  editar(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SolicitacaoCreateSchema)) dto: SolicitacaoCreate,
  ) {
    return this.solicitacoes.adminUpdate(id, req.user.sub, dto);
  }

  /** Troca direta de status (override). */
  @Put(':id/status')
  setStatus(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminStatusSchema)) dto: AdminStatusInput,
  ) {
    return this.solicitacoes.adminSetStatus(id, req.user.sub, dto.status, dto.justificativa);
  }

  /** Define o status da verba pública (só admin, usado quando tipoVerba = VP). */
  @Put(':id/status-verba-publica')
  setStatusVerbaPublica(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(StatusVerbaPublicaInputSchema)) dto: StatusVerbaPublicaInput,
  ) {
    return this.solicitacoes.setStatusVerbaPublica(id, req.user.sub, dto.statusVerbaPublica);
  }

  /** Aprovar / reprovar / mandar revisar (decisão terminal de admin). */
  @Post(':id/decidir')
  decidir(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AprovacaoInputSchema)) dto: AprovacaoInput,
  ) {
    return this.solicitacoes.adminDecidir(id, req.user.sub, dto);
  }

  /** Prorroga um item para o ano seguinte (clona em nova solicitação Aprovada). */
  @Post(':id/itens/:itemId/prorrogar')
  prorrogarItem(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.service.prorrogarItem(id, itemId, req.user.sub);
  }

  /** Exclusão definitiva (hard delete). */
  @Delete(':id')
  excluir(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.solicitacoes.adminDelete(id, req.user.sub);
  }
}
