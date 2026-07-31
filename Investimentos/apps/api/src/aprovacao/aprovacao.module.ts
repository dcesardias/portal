import { Module } from '@nestjs/common';
import { AprovacaoController } from './aprovacao.controller';
import { AprovacaoService } from './aprovacao.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule],
  controllers: [AprovacaoController],
  providers: [AprovacaoService],
  exports: [AprovacaoService],
})
export class AprovacaoModule {}
