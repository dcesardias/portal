import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type { CarryoverItem } from '@investimentos/shared';
import { registrarEvento } from '../common/auditoria';

type Filtros = {
  estabelecimentoIds?: number[];
  grupoIds?: number[];
  tipos?: string[]; // ITEM | INSTRUMENTAL | OBRA
  status?: string[];
  verba?: string[]; // RP | VP | SEM
};

type RelatorioFiltros = Filtros & {
  unidadeNegocioIds?: number[];
  centroCustoCodigos?: string[];
  anos?: number[]; // ano-alvo (ano da data prevista dos itens)
  dataDe?: string; // yyyy-mm-dd (dtSolicitacao >=)
  dataAte?: string; // yyyy-mm-dd (dtSolicitacao <=)
  valorMin?: number;
  valorMax?: number;
  q?: string; // busca em nº / projeto / solicitante
};

@Injectable()
export class AdminSolicitacoesService {
  constructor(private readonly prisma: PrismaService) {}

  // Verba com multisseleção: RP/VP viram IN; "SEM" = tipoVerba null. Devolve a
  // cláusula (ou null) para compor via AND, sem colidir com o OR da busca.
  private verbaWhere(verba?: string[]): Prisma.SolicitacaoWhereInput | null {
    if (!verba?.length) return null;
    const clauses: Prisma.SolicitacaoWhereInput[] = [];
    if (verba.includes('SEM')) clauses.push({ tipoVerba: null });
    const rpvp = verba.filter((v) => v === 'RP' || v === 'VP');
    if (rpvp.length) clauses.push({ tipoVerba: { in: rpvp } });
    if (!clauses.length) return null;
    return clauses.length === 1 ? clauses[0] : { OR: clauses };
  }

