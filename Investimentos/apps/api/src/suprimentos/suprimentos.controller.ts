import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SuprimentosService } from './suprimentos.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PERFIS } from '../common/constants/perfis';
import { ZodValidationPipe } from '../common/pipes/zod.pipe';
import { csvNums, csvStrs } from '../common/query';
import {
  SuprimentosPrecoSchema,
  SuprimentosValorItemSchema,
  type SuprimentosPreco,
  type SuprimentosValorItem,
} from '@investimentos/shared';

interface AuthRequest extends Request {
  user: { sub: string; login: string; perfis?: string[] };
}

@Controller('suprimentos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(PERFIS.ADMIN, PERFIS.SUPRIMENTOS)
export class SuprimentosController {
  constructor(private readonly service: SuprimentosService) {}

  // ── Preços do catálogo ─────────────────────────────────────────────────────
  @Get('itens')
  listItens(
    @Query('q') q?: string,
    @Query('grupoId') grupoId?: string | string[],
    @Query('tipo') tipo?: string | string[],
    @Query('ativo') ativo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listItens({
      q: q?.trim() || undefined,
      grupoIds: csvNums(grupoId),
      tipos: csvStrs(tipo),
      ativo: ativo == null || ativo === '' ? undefined : ativo === 'true',
      page: page ? Math.max(1, parseInt(page, 10)) : 1,
      pageSize: pageSize ? Math.min(100, Math.max(1, parseInt(pageSize, 10))) : 20,
    });
  }

  @Put('itens/:id/precos')
  updatePrecos(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SuprimentosPrecoSchema)) dto: SuprimentosPreco,
  ) {
    return this.service.updatePrecos(parseInt(id, 10), dto);
  }

  // ── Valor informado nas solicitações ───────────────────────────────────────
  @Get('solicitacoes-itens')
  listSolicitacaoItens(
    @Query('q') q?: string,
    @Query('estabelecimentoId') estabelecimentoId?: string | string[],
    @Query('grupoId') grupoId?: string | string[],
    @Query('itemCatalogoId') itemCatalogoId?: string,
    @Query('status') status?: string | string[],
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listSolicitacaoItens({
      q: q?.trim() || undefined,
      estabelecimentoIds: csvNums(estabelecimentoId),
      grupoIds: csvNums(grupoId),
      itemCatalogoId: itemCatalogoId ? parseInt(itemCatalogoId, 10) : undefined,
      status: csvStrs(status),
      page: page ? Math.max(1, parseInt(page, 10)) : 1,
      pageSize: pageSize ? Math.min(100, Math.max(1, parseInt(pageSize, 10))) : 20,
    });
  }

  @Put('solicitacao-item/:id/valor')
  setValorItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SuprimentosValorItemSchema)) dto: SuprimentosValorItem,
    @Req() req: AuthRequest,
  ) {
    return this.service.setValorItem(id, dto.valorSuprimentos, req.user.sub);
  }
}
