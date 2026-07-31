import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Check, X, RotateCcw, ChevronRight, Pencil, History } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { Empty } from '../components/Empty';
import { formatBRL, formatDateTime, initials, cn } from '../lib/utils';
import { useCatalog } from '../hooks/useCatalog';
import { usePermissions } from '../hooks/usePermissions';
import { PageTour } from '../components/PageTour';
import { AprovadorItemEditor, type ItemDraft } from '../components/AprovadorItemEditor';
import type { TourStep } from '../components/GuidedTour';
import type { SolicitacaoStatus } from '@investimentos/shared';

type Pendente = {
  id: string;
  numero: string;
  status: SolicitacaoStatus;
  criadaEm: string;
  criadaPor: string;
  estabelecimentoId: number;
  centroCustoCodigo: string;
  etapaAtual: string | null;
  etapaFocal: boolean;
  aprovadorAtual: string | null;
  projeto: string | null;
  obsGF: string | null;
  obsGPE: string | null;
  validacao: string | null;
  revisaoAnual: string | null;
  itens: {
    id: string;
    tipo: string;
    descricao: string;
    quantidade: number;
    valorUnitario: number;
    justificativa: string;
    grupoId: number;
    cdMaterialTasy: string | null;
    dsMaterialTasy: string | null;
    movimentoContabil: string | null;
    // Campos editáveis pelo aprovador (opcionais + valor).
    especificacao: string | null;
    modelosReferencia: string | null;
    justificativaPeriodo: string | null;
    publicoAlvo: string | null;
    volumePessoas: string | null;
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
    subtipoObra: string | null;
    subtipoObraOutros: string | null;
    ieDemolicoes: boolean;
    iePiso: boolean;
    ieForro: boolean;
    ieArCondicionado: boolean;
    ieMarcenaria: boolean;
    ieCaixilhos: boolean;
  }[];
};

type PendItem = Pendente['itens'][number];

const MOVIMENTO_LABEL: Record<string, string> = {
  DESPESA: 'Despesa',
  INVESTIMENTO: 'Investimento',
};

// Item (DTO) -> rascunho editável.
function draftFromItem(it: PendItem): ItemDraft {
  return {
    valorUnitario: it.valorUnitario,
    especificacao: it.especificacao ?? '',
    modelosReferencia: it.modelosReferencia ?? '',
    justificativaPeriodo: it.justificativaPeriodo ?? '',
    publicoAlvo: it.publicoAlvo ?? '',
    volumePessoas: it.volumePessoas ?? '',
    beneficiosProjeto: it.beneficiosProjeto ?? '',
    impactoRdc50: it.impactoRdc50 ?? '',
    justificativaClinica: it.justificativaClinica ?? '',
    infraAguaEsgoto: it.infraAguaEsgoto,
    infraEletricaRegulada: it.infraEletricaRegulada,
    infraBlindagem: it.infraBlindagem,
    infraClimatizacao: it.infraClimatizacao,
    infraGasesMedicinais: it.infraGasesMedicinais,
    infraPlugAndPlay: it.infraPlugAndPlay,
    manutencaoPreventiva: (it.manutencaoPreventiva as ItemDraft['manutencaoPreventiva']) ?? '',
    manutPeriodMensal: it.manutPeriodMensal,
    manutPeriodTrimestral: it.manutPeriodTrimestral,
    manutPeriodSemestral: it.manutPeriodSemestral,
    manutPeriodAnual: it.manutPeriodAnual,
    subtipoObra: (it.subtipoObra as ItemDraft['subtipoObra']) ?? '',
    subtipoObraOutros: it.subtipoObraOutros ?? '',
    ieDemolicoes: it.ieDemolicoes,
    iePiso: it.iePiso,
    ieForro: it.ieForro,
    ieArCondicionado: it.ieArCondicionado,
    ieMarcenaria: it.ieMarcenaria,
    ieCaixilhos: it.ieCaixilhos,
  };
}