  async list(f: Filtros) {
    const where: Prisma.SolicitacaoWhereInput = {};
    if (f.estabelecimentoIds?.length) where.estabelecimentoId = { in: f.estabelecimentoIds };
    if (f.status?.length) where.status = { in: f.status };
    const verbaClause = this.verbaWhere(f.verba);
    if (verbaClause) where.AND = [verbaClause];

    if (f.grupoIds?.length || f.tipos?.length) {
      where.itens = {
        some: {
          ...(f.grupoIds?.length ? { grupoId: { in: f.grupoIds } } : {}),
          ...(f.tipos?.length ? { tipo: { in: f.tipos } } : {}),
        },
      };
    }

    const rows = await this.prisma.solicitacao.findMany({
      where,
      orderBy: { dtSolicitacao: 'desc' },
      take: 500,
      include: {
        solicitante: { select: { nome: true, login: true } },
        estabelecimento: { select: { nome: true } },
        itens: { select: { valorTotal: true, tipo: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      numero: r.numero,
      solicitanteNome: r.solicitante.nome,
      solicitanteLogin: r.solicitante.login,
      estabelecimentoNome: r.estabelecimento.nome,
      status: r.status,
      tipoVerba: r.tipoVerba,
      dtSolicitacao: r.dtSolicitacao,
      valorTotal: r.itens.reduce((s, i) => s + Number(i.valorTotal), 0),
      tipos: [...new Set(r.itens.map((i) => i.tipo))],
    }));
  }

  async setVerbaBulk(ids: string[], tipoVerba: 'RP' | 'VP' | null) {
    const res = await this.prisma.solicitacao.updateMany({
      where: { id: { in: ids } },
      data: { tipoVerba },
    });
    return { atualizadas: res.count };
  }

  /**
   * Relatório completo: TODAS as solicitações (de qualquer solicitante) com o
   * máximo de informação e filtros amplos. Devolve IDs (estab/unidade/CC/grupos)
   * que o front resolve em nomes via catálogo; o resto já vem pronto.
   */
  async relatorio(f: RelatorioFiltros) {
    const MAX = 5000;
    const where: Prisma.SolicitacaoWhereInput = {};
    if (f.estabelecimentoIds?.length) where.estabelecimentoId = { in: f.estabelecimentoIds };
    if (f.unidadeNegocioIds?.length) where.unidadeNegocioId = { in: f.unidadeNegocioIds };
    if (f.centroCustoCodigos?.length) where.centroCustoCodigo = { in: f.centroCustoCodigos };
    if (f.status?.length) where.status = { in: f.status };
    const verbaClause = this.verbaWhere(f.verba);
    if (verbaClause) where.AND = [verbaClause];

    // Filtro por item: grupo, tipo e/ou ano-alvo (ano da data prevista).
    const itemSome: Prisma.SolicitacaoItemWhereInput = {};
    if (f.grupoIds?.length) itemSome.grupoId = { in: f.grupoIds };
    if (f.tipos?.length) itemSome.tipo = { in: f.tipos };
    if (f.anos?.length) {
      itemSome.OR = f.anos.map((a) => ({
        dataPrevista: { gte: new Date(Date.UTC(a, 0, 1)), lt: new Date(Date.UTC(a + 1, 0, 1)) },
      }));
    }
    if (Object.keys(itemSome).length) {
      where.itens = { some: itemSome };
    }

    if (f.dataDe || f.dataAte) {
      where.dtSolicitacao = {
        ...(f.dataDe ? { gte: new Date(f.dataDe) } : {}),
        ...(f.dataAte ? { lte: new Date(`${f.dataAte}T23:59:59`) } : {}),
      };
    }

    if (f.q?.trim()) {
      const q = f.q.trim();
      const orClauses: Prisma.SolicitacaoWhereInput[] = [
        { projeto: { contains: q } },
        { solicitante: { is: { nome: { contains: q } } } },
        { solicitante: { is: { login: { contains: q } } } },
      ];
      const numero = parseInt(q.replace(/\D/g, ''), 10);
      if (!Number.isNaN(numero)) orClauses.push({ numero });
      where.OR = orClauses;
    }

    const rows = await this.prisma.solicitacao.findMany({
      where,
      orderBy: { dtSolicitacao: 'desc' },
      take: MAX,
      include: {
        solicitante: { select: { nome: true, login: true } },
        itens: {
          include: {
            itemCatalogo: {
              select: {
                nome: true,
                agrupamento: true,
                classificacao: true,
                cdMaterialTasy: true,
                dsMaterialTasy: true,
                movimentoContabil: true,
                valorReferencia: true,
                valorMin: true,
                valorMax: true,
                dolarizadoRenem: true,
                idRenem: true,
                dsRenem: true,
              },
            },
          },
        },
        fluxo: { include: { etapas: { select: { ordem: true, nome: true } } } },
      },
    });

    const num = (v: unknown) => (v == null ? null : Number(v));
    // UMA LINHA POR ITEM: campos da solicitação (repetidos) + item + cadastro.
    const linhas: Record<string, unknown>[] = [];
    for (const r of rows) {
      const valorTotalSol = r.itens.reduce((s, i) => s + Number(i.valorTotal), 0);
      // Faixa de valor filtra sobre o total agregado da solicitação.
      if (f.valorMin != null && valorTotalSol < f.valorMin) continue;
      if (f.valorMax != null && valorTotalSol > f.valorMax) continue;
      const etapaAtual =
        r.fluxo?.etapas.find((e) => e.ordem === r.etapaAtualOrdem)?.nome ?? null;
      for (const it of r.itens) {
        // Filtros por item (quando informados) refletem na linha emitida.
        if (f.grupoIds?.length && !f.grupoIds.includes(it.grupoId)) continue;
        if (f.tipos?.length && !f.tipos.includes(it.tipo)) continue;
        if (
          f.anos?.length &&
          !(it.dataPrevista && f.anos.includes(it.dataPrevista.getUTCFullYear()))
        )
          continue;
        const c = it.itemCatalogo;
        linhas.push({
          // ── Solicitação ──
          id: r.id,
          numero: r.numero,
          dtSolicitacao: r.dtSolicitacao,
          dtRecurso: r.dtRecurso,
          status: r.status,
          tipoVerba: r.tipoVerba,
          projeto: r.projeto,
          solicitanteNome: r.solicitante.nome,
          solicitanteLogin: r.solicitante.login,
          estabelecimentoId: r.estabelecimentoId,
          unidadeNegocioId: r.unidadeNegocioId,
          centroCustoCodigo: r.centroCustoCodigo,
          etapaAtual,
          prorrogada: r.origemProrrogacaoId != null,
          obsGF: r.obsGF,
          obsGPE: r.obsGPE,
          validacao: r.validacao,
          revisaoAnual: r.revisaoAnual,
          // ── Item ──
          itemId: it.id,
          tipo: it.tipo,
          grupoId: it.grupoId,
          motivoId: it.motivoId,
          descricao: it.descricao,
          fabricantes: it.especificacao,
          modelosReferencia: it.modelosReferencia,
          justificativa: it.justificativa,
          quantidade: it.quantidade,
          valorUnitario: num(it.valorUnitario),
          valorTotal: num(it.valorTotal),
          dataPrevista: it.dataPrevista,
          prorrogadoParaAno: it.prorrogadoParaAno,
          itemProrrogado: it.origemItemId != null,
          justificativaPeriodo: it.justificativaPeriodo,
          publicoAlvo: it.publicoAlvo,
          volumePessoas: it.volumePessoas,
          // Obra
          subtipoObra: it.subtipoObra,
          subtipoObraOutros: it.subtipoObraOutros,
          escopoInicial: it.escopoInicial,
          beneficiosProjeto: it.beneficiosProjeto,
          impactoRdc50: it.impactoRdc50,
          ieDemolicoes: it.ieDemolicoes,
          iePiso: it.iePiso,
          ieForro: it.ieForro,
          ieArCondicionado: it.ieArCondicionado,
          ieMarcenaria: it.ieMarcenaria,
          ieCaixilhos: it.ieCaixilhos,
          // Item (clínico/infra/manutenção)
          justificativaClinica: it.justificativaClinica,
          infraAguaEsgoto: it.infraAguaEsgoto,
          infraEletricaRegulada: it.infraEletricaRegulada,
          infraBlindagem: it.infraBlindagem,
          infraClimatizacao: it.infraClimatizacao,
          infraGasesMedicinais: it.infraGasesMedicinais,
          infraPlugAndPlay: it.infraPlugAndPlay,
          manutencaoPreventiva: it.manutencaoPreventiva,
          manutPeriodMensal: it.manutPeriodMensal,
          manutPeriodTrimestral: it.manutPeriodTrimestral,
          manutPeriodSemestral: it.manutPeriodSemestral,
          manutPeriodAnual: it.manutPeriodAnual,
          // ── Cadastro do item (catálogo) ──
          catalogoNome: c?.nome ?? null,
          agrupamento: c?.agrupamento ?? null,
          classificacao: c?.classificacao ?? null,
          cdMaterialTasy: c?.cdMaterialTasy ?? null,
          dsMaterialTasy: c?.dsMaterialTasy ?? null,
          movimentoContabil: c?.movimentoContabil ?? null,
          valorReferencia: num(c?.valorReferencia),
          catValorMin: num(c?.valorMin),
          catValorMax: num(c?.valorMax),
          dolarizadoRenem: c?.dolarizadoRenem ?? null,
          idRenem: c?.idRenem ?? null,
          dsRenem: c?.dsRenem ?? null,
        });
      }
    }

    return { total: linhas.length, truncado: rows.length >= MAX, itens: linhas };
  }

  /**
   * Prorroga um item aprovado para o ANO SEGUINTE: clona o item para uma nova
   * solicitação (status APROVADO, uma por origem) e marca o item original como
   * prorrogado. Admin, qualquer status da solicitação de origem.
   */
  async prorrogarItem(solicitacaoId: string, itemId: string, adminId: string) {
    const item = await this.prisma.solicitacaoItem.findUnique({ where: { id: itemId } });
    if (!item || item.solicitacaoId !== solicitacaoId) {
      throw new NotFoundException('Item não encontrado nesta solicitação');
    }
    if (item.prorrogadoParaAno != null) {
      throw new BadRequestException('Este item já foi prorrogado.');
    }
    if (item.origemItemId != null) {
      throw new BadRequestException('Este item já é resultado de uma prorrogação.');
    }
    const origem = await this.prisma.solicitacao.findUnique({ where: { id: solicitacaoId } });
    if (!origem) throw new NotFoundException('Solicitação não encontrada');

    // Ano-alvo do clone = ano da data prevista do item + 1; nova data = +1 ano.
    const anoBase = item.dataPrevista
      ? item.dataPrevista.getUTCFullYear()
      : new Date().getUTCFullYear() + 1;
    const anoAlvo = anoBase + 1;
    const novaData = item.dataPrevista
      ? new Date(item.dataPrevista)
      : new Date(Date.UTC(anoAlvo, 0, 1));
    if (item.dataPrevista) novaData.setUTCFullYear(novaData.getUTCFullYear() + 1);

    const out = await this.prisma.$transaction(async (tx) => {
      // Uma nova solicitação por origem: reutiliza se já existir.
      let carry = await tx.solicitacao.findFirst({
        where: { origemProrrogacaoId: solicitacaoId },
      });
      const carryCriada = !carry;
      if (!carry) {
        carry = await tx.solicitacao.create({
          data: {
            solicitanteId: origem.solicitanteId,
            estabelecimentoId: origem.estabelecimentoId,
            unidadeNegocioId: origem.unidadeNegocioId,
            centroCustoCodigo: origem.centroCustoCodigo,
            tipoVerba: origem.tipoVerba,
            projeto: origem.projeto,
            status: 'APROVADO',
            origemProrrogacaoId: solicitacaoId,
            dtRecurso: novaData, // data prevista (ano seguinte) da solicitação
          },
        });
      } else if (!carry.dtRecurso || novaData < carry.dtRecurso) {
        // Mantém a MENOR data prevista entre os itens já prorrogados.
        await tx.solicitacao.update({ where: { id: carry.id }, data: { dtRecurso: novaData } });
      }
      // Clona o item para a nova solicitação (copia todos os campos + data +1 ano).
      const { id: _id, solicitacaoId: _sid, prorrogadoParaAno: _p, origemItemId: _o, ...campos } =
        item;
      await tx.solicitacaoItem.create({
        data: {
          ...campos,
          solicitacaoId: carry.id,
          dataPrevista: novaData,
          origemItemId: item.id,
          prorrogadoParaAno: null,
        },
      });
      // Marca o item original como prorrogado.
      await tx.solicitacaoItem.update({
        where: { id: item.id },
        data: { prorrogadoParaAno: anoAlvo },
      });
      return { carry, carryCriada };
    });

    // Auditoria (best-effort, fora da transação).
    if (out.carryCriada) {
      await registrarEvento(this.prisma, {
        entidade: 'Solicitacao',
        entidadeId: out.carry.id,
        usuarioId: adminId,
        acao: 'CRIADA',
        dados: { comentario: `Criada por prorrogação da solicitação #${origem.numero}.` },
      });
    }
    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: solicitacaoId,
      usuarioId: adminId,
      acao: 'ITEM_PRORROGADO',
      dados: {
        comentario: `Item "${item.descricao}" prorrogado para ${anoAlvo} (nova solicitação #${out.carry.numero}).`,
      },
    });

    return {
      ok: true,
      anoAlvo,
      novaSolicitacaoId: out.carry.id,
      novaSolicitacaoNumero: out.carry.numero,
    };
  }

