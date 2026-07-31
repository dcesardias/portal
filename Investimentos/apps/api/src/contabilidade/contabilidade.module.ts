import { Module } from '@nestjs/common';
import { ContabilidadeController } from './contabilidade.controller';
import { ContabilidadeService } from './contabilidade.service';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [ContabilidadeController],
  providers: [ContabilidadeService],
})
export class ContabilidadeModule {}
