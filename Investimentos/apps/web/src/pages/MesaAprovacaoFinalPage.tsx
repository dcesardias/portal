import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Gavel,
  ChevronRight,
  ChevronDown,
  Filter,
  RotateCcw,
  FileSpreadsheet,
  Check,
  X,
  Undo2,
  Layers3,
  Package,
  Building2,
  Wallet,
  ClipboardList,
  CalendarClock,
  ExternalLink,
  ListChecks,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { Empty } from '../components/Empty';
import { StatusBadge } from '../components/StatusBadge';
import { MultiSelectSearch } from '../components/MultiSelectSearch';
import type { OptId } from '../components/SearchableSelect';
import { useCatalog } from '../hooks/useCatalog';
import { formatBRL, cn } from '../lib/utils';
import type { SolicitacaoStatus } from '@investimentos/shared';

type Row = {
  solicitacaoId: string;
  numero: number;
  status: SolicitacaoStatus;
  etapaAtual: string | null;
  solicitanteNome: string;
  estabelecimentoId: number;
  unidadeNegocioId: number;
  grupoId: number;
  agrupamento: string | null;
  itemCatalogoId: number | null;
  itemNome: string;
  tipo: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  dataPrevista: string | null;
  tipoVerba: 'RP' | 'VP' | null;
  statusVerbaPublica: string | null;
  carryover: boolean;
};

const STATUS_VP_LABEL: Record<string, string> = {
  PROPOSICAO: 'Proposição',
  SUBMETIDO: 'Submetido',
  CAPTACAO: 'Captação',
  CONVENIAMENTO: 'Conveniamento',
  EXECUCAO: 'Execução',
  CONCLUIDO: 'Concluído',
  ALOCAR: 'Alocar',
};
const VERBA_OPCOES = [
  { id: 'RP', label: 'Recurso Próprio (RP)' },
  { id: 'VP', label: 'Verba Pública (VP)' },
  { id: 'SEM', label: 'Sem verba' },
];
const STATUS_VP_OPCOES = Object.entries(STATUS_VP_LABEL).map(([id, label]) => ({ id, label }));

const SEM_AGRUP = '— sem agrupamento —';

// Filtro de multisseleção: array vazio = sem filtro (todos).
const inSet = (arr: OptId[], v: OptId) => arr.length === 0 || arr.includes(v);

// ── Agregação (pivô) ──────────────────────────────────────────────────────────
type ItemAgg = {
  key: string;
  nome: string;
  qtd: number;
  valor: number;
  porUnidade: Map<number, number>;
  sols: Map<string, { qtd: number; valor: number }>;
};
type AgrAgg = { nome: string; qtd: number; valor: number; sols: Set<string>; itens: Map<string, ItemAgg> };
type GrupoAgg = { grupoId: number; qtd: number; valor: number; sols: Set<string>; agrs: Map<string, AgrAgg> };

export function MesaAprovacaoFinalPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cat = useCatalog();

  const [fEstab, setFEstab] = useState<OptId[]>([]);
  const [fUnidade, setFUnidade] = useState<OptId[]>([]);
  const [fGrupo, setFGrupo] = useState<OptId[]>([]);
  const [fAgrup, setFAgrup] = useState<OptId[]>([]);
  const [fVerba, setFVerba] = useState<OptId[]>([]);
  const [fStatusVP, setFStatusVP] = useState<OptId[]>([]);
  const [fCarryover, setFCarryover] = useState<'todos' | 'so' | 'sem'>('todos');
  const [q, setQ] = useState('');
  const [aberto, setAberto] = useState<Set<string>>(new Set());
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [comentario, setComentario] = useState('');
  // Decisão em lote (grupo/agrupamento/item inteiro)
  const [lote, setLote] = useState<{ titulo: string; ids: string[] } | null>(null);
  const [loteComentario, setLoteComentario] = useState('');

  const estabById = useMemo(() => new Map(cat.estabelecimentos.map((e) => [e.id, e.nome])), [cat.estabelecimentos]);
  const unidadeById = useMemo(() => new Map(cat.unidades.map((u) => [u.id, u.nome])), [cat.unidades]);
  const grupoById = useMemo(() => new Map(cat.grupos.map((g) => [g.id, g.nome])), [cat.grupos]);

  const { data, isLoading } = useQuery<{ total: number; itens: Row[] }>({
    queryKey: ['aprovacoes', 'mesa-final'],
    queryFn: () => api.get('/aprovacoes/mesa-final').then((r) => r.data),
  });

  const todas = data?.itens ?? [];

  // Agrupamentos disponíveis (para o filtro), dependentes dos demais filtros base.
  const agrupamentosDisponiveis = useMemo(() => {
    const s = new Set<string>();
    for (const r of todas) {
      if (!inSet(fEstab, r.estabelecimentoId)) continue;
      if (!inSet(fUnidade, unidadeById.get(r.unidadeNegocioId) ?? "")) continue;
      if (!inSet(fGrupo, r.grupoId)) continue;
      s.add(r.agrupamento ?? SEM_AGRUP);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [todas, fEstab, fUnidade, fGrupo]);

  const filtered = useMemo(() => {
    const termo = q.trim().toLowerCase();
    const soDigitos = termo.replace(/\D/g, '');
    const verbaSet = new Set(fVerba.map(String));
    const vpSet = new Set(fStatusVP.map(String));
    return todas.filter((r) => {
      if (!inSet(fEstab, r.estabelecimentoId)) return false;
      if (!inSet(fUnidade, unidadeById.get(r.unidadeNegocioId) ?? "")) return false;
      if (!inSet(fGrupo, r.grupoId)) return false;
      if (fAgrup.length && !fAgrup.includes(r.agrupamento ?? SEM_AGRUP)) return false;
      if (fCarryover === 'so' && !r.carryover) return false;
      if (fCarryover === 'sem' && r.carryover) return false;
      if (verbaSet.size && !verbaSet.has(r.tipoVerba ?? 'SEM')) return false;
      if (vpSet.size && !(r.statusVerbaPublica && vpSet.has(r.statusVerbaPublica))) return false;
      if (termo) {
        const hit =
          r.itemNome.toLowerCase().includes(termo) ||
          r.solicitanteNome.toLowerCase().includes(termo) ||
          (soDigitos && String(r.numero).includes(soDigitos));
        if (!hit) return false;
      }
      return true;
    });
  }, [todas, fEstab, fUnidade, fGrupo, fAgrup, fCarryover, fVerba, fStatusVP, q]);

  // KPIs
  const kpis = useMemo(() => {
    const sols = new Set<string>();
    let valor = 0;
    let valorCarryover = 0;
    for (const r of filtered) {
      sols.add(r.solicitacaoId);
      valor += r.valorTotal;
      if (r.carryover) valorCarryover += r.valorTotal;
    }
    return { valor, valorCarryover, solicitacoes: sols.size, itens: filtered.length };
  }, [filtered]);

  // Info agregada por solicitação (valor nesta visão) — contexto da decisão.
  const solInfo = useMemo(() => {
    const m = new Map<
      string,
      {
        numero: number;
        solicitanteNome: string;
        status: SolicitacaoStatus;
        valor: number;
        itens: number;
        carryover: boolean;
      }
    >();
    for (const r of filtered) {
      const s =
        m.get(r.solicitacaoId) ??
        {
          numero: r.numero,
          solicitanteNome: r.solicitanteNome,
          status: r.status,
          valor: 0,
          itens: 0,
          carryover: r.carryover,
        };
      s.valor += r.valorTotal;
      s.itens += 1;
      m.set(r.solicitacaoId, s);
    }
    return m;
  }, [filtered]);

  // Árvore Grupo → Agrupamento → Item (ordenada por gasto desc).
  const arvore = useMemo(() => {
    const gMap = new Map<number, GrupoAgg>();
    for (const r of filtered) {
      let g = gMap.get(r.grupoId);
      if (!g) {
        g = { grupoId: r.grupoId, qtd: 0, valor: 0, sols: new Set(), agrs: new Map() };
        gMap.set(r.grupoId, g);
      }
      g.qtd += r.quantidade;
      g.valor += r.valorTotal;
      g.sols.add(r.solicitacaoId);

      const agrNome = r.agrupamento ?? SEM_AGRUP;
      let a = g.agrs.get(agrNome);
      if (!a) {
        a = { nome: agrNome, qtd: 0, valor: 0, sols: new Set(), itens: new Map() };
        g.agrs.set(agrNome, a);
      }
      a.qtd += r.quantidade;
      a.valor += r.valorTotal;
      a.sols.add(r.solicitacaoId);

      const ik = r.itemCatalogoId != null ? `c${r.itemCatalogoId}` : `d:${r.itemNome}`;
      let it = a.itens.get(ik);
      if (!it) {
        it = { key: ik, nome: r.itemNome, qtd: 0, valor: 0, porUnidade: new Map(), sols: new Map() };
        a.itens.set(ik, it);
      }
      it.qtd += r.quantidade;
      it.valor += r.valorTotal;
      it.porUnidade.set(r.unidadeNegocioId, (it.porUnidade.get(r.unidadeNegocioId) ?? 0) + r.quantidade);
      const sa = it.sols.get(r.solicitacaoId) ?? { qtd: 0, valor: 0 };
      sa.qtd += r.quantidade;
      sa.valor += r.valorTotal;
      it.sols.set(r.solicitacaoId, sa);
    }
    // Ordena tudo por valor desc.
    return [...gMap.values()]
      .sort((x, y) => y.valor - x.valor)
      .map((g) => ({
        ...g,
        agrsArr: [...g.agrs.values()]
          .sort((x, y) => y.valor - x.valor)
          .map((a) => ({
            ...a,
            itensArr: [...a.itens.values()].sort((x, y) => y.valor - x.valor),
          })),
      }));
  }, [filtered]);

  const toggle = (k: string) =>
    setAberto((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const decidir = useMutation({
    mutationFn: ({ id, decisao }: { id: string; decisao: 'APROVADO' | 'REPROVADO' | 'REVISAO' }) =>
      api
        .post(`/aprovacoes/solicitacoes/${id}/decidir`, { decisao, justificativa: comentario || null })
        .then((r) => r.data),
    onSuccess: () => {
      setDecidindo(null);
      setComentario('');
      qc.invalidateQueries();
    },
    onError: (e) => {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Não foi possível registrar a decisão.';
      alert(msg);
    },
  });

  const decidirLote = useMutation({
    mutationFn: ({ ids, decisao }: { ids: string[]; decisao: 'APROVADO' | 'REPROVADO' | 'REVISAO' }) =>
      api
        .post('/aprovacoes/decidir-lote', { ids, decisao, justificativa: loteComentario || null })
        .then((r) => r.data as { total: number; sucesso: number; falhas: number }),
    onSuccess: (res) => {
      setLote(null);
      setLoteComentario('');
      qc.invalidateQueries();
      if (res.falhas > 0) {
        alert(
          `${res.sucesso} de ${res.total} solicitação(ões) decidida(s).\n` +
            `${res.falhas} não puderam ser decididas agora (fora da sua alçada ou já resolvidas).`,
        );
      }
    },
    onError: (e) => {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Não foi possível registrar as decisões.';
      alert(msg);
    },
  });

  function abrirLote(titulo: string, ids: Iterable<string>) {
    setLoteComentario('');
    // Carryovers já estão aprovados — não entram numa decisão em lote.
    const decidiveis = [...new Set(ids)].filter((id) => !solInfo.get(id)?.carryover);
    setLote({ titulo, ids: decidiveis });
  }

  function limpar() {
    setFEstab([]);
    setFUnidade([]);
    setFGrupo([]);
    setFAgrup([]);
    setFVerba([]);
    setFStatusVP([]);
    setFCarryover('todos');
    setQ('');
  }

  function exportarExcel() {
    const dados = filtered.map((r) => ({
      Grupo: grupoById.get(r.grupoId) ?? `#${r.grupoId}`,
      Agrupamento: r.agrupamento ?? '',
      Item: r.itemNome,
      Unidade: unidadeById.get(r.unidadeNegocioId) ?? '',
      Estabelecimento: estabById.get(r.estabelecimentoId) ?? '',
      'Solicitação': `#${String(r.numero).padStart(5, '0')}`,
      Solicitante: r.solicitanteNome,
      Quantidade: r.quantidade,
      'Valor unitário': r.valorUnitario,
      'Valor total': r.valorTotal,
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mesa Aprovação Final');
    XLSX.writeFile(wb, `mesa_aprovacao_final_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const unidadesFiltradas = cat.unidades.filter((u) => inSet(fEstab, u.estabelecimentoId));
  // Nomes de unidade se repetem entre estabelecimentos — filtramos por NOME
  // (uma opção por nome; selecionar um nome cobre todas as homônimas).
  const unidadeOptions = [...new Set(unidadesFiltradas.map((u) => u.nome))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((n) => ({ id: n, label: n }));

  return (
    <>
      <PageHeader
        title="Mesa de Aprovação Final"
        subtitle="Priorize por gasto, agrupe e desça ao item — decida o que vai para aprovação final"
        actions={
          <button className="btn-ghost" onClick={exportarExcel} disabled={filtered.length === 0}>
            <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Kpi icon={Wallet} label="Valor na mesa" value={formatBRL(kpis.valor)} accent="brand" />
        <Kpi
          icon={CalendarClock}
          label="Dos quais carryover"
          value={formatBRL(kpis.valorCarryover)}
          accent="sky"
        />
        <Kpi icon={ClipboardList} label="Solicitações" value={kpis.solicitacoes} accent="amber" />
        <Kpi icon={Package} label="Itens" value={kpis.itens} accent="emerald" />
      </div>

      {/* Filtros */}
      <div className="card mb-4">
        <div className="card-body space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-soft">
            <Filter className="w-4 h-4" /> Filtros
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="label">Estabelecimento</label>
              <MultiSelectSearch
                value={fEstab}
                options={cat.estabelecimentos.map((e) => ({ id: e.id, label: e.nome }))}
                onChange={(v) => {
                  setFEstab(v);
                  setFUnidade([]);
                }}
              />
            </div>
            <div>
              <label className="label">Unidade</label>
              <MultiSelectSearch
                value={fUnidade}
                options={unidadeOptions}
                onChange={setFUnidade}
              />
            </div>
            <div>
              <label className="label">Grupo</label>
              <MultiSelectSearch
                value={fGrupo}
                options={cat.grupos.map((g) => ({ id: g.id, label: g.nome }))}
                onChange={(v) => {
                  setFGrupo(v);
                  setFAgrup([]);
                }}
              />
            </div>
            <div>
              <label className="label">Agrupamento</label>
              <MultiSelectSearch
                value={fAgrup}
                options={agrupamentosDisponiveis.map((a) => ({ id: a, label: a }))}
                onChange={setFAgrup}
              />
            </div>
            <div>
              <label className="label">Tipo de verba</label>
              <MultiSelectSearch value={fVerba} options={VERBA_OPCOES} onChange={setFVerba} />
            </div>
            <div>
              <label className="label">Status verba pública</label>
              <MultiSelectSearch value={fStatusVP} options={STATUS_VP_OPCOES} onChange={setFStatusVP} />
            </div>
            <div>
              <label className="label">Carryover</label>
              <select
                className="input"
                value={fCarryover}
                onChange={(e) => setFCarryover(e.target.value as 'todos' | 'so' | 'sem')}
              >
                <option value="todos">Incluir</option>
                <option value="so">Só carryovers</option>
                <option value="sem">Sem carryovers</option>
              </select>
            </div>
            <div>
              <label className="label">Busca (item, nº, solicitante)</label>
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ex.: cadeira, 142, joão"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn-ghost" onClick={limpar}>
              <RotateCcw className="w-4 h-4" /> Limpar filtros
            </button>
          </div>
        </div>
      </div>

      {/* Pivô / drill */}
      {isLoading ? (
        <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>
      ) : arvore.length === 0 ? (
        <Empty
          icon={Gavel}
          title="Nada aguardando aprovação final"
          description="Quando houver solicitações na etapa final do fluxo, elas aparecem aqui para a mesa decidir."
        />
      ) : (
        <div className="space-y-2">
          {arvore.map((g) => {
            const gk = `g:${g.grupoId}`;
            const gAberto = aberto.has(gk);
            return (
              <div key={gk} className="card overflow-hidden">
                {/* Nível 1 — Grupo */}
                <div className="w-full flex items-center gap-2 px-4 py-3 hover:bg-surface-alt transition">
                  <button
                    onClick={() => toggle(gk)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <Chevron open={gAberto} />
                    <Layers3 className="w-4 h-4 text-brand-700 shrink-0" />
                    <span className="font-semibold text-ink flex-1 min-w-0 truncate">
                      {grupoById.get(g.grupoId) ?? `Grupo #${g.grupoId}`}
                    </span>
                    <Metricas qtd={g.qtd} valor={g.valor} sols={g.sols.size} />
                  </button>
                  <LoteBtn
                    n={g.sols.size}
                    onClick={() =>
                      abrirLote(`Grupo: ${grupoById.get(g.grupoId) ?? `#${g.grupoId}`}`, g.sols)
                    }
                  />
                </div>

                {gAberto && (
                  <div className="border-t border-surface-border bg-surface-alt/40">
                    {g.agrsArr.map((a) => {
                      const ak = `a:${g.grupoId}::${a.nome}`;
                      const aAberto = aberto.has(ak);
                      return (
                        <div key={ak} className="border-b border-surface-border last:border-0">
                          {/* Nível 2 — Agrupamento */}
                          <div className="w-full flex items-center gap-2 pl-8 pr-4 py-2.5 hover:bg-white transition">
                            <button
                              onClick={() => toggle(ak)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left"
                            >
                              <Chevron open={aAberto} small />
                              <span className="text-sm font-medium text-ink flex-1 min-w-0 truncate">
                                {a.nome}
                              </span>
                              <Metricas qtd={a.qtd} valor={a.valor} sols={a.sols.size} />
                            </button>
                            <LoteBtn
                              n={a.sols.size}
                              onClick={() =>
                                abrirLote(
                                  `${grupoById.get(g.grupoId) ?? `#${g.grupoId}`} · ${a.nome}`,
                                  a.sols,
                                )
                              }
                            />
                          </div>

                          {aAberto && (
                            <div className="bg-white">
                              {a.itensArr.map((it) => {
                                const ik = `i:${g.grupoId}::${a.nome}::${it.key}`;
                                const iAberto = aberto.has(ik);
                                const unidades = [...it.porUnidade.entries()].sort((x, y) => y[1] - x[1]);
                                return (
                                  <div key={ik} className="border-t border-surface-border">
                                    {/* Nível 3 — Item */}
                                    <div className="w-full flex items-start gap-2 pl-14 pr-4 py-2.5 hover:bg-surface-alt/60 transition">
                                      <button
                                        onClick={() => toggle(ik)}
                                        className="flex items-start gap-3 flex-1 min-w-0 text-left"
                                      >
                                        <Chevron open={iAberto} small />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm text-ink truncate">{it.nome}</div>
                                          {/* Divisão por unidade — o "1500 cadeiras: 5 aqui, 5 ali" */}
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {unidades.map(([uid, qtd]) => (
                                              <span
                                                key={uid}
                                                className="inline-flex items-center gap-1 text-xs bg-surface-alt border border-surface-border rounded-full px-2 py-0.5 text-ink-soft"
                                              >
                                                <Building2 className="w-3 h-3 text-ink-muted" />
                                                {unidadeById.get(uid) ?? `Unid. ${uid}`}:{' '}
                                                <b className="text-ink tabular-nums">{qtd}</b>
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                        <Metricas qtd={it.qtd} valor={it.valor} sols={it.sols.size} />
                                      </button>
                                      <LoteBtn
                                        n={it.sols.size}
                                        onClick={() => abrirLote(`Item: ${it.nome}`, it.sols.keys())}
                                      />
                                    </div>

                                    {iAberto && (
                                      <div className="pl-14 pr-4 pb-3 space-y-2">
                                        {[...it.sols.entries()].map(([solId, sv]) => {
                                          const info = solInfo.get(solId);
                                          const emDecisao = decidindo === solId;
                                          return (
                                            <div
                                              key={solId}
                                              className="rounded-lg border border-surface-border bg-surface-alt/40 p-3"
                                            >
                                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <button
                                                  className="font-medium text-brand-700 hover:underline inline-flex items-center gap-1"
                                                  onClick={() => navigate(`/solicitacoes/${solId}`)}
                                                >
                                                  #{String(info?.numero ?? 0).padStart(5, '0')}
                                                  <ExternalLink className="w-3 h-3" />
                                                </button>
                                                {info && <StatusBadge status={info.status} />}
                                                {info?.carryover && (
                                                  <span className="badge bg-sky-100 text-sky-800 inline-flex items-center gap-1">
                                                    <CalendarClock className="w-3 h-3" /> Carryover
                                                  </span>
                                                )}
                                                <span className="text-sm text-ink-soft">
                                                  {info?.solicitanteNome}
                                                </span>
                                                <span className="text-xs text-ink-muted ml-auto tabular-nums">
                                                  {sv.qtd} un · {formatBRL(sv.valor)}
                                                </span>
                                                {!info?.carryover && (
                                                  <button
                                                    className="btn-ghost py-1 px-2 text-xs"
                                                    onClick={() => {
                                                      setDecidindo(emDecisao ? null : solId);
                                                      setComentario('');
                                                    }}
                                                  >
                                                    <Gavel className="w-3.5 h-3.5" /> Decidir
                                                  </button>
                                                )}
                                              </div>

                                              {emDecisao && !info?.carryover && (
                                                <div className="mt-3 border-t border-surface-border pt-3">
                                                  <div className="text-xs text-ink-muted mb-2">
                                                    A decisão vale para a <b>solicitação inteira</b>
                                                    {info ? (
                                                      <>
                                                        {' '}
                                                        ({info.itens} item(ns) nesta visão ·{' '}
                                                        {formatBRL(info.valor)})
                                                      </>
                                                    ) : null}
                                                    . Comentário é obrigatório para reprovar ou devolver.
                                                  </div>
                                                  <textarea
                                                    className="input resize-none mb-2"
                                                    rows={2}
                                                    value={comentario}
                                                    onChange={(e) => setComentario(e.target.value)}
                                                    placeholder="Comentário (opcional para aprovar; obrigatório para reprovar/devolver)"
                                                  />
                                                  <div className="flex flex-wrap gap-2">
                                                    <button
                                                      className="btn-success py-1.5 px-3 text-sm"
                                                      disabled={decidir.isPending}
                                                      onClick={() =>
                                                        decidir.mutate({ id: solId, decisao: 'APROVADO' })
                                                      }
                                                    >
                                                      <Check className="w-4 h-4" /> Aprovar final
                                                    </button>
                                                    <button
                                                      className="btn-ghost py-1.5 px-3 text-sm text-orange-700 hover:bg-orange-50"
                                                      disabled={decidir.isPending || !comentario.trim()}
                                                      title={!comentario.trim() ? 'Escreva um comentário' : undefined}
                                                      onClick={() =>
                                                        decidir.mutate({ id: solId, decisao: 'REVISAO' })
                                                      }
                                                    >
                                                      <Undo2 className="w-4 h-4" /> Devolver p/ revisão
                                                    </button>
                                                    <button
                                                      className="btn-ghost py-1.5 px-3 text-sm text-red-600 hover:bg-red-50"
                                                      disabled={decidir.isPending || !comentario.trim()}
                                                      title={!comentario.trim() ? 'Escreva um comentário' : undefined}
                                                      onClick={() =>
                                                        decidir.mutate({ id: solId, decisao: 'REPROVADO' })
                                                      }
                                                    >
                                                      <X className="w-4 h-4" /> Reprovar
                                                    </button>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de decisão em lote */}
      {lote && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !decidirLote.isPending && setLote(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-surface-border flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-brand-700" />
              <h3 className="font-semibold text-ink">Decisão em lote</h3>
              <button
                className="ml-auto btn-ghost py-1 px-2"
                onClick={() => setLote(null)}
                disabled={decidirLote.isPending}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="text-sm text-ink">
                <div className="text-ink-soft">{lote.titulo}</div>
                <div className="mt-1">
                  A mesma decisão será aplicada a{' '}
                  <b className="text-ink">{lote.ids.length}</b> solicitação(ões).
                </div>
              </div>
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                A decisão vale para a <b>solicitação inteira</b> (todos os itens dela), não só
                pelos itens deste grupo/agrupamento. Pedidos fora da sua alçada ou já resolvidos
                são ignorados automaticamente.
              </div>
              <textarea
                className="input resize-none"
                rows={3}
                value={loteComentario}
                onChange={(e) => setLoteComentario(e.target.value)}
                placeholder="Comentário (opcional para aprovar; obrigatório para reprovar/devolver)"
              />
              <div className="flex flex-nowrap gap-2 justify-end">
                <button
                  className="btn-ghost text-orange-700 hover:bg-orange-50 whitespace-nowrap"
                  disabled={decidirLote.isPending || !loteComentario.trim()}
                  title={!loteComentario.trim() ? 'Escreva um comentário' : undefined}
                  onClick={() => decidirLote.mutate({ ids: lote.ids, decisao: 'REVISAO' })}
                >
                  <Undo2 className="w-4 h-4" /> Devolver p/ revisão
                </button>
                <button
                  className="btn-ghost text-red-600 hover:bg-red-50 whitespace-nowrap"
                  disabled={decidirLote.isPending || !loteComentario.trim()}
                  title={!loteComentario.trim() ? 'Escreva um comentário' : undefined}
                  onClick={() => decidirLote.mutate({ ids: lote.ids, decisao: 'REPROVADO' })}
                >
                  <X className="w-4 h-4" /> Reprovar todas
                </button>
                <button
                  className="btn-success whitespace-nowrap"
                  disabled={decidirLote.isPending}
                  onClick={() => decidirLote.mutate({ ids: lote.ids, decisao: 'APROVADO' })}
                >
                  <Check className="w-4 h-4" />{' '}
                  {decidirLote.isPending ? 'Processando…' : 'Aprovar todas'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LoteBtn({ n, onClick }: { n: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="btn-secondary py-1 px-2.5 text-xs shrink-0 border-brand-200 text-brand-800 hover:bg-brand-50"
      title={`Decidir as ${n} solicitações deste nível de uma vez`}
    >
      <ListChecks className="w-3.5 h-3.5" /> Decidir em lote
    </button>
  );
}

function Chevron({ open, small }: { open: boolean; small?: boolean }) {
  const cls = small ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return open ? (
    <ChevronDown className={cn(cls, 'text-ink-muted shrink-0')} />
  ) : (
    <ChevronRight className={cn(cls, 'text-ink-muted shrink-0')} />
  );
}

function Metricas({ qtd, valor, sols }: { qtd: number; valor: number; sols: number }) {
  return (
    <div className="flex items-center gap-4 shrink-0 text-right">
      <div className="hidden sm:block">
        <div className="text-[10px] uppercase tracking-wide text-ink-muted">Qtd</div>
        <div className="text-sm font-medium tabular-nums text-ink">{qtd.toLocaleString('pt-BR')}</div>
      </div>
      <div className="hidden md:block">
        <div className="text-[10px] uppercase tracking-wide text-ink-muted">Solic.</div>
        <div className="text-sm font-medium tabular-nums text-ink">{sols}</div>
      </div>
      <div className="min-w-[7rem]">
        <div className="text-[10px] uppercase tracking-wide text-ink-muted">Valor</div>
        <div className="text-sm font-semibold tabular-nums text-brand-800">{formatBRL(valor)}</div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Wallet;
  label: string;
  value: string | number;
  accent: 'brand' | 'amber' | 'emerald' | 'sky';
}) {
  const bg = {
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    sky: 'bg-sky-50 text-sky-700',
  }[accent];
  return (
    <div className="card">
      <div className="card-body flex items-center gap-4">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${bg}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-ink-soft uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-semibold text-ink tabular-nums truncate">{value}</div>
        </div>
      </div>
    </div>
  );
}
