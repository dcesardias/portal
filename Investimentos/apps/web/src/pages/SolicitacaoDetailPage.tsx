import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Send,
  XCircle,
  Building2,
  Wallet,
  User,
  Calendar,
  ShieldCheck,
  Pencil,
  Trash2,
  Check,
  X,
  RotateCcw,
  CalendarPlus,
} from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { formatBRL, formatDate, formatDateTime, formatCentroCusto } from '../lib/utils';
import { SolicitacaoStatusEnum, type SolicitacaoStatus } from '@investimentos/shared';
import { useCatalog } from '../hooks/useCatalog';
import { usePermissions } from '../hooks/usePermissions';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageTour } from '../components/PageTour';
import type { TourStep } from '../components/GuidedTour';

type HistoricoItem = {
  acao: string;
  data: string;
  autor: string | null;
  etapa: string | null;
  comentario: string | null;
};

type Detail = {
  id: string;
  numero: string;
  status: SolicitacaoStatus;
  criadaEm: string;
  dtRecurso: string | null;
  criadaPor: string;
  solicitanteLogin: string | null;
  estabelecimentoId: number;
  unidadeNegocioId: number;
  centroCustoCodigo: string;
  tipoVerba: 'RP' | 'VP' | null;
  statusVerbaPublica: string | null;
  projeto: string | null;
  etapaAtual: string | null;
  aprovadorAtual: string | null;
  origemProrrogacaoId: string | null;
  obsGF: string | null;
  obsGPE: string | null;
  validacao: string | null;
  revisaoAnual: string | null;
  itens: {
    id: string;
    tipo: string;
    grupoId: number;
    prorrogadoParaAno?: number | null;
    origemItemId?: string | null;
    cdMaterialTasy?: string | null;
    dsMaterialTasy?: string | null;
    movimentoContabil?: string | null;
    descricao: string;
    motivoId: number;
    justificativa: string;
    quantidade: number;
    valorUnitario: number;
    especificacao?: string | null;
    // Contexto do projeto / campos por item (opcionais) — ver planilha do Diego.
    justificativaPeriodo?: string | null;
    publicoAlvo?: string | null;
    volumePessoas?: string | null;
    subtipoObra?: string | null;
    subtipoObraOutros?: string | null;
    escopoInicial?: string | null;
    beneficiosProjeto?: string | null;
    impactoRdc50?: string | null;
    justificativaClinica?: string | null;
    modelosReferencia?: string | null;
    infraAguaEsgoto?: boolean;
    infraEletricaRegulada?: boolean;
    infraBlindagem?: boolean;
    infraClimatizacao?: boolean;
    infraGasesMedicinais?: boolean;
    infraPlugAndPlay?: boolean;
    manutencaoPreventiva?: string | null;
    manutPeriodMensal?: boolean;
    manutPeriodTrimestral?: boolean;
    manutPeriodSemestral?: boolean;
    manutPeriodAnual?: boolean;
  }[];
  historico: HistoricoItem[];
};

const HISTORICO_META: Record<string, { label: string; dot: string }> = {
  CRIADA: { label: 'Criada', dot: 'bg-ink-muted' },
  ENVIADA: { label: 'Enviada para aprovação', dot: 'bg-brand' },
  APROVADO: { label: 'Aprovada', dot: 'bg-emerald-500' },
  REPROVADO: { label: 'Reprovada', dot: 'bg-red-500' },
  REVISAO: { label: 'Devolvida para revisão', dot: 'bg-accent-500' },
  CANCELADA: { label: 'Cancelada', dot: 'bg-slate-400' },
  EDITADA: { label: 'Editada', dot: 'bg-brand' },
  STATUS_ADMIN: { label: 'Status alterado pelo admin', dot: 'bg-accent-500' },
  ITEM_PRORROGADO: { label: 'Item prorrogado', dot: 'bg-sky-500' },
};