// Rascunho -> payload da API (texto vazio -> null; enum vazio -> null).
function draftToPayload(id: string, d: ItemDraft) {
  const nn = (s: string) => (s.trim() ? s : null);
  return {
    id,
    valorUnitario: d.valorUnitario,
    especificacao: nn(d.especificacao),
    modelosReferencia: nn(d.modelosReferencia),
    justificativaPeriodo: nn(d.justificativaPeriodo),
    publicoAlvo: nn(d.publicoAlvo),
    volumePessoas: nn(d.volumePessoas),
    beneficiosProjeto: nn(d.beneficiosProjeto),
    impactoRdc50: nn(d.impactoRdc50),
    justificativaClinica: nn(d.justificativaClinica),
    infraAguaEsgoto: d.infraAguaEsgoto,
    infraEletricaRegulada: d.infraEletricaRegulada,
    infraBlindagem: d.infraBlindagem,
    infraClimatizacao: d.infraClimatizacao,
    infraGasesMedicinais: d.infraGasesMedicinais,
    infraPlugAndPlay: d.infraPlugAndPlay,
    manutencaoPreventiva: d.manutencaoPreventiva || null,
    manutPeriodMensal: d.manutPeriodMensal,
    manutPeriodTrimestral: d.manutPeriodTrimestral,
    manutPeriodSemestral: d.manutPeriodSemestral,
    manutPeriodAnual: d.manutPeriodAnual,
    subtipoObra: d.subtipoObra || null,
    subtipoObraOutros: nn(d.subtipoObraOutros),
    ieDemolicoes: d.ieDemolicoes,
    iePiso: d.iePiso,
    ieForro: d.ieForro,
    ieArCondicionado: d.ieArCondicionado,
    ieMarcenaria: d.ieMarcenaria,
    ieCaixilhos: d.ieCaixilhos,
  };
}

