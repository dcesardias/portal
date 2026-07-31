import { Module } from '@nestjs/common';
import { FluxoResolver } from './fluxo.resolver';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [FluxoResolver],
  exports: [FluxoResolver],
})
export class FluxoModule {}
