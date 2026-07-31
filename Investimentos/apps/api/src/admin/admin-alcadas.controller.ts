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
import { AdminAlcadasService } from './admin-alcadas.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PERFIS } from '../common/constants/perfis';
import { ZodValidationPipe } from '../common/pipes/zod.pipe';
import {
  RegraAlcadaCreateSchema,
  RegraAlcadaBulkCreateSchema,
  RegraAlcadaBulkMatrixSchema,
  RegraAlcadaUpdateSchema,
  SubstituirUsuarioAlcadaSchema,
  type RegraAlcadaCreate,
  type RegraAlcadaBulkCreate,
  type RegraAlcadaBulkMatrix,
  type RegraAlcadaUpdate,
  type SubstituirUsuarioAlcada,
} from '@investimentos/shared';

@Controller('admin/alcadas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(PERFIS.ADMIN)
export class AdminAlcadasController {
  constructor(private readonly service: AdminAlcadasService) {}

  @Get()
  list(
    @Query('estabelecimentoId') estabelecimentoId?: string,
    @Query('nivel') nivel?: string,
  ) {
    return this.service.list({
      estabelecimentoId: estabelecimentoId ? Number(estabelecimentoId) : undefined,
      nivel,
    });
  }

  @Post()
  create(@Body(new ZodValidationPipe(RegraAlcadaCreateSchema)) dto: RegraAlcadaCreate) {
    return this.service.create(dto);
  }

  @Post('bulk')
  createBulk(
    @Body(new ZodValidationPipe(RegraAlcadaBulkCreateSchema)) dto: RegraAlcadaBulkCreate,
  ) {
    return this.service.createBulk(dto);
  }

  @Post('bulk-matrix')
  createBulkMatrix(
    @Body(new ZodValidationPipe(RegraAlcadaBulkMatrixSchema)) dto: RegraAlcadaBulkMatrix,
  ) {
    return this.service.createBulkMatrix(dto);
  }

  @Post('substituir-usuario')
  substituirUsuario(
    @Body(new ZodValidationPipe(SubstituirUsuarioAlcadaSchema)) dto: SubstituirUsuarioAlcada,
  ) {
    return this.service.substituirUsuario(dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RegraAlcadaUpdateSchema)) dto: RegraAlcadaUpdate,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