  // ── Carryover (cadastro dedicado) ──────────────────────────────────────────
  /**
   * Itens candidatos a carryover: itens de solicitações APROVADAS com data
   * prevista no ANO informado, que ainda não foram prorrogados nem são clones.
   */
  async listCarryoverCandidatos(ano: number) {
    const rows = await this.prisma.solicitacaoItem.findMany({
      where: {
        prorrogadoParaAno: null,
        origemItemId: null,
        dataPrevista: {
          gte: new Date(Date.UTC(ano, 0, 1)),
          lt: new Date(Date.UTC(ano + 1, 0, 1)),
        },
        solicitacao: { status: 'APROVADO' },
      },
      include: {
        solicitacao: {
          select: {
            id: true,
            numero: true,
            dtSolicitacao: true,
            solicitanteId: true,
            solicitante: { select: { nome: true } },
            estabelecimentoId: true,
            unidadeNegocioId: true,
          },
        },
        grupo: { select: { nome: true } },
      },
      orderBy: [{ solicitacao: { numero: 'asc' } }],
    });
    return rows.map((it) => ({
      solicitacaoId: it.solicitacaoId,
      itemId: it.id,
      numero: it.solicitacao.numero,
      descricao: it.descricao,
      grupoNome: it.grupo?.nome ?? null,
      solicitanteId: it.solicitacao.solicitanteId,
      solicitanteNome: it.solicitacao.solicitante?.nome ?? null,
      estabelecimentoId: it.solicitacao.estabelecimentoId,
      unidadeNegocioId: it.solicitacao.unidadeNegocioId,
      dtSolicitacaoOriginal: it.solicitacao.dtSolicitacao,
      dataPrevistaOriginal: it.dataPrevista,
      quantidade: it.quantidade,
      valorTotal: Number(it.valorTotal),
    }));
  }

