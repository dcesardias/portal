import type { PrismaService } from '../prisma/prisma.service';

/**
 * Estrutura mínima esperada de uma Solicitacao já carregada com os includes
 * (solicitante, itens, fluxo{etapas}).
 */
type Etapa = {
  ordem: number;
  nome: string;
  fonteAprovador: string;
  perfilAlvo: string | null;
  usuarioAlvoId: string | null;
};
type ItemRow = {
  id: string;
  tipo: string;
  grupoId: number;
  itemCatalogoId: number | null;
  descricao: string;
  especificacao: string | null;
  modelosReferencia: string | null;
  motivoId: number;
  justificativa: string;
  quantidade: number;
  valorUnitario: unknown;
  dataPrevista: Date | null;
  ieDemolicoes: boolean;
  iePiso: boolean;
  ieForro: boolean;
  ieArCondicionado: boolean;
  ieMarcenaria: boolean;
  ieCaixilhos: boolean;
  justificativaPeriodo: string | null;
  publicoAlvo: string | null;
  volumePessoas: string | null;
  subtipoObra: string | null;
  subtipoObraOutros: string | null;
  escopoInicial: string | null;
  beneficiosProjeto: string | null;
  impactoRdc50: string | null;
  justificativaClinica: string | null;
  infraAguaEsgoto: boolean;
  infraEletricaRegulada: boolean;
  infraBlindagem: boolean;
  infraClimatizacao: boolean;
  infraGasesMedicinais: boolean;
  infraPlugAndPlay: boolean;
  manutencaoPreventiva: string | null;
  manutPeriodMensal: boolean;
  manutPeriodTrimestral: boolean;
  manutPeriodSemestral: boolean;
  manutPeriodAnual: boolean;
  prorrogadoParaAno: number | null;
  origemItemId: string | null;
  itemCatalogo?: {
    cdMaterialTasy: string | null;
    dsMaterialTasy: string | null;
    movimentoContabil: string | null;
  } | null;
};
export type SolRow = {
  id: string;
  numero: number;
  status: string;
  dtSolicitacao: Date;
  dtRecurso: Date | null;
  solicitanteId: string;
  solicitante?: { nome: string; login: string } | null;
  estabelecimentoId: number;
  unidadeNegocioId: number;
  centroCustoCodigo: string;
  tipoVerba: string | null;
  statusVerbaPublica: string | null;
  projeto: string | null;
  etapaAtualOrdem: number | null;
  origemProrrogacaoId: string | null;
  obsGF: string | null;
  obsGPE: string | null;
  validacao: string | null;
  revisaoAnual: string | null;
  itens: ItemRow[];
  fluxo?: { nome: string; etapas: Etapa[] } | null;
};

export const INCLUDE_LISTA = {
  solicitante: { select: { nome: true, login: true } },
  itens: {
    // Referência Tasy/contábil do catálogo — exibida só para gestor focal/sup/admin.
    include: {
      itemCatalogo: {
        select: { cdMaterialTasy: true, dsMaterialTasy: true, movimentoContabil: true },
      },
    },
  },
  fluxo: { include: { etapas: true } },
} as const;

// Detalhe usa o mesmo conjunto de includes; a linha do tempo (histórico) é
// montada à parte, a partir de EventoAuditoria.
export const INCLUDE_DETALHE = INCLUDE_LISTA;