export function AprovacoesPage() {
  const qc = useQueryClient();
  const cat = useCatalog();
  const { isAdmin } = usePermissions();
  // Simulação agora permite ESCRITA: o admin DECIDE como o aprovador simulado
  // (testa alçadas de nível 1 e 2). Não gateia os botões; banner global avisa.
  const simulando = false;
  const [aba, setAba] = useState<'pendentes' | 'historico'>('pendentes');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [obsGF, setObsGF] = useState('');
  const [obsGPE, setObsGPE] = useState('');
  const [validacao, setValidacao] = useState('');
  const [revisaoAnual, setRevisaoAnual] = useState('');
  // Edição de itens (Gestor Focal/admin) antes de aprovar.
  const [editando, setEditando] = useState(false);
  const [edits, setEdits] = useState<Record<string, ItemDraft>>({});

  const { data: pendentes = [], isLoading } = useQuery<Pendente[]>({
    queryKey: ['aprovacoes'],
    queryFn: () => api.get('/aprovacoes/pendentes').then((r) => r.data),
  });

  const selected = pendentes.find((p) => p.id === selectedId) ?? pendentes[0] ?? null;

  // Sincroniza os campos de anotação ao trocar a solicitação selecionada.
  useEffect(() => {
    setObsGF(selected?.obsGF ?? '');
    setObsGPE(selected?.obsGPE ?? '');
    setValidacao(selected?.validacao ?? '');
    setRevisaoAnual(selected?.revisaoAnual ?? '');
    setEditando(false); // sai do modo edição ao trocar de solicitação
  }, [selected?.id]);

  const podeEditar = !simulando && !!selected && (isAdmin || selected.etapaFocal);

  function iniciarEdicao() {
    if (!selected) return;
    const inicial: Record<string, ItemDraft> = {};
    for (const it of selected.itens) inicial[it.id] = draftFromItem(it);
    setEdits(inicial);
    setEditando(true);
  }

  const salvarEdicao = useMutation({
    mutationFn: () =>
      api
        .put(`/aprovacoes/solicitacoes/${selected!.id}/itens`, {
          itens: selected!.itens.map((it) => draftToPayload(it.id, edits[it.id])),
        })
        .then((r) => r.data),
    onSuccess: () => {
      setEditando(false);
      qc.invalidateQueries({ queryKey: ['aprovacoes'] });
    },
  });

  const decidir = useMutation({
    mutationFn: (decisao: 'APROVADO' | 'REPROVADO' | 'REVISAO') =>
      api
        .post(`/aprovacoes/solicitacoes/${selected!.id}/decidir`, {
          decisao,
          justificativa: justificativa || null,
        })
        .then((r) => r.data),
    onSuccess: () => {
      setJustificativa('');
      setSelectedId(null);
      qc.invalidateQueries();
    },
  });

  const salvarObsGF = useMutation({
    mutationFn: () =>
      api
        .post(`/aprovacoes/solicitacoes/${selected!.id}/obs-gf`, { obsGF: obsGF || null })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aprovacoes'] }),
  });

  const salvarGPE = useMutation({
    mutationFn: () =>
      api
        .post(`/aprovacoes/solicitacoes/${selected!.id}/anotacao-gpe`, {
          obsGPE: obsGPE || null,
          validacao: validacao || null,
          revisaoAnual: revisaoAnual || null,
        })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aprovacoes'] }),
  });

  const temFila = pendentes.length > 0;
  const tourSteps: TourStep[] = temFila
    ? [
        {
          title: 'Fila de Aprovação ✅',
          body: 'Aqui ficam os pedidos que dependem da sua decisão. Veja como avaliar e decidir cada um.',
        },
        {
          target: '[data-tour="aprov-fila"]',
          title: 'A fila',
          body: 'Cada card é um pedido pendente, com solicitante, data e valor total. Clique em um para abri-lo ao lado.',
        },
        {
          target: '[data-tour="aprov-detalhe"]',
          title: 'Detalhe do pedido',
          body: 'Confira o contexto, os itens com quantidades e valores, e a justificativa de cada item.',
        },
        {
          target: '[data-tour="aprov-comentario"]',
          title: 'Comentário',
          body: 'Opcional para aprovar, mas obrigatório para reprovar ou solicitar revisão — é a mensagem que volta ao solicitante.',
        },
        {
          target: '[data-tour="aprov-acoes"]',
          title: 'Sua decisão',
          body: 'Aprovar segue o fluxo para a próxima alçada; Solicitar revisão devolve o pedido para ajustes; Reprovar encerra a solicitação.',
        },
      ]
    : [
        {
          title: 'Fila de Aprovação ✅',
          body: 'Esta é a sua fila de aprovações. No momento não há pedidos pendentes. Quando algum precisar da sua decisão, ele aparece aqui — você abre o pedido, confere os itens e escolhe Aprovar, Solicitar revisão ou Reprovar.',
        },
      ];

  return (
    <>
      <PageTour pageKey="aprovacoes" steps={tourSteps} />
      <PageHeader
        title="Fila de Aprovação"
        subtitle="Solicitações aguardando sua decisão"
      />

      {/* Abas: fila pendente × histórico das minhas decisões */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-surface-border">
        <TabBtn active={aba === 'pendentes'} onClick={() => setAba('pendentes')} icon={CheckSquare}>
          Pendentes{pendentes.length ? ` (${pendentes.length})` : ''}
        </TabBtn>
        <TabBtn active={aba === 'historico'} onClick={() => setAba('historico')} icon={History}>
          Minhas decisões
        </TabBtn>
      </div>

      {aba === 'historico' && <MinhasDecisoes />}

      {aba === 'pendentes' &&
        (isLoading ? (
        <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>
      ) : pendentes.length === 0 ? (
        <Empty
          icon={CheckSquare}
          title="Nada pendente"
          description="Você não tem solicitações aguardando aprovação no momento."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Fila */}
          <div data-tour="aprov-fila" className="lg:col-span-2 space-y-2">
            <div className="text-xs uppercase tracking-wide text-ink-soft font-semibold px-2">
              {pendentes.length} {pendentes.length === 1 ? 'pendente' : 'pendentes'}
            </div>
            {pendentes.map((p) => {
              const total = p.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
              const isSel = (selected?.id ?? '') === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    'w-full text-left card card-body hover:border-brand transition',
                    isSel ? 'border-brand ring-2 ring-brand-100' : '',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-800 flex items-center justify-center text-xs font-bold">
                      {initials(p.criadaPor)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-ink truncate">{p.numero}</div>
                        <StatusBadge status={p.status} />
                      </div>
                      <div className="text-xs text-ink-soft truncate">
                        {p.criadaPor} · {formatDateTime(p.criadaEm)}
                      </div>
                      <div className="text-sm font-semibold tabular-nums mt-1">{formatBRL(total)}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ink-muted" />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detalhe */}
          <div className="lg:col-span-3">
            {selected ? (
              <div data-tour="aprov-detalhe" className="card sticky top-20">
                <div className="card-header">
                  <div>
                    <div className="font-semibold text-ink">{selected.numero}</div>
                    <div className="text-xs text-ink-soft">
                      Etapa: <b>{selected.etapaAtual}</b>
                    </div>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                <div className="card-body space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="Solicitante" value={selected.criadaPor} />
                    <Field label="Criada em" value={formatDateTime(selected.criadaEm)} />
                    <Field
                      label="Estabelecimento"
                      value={cat.estabelecimentos.find((e) => e.id === selected.estabelecimentoId)?.nome ?? '—'}
                    />
                    <Field label="Centro de custo" value={selected.centroCustoCodigo} />
                    {selected.projeto && <Field label="Projeto" value={selected.projeto} />}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-ink-soft uppercase tracking-wide">Itens</div>
                      {podeEditar &&
                        (editando ? (
                          <div className="flex items-center gap-2">
                            <button
                              className="btn-primary py-1 px-2 text-xs"
                              disabled={salvarEdicao.isPending}
                              onClick={() => salvarEdicao.mutate()}
                            >
                              {salvarEdicao.isPending ? 'Salvando…' : 'Salvar alterações'}
                            </button>
                            <button
                              className="btn-ghost py-1 px-2 text-xs"
                              onClick={() => setEditando(false)}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn-ghost py-1 px-2 text-xs"
                            onClick={iniciarEdicao}
                            title="Editar valor unitário e campos opcionais antes de aprovar"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Editar itens
                          </button>
                        ))}
                    </div>
                    <div className="space-y-2">
                      {selected.itens.map((it) => (
                        <div key={it.id} className="p-3 bg-surface-alt rounded-lg border border-surface-border">
                          <div className="flex justify-between items-start gap-3">
                            <div className="min-w-0">
                              <div className="font-medium text-ink">{it.descricao}</div>
                              <div className="text-xs text-ink-soft">
                                {cat.grupos.find((g) => g.id === it.grupoId)?.nome}
                              </div>
                            </div>
                            <div className="text-right text-sm tabular-nums flex-shrink-0">
                              <div>
                                {it.quantidade} × {formatBRL(it.valorUnitario)}
                              </div>
                              <div className="font-semibold">
                                {formatBRL(it.quantidade * it.valorUnitario)}
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-ink-soft mt-2 italic">"{it.justificativa}"</div>
                          {/* Referência Tasy/contábil (do catálogo) */}
                          {(it.cdMaterialTasy || it.movimentoContabil) && (
                            <div className="text-[11px] text-ink-muted mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
                              {it.cdMaterialTasy && (
                                <span>
                                  <b>Cód. material:</b> {it.cdMaterialTasy}
                                </span>
                              )}
                              {it.dsMaterialTasy && (
                                <span>
                                  <b>Material:</b> {it.dsMaterialTasy}
                                </span>
                              )}
                              {it.movimentoContabil && (
                                <span>
                                  <b>Movimento:</b>{' '}
                                  {MOVIMENTO_LABEL[it.movimentoContabil] ?? it.movimentoContabil}
                                </span>
                              )}
                            </div>
                          )}
                          {editando && edits[it.id] && (
                            <AprovadorItemEditor
                              tipo={it.tipo}
                              grupoNome={cat.grupos.find((g) => g.id === it.grupoId)?.nome}
                              draft={edits[it.id]}
                              disabled={salvarEdicao.isPending}
                              onChange={(patch) =>
                                setEdits((prev) => ({ ...prev, [it.id]: { ...prev[it.id], ...patch } }))
                              }
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="text-right mt-3 text-sm">
                      Total:{' '}
                      <span className="font-semibold text-lg tabular-nums text-ink">
                        {formatBRL(
                          selected.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0),
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Observação do Gestor Focal — visível a aprovadores/admin. */}
                  <div className="rounded-lg border border-surface-border p-3 space-y-2">
                    <label className="label">Observação Gestor Focal</label>
                    <textarea
                      className="input resize-none"
                      rows={2}
                      value={obsGF}
                      onChange={(e) => setObsGF(e.target.value)}
                      placeholder="Comentário adicional do gestor focal…"
                      disabled={simulando}
                    />
                    <button
                      className="btn-secondary py-1 px-3 text-sm"
                      onClick={() => salvarObsGF.mutate()}
                      disabled={salvarObsGF.isPending || simulando}
                    >
                      {salvarObsGF.isPending ? 'Salvando…' : 'Salvar observação'}
                    </button>
                  </div>

                  {/* Observação + Validação — só GPE (admin). */}
                  {isAdmin && (
                    <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3 space-y-2">
                      <div className="text-xs font-semibold text-brand-800 uppercase tracking-wide">
                        GPE
                      </div>
                      <label className="label">Observação GPE</label>
                      <textarea
                        className="input resize-none"
                        rows={2}
                        value={obsGPE}
                        onChange={(e) => setObsGPE(e.target.value)}
                        placeholder="Comentário adicional do GPE…"
                        disabled={simulando}
                      />
                      <label className="label">Validação</label>
                      <input
                        className="input"
                        value={validacao}
                        onChange={(e) => setValidacao(e.target.value)}
                        placeholder="Classificação da validação"
                        disabled={simulando}
                      />
                      <label className="label">Revisão Anual</label>
                      <textarea
                        className="input resize-none"
                        rows={2}
                        value={revisaoAnual}
                        onChange={(e) => setRevisaoAnual(e.target.value)}
                        placeholder="Anotações da revisão anual…"
                        disabled={simulando}
                      />
                      <button
                        className="btn-secondary py-1 px-3 text-sm"
                        onClick={() => salvarGPE.mutate()}
                        disabled={salvarGPE.isPending || simulando}
                      >
                        {salvarGPE.isPending ? 'Salvando…' : 'Salvar GPE'}
                      </button>
                    </div>
                  )}

                  <div data-tour="aprov-comentario">
                    <label className="label">Comentário (opcional para aprovar, obrigatório para reprovar/revisar)</label>
                    <textarea
                      className="input resize-none"
                      rows={3}
                      value={justificativa}
                      onChange={(e) => setJustificativa(e.target.value)}
                      placeholder="Escreva um comentário para o solicitante…"
                    />
                  </div>

                  <div data-tour="aprov-acoes" className="flex gap-2 pt-2 border-t border-surface-border flex-wrap">
                    <button
                      className="btn-success flex-1"
                      onClick={() => decidir.mutate('APROVADO')}
                      disabled={decidir.isPending || simulando}
                      title={simulando ? 'Indisponível durante a simulação' : undefined}
                    >
                      <Check className="w-4 h-4" /> Aprovar
                    </button>
                    <button
                      className="btn-secondary flex-1"
                      onClick={() => decidir.mutate('REVISAO')}
                      disabled={decidir.isPending || !justificativa.trim() || simulando}
                      title={simulando ? 'Indisponível durante a simulação' : undefined}
                    >
                      <RotateCcw className="w-4 h-4" /> Solicitar revisão
                    </button>
                    <button
                      className="btn-danger flex-1"
                      onClick={() => decidir.mutate('REPROVADO')}
                      disabled={decidir.isPending || !justificativa.trim() || simulando}
                      title={simulando ? 'Indisponível durante a simulação' : undefined}
                    >
                      <X className="w-4 h-4" /> Reprovar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card card-body text-center py-16 text-ink-soft">
                Selecione uma solicitação à esquerda.
              </div>
            )}
          </div>
        </div>
        ))}
    </>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CheckSquare;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap',
        active ? 'border-brand text-brand-800' : 'border-transparent text-ink-soft hover:text-ink',
      )}
    >
      <Icon className="w-4 h-4" /> {children}
    </button>
  );
}

type Decisao = {
  id: string;
  data: string;
  decisao: 'APROVADO' | 'REPROVADO' | 'REVISAO';
  justificativa: string | null;
  etapaNome: string | null;
  solicitacaoId: string;
  numero: string;
  statusAtual: SolicitacaoStatus;
  solicitanteNome: string | null;
  valorTotal: number;
};

function DecisaoBadge({ decisao }: { decisao: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    APROVADO: { label: 'Aprovado', cls: 'bg-emerald-100 text-emerald-800' },
    REPROVADO: { label: 'Reprovado', cls: 'bg-red-100 text-red-700' },
    REVISAO: { label: 'Devolvido p/ revisão', cls: 'bg-orange-100 text-orange-800' },
  };
  const s = map[decisao] ?? { label: decisao, cls: 'bg-slate-100 text-slate-700' };
  return <span className={cn('badge', s.cls)}>{s.label}</span>;
}

function MinhasDecisoes() {
  const navigate = useNavigate();
  const { data: rows = [], isLoading } = useQuery<Decisao[]>({
    queryKey: ['aprovacoes', 'minhas-decisoes'],
    queryFn: () => api.get('/aprovacoes/minhas-decisoes').then((r) => r.data),
  });

  if (isLoading) {
    return <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>;
  }
  if (rows.length === 0) {
    return (
      <Empty
        icon={History}
        title="Nenhuma decisão ainda"
        description="As solicitações que você aprovar, reprovar ou devolver para revisão aparecem aqui."
      />
    );
  }

  return (
    <div className="card">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="table-head">Solicitação</th>
              <th className="table-head">Solicitante</th>
              <th className="table-head">Etapa</th>
              <th className="table-head">Minha decisão</th>
              <th className="table-head">Quando</th>
              <th className="table-head text-right">Valor</th>
              <th className="table-head">Status atual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr
                key={d.id}
                className="table-row cursor-pointer hover:bg-surface-alt transition"
                onClick={() => navigate(`/solicitacoes/${d.solicitacaoId}`)}
              >
                <td className="table-cell font-medium text-brand-700">{d.numero}</td>
                <td className="table-cell">{d.solicitanteNome ?? '—'}</td>
                <td className="table-cell text-ink-soft">{d.etapaNome ?? '—'}</td>
                <td className="table-cell">
                  <DecisaoBadge decisao={d.decisao} />
                  {d.justificativa && (
                    <div className="text-xs text-ink-muted truncate max-w-[220px]" title={d.justificativa}>
                      {d.justificativa}
                    </div>
                  )}
                </td>
                <td className="table-cell text-ink-soft whitespace-nowrap">{formatDateTime(d.data)}</td>
                <td className="table-cell text-right tabular-nums">{formatBRL(d.valorTotal)}</td>
                <td className="table-cell">
                  <StatusBadge status={d.statusAtual} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ink-soft uppercase tracking-wide">{label}</div>
      <div className="text-ink font-medium">{value}</div>
    </div>
  );
}
