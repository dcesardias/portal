import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FluxoResolver } from '../fluxo/fluxo.resolver';
import {
  INCLUDE_DETALHE,
  INCLUDE_LISTA,
  toSolicitacaoDto,
  type SolRow,
} from './solicitacao.mapper';
import { registrarEvento, montarHistorico } from '../common/auditoria';
import type {
  SolicitacaoCreate,
  SolicitacaoItemInput,
  AprovacaoInput,
} from '@investimentos/shared';

export const STATUS = {
  RASCUNHO: 'RASCUNHO',
  EM_APROVACAO: 'EM_APROVACAO',
  APROVACAO_INICIAL: 'APROVACAO_INICIAL',
  APROVADO: 'APROVADO',
  REPROVADO: 'REPROVADO',
  EM_REVISAO: 'EM_REVISAO',
  CANCELADO: 'CANCELADO',
} as const;

/** Menor data prevista entre os itens (ou null se nenhum item tiver data). */
function menorDataPrevista(itens: { dataPrevista: Date | null }[]): Date | null {
  const datas = itens.map((it) => it.dataPrevista).filter((d): d is Date => d != null);
  if (!datas.length) return null;
  return datas.reduce((min, d) => (d < min ? d : min));
}

@Injectable()
export class SolicitacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: FluxoResolver,
  ) {}

  async create(
    solicitanteId: string,
    dto: SolicitacaoCreate,
    simuladoPorId: string | null = null,
  ) {
    if (!dto.itens?.length) {
      throw new BadRequestException('Solicitação deve conter ao menos 1 item');
    }

    // Integridade: o tipo declarado do item precisa bater com o tipo do catálogo.
    await this.validarTipoDosItens(dto.itens);

    // Restrição opcional do solicitante (centro de custo / conta contábil).
    await this.assertRestricaoSolicitante(solicitanteId, dto);

    const itensData = this.montarItensData(dto.itens);

    const criada = await this.prisma.solicitacao.create({
      data: {
        solicitanteId,
        estabelecimentoId: dto.estabelecimentoId,
        unidadeNegocioId: dto.unidadeNegocioId,
        centroCustoCodigo: dto.centroCustoCodigo,
        tipoVerba: dto.tipoVerba ?? null,
        projeto: dto.projeto ?? null,
        // dtRecurso no nível da solicitação = data prevista explícita OU a MENOR
        // data prevista entre os itens (mantém compatível list/detalhe que mostram
        // "data prevista" no topo, agora que a data virou por item).
        dtRecurso: dto.dtRecurso
          ? new Date(dto.dtRecurso)
          : menorDataPrevista(itensData),
        status: STATUS.RASCUNHO,
        simuladoPorId,
        itens: { create: itensData },
      },
      include: { itens: true },
    });
    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: criada.id,
      usuarioId: solicitanteId,
      acao: 'CRIADA',
    });
    return criada;
  }

  /**
   * Criação RETROATIVA pelo admin: nasce já com Aprovação Final (status APROVADO),
   * sem passar pelo fluxo. O admin escolhe o solicitante e a data original da
   * solicitação (dtSolicitacao). Serve para cadastrar itens de anos anteriores
   * que depois serão prorrogados (carryover).
   */
  async adminCreateAprovada(
    dto: SolicitacaoCreate & { solicitanteId: string; dtSolicitacao: string },
    adminId: string,
  ) {
    if (!dto.itens?.length) {
      throw new BadRequestException('Solicitação deve conter ao menos 1 item');
    }
    await this.validarTipoDosItens(dto.itens);
    const itensData = this.montarItensData(dto.itens);
    const dtSolic = new Date(dto.dtSolicitacao);
    if (isNaN(dtSolic.getTime())) {
      throw new BadRequestException('Data da solicitação inválida.');
    }

    const criada = await this.prisma.solicitacao.create({
      data: {
        solicitanteId: dto.solicitanteId,
        estabelecimentoId: dto.estabelecimentoId,
        unidadeNegocioId: dto.unidadeNegocioId,
        centroCustoCodigo: dto.centroCustoCodigo,
        tipoVerba: dto.tipoVerba ?? null,
        projeto: dto.projeto ?? null,
        dtSolicitacao: dtSolic,
        dtRecurso: dto.dtRecurso ? new Date(dto.dtRecurso) : menorDataPrevista(itensData),
        status: STATUS.APROVADO,
        itens: { create: itensData },
      },
      include: { itens: true },
    });
    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: criada.id,
      usuarioId: adminId,
      acao: 'CRIADA',
      dados: {
        admin: true,
        aprovadaNaCriacao: true,
        comentario: `Criada retroativamente pelo admin já em Aprovação Final (solicitante ${dto.solicitanteId}).`,
      },
    });
    return criada;
  }

  /** Monta as linhas de item (com valorTotal calculado) para create/update. */
  private montarItensData(itens: SolicitacaoItemInput[]) {
    return itens.map((it) => ({
      tipo: it.tipo,
      grupoId: it.grupoId,
      itemCatalogoId: it.itemCatalogoId ?? null,
      descricao: it.descricao,
      especificacao: it.especificacao ?? null,
      modelosReferencia: it.modelosReferencia ?? null,
      motivoId: it.motivoId,
      justificativa: it.justificativa,
      quantidade: it.quantidade,
      valorUnitario: it.valorUnitario,
      valorTotal: Number((it.quantidade * it.valorUnitario).toFixed(2)),
      dataPrevista: it.dataPrevista ? new Date(it.dataPrevista) : null,
      ieDemolicoes: it.ieDemolicoes ?? false,
      iePiso: it.iePiso ?? false,
      ieForro: it.ieForro ?? false,
      ieArCondicionado: it.ieArCondicionado ?? false,
      ieMarcenaria: it.ieMarcenaria ?? false,
      ieCaixilhos: it.ieCaixilhos ?? false,
      justificativaPeriodo: it.justificativaPeriodo ?? null,
      publicoAlvo: it.publicoAlvo ?? null,
      volumePessoas: it.volumePessoas ?? null,
      subtipoObra: it.subtipoObra ?? null,
      subtipoObraOutros: it.subtipoObraOutros ?? null,
      escopoInicial: it.escopoInicial ?? null,
      beneficiosProjeto: it.beneficiosProjeto ?? null,
      impactoRdc50: it.impactoRdc50 ?? null,
      justificativaClinica: it.justificativaClinica ?? null,
      infraAguaEsgoto: it.infraAguaEsgoto ?? false,
      infraEletricaRegulada: it.infraEletricaRegulada ?? false,
      infraBlindagem: it.infraBlindagem ?? false,
      infraClimatizacao: it.infraClimatizacao ?? false,
      infraGasesMedicinais: it.infraGasesMedicinais ?? false,
      infraPlugAndPlay: it.infraPlugAndPlay ?? false,
      manutencaoPreventiva: it.manutencaoPreventiva ?? null,
      manutPeriodMensal: it.manutPeriodMensal ?? false,
      manutPeriodTrimestral: it.manutPeriodTrimestral ?? false,
      manutPeriodSemestral: it.manutPeriodSemestral ?? false,
      manutPeriodAnual: it.manutPeriodAnual ?? false,
    }));
  }

  /**
   * Confere que o item do catálogo referenciado tem o mesmo `tipo` declarado
   * (ITEM/INSTRUMENTAL). Obra não referencia catálogo. Evita, por ex., pedir um
   * instrumental dentro de um fluxo de "Itens".
   */
  private async validarTipoDosItens(itens: SolicitacaoItemInput[]) {
    const comCatalogo = itens.filter((it) => it.itemCatalogoId != null);
    if (!comCatalogo.length) return;

    const ids = [...new Set(comCatalogo.map((it) => it.itemCatalogoId!))];
    const catalogos = await this.prisma.itemCatalogo.findMany({
      where: { id: { in: ids } },
      select: { id: true, tipo: true, grupoId: true },
    });
    const porId = new Map(catalogos.map((c) => [c.id, c]));

    for (const it of comCatalogo) {
      const cat = porId.get(it.itemCatalogoId!);
      if (!cat) {
        throw new BadRequestException(`Item de catálogo ${it.itemCatalogoId} não existe`);
      }
      if (cat.tipo !== it.tipo) {
        throw new BadRequestException(
          `Item ${it.itemCatalogoId} é do tipo ${cat.tipo}, não ${it.tipo}`,
        );
      }
    }
  }

  /**
   * Restrição opcional: se o solicitante tiver linhas em RestricaoSolicitante,
   * a solicitação só passa se casar com ao menos uma delas. Sem linhas = livre.
   * Uma linha casa quando (centroCusto nulo OU == CC da solicitação) E
   * (conta nula OU == conta contábil de algum grupo dos itens).
   */
  private async assertRestricaoSolicitante(solicitanteId: string, dto: SolicitacaoCreate) {
    const restricoes = await this.prisma.restricaoSolicitante.findMany({
      where: { userId: solicitanteId },
    });
    if (restricoes.length === 0) return; // sem restrição

    const grupoIds = [...new Set(dto.itens.map((it) => it.grupoId))];
    const grupos = await this.prisma.grupoInvestimento.findMany({
      where: { id: { in: grupoIds } },
      select: { contaContabil: true },
    });
    const contasDaSolicitacao = new Set(
      grupos.map((g) => g.contaContabil).filter((c): c is string => c != null),
    );

    const casa = restricoes.some(
      (r) =>
        (r.centroCustoCodigo == null || r.centroCustoCodigo === dto.centroCustoCodigo) &&
        (r.contaContabil == null || contasDaSolicitacao.has(r.contaContabil)),
    );

    if (!casa) {
      throw new ForbiddenException(
        'Você não tem permissão para solicitar neste centro de custo / conta contábil.',
      );
    }
  }

  /**
   * Lista de solicitações. Por padrão só as do próprio usuário; com
   * `opts.isAdmin` retorna TODAS (admin/efetivo-admin vê tudo), mantendo o
   * filtro de status quando informado.
   */
  async findMinhas(userId: string, opts?: { isAdmin?: boolean; status?: string }) {
    const rows = await this.prisma.solicitacao.findMany({
      where: {
        ...(opts?.isAdmin ? {} : { solicitanteId: userId }),
        ...(opts?.status ? { status: opts.status } : {}),
      },
      orderBy: { dtSolicitacao: 'desc' },
      include: INCLUDE_LISTA,
    });
    return Promise.all(rows.map((r) => toSolicitacaoDto(this.prisma, r as unknown as SolRow)));
  }

  /** DTO enriquecido para a tela de detalhe (nomes, etapa atual, histórico). */
  async detalhe(id: string) {
    const sol = await this.prisma.solicitacao.findUnique({
      where: { id },
      include: INCLUDE_DETALHE,
    });
    if (!sol) throw new NotFoundException('Solicitação não encontrada');
    const dto = await toSolicitacaoDto(this.prisma, sol as unknown as SolRow);
    const historico = await montarHistorico(this.prisma, id);
    return { ...dto, historico };
  }

  /** Uso INTERNO (update/enviar/cancelar) — modelo cru, não o DTO. */
  async findById(id: string) {
    const sol = await this.prisma.solicitacao.findUnique({
      where: { id },
      include: { itens: true, aprovacoes: true, fluxo: { include: { etapas: true } } },
    });
    if (!sol) throw new NotFoundException('Solicitação não encontrada');
    return sol;
  }

  /**
   * Edição COMPLETA (cabeçalho + itens) pelo próprio solicitante. Permitida só
   * enquanto o pedido está com ele — RASCUNHO ou EM_REVISAO. Depois de enviado
   * para aprovação, fica bloqueada (só admin edita).
   */
  async update(id: string, solicitanteId: string, dto: SolicitacaoCreate) {
    const sol = await this.findById(id);
    if (sol.solicitanteId !== solicitanteId) {
      throw new ForbiddenException('Só o solicitante pode editar este pedido');
    }
    if (sol.status !== STATUS.RASCUNHO && sol.status !== STATUS.EM_REVISAO) {
      throw new BadRequestException(
        'Este pedido já foi enviado para aprovação e não pode mais ser editado.',
      );
    }
    // Mesma restrição opcional (centro de custo / conta) aplicada na criação.
    await this.assertRestricaoSolicitante(solicitanteId, dto);
    await this.aplicarEdicaoCompleta(id, dto, sol.tipoVerba);
    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: id,
      usuarioId: solicitanteId,
      acao: 'EDITADA',
    });
    return this.findById(id);
  }

  async enviar(id: string, solicitanteId: string) {
    const sol = await this.findById(id);
    if (sol.solicitanteId !== solicitanteId) {
      throw new ForbiddenException('Não é o solicitante');
    }
    if (sol.status !== STATUS.RASCUNHO && sol.status !== STATUS.EM_REVISAO) {
      throw new BadRequestException(
        `Não pode enviar em status ${sol.status}`,
      );
    }
    if (!sol.itens.length) {
      throw new BadRequestException('Solicitação sem itens não pode ser enviada');
    }

    const valorTotal = sol.itens.reduce(
      (acc, it) => acc + Number(it.valorTotal),
      0,
    );
    const grupoUnico = sol.itens.length
      ? new Set(sol.itens.map((it) => it.grupoId)).size === 1
        ? sol.itens[0].grupoId
        : undefined
      : undefined;

    const fluxo = await this.resolver.resolve({
      estabelecimentoId: sol.estabelecimentoId,
      grupoId: grupoUnico,
      tipoVerba: sol.tipoVerba ?? undefined,
      valor: valorTotal,
    });

    if (!fluxo) {
      throw new BadRequestException(
        'Nenhum fluxo aplicável — configure regra ou fluxo default',
      );
    }

    const primeiraEtapa = fluxo.etapas.find((e) => e.ordem === 1);
    if (!primeiraEtapa) {
      throw new BadRequestException(
        `Fluxo ${fluxo.nome} sem etapa de ordem 1`,
      );
    }

    // Atômico: o where inclui o status esperado, então 2 envios concorrentes do
    // mesmo id não podem gerar 2 fluxos — só o primeiro casa a condição.
    const { count } = await this.prisma.solicitacao.updateMany({
      where: { id, status: { in: [STATUS.RASCUNHO, STATUS.EM_REVISAO] } },
      data: {
        status: STATUS.EM_APROVACAO,
        fluxoId: fluxo.id,
        etapaAtualOrdem: primeiraEtapa.ordem,
      },
    });
    if (count === 0) {
      throw new BadRequestException('Status mudou — recarregue o pedido.');
    }
    const enviada = await this.prisma.solicitacao.findUniqueOrThrow({
      where: { id },
      include: { itens: true, fluxo: { include: { etapas: true } } },
    });
    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: id,
      usuarioId: solicitanteId,
      acao: 'ENVIADA',
      dados: { fluxo: fluxo.nome },
    });
    return enviada;
  }

  /**
   * Envio em lote de rascunhos. Semântica PARCIAL (não all-or-nothing): cada id
   * reaproveita `enviar` (dono/status/itens/fluxo) isoladamente — uma falha não
   * derruba o lote. ids duplicados são processados uma única vez.
   */
  async enviarLote(solicitanteId: string, ids: string[]) {
    const unicos = [...new Set(ids)];
    const resultados: Array<{ id: string; numero: number | null; ok: boolean; erro?: string }> = [];

    for (const id of unicos) {
      try {
        const enviada = await this.enviar(id, solicitanteId);
        resultados.push({ id, numero: enviada.numero, ok: true });
      } catch (e) {
        // Forbidden (não é o dono) e NotFound (id não existe) não devem revelar
        // o número sequencial nem confirmar a existência do UUID de outro dono.
        // Só busca `numero` quando o erro é do próprio pedido (ex.: status/itens/fluxo).
        const podeRevelarNumero = !(e instanceof ForbiddenException || e instanceof NotFoundException);
        const numero = podeRevelarNumero
          ? await this.prisma.solicitacao
              .findUnique({ where: { id }, select: { numero: true } })
              .then((s) => s?.numero ?? null)
              .catch(() => null)
          : null;
        resultados.push({
          id,
          numero,
          ok: false,
          erro: e instanceof Error ? e.message : 'Falha ao enviar',
        });
      }
    }

    return {
      enviadas: resultados.filter((r) => r.ok).length,
      falhas: resultados.filter((r) => !r.ok).length,
      resultados,
    };
  }

  async cancelar(id: string, solicitanteId: string) {
    const sol = await this.findById(id);
    if (sol.solicitanteId !== solicitanteId) {
      throw new ForbiddenException('Não é o solicitante');
    }
    if (
      sol.status === STATUS.APROVADO ||
      sol.status === STATUS.CANCELADO
    ) {
      throw new BadRequestException(
        `Não pode cancelar em status ${sol.status}`,
      );
    }
    const cancelada = await this.prisma.solicitacao.update({
      where: { id },
      data: { status: STATUS.CANCELADO },
    });
    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: id,
      usuarioId: solicitanteId,
      acao: 'CANCELADA',
    });
    return cancelada;
  }

  // ─── Ações de ADMIN (override) ─────────────────────────────────────────────
  // O admin atua sobre QUALQUER solicitação, de qualquer solicitante, sem as
  // travas de dono/status/etapa. A autorização de perfil é feita no controller.

  /**
   * Núcleo da edição completa (cabeçalho + itens): substitui o conjunto de itens
   * numa transação. Sem checagem de dono/status — quem chama decide a autorização.
   */
  private async aplicarEdicaoCompleta(
    id: string,
    dto: SolicitacaoCreate,
    tipoVerbaAtual: string | null,
  ) {
    if (!dto.itens?.length) {
      throw new BadRequestException('Solicitação deve conter ao menos 1 item');
    }
    await this.validarTipoDosItens(dto.itens);
    const itensData = this.montarItensData(dto.itens);

    await this.prisma.$transaction(async (tx) => {
      const itensAntigos = await tx.solicitacaoItem.findMany({
        where: { solicitacaoId: id },
        select: { id: true },
      });
      const itemIds = itensAntigos.map((i) => i.id);
      if (itemIds.length) {
        await tx.solicitacaoItem.deleteMany({ where: { solicitacaoId: id } });
      }
      await tx.solicitacao.update({
        where: { id },
        data: {
          estabelecimentoId: dto.estabelecimentoId,
          unidadeNegocioId: dto.unidadeNegocioId,
          centroCustoCodigo: dto.centroCustoCodigo,
          tipoVerba: dto.tipoVerba ?? tipoVerbaAtual,
          projeto: dto.projeto ?? null,
          dtRecurso: dto.dtRecurso ? new Date(dto.dtRecurso) : menorDataPrevista(itensData),
          itens: { create: itensData },
        },
      });
    });
  }

  /** Edição completa (cabeçalho + itens) de QUALQUER solicitação — admin. */
  async adminUpdate(id: string, adminId: string, dto: SolicitacaoCreate) {
    const sol = await this.findById(id);
    await this.aplicarEdicaoCompleta(id, dto, sol.tipoVerba);
    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: id,
      usuarioId: adminId,
      acao: 'EDITADA',
      dados: { admin: true },
    });
    return this.findById(id);
  }

  /** Define o status da verba pública (só admin). `null` limpa. */
  async setStatusVerbaPublica(id: string, adminId: string, statusVerbaPublica: string | null) {
    const sol = await this.findById(id);
    const atualizada = await this.prisma.solicitacao.update({
      where: { id },
      data: { statusVerbaPublica },
    });
    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: id,
      usuarioId: adminId,
      acao: 'STATUS_VERBA_PUBLICA',
      dados: { de: sol.statusVerbaPublica, para: statusVerbaPublica },
    });
    return atualizada;
  }

  /** Troca direta de status (override de admin), sem passar pela máquina de estados. */
  async adminSetStatus(id: string, adminId: string, status: string, justificativa?: string | null) {
    const sol = await this.findById(id);
    const atualizada = await this.prisma.solicitacao.update({
      where: { id },
      data: { status },
      include: { itens: true },
    });
    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: id,
      usuarioId: adminId,
      acao: 'STATUS_ADMIN',
      dados: { de: sol.status, para: status, admin: true, comentario: justificativa ?? null },
    });
    return atualizada;
  }

  /**
   * Decisão de admin (override): aprova/reprova/manda revisar QUALQUER solicitação
   * de forma terminal, sem respeitar etapas ou identidade do aprovador. Não grava
   * na tabela Aprovacao (que exige etapa) — registra só na trilha de auditoria.
   */
  async adminDecidir(id: string, adminId: string, input: AprovacaoInput) {
    await this.findById(id);
    const destino =
      input.decisao === 'APROVADO'
        ? STATUS.APROVADO
        : input.decisao === 'REPROVADO'
          ? STATUS.REPROVADO
          : STATUS.EM_REVISAO;

    const atualizada = await this.prisma.solicitacao.update({
      where: { id },
      data:
        destino === STATUS.EM_REVISAO
          ? { status: destino, fluxoId: null, etapaAtualOrdem: null }
          : { status: destino },
      include: { itens: true },
    });
    await registrarEvento(this.prisma, {
      entidade: 'Solicitacao',
      entidadeId: id,
      usuarioId: adminId,
      acao: input.decisao, // APROVADO | REPROVADO | REVISAO
      dados: { admin: true, comentario: input.justificativa ?? null },
    });
    return atualizada;
  }

  /** Exclusão definitiva (hard delete) — remove itens, aprovações e a trilha. */
  async adminDelete(id: string, _adminId: string) {
    await this.findById(id); // 404 se não existe
    await this.prisma.$transaction(async (tx) => {
      await tx.aprovacao.deleteMany({ where: { solicitacaoId: id } });
      await tx.solicitacaoItem.deleteMany({ where: { solicitacaoId: id } });
      await tx.eventoAuditoria.deleteMany({
        where: { entidade: 'Solicitacao', entidadeId: id },
      });
      await tx.solicitacao.delete({ where: { id } });
    });
    return { deletada: true, id };
  }
}
