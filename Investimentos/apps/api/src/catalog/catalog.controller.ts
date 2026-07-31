import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('catalog')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('estabelecimentos')
  estabelecimentos() {
    return this.catalog.listEstabelecimentos();
  }

  @Get('unidades')
  unidades(@Query('estabelecimentoId') estabelecimentoId?: string) {
    const id = estabelecimentoId ? parseInt(estabelecimentoId, 10) : undefined;
    return this.catalog.listUnidades(id);
  }

  @Get('centros-custo')
  centrosCusto(@Query('unidadeId') unidadeId?: string) {
    const id = unidadeId ? parseInt(unidadeId, 10) : undefined;
    return this.catalog.listCentrosCusto(id);
  }

  @Get('grupos')
  grupos() {
    return this.catalog.listGrupos();
  }

  @Get('itens')
  itens(@Query('grupoId') grupoId?: string, @Query('tipo') tipo?: string) {
    const id = grupoId ? parseInt(grupoId, 10) : undefined;
    return this.catalog.listItens(id, tipo);
  }

  @Get('motivos')
  motivos() {
    return this.catalog.listMotivos();
  }
}
