import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { STATUS } from '../solicitacao/solicitacao.service';
import { assertTransition, type Status } from '../fluxo/state-machine';
import { INCLUDE_DETALHE, toSolicitacaoDto, type SolRow } from '../solicitacao/solicitacao.mapper';
import { registrarEvento } from '../common/auditoria';
import type { AprovacaoInput, AprovadorEdit } from '@investimentos/shared';

export interface RelatorioAprovadorFiltros {
  situacoes?: string[]; // PENDENTE | APROVADO | REPROVADO | REVISAO
  grupoIds?: number[];
  q?: string;
  dataDe?: string;
  dataAte?: string;
}

@Injectable()
export class AprovacaoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista solicitações pendentes de aprovação onde o `userLogin` pode atuar
   * na etapa atual do fluxo (por PERFIL, USUARIO ou por alçada ESTAB×GRUPO).
   */
  async pendentes(userLogin: string, userId: string, isAdmin = false) {
    const solicitacoes = await this.prisma.solicitacao.findMany({
      where: {
        status: { in: [STATUS.EM_APROVACAO, STATUS.APROVACAO_INICIAL] },
        fluxoId: { not: null },
      },
      include: INCLUDE_DETALHE,
      orderBy: { dtSolicitacao: 'asc' },
    });

    const result = [];
    for (const sol of solicitacoes) {
      const etapa = sol.fluxo?.etapas.find((e) => e.ordem === sol.etapaAtualOrdem);
      if (!etapa) continue;

      // Admin atua em QUALQUER etapa — vê todas as solicitações em aprovação.
      const podeAtuar = isAdmin || (await this.podeAprovar(etapa, sol, userLogin, userId));
      if (podeAtuar) result.push(await toSolicitacaoDto(this.prisma, sol as unknown as SolRow));
    }
    return result;
  }

  /**
   * Histórico de decisões do próprio aprovador (o que ele aprovou, reprovou ou
   * devolveu para revisão), mais recentes primeiro. Inclui o status atual da
   * solicitação para dar contexto (ex.: um item aprovado no nível 1 pode já
   * estar Aprovação Final ou ter sido reprovado depois).
   */
  async minhasDecisoes(aprovadorId: string) {
    const rows = await this.prisma.aprovacao.findMany({
      where: { aprovadorId },
      orderBy: { data: 'desc' },
      include: {
        etapa: { select: { nome: true } },
        solicitacao: {
          select: {
            id: true,
            numero: true,
            status: true,
            solicitante: { select: { nome: true } },
            itens: { select: { quantidade: true, valorUnitario: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      data: r.data,
      decisao: r.decisao, // APROVADO | REPROVADO | REVISAO
      justificativa: r.justificativa,
      etapaNome: r.etapa?.nome ?? null,
      solicitacaoId: r.solicitacao.id,
      numero: `#${String(r.solicitacao.numero).padStart(5, '0')}`,
      statusAtual: r.solicitacao.status,
      solicitanteNome: r.solicitacao.solicitante?.nome ?? null,
      valorTotal: r.solicitacao.itens.reduce(
        (s, i) => s + i.quantidade * Number(i.valorUnitario),
        0,
      ),
    }));
  }

  /**
   * Relatório do APROVADOR: itens das solicitações que (a) estão na fila dele
   * agora (pendentes para a alçada/perfil dele) ou (b) ele já decidiu (aprovou,
   * reprovou ou devolveu para revisão). Uma linha por item. A coluna `situacao`
   * reflete a relação DELE com a solicitação (PENDENTE + a última decisão dele).
   */
  async relatorio(userLogin: string, userId: string, f: RelatorioAprovadorFiltros) {
    // (a) Fila atual: solicitações em andamento onde ELE pode atuar na etapa atual.
    const emFluxo = await this.prisma.solicitacao.findMany({
      where: {
        status: { in: [STATUS.EM_APROVACAO, STATUS.APROVACAO_INICIAL] },
        fluxoId: { not: null },
      },
      include: {
        itens: { select: { grupoId: true } },
        fluxo: { include: { etapas: true } },
      },
    });
    const pendentesIds = new Set<string>();
    for (const sol of emFluxo) {
      const etapa = sol.fluxo?.etapas.find((e) => e.ordem === sol.etapaAtualOrdem);
      if (!etapa) continue;
      if (await this.podeAprovar(etapa, sol, userLogin, userId)) pendentesIds.add(sol.id);
    }

    // (b) Histórico: última decisão dele por solicitação (asc → o último sobrescreve).
    const minhas = await this.prisma.aprovacao.findMany({
      where: { aprovadorId: userId },
      orderBy: { data: 'asc' },
      select: { solicitacaoId: true, decisao: true, data: true, justificativa: true },
    });
    const ultima = new Map<
      string,
      { decisao: string; data: Date; justificativa: string | null }
    >();
    for (const a of minhas) {
      ultima.set(a.solicitacaoId, {
        decisao: a.decisao,
        data: a.data,
        justificativa: a.justificativa,
      });
    }

    const ids = new Set<string>([...pendentesIds, ...ultima.keys()]);
    if (ids.size === 0) return { total: 0, itens: [] };

    const sols = await this.prisma.solicitacao.findMany({
      where: { id: { in: [...ids] } },
      orderBy: { dtSolicitacao: 'desc' },
      include: {
        solicitante: { select: { nome: true, login: true } },
        itens: true,
        fluxo: { include: { etapas: { select: { ordem: true, nome: true } } } },
      },
    });

    const num = (v: unknown) => (v == null ? null : Number(v));
    const soDigitos = (f.q ?? '').replace(/\D/g, '');
    const termo = (f.q ?? '').trim().toLowerCase();

    const linhas: Record<string, unknown>[] = [];
    for (const r of sols) {
      // PENDENTE tem prioridade sobre a decisão anterior (ex.: voltou pra fila dele).
      const situacao = pendentesIds.has(r.id)
        ? 'PENDENTE'
        : (ultima.get(r.id)?.decisao ?? 'PENDENTE');
      if (f.situacoes?.length && !f.situacoes.includes(situacao)) continue;
      if (f.dataDe && r.dtSolicitacao < new Date(f.dataDe)) continue;
      if (f.dataAte && r.dtSolicitacao > new Date(`${f.dataAte}T23:59:59`)) continue;
      if (termo) {
        const hit =
          (soDigitos && String(r.numero).includes(soDigitos)) ||
          (r.projeto ?? '').toLowerCase().includes(termo) ||
          r.solicitante.nome.toLowerCase().includes(termo) ||
          r.solicitante.login.toLowerCase().includes(termo);
        if (!hit) continue;
      }
      const etapaAtual =
        r.fluxo?.etapas.find((e) => e.ordem === r.etapaAtualOrdem)?.nome ?? null;
      const decisao = ultima.get(r.id) ?? null;
      for (const it of r.itens) {
        if (f.grupoIds?.length && !f.grupoIds.includes(it.grupoId)) continue;
        linhas.push({
          id: r.id,
          numero: r.numero,
          dtSolicitacao: r.dtSolicitacao,
          status: r.status,
          situacao, // PENDENTE | APROVADO | REPROVADO | REVISAO
          decisaoData: decisao?.data ?? null,
          decisaoJustificativa: decisao?.justificativa ?? null,
          etapaAtual,
          solicitanteNome: r.solicitante.nome,
          estabelecimentoId: r.estabelecimentoId,
          grupoId: it.grupoId,
          tipo: it.tipo,
          descricao: it.descricao,
          quantidade: it.quantidade,
          valorUnitario: num(it.valorUnitario),
          valorTotal: num(it.valorTotal),
          dataPrevista: it.dataPrevista,
        });
      }
    }
    return { total: linhas.length, itens: linhas };
  }

  /**
   * "Mesa de Aprovação Final": itens de todas as solicitações que estão na
   * ETAPA FINAL do fluxo (em andamento, sem nenhuma etapa obrigatória adiante).
   * Uma linha por item, com as dimensões para pivô/drill (grupo, agrupamento,
   * unidade) — a agregação é feita no cliente para permitir drill interativo.
   */
  async mesaFinal() {
    const MAX = 5000;
    const inc = {
      solicitante: { select: { nome: true } },
      itens: { include: { itemCatalogo: { select: { nome: true, agrupamento: true } } } },
      fluxo: { include: { etapas: { select: { ordem: true, nome: true, obrigatoria: true } } } },
    } as const;

    const inFlight = await this.prisma.solicitacao.findMany({
      where: {
        status: { in: [STATUS.EM_APROVACAO, STATUS.APROVACAO_INICIAL] },
        fluxoId: { not: null },
      },
      take: MAX,
      orderBy: { dtSolicitacao: 'asc' },
      include: inc,
    });
    // Carryovers (prorrogados): já aprovados; entram para compor o total do ano.
    const carryovers = await this.prisma.solicitacao.findMany({
      where: { status: STATUS.APROVADO, origemProrrogacaoId: { not: null } },
      take: MAX,
      orderBy: { dtSolicitacao: 'asc' },
      include: inc,
    });

    const num = (v: unknown) => (v == null ? 0 : Number(v));
    const linhas: Record<string, unknown>[] = [];
    type SolComItens = (typeof inFlight)[number];
    const pushItens = (r: SolComItens, etapaNome: string | null, carryover: boolean) => {
      for (const it of r.itens) {
        linhas.push({
          solicitacaoId: r.id,
          numero: r.numero,
          status: r.status,
          etapaAtual: etapaNome,
          solicitanteNome: r.solicitante.nome,
          estabelecimentoId: r.estabelecimentoId,
          unidadeNegocioId: r.unidadeNegocioId,
          grupoId: it.grupoId,
          agrupamento: it.itemCatalogo?.agrupamento ?? null,
          itemCatalogoId: it.itemCatalogoId ?? null,
          itemNome: it.itemCatalogo?.nome ?? it.descricao,
          tipo: it.tipo,
          quantidade: it.quantidade,
          valorUnitario: num(it.valorUnitario),
          valorTotal: num(it.valorTotal),
          dataPrevista: it.dataPrevista,
          tipoVerba: r.tipoVerba, // RP | VP | null
          statusVerbaPublica: r.statusVerbaPublica,
          carryover,
        });
      }
    };

    for (const r of inFlight) {
      const etapas = r.fluxo?.etapas ?? [];
      const etapa = etapas.find((e) => e.ordem === r.etapaAtualOrdem);
      if (!etapa) continue;
      // Só entra na mesa quem já está na última etapa obrigatória (aprovação final).
      if (etapas.some((e) => e.ordem > etapa.ordem && e.obrigatoria)) continue;
      pushItens(r, etapa.nome, false);
    }
    for (const r of carryovers) pushItens(r, null, true);

    return { total: linhas.length, itens: linhas };
  }

  async decidir(
    solicitacaoId: string,
    aprovadorId: string,
    aprovadorLogin: string,
    input: AprovacaoInput,
    isAdmin = false,
    simuladoPorId: string | null = null,
  ) {
    const sol = await this.prisma.solicitacao.findUnique({
      where: { id: solicitacaoId },
      include: { itens: true, fluxo: { include: { etapas: true } } },
    });
    if (!sol) throw new NotFoundException('Solicitação não encontrada');
    if (
      sol.status !== STATUS.EM_APROVACAO &&
      sol.status !== STATUS.APROVACAO_INICIAL
    ) {
      throw new BadRequestException(
        `Solicitação em status ${sol.status} não aceita decisão`,
      );
    }
    if (!sol.fluxo || sol.etapaAtualOrdem == null) {
      throw new BadRequestException('Fluxo não materializado');
    }
    const etapa = sol.fluxo.etapas.find((e) => e.ordem === sol.etapaAtualOrdem);
    if (!etapa) throw new BadRequestException('Etapa atual não encontrada');

    // Admin pode decidir em qualquer etapa (override total).
    const podeAtuar = isAdmin || (await this.podeAprovar(etapa, sol, aprovadorLogin, aprovadorId));
    if (!podeAtuar) {
      throw new ForbiddenException(
        `Usuário ${aprovadorLogin} não é aprovador desta etapa`,
      );
    }

    if (input.decisao === 'REVISAO' && !etapa.permiteRevisao) {
      throw new BadRequestException('Etapa não permite pedir revisão');
    }

    // Grava a decisão (evento) — tabela Aprovacao + trilha de auditoria
    await this.prisma.aprovacao.create({
      data: {
        solicitacaoId,
        etapaId: etapa.id,
        aprovadorId,
        decisao: input.decisao,
        justificativa: input.justificativa ?? null,
        simuladoPorId,
      },
    });
    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: solicitacaoId,
      usuarioId: aprovadorId,
      acao: input.decisao, // APROVADO | REPROVADO | REVISAO
      dados: { etapa: etapa.nome, comentario: input.justificativa ?? null },
    });

    // Atualiza status conforme decisão
    if (input.decisao === 'REPROVADO') {
      return this.transitar(sol.id, sol.status as Status, STATUS.REPROVADO);
    }
    if (input.decisao === 'REVISAO') {
      return this.transitar(sol.id, sol.status as Status, STATUS.EM_REVISAO, {
        fluxoId: null,
        etapaAtualOrdem: null,
      });
    }

    // APROVADO: avança para próxima etapa obrigatória
    const proxima = sol.fluxo.etapas
      .filter((e) => e.ordem > etapa.ordem && e.obrigatoria)
      .sort((a, b) => a.ordem - b.ordem)[0];

    if (proxima) {
      // Ainda há etapa(s): passa a "Aprovação Inicial" na 1ª aprovação e avança a
      // etapa. Em etapas seguintes (já em APROVACAO_INICIAL) só avança a etapa.
      const novoStatus =
        sol.status === STATUS.EM_APROVACAO ? STATUS.APROVACAO_INICIAL : sol.status;
      if (novoStatus !== sol.status) {
        assertTransition(sol.status as Status, novoStatus as Status);
      }
      return this.prisma.solicitacao.update({
        where: { id: sol.id },
        data: { status: novoStatus, etapaAtualOrdem: proxima.ordem },
        include: { itens: true, aprovacoes: true },
      });
    }
    // Última etapa obrigatória aprovada → Aprovação Final.
    return this.transitar(sol.id, sol.status as Status, STATUS.APROVADO);
  }

  /**
   * Decisão em LOTE (Mesa de Aprovação Final): aplica a mesma decisão a várias
   * solicitações. Semântica PARCIAL — cada uma passa pelo mesmo caminho do
   * `decidir` (status, etapa, autorização) e falha isoladamente. Retorna o
   * resultado por id para a UI mostrar o que passou e o que não passou.
   */
  async decidirLote(
    ids: string[],
    aprovadorId: string,
    aprovadorLogin: string,
    input: AprovacaoInput,
    isAdmin = false,
    simuladoPorId: string | null = null,
  ) {
    // Dedup preservando ordem (o mesmo pedido pode aparecer sob vários itens).
    const unicos = [...new Set(ids)];
    const resultados: { id: string; ok: boolean; erro?: string }[] = [];
    for (const id of unicos) {
      try {
        await this.decidir(id, aprovadorId, aprovadorLogin, input, isAdmin, simuladoPorId);
        resultados.push({ id, ok: true });
      } catch (e) {
        resultados.push({
          id,
          ok: false,
          erro: e instanceof Error ? e.message : 'Falha ao decidir',
        });
      }
    }
    return {
      total: unicos.length,
      sucesso: resultados.filter((r) => r.ok).length,
      falhas: resultados.filter((r) => !r.ok).length,
      resultados,
    };
  }

  /** Observação do Gestor Focal (aprovador/aprovador final). */
  async salvarObsGF(id: string, obsGF: string | null | undefined, usuarioId: string) {
    const sol = await this.prisma.solicitacao.findUnique({ where: { id } });
    if (!sol) throw new NotFoundException('Solicitação não encontrada');
    await this.prisma.solicitacao.update({
      where: { id },
      data: { obsGF: obsGF ?? null },
    });
    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: id,
      usuarioId,
      acao: 'OBS_GF',
    });
    return { ok: true };
  }

  /** Observação + Validação do GPE (admin). */
  async salvarAnotacaoGPE(
    id: string,
    dados: { obsGPE?: string | null; validacao?: string | null; revisaoAnual?: string | null },
    usuarioId: string,
  ) {
    const sol = await this.prisma.solicitacao.findUnique({ where: { id } });
    if (!sol) throw new NotFoundException('Solicitação não encontrada');
    await this.prisma.solicitacao.update({
      where: { id },
      data: {
        obsGPE: dados.obsGPE ?? null,
        validacao: dados.validacao ?? null,
        revisaoAnual: dados.revisaoAnual ?? null,
      },
    });
    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: id,
      usuarioId,
      acao: 'ANOTACAO_GPE',
    });
    return { ok: true };
  }

  /**
   * Edição de campos OPCIONAIS + valor unitário dos itens pelo aprovador, antes
   * de aprovar. Permitido: admin (qualquer etapa) OU aprovador da etapa FOCAL.
   * Campos de identidade (descrição, qtd, catálogo, motivo, data prevista,
   * escopo inicial) não são tocados — o schema só carrega os editáveis.
   */
  async editarItens(
    solicitacaoId: string,
    userId: string,
    userLogin: string,
    isAdmin: boolean,
    dto: AprovadorEdit,
  ) {
    const sol = await this.prisma.solicitacao.findUnique({
      where: { id: solicitacaoId },
      include: { itens: true, fluxo: { include: { etapas: true } } },
    });
    if (!sol) throw new NotFoundException('Solicitação não encontrada');
    if (
      sol.status !== STATUS.EM_APROVACAO &&
      sol.status !== STATUS.APROVACAO_INICIAL
    ) {
      throw new BadRequestException('Só é possível editar itens durante a aprovação.');
    }
    const etapa = sol.fluxo?.etapas.find((e) => e.ordem === sol.etapaAtualOrdem);
    if (!etapa) throw new BadRequestException('Etapa atual não encontrada');

    // Gating: admin em qualquer etapa; senão, precisa ser aprovador da etapa FOCAL.
    if (!isAdmin) {
      const ehFocal = etapa.fonteAprovador === 'ALCADA_FOCAL';
      const pode = ehFocal && (await this.podeAprovar(etapa, sol, userLogin, userId));
      if (!pode) {
        throw new ForbiddenException(
          'Edição permitida apenas ao Gestor Focal na etapa focal (ou admin).',
        );
      }
    }

    const porId = new Map(sol.itens.map((i) => [i.id, i]));
    await this.prisma.$transaction(async (tx) => {
      for (const edit of dto.itens) {
        const item = porId.get(edit.id);
        if (!item) continue; // ignora ids que não pertencem a esta solicitação
        const { id, valorUnitario, ...rest } = edit;
        const data: Record<string, unknown> = { ...rest };
        if (valorUnitario != null) {
          data.valorUnitario = valorUnitario;
          data.valorTotal = Number((item.quantidade * valorUnitario).toFixed(2));
        }
        await tx.solicitacaoItem.update({ where: { id }, data });
      }
    });

    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: solicitacaoId,
      usuarioId: userId,
      acao: 'ITENS_EDITADOS',
      dados: { comentario: `Itens editados por ${userLogin} na etapa "${etapa.nome}".` },
    });

    const atualizada = await this.prisma.solicitacao.findUnique({
      where: { id: solicitacaoId },
      include: INCLUDE_DETALHE,
    });
    return toSolicitacaoDto(this.prisma, atualizada as unknown as SolRow);
  }

  private async podeAprovar(
    etapa: { fonteAprovador: string; perfilAlvo: string | null; usuarioAlvoId: string | null },
    sol: { estabelecimentoId: number; itens: { grupoId: number }[] },
    userLogin: string,
    userId: string,
  ): Promise<boolean> {
    const fonte = etapa.fonteAprovador;
    if (fonte === 'USUARIO') {
      return etapa.usuarioAlvoId === userId;
    }
    if (fonte === 'PERFIL') {
      if (!etapa.perfilAlvo) return false;
      const perfis = await this.prisma.userPerfil.findMany({
        where: { userId, perfil: { nome: etapa.perfilAlvo } },
      });
      return perfis.length > 0;
    }
    // ALCADA_*: casa por (estabelecimento, grupo, nivel, login)
    const nivel = fonte.replace('ALCADA_', ''); // FOCAL | SUP | FINAL
    const grupos = new Set(sol.itens.map((it) => it.grupoId));
    const rules = await this.prisma.regraAlcada.findMany({
      where: {
        estabelecimentoId: sol.estabelecimentoId,
        grupoId: { in: [...grupos] },
        nivel,
        usuarioLogin: userLogin,
      },
    });
    return rules.length > 0;
  }

  private async transitar(
    id: string,
    from: Status,
    to: Status,
    extra: Record<string, unknown> = {},
  ) {
    assertTransition(from, to);
    return this.prisma.solicitacao.update({
      where: { id },
      data: { status: to, ...extra },
      include: { itens: true, aprovacoes: true },
    });
  }
}
