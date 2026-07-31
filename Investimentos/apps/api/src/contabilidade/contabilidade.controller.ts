import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ContabilidadeService } from './contabilidade.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PERFIS } from '../common/constants/perfis';
import { ZodValidationPipe } from '../common/pipes/zod.pipe';
import { csvNums, csvStrs } from '../common/query';
import { ContabilidadeVinculoSchema, type ContabilidadeVinculo } from '@investimentos/shared';

@Controller('contabilidade')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(PERFIS.ADMIN, PERFIS.CONTABILIDADE)
export class ContabilidadeController {
  constructor(private readonly service: ContabilidadeService) {}

  @Get('itens')
  listItens(
    @Query('q') q?: string,
    @Query('grupoId') grupoId?: string | string[],
    @Query('tipo') tipo?: string | string[],
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listItens({
      q: q?.trim() || undefined,
      grupoIds: csvNums(grupoId),
      tipos: csvStrs(tipo),
      ativo: undefined,
      page: page ? Math.max(1, parseInt(page, 10)) : 1,
      pageSize: pageSize ? Math.min(100, Math.max(1, parseInt(pageSize, 10))) : 20,
    });
  }

  @Get('materiais-tasy')
  buscarMateriais(@Query('q') q?: string) {
    return this.service.searchMateriais(q ?? '');
  }

  @Get('contas-contabeis')
  buscarContas(@Query('q') q?: string) {
    return this.service.searchContas(q ?? '');
  }

  @Put('itens/:id/vinculos')
  updateVinculos(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ContabilidadeVinculoSchema)) dto: ContabilidadeVinculo,
  ) {
    return this.service.updateVinculos(parseInt(id, 10), dto);
  }
}