/** Rótulo de quem aprova a etapa atual (nomes reais, não login). */
async function labelAprovador(prisma: PrismaService, etapa: Etapa, sol: SolRow): Promise<string | null> {
  if (etapa.fonteAprovador === 'USUARIO') {
    if (!etapa.usuarioAlvoId) return null;
    const u = await prisma.user.findUnique({ where: { id: etapa.usuarioAlvoId }, select: { nome: true } });
    return u?.nome ?? null;
  }
  if (etapa.fonteAprovador === 'PERFIL') return etapa.perfilAlvo;

  // ALCADA_FOCAL | ALCADA_SUP | ALCADA_FINAL
  const nivel = etapa.fonteAprovador.replace('ALCADA_', '');
  const grupos = [...new Set(sol.itens.map((it) => it.grupoId))];
  const rules = await prisma.regraAlcada.findMany({
    where: { estabelecimentoId: sol.estabelecimentoId, grupoId: { in: grupos }, nivel },
    select: { usuarioLogin: true },
  });
  if (!rules.length) return null;
  const logins = [...new Set(rules.map((r) => r.usuarioLogin))];
  const users = await prisma.user.findMany({
    where: { login: { in: logins } },
    select: { login: true, nome: true },
  });
  const nomePorLogin = new Map(users.map((u) => [u.login, u.nome]));
  return logins.map((l) => nomePorLogin.get(l) ?? l).join(', ');
}

/** Converte uma Solicitacao (com includes) no DTO que o front-end consome. */
export async function toSolicitacaoDto(prisma: PrismaService, sol: SolRow) {
  const etapa = sol.fluxo?.etapas.find((e) => e.ordem === sol.etapaAtualOrdem) ?? null;
  const aprovadorAtual = etapa ? await labelAprovador(prisma, etapa, sol) : null;

  return {
    id: sol.id,
    numero: `#${String(sol.numero).padStart(5, '0')}`,
    status: sol.status,
    criadaEm: sol.dtSolicitacao,
    dtRecurso: sol.dtRecurso,
    criadaPor: sol.solicitante?.nome ?? '—',
    solicitanteLogin: sol.solicitante?.login ?? null,
    estabelecimentoId: sol.estabelecimentoId,
    unidadeNegocioId: sol.unidadeNegocioId,
    centroCustoCodigo: sol.centroCustoCodigo,
    tipoVerba: sol.tipoVerba,
    statusVerbaPublica: sol.statusVerbaPublica,
    projeto: sol.projeto,
    etapaAtual: etapa?.nome ?? null,
    etapaFocal: etapa?.fonteAprovador === 'ALCADA_FOCAL',
    aprovadorAtual,
    origemProrrogacaoId: sol.origemProrrogacaoId,
    obsGF: sol.obsGF,
    obsGPE: sol.obsGPE,
    validacao: sol.validacao,
    revisaoAnual: sol.revisaoAnual,
    itens: sol.itens.map((it) => ({
      id: it.id,
      tipo: it.tipo,
      grupoId: it.grupoId,
      itemCatalogoId: it.itemCatalogoId,
      // Referência Tasy/contábil (do catálogo) — front decide exibição por papel.
      cdMaterialTasy: it.itemCatalogo?.cdMaterialTasy ?? null,
      dsMaterialTasy: it.itemCatalogo?.dsMaterialTasy ?? null,
      movimentoContabil: it.itemCatalogo?.movimentoContabil ?? null,
      descricao: it.descricao,
      especificacao: it.especificacao,
      modelosReferencia: it.modelosReferencia,
      motivoId: it.motivoId,
      justificativa: it.justificativa,
      quantidade: it.quantidade,
      valorUnitario: Number(it.valorUnitario),
      dataPrevista: it.dataPrevista,
      ieDemolicoes: it.ieDemolicoes,
      iePiso: it.iePiso,
      ieForro: it.ieForro,
      ieArCondicionado: it.ieArCondicionado,
      ieMarcenaria: it.ieMarcenaria,
      ieCaixilhos: it.ieCaixilhos,
      justificativaPeriodo: it.justificativaPeriodo,
      publicoAlvo: it.publicoAlvo,
      volumePessoas: it.volumePessoas,
      subtipoObra: it.subtipoObra,
      subtipoObraOutros: it.subtipoObraOutros,
      escopoInicial: it.escopoInicial,
      beneficiosProjeto: it.beneficiosProjeto,
      impactoRdc50: it.impactoRdc50,
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
      prorrogadoParaAno: it.prorrogadoParaAno,
      origemItemId: it.origemItemId,
    })),
  };
}