  /**
   * Cria carryovers em lote com os dados informados pelo admin (solicitante,
   * data original e nova data de execução). Semântica PARCIAL — cada item falha
   * isoladamente. Reaproveita 1 solicitação-carry por origem (ano da nova data).
   */
  async criarCarryover(
    dto: { itens: CarryoverItem[] },
    adminId: string,
  ) {
    const resultados: { itemId: string; ok: boolean; numero?: number; erro?: string }[] = [];
    for (const req of dto.itens) {
      try {
        const r = await this.carryoverUmItem(req, adminId);
        resultados.push({ itemId: req.itemId, ok: true, numero: r });
      } catch (e) {
        resultados.push({
          itemId: req.itemId,
          ok: false,
          erro: e instanceof Error ? e.message : 'Falha ao prorrogar',
        });
      }
    }
    return {
      total: dto.itens.length,
      sucesso: resultados.filter((r) => r.ok).length,
      falhas: resultados.filter((r) => !r.ok).length,
      resultados,
    };
  }

  private async carryoverUmItem(
    req: CarryoverItem,
    adminId: string,
  ): Promise<number> {
    const item = await this.prisma.solicitacaoItem.findUnique({ where: { id: req.itemId } });
    if (!item || item.solicitacaoId !== req.solicitacaoId) {
      throw new NotFoundException('Item não encontrado nesta solicitação');
    }
    if (item.prorrogadoParaAno != null) throw new BadRequestException('Item já prorrogado.');
    if (item.origemItemId != null) throw new BadRequestException('Item já é um carryover.');
    const origem = await this.prisma.solicitacao.findUnique({ where: { id: req.solicitacaoId } });
    if (!origem) throw new NotFoundException('Solicitação não encontrada');

    const novaData = new Date(req.novaDataExecucao);
    if (isNaN(novaData.getTime())) throw new BadRequestException('Nova data de execução inválida.');
    const dataOriginal = new Date(req.dataOriginal);
    if (isNaN(dataOriginal.getTime())) throw new BadRequestException('Data original inválida.');
    const anoAlvo = novaData.getUTCFullYear();

    const out = await this.prisma.$transaction(async (tx) => {
      // Uma carry por (origem × solicitante informado): permite solicitantes
      // distintos ao prorrogar itens da mesma origem.
      let carry = await tx.solicitacao.findFirst({
        where: { origemProrrogacaoId: req.solicitacaoId, solicitanteId: req.solicitanteId },
      });
      const carryCriada = !carry;
      if (!carry) {
        carry = await tx.solicitacao.create({
          data: {
            solicitanteId: req.solicitanteId,
            estabelecimentoId: origem.estabelecimentoId,
            unidadeNegocioId: origem.unidadeNegocioId,
            centroCustoCodigo: origem.centroCustoCodigo,
            tipoVerba: origem.tipoVerba,
            projeto: origem.projeto,
            status: 'APROVADO',
            origemProrrogacaoId: req.solicitacaoId,
            dtSolicitacao: dataOriginal, // data real informada pelo admin
            dtRecurso: novaData,
          },
        });
      } else if (!carry.dtRecurso || novaData < carry.dtRecurso) {
        await tx.solicitacao.update({ where: { id: carry.id }, data: { dtRecurso: novaData } });
      }
      const { id: _id, solicitacaoId: _sid, prorrogadoParaAno: _p, origemItemId: _o, ...campos } =
        item;
      await tx.solicitacaoItem.create({
        data: { ...campos, solicitacaoId: carry.id, dataPrevista: novaData, origemItemId: item.id, prorrogadoParaAno: null },
      });
      await tx.solicitacaoItem.update({
        where: { id: item.id },
        data: { prorrogadoParaAno: anoAlvo },
      });
      return { carry, carryCriada };
    });

    if (out.carryCriada) {
      await registrarEvento(this.prisma, {
        entidade: 'Solicitacao',
        entidadeId: out.carry.id,
        usuarioId: adminId,
        acao: 'CRIADA',
        dados: { comentario: `Carryover da solicitação #${origem.numero}.` },
      });
    }
    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: req.solicitacaoId,
      usuarioId: adminId,
      acao: 'ITEM_PRORROGADO',
      dados: {
        comentario: `Item "${item.descricao}" carryover para ${anoAlvo} (solicitação #${out.carry.numero}).`,
      },
    });
    return out.carry.numero;
  }
}
