import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminUsuariosService } from './admin-usuarios.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PERFIS } from '../common/constants/perfis';
import { ZodValidationPipe } from '../common/pipes/zod.pipe';
import {
  AdminUsuarioCreateSchema,
  AdminUsuarioUpdateSchema,
  AdminUsuarioAtivoSchema,
  AdminUsuarioPerfisSchema,
  type AdminUsuarioCreate,
  type AdminUsuarioUpdate,
  type AdminUsuarioAtivo,
  type AdminUsuarioPerfis,
} from '@investimentos/shared';

interface AuthRequest extends Request {
  user: { sub: string; login: string };
}

@Controller('admin/usuarios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(PERFIS.ADMIN)
export class AdminUsuariosController {
  constructor(private readonly service: AdminUsuariosService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(AdminUsuarioCreateSchema)) dto: AdminUsuarioCreate) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminUsuarioUpdateSchema)) dto: AdminUsuarioUpdate,
  ) {
    return this.service.update(id, dto);
  }

  @Put(':id/ativo')
  setAtivo(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminUsuarioAtivoSchema)) dto: AdminUsuarioAtivo,
  ) {
    return this.service.setAtivo(id, dto.ativo, req.user.sub);
  }

  @Put(':id/perfis')
  setPerfis(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminUsuarioPerfisSchema)) dto: AdminUsuarioPerfis,
  ) {
    return this.service.setPerfis(id, dto.perfis, req.user.sub);
  }

  @Post(':id/resetar-senha')
  resetSenha(@Param('id') id: string) {
    return this.service.resetSenha(id);
  }

  /** Registra o início da simulação (auditoria) — chamado ANTES do front ativar o header. */
  @Post(':id/simular')
  simular(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.simular(id, req.user.sub, req.user.login);
  }
}
