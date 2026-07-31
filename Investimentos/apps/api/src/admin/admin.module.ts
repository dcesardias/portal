import { Module } from '@nestjs/common';
import { AdminUsuariosController } from './admin-usuarios.controller';
import { AdminUsuariosService } from './admin-usuarios.service';
import { AdminAlcadasController } from './admin-alcadas.controller';
import { AdminAlcadasService } from './admin-alcadas.service';
import { AdminFluxosController } from './admin-fluxos.controller';
import { AdminFluxosService } from './admin-fluxos.service';
import { AdminRestricoesController } from './admin-restricoes.controller';
import { AdminRestricoesService } from './admin-restricoes.service';
import { AdminSolicitacoesController } from './admin-solicitacoes.controller';
import { AdminSolicitacoesService } from './admin-solicitacoes.service';
import { AdminItensController } from './admin-itens.controller';
import { AdminItensService } from './admin-itens.service';
import { AuthModule } from '../auth/auth.module';
import { FluxoModule } from '../fluxo/fluxo.module';
import { SolicitacaoModule } from '../solicitacao/solicitacao.module';

@Module({
  imports: [AuthModule, FluxoModule, SolicitacaoModule],
  controllers: [
    AdminUsuariosController,
    AdminAlcadasController,
    AdminFluxosController,
    AdminRestricoesController,
    AdminSolicitacoesController,
    AdminItensController,
  ],
  providers: [
    AdminUsuariosService,
    AdminAlcadasService,
    AdminFluxosService,
    AdminRestricoesService,
    AdminSolicitacoesService,
    AdminItensService,
  ],
  exports: [AdminItensService],
})
export class AdminModule {}
