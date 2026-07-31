import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminFluxosService } from './admin-fluxos.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PERFIS } from '../common/constants/perfis';
import { ZodValidationPipe } from '../common/pipes/zod.pipe';
import {
  RegraFluxoCreateSchema,
  RegraFluxoUpdateSchema,
  SimularFluxoSchema,
  FluxoCreateSchema,
  FluxoUpdateSchema,
  type RegraFluxoCreate,
  type RegraFluxoUpdate,
  type SimularFluxo,
  type FluxoCreate,
  type FluxoUpdate,
} from '@investimentos/shared';

@Controller('admin/fluxos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(PERFIS.ADMIN)
export class AdminFluxosController {
  constructor(private readonly service: AdminFluxosService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get('fluxos-disponiveis')
  listFluxos() {
    return this.service.listFluxos();
  }

  // ── Montador de fluxo (CRUD do Fluxo + suas etapas) ──
  @Post('fluxos')
  createFluxo(@Body(new ZodValidationPipe(FluxoCreateSchema)) dto: FluxoCreate) {
    return this.service.createFluxo(dto);
  }

  @Put('fluxos/:id')
  updateFluxo(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(FluxoUpdateSchema)) dto: FluxoUpdate,
  ) {
    return this.service.updateFluxo(id, dto);
  }

  @Delete('fluxos/:id')
  removeFluxo(@Param('id') id: string) {
    return this.service.removeFluxo(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(RegraFluxoCreateSchema)) dto: RegraFluxoCreate) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RegraFluxoUpdateSchema)) dto: RegraFluxoUpdate,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('simular')
  simular(@Body(new ZodValidationPipe(SimularFluxoSchema)) dto: SimularFluxo) {
    return this.service.simular(dto);
  }
}