const SUBTIPO_OBRA_LABEL: Record<string, string> = {
  NOVA_CONSTRUCAO: 'Nova construção',
  REFORMA_ESTRUTURAL: 'Reforma estrutural',
  REVITALIZACAO: 'Revitalização estética e funcional',
  MANUTENCAO_CORRETIVA: 'Manutenção corretiva civil pesada',
  OUTROS: 'Outros',
};

const INFRA_LABEL: { key: keyof Detail['itens'][number]; label: string }[] = [
  { key: 'infraAguaEsgoto', label: 'Ponto de água/esgoto' },
  { key: 'infraEletricaRegulada', label: 'Rede elétrica regulada' },
  { key: 'infraBlindagem', label: 'Blindagem de sala' },
  { key: 'infraClimatizacao', label: 'Climatização dedicada' },
  { key: 'infraGasesMedicinais', label: 'Gases medicinais' },
];

const MANUT_PREVENTIVA_LABEL: Record<string, string> = {
  SIM_CALIBRACAO: 'Sim, exige calibração ou revisão periódica obrigatória',
  NAO_COMPLEXA: 'Não exige manutenção complexa',
  NAO_SEI: 'Não sei informar',
};

const PERIODICIDADE_LABEL: { key: keyof Detail['itens'][number]; label: string }[] = [
  { key: 'manutPeriodMensal', label: 'Mensal' },
  { key: 'manutPeriodTrimestral', label: 'Trimestral' },
  { key: 'manutPeriodSemestral', label: 'Semestral' },
  { key: 'manutPeriodAnual', label: 'Anual' },
];

// Campos novos por item (planilha do Diego) — só exibe o que estiver preenchido.
const MOVIMENTO_LABEL: Record<string, string> = {
  DESPESA: 'Despesa',
  INVESTIMENTO: 'Investimento',
};

// `comReferencia`: inclui a referência Tasy/contábil (só p/ gestor focal/sup/admin).
function camposExtrasItem(
  it: Detail['itens'][number],
  comReferencia = false,
): { label: string; value: string }[] {
  const campos: { label: string; value: string }[] = [];
  if (comReferencia) {
    if (it.cdMaterialTasy) {
      campos.push({ label: 'Cód. material (Tasy)', value: it.cdMaterialTasy });
    }
    if (it.dsMaterialTasy) {
      campos.push({ label: 'Material (Tasy)', value: it.dsMaterialTasy });
    }
    if (it.movimentoContabil) {
      campos.push({
        label: 'Movimento contábil',
        value: MOVIMENTO_LABEL[it.movimentoContabil] ?? it.movimentoContabil,
      });
    }
  }
  if (it.justificativaPeriodo) {
    campos.push({ label: 'Justificativa do período', value: it.justificativaPeriodo });
  }
  if (it.publicoAlvo) {
    campos.push({ label: 'Público-alvo', value: it.publicoAlvo });
  }
  if (it.volumePessoas) {
    campos.push({ label: 'Volume de pessoas impactadas', value: it.volumePessoas });
  }
  if (it.subtipoObra) {
    const label = SUBTIPO_OBRA_LABEL[it.subtipoObra] ?? it.subtipoObra;
    campos.push({
      label: 'Tipo de solicitação',
      value: it.subtipoObra === 'OUTROS' && it.subtipoObraOutros ? `${label}: ${it.subtipoObraOutros}` : label,
    });
  }
  if (it.escopoInicial) {
    campos.push({ label: 'Escopo inicial da obra', value: it.escopoInicial });
  }
  if (it.beneficiosProjeto) {
    campos.push({ label: 'Principais benefícios do projeto', value: it.beneficiosProjeto });
  }
  if (it.impactoRdc50) {
    campos.push({ label: 'Impacta RDC 50?', value: it.impactoRdc50 });
  }
  if (it.justificativaClinica) {
    campos.push({ label: 'Justificativa/evidência clínica', value: it.justificativaClinica });
  }
  if (it.especificacao) {
    campos.push({ label: 'Fabricantes', value: it.especificacao });
  }
  if (it.modelosReferencia) {
    campos.push({ label: 'Modelos de referência', value: it.modelosReferencia });
  }
  const infra = INFRA_LABEL.filter((i) => it[i.key]).map((i) => i.label);
  if (infra.length) {
    campos.push({ label: 'Infraestrutura especial', value: infra.join(', ') });
  } else if (it.infraPlugAndPlay) {
    campos.push({ label: 'Infraestrutura especial', value: 'Não necessita / plug-and-play' });
  }
  if (it.manutencaoPreventiva) {
    campos.push({
      label: 'Manutenção preventiva',
      value: MANUT_PREVENTIVA_LABEL[it.manutencaoPreventiva] ?? it.manutencaoPreventiva,
    });
  }
  const period = PERIODICIDADE_LABEL.filter((p) => it[p.key]).map((p) => p.label);
  if (period.length) {
    campos.push({ label: 'Periodicidade da manutenção', value: period.join(', ') });
  }
  return campos;
}

