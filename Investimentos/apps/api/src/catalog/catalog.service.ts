import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Estabelecimentos ─────────────────────────────────────────────────────
  listEstabelecimentos(soAtivos = true) {
    return this.prisma.estabelecimento.findMany({
      where: soAtivos ? { ativo: true } : {},
      orderBy: { nome: 'asc' },
    });
  }

  // ── Unidades ─────────────────────────────────────────────────────────────
  listUnidades(estabelecimentoId?: number, soAtivos = true) {
    return this.prisma.unidadeNegocio.findMany({
      where: {
        ...(soAtivos ? { ativo: true } : {}),
        ...(estabelecimentoId ? { estabelecimentoId } : {}),
      },
      orderBy: { nome: 'asc' },
    });
  }

  // ── Centros de custo ─────────────────────────────────────────────────────
  listCentrosCusto(unidadeId?: number, soAtivos = true) {
    return this.prisma.centroCusto.findMany({
      where: {
        ...(soAtivos ? { ativo: true } : {}),
        ...(unidadeId ? { unidadeId } : {}),
      },
      orderBy: { codigo: 'asc' },
    });
  }

  // ── Grupos de investimento ──────────────────────────────────────────────
  listGrupos(soAtivos = true) {
    return this.prisma.grupoInvestimento.findMany({
      where: soAtivos ? { ativo: true } : {},
      orderBy: { nome: 'asc' },
    });
  }

  // ── Itens de catálogo ────────────────────────────────────────────────────
  // `tipo` filtra ITEM vs INSTRUMENTAL (obras não têm catálogo — descrição livre).
  async listItens(grupoId?: number, tipo?: string, soAtivos = true) {
    const rows = await this.prisma.itemCatalogo.findMany({
      where: {
        ...(soAtivos ? { ativo: true } : {}),
        ...(grupoId ? { grupoId } : {}),
        ...(tipo ? { tipo } : {}),
      },
      orderBy: { nome: 'asc' },
    });
    // valorReferencia/valorMin/valorMax são Decimal (Prisma) → serializam como string
    // no JSON. O contrato (@investimentos/shared) promete `number`, então normalizamos
    // aqui na origem. Min/Max servem de faixa de referência ao solicitante.
    return rows.map((r) => ({
      ...r,
      valorReferencia: r.valorReferencia == null ? null : Number(r.valorReferencia),
      valorMin: r.valorMin == null ? null : Number(r.valorMin),
      valorMax: r.valorMax == null ? null : Number(r.valorMax),
    }));
  }

  // ── Motivos ──────────────────────────────────────────────────────────────
  listMotivos(soAtivos = true) {
    return this.prisma.motivo.findMany({
      where: soAtivos ? { ativo: true } : {},
      orderBy: { nome: 'asc' },
    });
  }
}
