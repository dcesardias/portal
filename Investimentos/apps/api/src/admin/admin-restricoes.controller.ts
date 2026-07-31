import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminRestricoesService } from './admin-restricoes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PERFIS } from '../common/constants/perfis';
import { ZodValidationPipe } from '../common/pipes/zod.pipe';
import {
  RestricaoSolicitanteCreateSchema,
  type RestricaoSolicitanteCreate,
} from '@investimentos/shared';

@Controller('admin/restricoes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(PERFIS.ADMIN)
export class AdminRestricoesController {
  constructor(private readonly service: AdminRestricoesService) {}

  @Get()
  list(@Query('userId') userId?: string) {
    return this.service.list(userId);
  }

  @Post()
  create(@Body(new ZodValidationPipe(RestricaoSolicitanteCreateSchema)) dto: RestricaoSolicitanteCreate) {
    return this.service.create(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