const STATUS_LABEL: Record<SolicitacaoStatus, string> = {
  RASCUNHO: 'Rascunho',
  EM_APROVACAO: 'Em aprovação',
  APROVACAO_INICIAL: 'Aprovação inicial',
  APROVADO: 'Aprovação final',
  REPROVADO: 'Reprovado',
  EM_REVISAO: 'Em revisão',
  CANCELADO: 'Cancelado',
};

// Status da verba pública (na ordem do fluxo). Editável só por admin quando VP.
const STATUS_VP_OPCOES = [
  'PROPOSICAO',
  'SUBMETIDO',
  'CAPTACAO',
  'CONVENIAMENTO',
  'EXECUCAO',
  'CONCLUIDO',
  'ALOCAR',
] as const;
const STATUS_VP_LABEL: Record<string, string> = {
  PROPOSICAO: 'Proposição',
  SUBMETIDO: 'Submetido',
  CAPTACAO: 'Captação',
  CONVENIAMENTO: 'Conveniamento',
  EXECUCAO: 'Execução',
  CONCLUIDO: 'Concluído',
  ALOCAR: 'Alocar',
};

export function SolicitacaoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { me, isAdmin: admin, isAprovador, isViewer } = usePermissions();
  // Simulação agora permite ESCRITA (o admin age COMO o usuário simulado); não
  // gateia os botões. O banner global (AppShell) avisa o admin.
  const simulando = false;
  const cat = useCatalog();

  const { data, isLoading } = useQuery<Detail>({
    queryKey: ['solicitacao', id],
    queryFn: () => api.get(`/solicitacoes/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const enviar = useMutation({
    mutationFn: () => api.post(`/solicitacoes/${id}/enviar`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });

  const cancelar = useMutation({
    mutationFn: () => api.post(`/solicitacoes/${id}/cancelar`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });

  // ── Ações de admin ──────────────────────────────────────────────────────
  const [adminMsg, setAdminMsg] = useState('');
  const [novoStatus, setNovoStatus] = useState<SolicitacaoStatus | ''>('');
  const [showCancel, setShowCancel] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const adminDecidir = useMutation({
    mutationFn: (decisao: 'APROVADO' | 'REPROVADO' | 'REVISAO') =>
      api
        .post(`/admin/solicitacoes/${id}/decidir`, { decisao, justificativa: adminMsg || null })
        .then((r) => r.data),
    onSuccess: () => {
      setAdminMsg('');
      qc.invalidateQueries();
    },
  });

  const adminStatus = useMutation({
    mutationFn: (status: SolicitacaoStatus) =>
      api
        .put(`/admin/solicitacoes/${id}/status`, { status, justificativa: adminMsg || null })
        .then((r) => r.data),
    onSuccess: () => {
      setAdminMsg('');
      setNovoStatus('');
      qc.invalidateQueries();
    },
  });

  const setStatusVP = useMutation({
    mutationFn: (statusVerbaPublica: string | null) =>
      api
        .put(`/admin/solicitacoes/${id}/status-verba-publica`, { statusVerbaPublica })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries(),
  });

  const adminExcluir = useMutation({
    mutationFn: () => api.delete(`/admin/solicitacoes/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries();
      navigate('/solicitacoes');
    },
  });

  // Prorroga um item para o ano seguinte (admin, qualquer status).
  const prorrogar = useMutation({
    mutationFn: (itemId: string) =>
      api.post(`/admin/solicitacoes/${id}/itens/${itemId}/prorrogar`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries(),
  });

  if (isLoading || !data) {
    return <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>;
  }

  const estab = cat.estabelecimentos.find((e) => e.id === data.estabelecimentoId)?.nome ?? '—';
  const unid = cat.unidades.find((u) => u.id === data.unidadeNegocioId)?.nome ?? '—';
  const ccDesc = cat.centros.find((c) => c.codigo === data.centroCustoCodigo)?.descricao ?? '';
  const cc = formatCentroCusto(data.centroCustoCodigo, ccDesc);
  const total = data.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

  // Viewer é só-leitura: nenhuma ação (enviar/cancelar/editar).
  const canSend = !isViewer && (data.status === 'RASCUNHO' || data.status === 'EM_REVISAO');
  const canCancel =
    !isViewer &&
    (data.status === 'RASCUNHO' ||
      data.status === 'EM_APROVACAO' ||
      data.status === 'APROVACAO_INICIAL' ||
      data.status === 'EM_REVISAO');
  // Dono edita só enquanto o pedido está com ele (rascunho/revisão); admin edita sempre.
  const isOwner = !!me?.login && me.login === data.solicitanteLogin;
  const podeEditar =
    !isViewer && (admin || (isOwner && (data.status === 'RASCUNHO' || data.status === 'EM_REVISAO')));

  // Descreve só as ações que realmente aparecem para este pedido/usuário.
  const acoesDisponiveis = [
    podeEditar && '“Editar” altera os dados e itens (enquanto rascunho ou em revisão)',
    canSend && '“Enviar para aprovação” encaminha o pedido para o fluxo de alçadas',
    canCancel && '“Cancelar” encerra a solicitação',
  ].filter(Boolean) as string[];

  const tourSteps: TourStep[] = [
    {
      title: 'Detalhe da solicitação 🔎',
      body: 'Esta tela reúne tudo sobre um pedido: contexto, itens, andamento da aprovação e resumo financeiro.',
    },
    {
      target: '[data-tour="det-acoes"]',
      title: 'Status e ações',
      body:
        (acoesDisponiveis.length
          ? `O selo mostra a situação atual. As ações disponíveis agora: ${acoesDisponiveis.join('; ')}.`
          : 'O selo mostra a situação atual do pedido. Não há ações disponíveis neste status.') +
        ' As ações mudam conforme o status do pedido e o seu papel.',
    },
    {
      target: '[data-tour="det-fluxo"]',
      title: 'Fluxo de aprovação',
      body: 'Acompanhe em que etapa o pedido está e quem é o aprovador pendente no momento.',
    },
    {
      target: '[data-tour="det-financeiro"]',
      title: 'Resumo financeiro',
      body: 'Quantidade de itens, unidades totais e o valor total da solicitação.',
    },
    {
      target: '[data-tour="det-voltar"]',
      title: 'Voltar',
      body: 'Retorna para a lista de “Minhas Solicitações”.',
    },
  ];

  return (
    <>
      <PageTour pageKey="detalhe" steps={tourSteps} />
      <button
        data-tour="det-voltar"
        onClick={() => navigate('/solicitacoes')}
        className="text-sm text-ink-soft hover:text-ink mb-3 inline-flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar para a lista
      </button>

      <PageHeader
        title={data.numero}
        subtitle={data.projeto ?? 'Solicitação de investimento'}
        actions={
          <div data-tour="det-acoes" className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={data.status} />
            {podeEditar && (
              <button
                className="btn-secondary"
                onClick={() => navigate(`/solicitacoes/${id}/editar`)}
                disabled={simulando}
                title={simulando ? 'Indisponível durante a simulação' : undefined}
              >
                <Pencil className="w-4 h-4" /> Editar
              </button>
            )}
            {canSend && (
              <button
                className="btn-primary"
                onClick={() => enviar.mutate()}
                disabled={enviar.isPending || data.itens.length === 0 || simulando}
                title={simulando ? 'Indisponível durante a simulação' : undefined}
              >
                <Send className="w-4 h-4" /> {enviar.isPending ? 'Enviando…' : 'Enviar para aprovação'}
              </button>
            )}
            {canCancel && (
              <button
                className="btn-secondary"
                onClick={() => setShowCancel(true)}
                disabled={cancelar.isPending || simulando}
                title={simulando ? 'Indisponível durante a simulação' : undefined}
              >
                <XCircle className="w-4 h-4" /> Cancelar
              </button>
            )}
          </div>
        }
      />

      {data.origemProrrogacaoId && (
        <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-900 flex items-center gap-2 flex-wrap">
          <CalendarPlus className="w-4 h-4 flex-shrink-0" />
          Esta solicitação foi criada por <b>prorrogação</b> de itens do ano anterior.
          <Link
            to={`/solicitacoes/${data.origemProrrogacaoId}`}
            className="underline font-medium"
          >
            Ver solicitação de origem
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info principal */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold text-ink">Contexto</h3>
            </div>
            <div className="card-body grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <Info icon={Building2} label="Estabelecimento" value={estab} />
              <Info icon={Building2} label="Unidade de negócio" value={unid} />
              <Info icon={Wallet} label="Centro de custo" value={cc} />
              <Info icon={User} label="Solicitante" value={data.criadaPor} />
              <Info icon={Calendar} label="Criada em" value={formatDateTime(data.criadaEm)} />
              <Info
                icon={Calendar}
                label={data.itens.some((i) => i.tipo === 'OBRA') ? 'Data prevista da obra' : 'Data prevista de aquisição'}
                value={data.dtRecurso ? formatDate(data.dtRecurso) : '—'}
              />
              {data.tipoVerba === 'VP' && (
                <Info
                  icon={Wallet}
                  label="Status verba pública"
                  value={
                    data.statusVerbaPublica
                      ? (STATUS_VP_LABEL[data.statusVerbaPublica] ?? data.statusVerbaPublica)
                      : '—'
                  }
                />
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold text-ink">Itens ({data.itens.length})</h3>
              <div className="text-sm text-ink-soft tabular-nums">Total: <b className="text-ink">{formatBRL(total)}</b></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="table-head">Item</th>
                    <th className="table-head">Grupo</th>
                    <th className="table-head text-right">Qtd</th>
                    <th className="table-head text-right">V.Unit.</th>
                    <th className="table-head text-right">Total</th>
                    {admin && <th className="table-head text-right">Prorrogação</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.itens.map((it) => {
                    const extras = camposExtrasItem(it, isAprovador || admin);
                    return (
                    <tr key={it.id} className="table-row align-top">
                      <td className="table-cell">
                        <div className="font-medium flex items-center gap-2 flex-wrap">
                          {it.descricao}
                          {it.prorrogadoParaAno && (
                            <span className="badge bg-sky-100 text-sky-800">
                              Prorrogado p/ {it.prorrogadoParaAno}
                            </span>
                          )}
                          {it.origemItemId && (
                            <span className="badge bg-slate-100 text-slate-600">Prorrogado de ano anterior</span>
                          )}
                        </div>
                        <div className="text-xs text-ink-soft mt-1 max-w-md">
                          <span className="font-medium">Justificativa:</span> {it.justificativa}
                        </div>
                        {extras.length > 0 && (
                          <div className="text-xs text-ink-soft mt-1 max-w-md space-y-0.5">
                            {extras.map((c) => (
                              <div key={c.label}>
                                <span className="font-medium">{c.label}:</span> {c.value}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="table-cell text-ink-soft">
                        {cat.grupos.find((g) => g.id === it.grupoId)?.nome ?? '—'}
                      </td>
                      <td className="table-cell text-right tabular-nums">{it.quantidade}</td>
                      <td className="table-cell text-right tabular-nums">{formatBRL(it.valorUnitario)}</td>
                      <td className="table-cell text-right tabular-nums font-medium">
                        {formatBRL(it.quantidade * it.valorUnitario)}
                      </td>
                      {admin && (
                        <td className="table-cell text-right">
                          {it.prorrogadoParaAno ? (
                            <span className="text-xs text-ink-muted">→ {it.prorrogadoParaAno}</span>
                          ) : it.origemItemId ? (
                            <span className="text-xs text-ink-muted">—</span>
                          ) : (
                            <button
                              className="btn-secondary py-1 px-2.5 text-xs whitespace-nowrap"
                              title="Clonar este item para uma nova solicitação (Aprovada) do ano seguinte"
                              disabled={prorrogar.isPending || simulando}
                              onClick={() => {
                                if (confirm(`Prorrogar o item "${it.descricao}" para o ano seguinte? Será criada/atualizada uma solicitação aprovada do próximo ano.`)) {
                                  prorrogar.mutate(it.id);
                                }
                              }}
                            >
                              <CalendarPlus className="w-3.5 h-3.5" /> Prorrogar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Histórico / rastreabilidade */}
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold text-ink">Histórico</h3>
              <div className="text-xs text-ink-soft">Registro de tudo o que aconteceu</div>
            </div>
            <div className="card-body">
              {data.historico.length === 0 ? (
                <div className="text-sm text-ink-soft">Nenhum evento registrado ainda.</div>
              ) : (
                <ol className="relative border-l border-surface-border ml-2 space-y-5">
                  {data.historico.map((h, i) => {
                    const meta = HISTORICO_META[h.acao] ?? { label: h.acao, dot: 'bg-ink-muted' };
                    return (
                      <li key={i} className="ml-4">
                        <span
                          className={`absolute -left-[7px] w-3.5 h-3.5 rounded-full border-2 border-white ${meta.dot}`}
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-ink">{meta.label}</span>
                          {h.etapa && (
                            <span className="badge bg-surface-alt text-ink-soft border border-surface-border">
                              {h.etapa}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-ink-soft mt-0.5">
                          {formatDateTime(h.data)}
                          {h.autor ? ` · ${h.autor}` : ''}
                        </div>
                        {h.comentario && (
                          <div className="text-sm text-ink mt-1 italic bg-surface-alt rounded-lg px-3 py-2">
                            "{h.comentario}"
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar de fluxo */}
        <div className="space-y-6">
          {admin && (
            <div className="card border-brand-200">
              <div className="card-header bg-brand-50">
                <h3 className="font-semibold text-ink inline-flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand" /> Administração
                </h3>
                <span className="text-xs text-ink-soft">Ações sobre qualquer solicitação</span>
              </div>
              <div className="card-body space-y-4">
                {data.tipoVerba === 'VP' && (
                  <div>
                    <div className="text-xs text-ink-soft uppercase tracking-wide mb-1.5">
                      Status da verba pública
                    </div>
                    <select
                      className="input"
                      value={data.statusVerbaPublica ?? ''}
                      disabled={setStatusVP.isPending || simulando}
                      onChange={(e) => setStatusVP.mutate(e.target.value || null)}
                    >
                      <option value="">— não definido —</option>
                      {STATUS_VP_OPCOES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_VP_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="label">Comentário (vai para o histórico)</label>
                  <textarea
                    className="input resize-none"
                    rows={2}
                    value={adminMsg}
                    onChange={(e) => setAdminMsg(e.target.value)}
                    placeholder="Opcional — motivo da ação"
                  />
                </div>

                <div>
                  <div className="text-xs text-ink-soft uppercase tracking-wide mb-1.5">
                    Decisão (override)
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      className="btn-success flex-1"
                      onClick={() => adminDecidir.mutate('APROVADO')}
                      disabled={adminDecidir.isPending || simulando}
                      title={simulando ? 'Indisponível durante a simulação' : undefined}
                    >
                      <Check className="w-4 h-4" /> Aprovar
                    </button>
                    <button
                      className="btn-secondary flex-1"
                      onClick={() => adminDecidir.mutate('REVISAO')}
                      disabled={adminDecidir.isPending || simulando}
                      title={simulando ? 'Indisponível durante a simulação' : undefined}
                    >
                      <RotateCcw className="w-4 h-4" /> Revisar
                    </button>
                    <button
                      className="btn-danger flex-1"
                      onClick={() => adminDecidir.mutate('REPROVADO')}
                      disabled={adminDecidir.isPending || simulando}
                      title={simulando ? 'Indisponível durante a simulação' : undefined}
                    >
                      <X className="w-4 h-4" /> Reprovar
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-ink-soft uppercase tracking-wide mb-1.5">
                    Mudar status manualmente
                  </div>
                  <div className="flex gap-2">
                    <select
                      className="input"
                      value={novoStatus}
                      onChange={(e) => setNovoStatus(e.target.value as SolicitacaoStatus)}
                      disabled={simulando}
                    >
                      <option value="">Selecione…</option>
                      {SolicitacaoStatusEnum.options.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn-secondary shrink-0"
                      disabled={!novoStatus || adminStatus.isPending || simulando}
                      title={simulando ? 'Indisponível durante a simulação' : undefined}
                      onClick={() => novoStatus && adminStatus.mutate(novoStatus)}
                    >
                      Aplicar
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-surface-border">
                  <button
                    className="btn-ghost text-red-600 hover:bg-red-50 w-full justify-center"
                    disabled={adminExcluir.isPending || simulando}
                    title={simulando ? 'Indisponível durante a simulação' : undefined}
                    onClick={() => setShowDelete(true)}
                  >
                    <Trash2 className="w-4 h-4" />{' '}
                    {adminExcluir.isPending ? 'Excluindo…' : 'Excluir definitivamente'}
                  </button>
                </div>

                {(adminDecidir.isError || adminStatus.isError || adminExcluir.isError) && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                    Não foi possível concluir a ação. Tente de novo.
                  </div>
                )}
              </div>
            </div>
          )}

          <div data-tour="det-fluxo" className="card">
            <div className="card-header">
              <h3 className="font-semibold text-ink">Fluxo de aprovação</h3>
            </div>
            <div className="card-body">
              {data.status === 'EM_APROVACAO' ||
              data.status === 'APROVACAO_INICIAL' ||
              data.status === 'EM_REVISAO' ? (
                <div>
                  <div className="text-xs text-ink-soft uppercase tracking-wide mb-1">Etapa atual</div>
                  <div className="font-medium text-ink">{data.etapaAtual}</div>
                  {data.aprovadorAtual && (
                    <div className="mt-3 flex items-center gap-2 p-3 bg-brand-50 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center text-xs font-semibold">
                        {data.aprovadorAtual.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="text-sm">
                        <div className="font-medium text-ink leading-tight">{data.aprovadorAtual}</div>
                        <div className="text-xs text-ink-soft">Aprovador pendente</div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-ink-soft">
                  {data.status === 'RASCUNHO'
                    ? 'Rascunho ainda não enviado para aprovação.'
                    : data.status === 'APROVADO'
                      ? 'Solicitação aprovada.'
                      : data.status === 'REPROVADO'
                        ? 'Solicitação reprovada.'
                        : 'Cancelada.'}
                </div>
              )}
            </div>
          </div>

          <div data-tour="det-financeiro" className="card">
            <div className="card-header">
              <h3 className="font-semibold text-ink">Resumo financeiro</h3>
            </div>
            <div className="card-body space-y-2 text-sm">
              <Row label="Itens" value={String(data.itens.length)} />
              <Row label="Unidades totais" value={String(data.itens.reduce((s, i) => s + i.quantidade, 0))} />
              <Row label="Valor total" value={formatBRL(total)} highlight />
            </div>
          </div>

          {/* Anotações internas — visíveis só a aprovadores/admin, quando houver. */}
          {(isAprovador || admin) &&
            (data.obsGF || data.obsGPE || data.validacao || data.revisaoAnual) && (
            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold text-ink">Anotações internas</h3>
              </div>
              <div className="card-body space-y-3 text-sm">
                {data.obsGF && (
                  <div>
                    <div className="text-xs text-ink-soft uppercase tracking-wide">
                      Observação Gestor Focal
                    </div>
                    <div className="text-ink whitespace-pre-wrap">{data.obsGF}</div>
                  </div>
                )}
                {data.obsGPE && (
                  <div>
                    <div className="text-xs text-ink-soft uppercase tracking-wide">Observação GPE</div>
                    <div className="text-ink whitespace-pre-wrap">{data.obsGPE}</div>
                  </div>
                )}
                {data.validacao && (
                  <div>
                    <div className="text-xs text-ink-soft uppercase tracking-wide">Validação</div>
                    <div className="text-ink whitespace-pre-wrap">{data.validacao}</div>
                  </div>
                )}
                {data.revisaoAnual && (
                  <div>
                    <div className="text-xs text-ink-soft uppercase tracking-wide">Revisão Anual</div>
                    <div className="text-ink whitespace-pre-wrap">{data.revisaoAnual}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {data.itens.length === 0 && data.status === 'RASCUNHO' && (
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          Este rascunho ainda não tem itens.{' '}
          <Link to="/solicitacoes/nova" className="underline font-medium">
            Adicione itens em uma nova solicitação.
          </Link>
        </div>
      )}

      <ConfirmDialog
        open={showCancel}
        title="Cancelar solicitação"
        message={
          <>
            Tem certeza que deseja cancelar a solicitação <b>{data.numero}</b>? Esta ação{' '}
            <b>não poderá ser desfeita</b> — a solicitação sairá do fluxo de aprovação.
          </>
        }
        confirmLabel="Sim, cancelar"
        cancelLabel="Voltar"
        loading={cancelar.isPending}
        onConfirm={() => cancelar.mutate(undefined, { onSuccess: () => setShowCancel(false) })}
        onClose={() => setShowCancel(false)}
      />

      <ConfirmDialog
        open={showDelete}
        title="Excluir definitivamente"
        message={
          <>
            Excluir <b>definitivamente</b> a solicitação <b>{data.numero}</b>? Itens e aprovações
            serão apagados. Esta ação <b>é irreversível</b>.
          </>
        }
        confirmLabel="Excluir definitivamente"
        cancelLabel="Voltar"
        loading={adminExcluir.isPending}
        onConfirm={() => adminExcluir.mutate()}
        onClose={() => setShowDelete(false)}
      />
    </>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-surface-alt text-ink-soft flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-ink-soft uppercase tracking-wide">{label}</div>
        <div className="text-ink font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-ink-soft">{label}</span>
      <span className={`tabular-nums ${highlight ? 'font-semibold text-ink text-base' : 'text-ink'}`}>{value}</span>
    </div>
  );
}
