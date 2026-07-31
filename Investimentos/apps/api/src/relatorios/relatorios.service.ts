import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RelatoriosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * KPIs da tela inicial: contagens por status e valor demandado no ANO
   * CORRENTE (por dtSolicitacao). Admin (real ou efetivo via simulação) vê
   * tudo; usuário comum vê só as suas próprias solicitações.
   */
  async dashboard(opts: { userId: string; isAdmin: boolean }) {
    const anoAtual = new Date().getFullYear();
    const start = new Date(anoAtual, 0, 1);
    const end = new Date(anoAtual + 1, 0, 1);

    const where = {
      dtSolicitacao: { gte: start, lt: end },
      ...(opts.isAdmin ? {} : { solicitanteId: opts.userId }),
    };

    const byStatus = await this.prisma.solicitacao.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });

    const total = byStatus.reduce((s, r) => s + r._count._all, 0);
    // "Aguardando aprovação" = em qualquer etapa em andamento (1ª ou aprovação inicial).
    const emAprovacao = byStatus
      .filter((r) => r.status === 'EM_APROVACAO' || r.status === 'APROVACAO_INICIAL')
      .reduce((s, r) => s + r._count._all, 0);
    const aprovadas = byStatus.find((r) => r.status === 'APROVADO')?._count._all ?? 0;
    const reprovadas = byStatus.find((r) => r.status === 'REPROVADO')?._count._all ?? 0;
    const porStatus = byStatus.map((r) => ({ status: r.status, count: r._count._all }));

    const itens = await this.prisma.solicitacaoItem.findMany({
      where: { solicitacao: where },
      select: { valorTotal: true, grupo: { select: { nome: true } } },
    });

    let valorTotal = 0;
    const porGrupoMap = new Map<string, number>();
    for (const it of itens) {
      const valor = Number(it.valorTotal);
      valorTotal += valor;
      const nome = it.grupo?.nome ?? 'Sem grupo';
      porGrupoMap.set(nome, (porGrupoMap.get(nome) ?? 0) + valor);
    }
    const porGrupo = [...porGrupoMap.entries()]
      .map(([grupo, valor]) => ({ grupo, valor }))
      .sort((a, b) => b.valor - a.valor);

    return { total, emAprovacao, aprovadas, reprovadas, valorTotal, porGrupo, porStatus };
  }

  /** Pendências agregadas por etapa atual (fluxo × ordem). */
  async pendenciasPorEtapa() {
    const rows = await this.prisma.solicitacao.groupBy({
      by: ['fluxoId', 'etapaAtualOrdem'],
      where: { status: { in: ['EM_APROVACAO', 'APROVACAO_INICIAL'] } },
      _count: { _all: true },
    });
    return rows.map((r) => ({
      fluxoId: r.fluxoId,
      etapaOrdem: r.etapaAtualOrdem,
      total: r._count._all,
    }));
  }

  /** Valores por grupo de investimento (soma de itens em solicitações aprovadas). */
  async valoresPorGrupo() {
    const rows = await this.prisma.solicitacaoItem.groupBy({
      by: ['grupoId'],
      where: { solicitacao: { status: 'APROVADO' } },
      _sum: { valorTotal: true },
      _count: { _all: true },
    });
    return rows.map((r) => ({
      grupoId: r.grupoId,
      total: Number(r._sum.valorTotal ?? 0),
      itens: r._count._all,
    }));
  }

  /** Tempo médio (dias) entre criação e aprovação final por fluxo. */
  async tempoMedioAprovacao() {
    const aprovadas = await this.prisma.solicitacao.findMany({
      where: { status: 'APROVADO' },
      select: {
        id: true,
        dtSolicitacao: true,
        fluxoId: true,
        aprovacoes: {
          where: { decisao: 'APROVADO' },
          orderBy: { data: 'desc' },
          take: 1,
        },
      },
    });

    const porFluxo = new Map<string, { soma: number; n: number }>();
    for (const s of aprovadas) {
      const ultima = s.aprovacoes[0];
      if (!ultima || !s.fluxoId) continue;
      const dias =
        (ultima.data.getTime() - s.dtSolicitacao.getTime()) / 86_400_000;
      const cur = porFluxo.get(s.fluxoId) ?? { soma: 0, n: 0 };
      cur.soma += dias;
      cur.n += 1;
      porFluxo.set(s.fluxoId, cur);
    }
    return [...porFluxo.entries()].map(([fluxoId, v]) => ({
      fluxoId,
      tempoMedioDias: v.n ? v.soma / v.n : 0,
      amostra: v.n,
    }));
  }
}
