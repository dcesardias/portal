import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Fluxo, EtapaFluxo, RegraFluxo } from '@prisma/client';

export interface ResolveContext {
  estabelecimentoId?: number;
  grupoId?: number;
  tipoVerba?: string;
  valor?: number;
}

/**
 * Motor de resolução de fluxo. Aplica prioridade e casamento por contexto:
 *   - regras com maior `prioridade` numérica vencem
 *   - `null` num critério da regra = "qualquer valor casa"
 *   - se o valor da solicitação sai fora de [vlMin, vlMax], a regra não casa
 *   - se nenhuma regra específica casar, tenta a `isDefault=true` de maior prioridade
 */
@Injectable()
export class FluxoResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(ctx: ResolveContext): Promise<(Fluxo & { etapas: EtapaFluxo[] }) | null> {
    const regras = await this.prisma.regraFluxo.findMany({
      where: { fluxo: { ativo: true } },
      orderBy: { prioridade: 'desc' },
      include: { fluxo: { include: { etapas: { orderBy: { ordem: 'asc' } } } } },
    });

    const candidata = regras.find((r) => matches(r, ctx));
    if (candidata) return candidata.fluxo;

    const defaultRule = regras.find((r) => r.isDefault);
    return defaultRule?.fluxo ?? null;
  }

  /**
   * Igual a `resolve`, mas devolve também as regras alternativas que também
   * dariam match (menor prioridade que a vencedora) — usado pelo simulador
   * do admin para explicar por que uma regra venceu sobre as outras.
   */
  async resolveComAlternativas(ctx: ResolveContext): Promise<{
    regra: (RegraFluxo & { fluxo: Fluxo & { etapas: EtapaFluxo[] } }) | null;
    alternativas: (RegraFluxo & { fluxo: Fluxo & { etapas: EtapaFluxo[] } })[];
  }> {
    const regras = await this.prisma.regraFluxo.findMany({
      where: { fluxo: { ativo: true } },
      orderBy: { prioridade: 'desc' },
      include: { fluxo: { include: { etapas: { orderBy: { ordem: 'asc' } } } } },
    });

    const candidatas = regras.filter((r) => matches(r, ctx));
    if (candidatas.length > 0) {
      return { regra: candidatas[0], alternativas: candidatas.slice(1) };
    }

    const defaultRule = regras.find((r) => r.isDefault) ?? null;
    return { regra: defaultRule, alternativas: [] };
  }
}

export function matches(regra: RegraFluxo, ctx: ResolveContext): boolean {
  if (regra.isDefault) return false; // default é fallback, não match direto
  if (
    regra.estabelecimentoId != null &&
    regra.estabelecimentoId !== ctx.estabelecimentoId
  ) {
    return false;
  }
  if (regra.grupoId != null && regra.grupoId !== ctx.grupoId) {
    return false;
  }
  if (regra.tipoVerba != null && regra.tipoVerba !== ctx.tipoVerba) {
    return false;
  }
  const valor = ctx.valor ?? 0;
  if (regra.vlMin != null && valor < Number(regra.vlMin)) {
    return false;
  }
  if (regra.vlMax != null && valor > Number(regra.vlMax)) {
    return false;
  }
  return true;
}
