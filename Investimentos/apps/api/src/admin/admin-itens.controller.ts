import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminItensService } from './admin-itens.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PERFIS } from '../common/constants/perfis';
import { ZodValidationPipe } from '../common/pipes/zod.pipe';
import { csvNums, csvStrs } from '../common/query';
import {
  ItemCatalogoCreateSchema,
  ItemCatalogoUpdateSchema,
  ItemCatalogoAtivoSchema,
  type ItemCatalogoCreate,
  type ItemCatalogoUpdate,
  type ItemCatalogoAtivo,
} from '@investimentos/shared';

@Controller('admin/itens')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(PERFIS.ADMIN)
export class AdminItensController {
  constructor(private readonly service: AdminItensService) {}

  // Busca materiais do Tasy (view dbo.vw_materiais_tasy) para o vínculo 1-para-1.
  @Get('materiais-tasy')
  buscarMateriais(@Query('q') q?: string) {
    return this.service.searchMateriais(q ?? '');
  }

  // Busca contas contábeis (view dbo.VW_CONTA_CONTABIL_PESSOAL) para o vínculo do item.
  @Get('contas-contabeis')
  buscarContas(@Query('q') q?: string) {
    return this.service.searchContas(q ?? '');
  }

  // Exportação da base completa (todas as colunas), respeitando os filtros atuais.
  @Get('export')
  export(
    @Query('q') q?: string,
    @Query('grupoId') grupoId?: string | string[],
    @Query('tipo') tipo?: string | string[],
    @Query('ativo') ativo?: string,
  ) {
    return this.service.exportAll({
      q: q?.trim() || undefined,
      grupoIds: csvNums(grupoId),
      tipos: csvStrs(tipo),
      ativo: ativo == null || ativo === '' ? undefined : ativo === 'true',
    });
  }

  @Get()
  list(
    @Query('q') q?: string,
    @Query('grupoId') grupoId?: string | string[],
    @Query('tipo') tipo?: string | string[],
    @Query('ativo') ativo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.list({
      q: q?.trim() || undefined,
      grupoIds: csvNums(grupoId),
      tipos: csvStrs(tipo),
      ativo: ativo == null || ativo === '' ? undefined : ativo === 'true',
      page: page ? Math.max(1, parseInt(page, 10)) : 1,
      pageSize: pageSize
        ? Math.min(100, Math.max(1, parseInt(pageSize, 10)))
        : 20,
    });
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(ItemCatalogoCreateSchema))
    dto: ItemCatalogoCreate,
  ) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ItemCatalogoUpdateSchema))
    dto: ItemCatalogoUpdate,
  ) {
    return this.service.update(parseInt(id, 10), dto);
  }

  @Put(':id/ativo')
  setAtivo(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ItemCatalogoAtivoSchema)) dto: ItemCatalogoAtivo,
  ) {
    return this.service.setAtivo(parseInt(id, 10), dto.ativo);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(parseInt(id, 10));
  }
}
