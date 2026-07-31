import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { envSchema } from './env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CatalogModule } from './catalog/catalog.module';
import { FluxoModule } from './fluxo/fluxo.module';
import { SolicitacaoModule } from './solicitacao/solicitacao.module';
import { AprovacaoModule } from './aprovacao/aprovacao.module';
import { RelatoriosModule } from './relatorios/relatorios.module';
import { AdminModule } from './admin/admin.module';
import { SuprimentosModule } from './suprimentos/suprimentos.module';
import { ContabilidadeModule } from './contabilidade/contabilidade.module';
import { MeModule } from './me/me.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    CatalogModule,
    FluxoModule,
    SolicitacaoModule,
    AprovacaoModule,
    RelatoriosModule,
    AdminModule,
    SuprimentosModule,
    ContabilidadeModule,
    MeModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
