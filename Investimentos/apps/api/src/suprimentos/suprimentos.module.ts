import { Module } from '@nestjs/common';
import { SuprimentosController } from './suprimentos.controller';
import { SuprimentosService } from './suprimentos.service';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [SuprimentosController],
  providers: [SuprimentosService],
})
export class SuprimentosModule {}
