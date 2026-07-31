import { useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import {
  Coins,
  Package,
  FileText,
  Search,
  Save,
  X,
  Pencil,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Empty } from '../components/Empty';
import { MultiSelectSearch } from '../components/MultiSelectSearch';
import type { OptId } from '../components/SearchableSelect';
import { api } from '../lib/api';
import { cn, formatBRL } from '../lib/utils';

const PAGE_SIZE = 20;

type Grupo = { id: number; nome: string };
type Estabelecimento = { id: number; nome: string };

function apiErro(e: unknown): string {
  return (
    (e as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ?? 'Ocorreu um erro. Tente novamente.'
  );
}

// Normaliza entrada de valor: "" -> null; caso contrário Number (aceita vírgula).
function parseValor(v: string): number | null {
  const t = v.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return isNaN(n) ? null : n;
}

const tabs = [
  { key: 'catalogo', label: 'Preços do Catálogo', icon: Package },
  { key: 'solicitacoes', label: 'Valores das Solicitações', icon: FileText },
] as const;

type TabKey = (typeof tabs)[number]['key'];

const SUBTITLES: Record<TabKey, string> = {
  catalogo:
    'Gerencie o preço de referência (Renem), o valor mínimo e o valor máximo de cada item do catálogo',
  solicitacoes:
    'Revise e ajuste o valor informado pelos solicitantes — o valor original é preservado',
};

export function SuprimentosPage() {
  const [tab, setTab] = useState<TabKey>('catalogo');

  return (
    <>
      <PageHeader
        title="Suprimentos"
        subtitle={SUBTITLES[tab]}
        actions={<Coins className="w-6 h-6 text-brand-700 hidden sm:block" />}
      />

      <div className="flex flex-wrap gap-1 mb-6 border-b border-surface-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap',
                active
                  ? 'border-brand text-brand-800'
                  : 'border-transparent text-ink-soft hover:text-ink',
              )}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'catalogo' && <PrecosCatalogoPanel />}
      {tab === 'solicitacoes' && <ValoresSolicitacoesPanel />}
    </>
  );
}

// ─── Aba 1: preços do catálogo ────────────────────────────────────────────────
type ItemPreco = {
  id: number;
  nome: string;
  grupoNome: string | null;
  tipo: string;
  agrupamento: string | null;
  valorReferencia: number | null;
  valorMin: number | null;
  valorMax: number | null;
  ativo: boolean;
};

type ListItensResp = {
  items: ItemPreco[];
  total: number;
  page: number;
  pageSize: number;
};

function PrecosCatalogoPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [fGrupo, setFGrupo] = useState<OptId[]>([]);
  const [fTipo, setFTipo] = useState<OptId[]>([]);
  const [page, setPage] = useState(1);

  // Edição inline (um item por vez)
  const [editId, setEditId] = useState<number | null>(null);
  const [ref, setRef] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  const { data: grupos = [] } = useQuery<Grupo[]>({
    queryKey: ['catalog', 'grupos'],
    queryFn: () => api.get('/catalog/grupos').then((r) => r.data),
    staleTime: 10 * 60_000,
  });
  const grupoOptions = grupos.map((g) => ({ id: g.id, label: g.nome }));

  const { data, isLoading, isFetching } = useQuery<ListItensResp>({
    queryKey: ['suprimentos', 'itens', { q, fGrupo, fTipo, page }],
    queryFn: () =>
      api
        .get('/suprimentos/itens', {
          params: {
            q: q.trim() || undefined,
            grupoId: fGrupo.length ? fGrupo.join(',') : undefined,
            tipo: fTipo.length ? fTipo.join(',') : undefined,
            page,
            pageSize: PAGE_SIZE,
          },
        })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const itens = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inicio = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const fim = Math.min(page * PAGE_SIZE, total);

  function abrirEdicao(it: ItemPreco) {
    setEditId(it.id);
    setRef(it.valorReferencia == null ? '' : String(it.valorReferencia));
    setMin(it.valorMin == null ? '' : String(it.valorMin));
    setMax(it.valorMax == null ? '' : String(it.valorMax));
  }
  function cancelar() {
    setEditId(null);
  }

  const salvar = useMutation({
    mutationFn: (id: number) =>
      api.put(`/suprimentos/itens/${id}/precos`, {
        valorReferencia: parseValor(ref),
        valorMin: parseValor(min),
        valorMax: parseValor(max),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suprimentos', 'itens'] });
      setEditId(null);
    },
    onError: (e) => alert(apiErro(e)),
  });

  function resetPagina() {
    setPage(1);
  }

  return (
    <>
      <div className="flex flex-col lg:flex-row lg:items-end gap-3 mb-4">
        <div className="flex-1">
          <label className="label">Buscar</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input pl-9"
              placeholder="Nome, agrupamento ou RENEM…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                resetPagina();
              }}
            />
          </div>
        </div>
        <div className="w-full lg:w-56">
          <label className="label">Grupo</label>
          <MultiSelectSearch
            value={fGrupo}
            options={grupoOptions}
            onChange={(v) => {
              setFGrupo(v);
              resetPagina();
            }}
          />
        </div>
        <div className="w-full lg:w-44">
          <label className="label">Tipo</label>
          <MultiSelectSearch
            value={fTipo}
            options={[
              { id: 'ITEM', label: 'Item' },
              { id: 'INSTRUMENTAL', label: 'Instrumental' },
            ]}
            onChange={(v) => {
              setFTipo(v);
              resetPagina();
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>
      ) : itens.length === 0 ? (
        <Empty icon={Package} title="Nenhum item encontrado" />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="table-head">Item</th>
                  <th className="table-head">Grupo</th>
                  <th className="table-head text-right">Valor Renem</th>
                  <th className="table-head text-right">Valor Mín.</th>
                  <th className="table-head text-right">Valor Máx.</th>
                  <th className="table-head text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => {
                  const emEdicao = editId === it.id;
                  return (
                    <tr key={it.id} className="table-row align-middle">
                      <td className="table-cell font-medium max-w-md">
                        <div className="truncate" title={it.nome}>
                          {it.nome}
                        </div>
                        {!it.ativo && (
                          <span className="badge bg-slate-100 text-slate-600 mt-1">Inativo</span>
                        )}
                      </td>
                      <td className="table-cell text-ink-soft">{it.grupoNome ?? '—'}</td>
                      {emEdicao ? (
                        <>
                          <td className="table-cell text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="input text-right w-32 py-1"
                              value={ref}
                              onChange={(e) => setRef(e.target.value)}
                              placeholder="0,00"
                            />
                          </td>
                          <td className="table-cell text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="input text-right w-32 py-1"
                              value={min}
                              onChange={(e) => setMin(e.target.value)}
                              placeholder="0,00"
                            />
                          </td>
                          <td className="table-cell text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="input text-right w-32 py-1"
                              value={max}
                              onChange={(e) => setMax(e.target.value)}
                              placeholder="0,00"
                            />
                          </td>
                          <td className="table-cell">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                className="btn-primary py-1 px-2 text-xs"
                                disabled={salvar.isPending}
                                onClick={() => salvar.mutate(it.id)}
                              >
                                <Save className="w-3.5 h-3.5" />{' '}
                                {salvar.isPending ? 'Salvando…' : 'Salvar'}
                              </button>
                              <button
                                className="btn-ghost py-1 px-2 text-xs"
                                onClick={cancelar}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="table-cell text-right tabular-nums">
                            {it.valorReferencia == null ? '—' : formatBRL(it.valorReferencia)}
                          </td>
                          <td className="table-cell text-right tabular-nums">
                            {it.valorMin == null ? '—' : formatBRL(it.valorMin)}
                          </td>
                          <td className="table-cell text-right tabular-nums">
                            {it.valorMax == null ? '—' : formatBRL(it.valorMax)}
                          </td>
                          <td className="table-cell">
                            <div className="flex items-center justify-end">
                              <button
                                className="btn-ghost py-1 px-2 text-xs"
                                onClick={() => abrirEdicao(it)}
                              >
                                <Pencil className="w-3.5 h-3.5" /> Editar preços
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border text-sm text-ink-soft">
            <div>
              Mostrando <b>{inicio}</b>–<b>{fim}</b> de <b>{total}</b>
              {isFetching && <span className="ml-2 text-ink-muted">atualizando…</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost py-1 px-2 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <span className="tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                className="btn-ghost py-1 px-2 disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Aba 2: valor informado nas solicitações ─────────────────────────────────
const STATUS_OPCOES = [
  { value: '', label: 'Todos' },
  { value: 'RASCUNHO', label: 'Rascunho' },
  { value: 'EM_APROVACAO', label: 'Em aprovação' },
  { value: 'APROVACAO_INICIAL', label: 'Aprovação inicial' },
  { value: 'EM_REVISAO', label: 'Em revisão' },
  { value: 'APROVADO', label: 'Aprovação final' },
  { value: 'REPROVADO', label: 'Reprovadas' },
  { value: 'CANCELADO', label: 'Canceladas' },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPCOES.filter((s) => s.value).map((s) => [s.value, s.label]),
);

type SolItem = {
  id: string;
  solicitacaoId: string;
  numero: number;
  status: string;
  estabelecimentoNome: string | null;
  solicitanteNome: string | null;
  grupoNome: string | null;
  descricao: string;
  itemNome: string | null;
  quantidade: number;
  valorUnitario: number;
  valorSuprimentos: number | null;
  itemValorMin: number | null;
  itemValorMax: number | null;
  itemValorReferencia: number | null;
  suprimentosPorNome: string | null;
  suprimentosEm: string | null;
};

type ListSolResp = {
  items: SolItem[];
  total: number;
  page: number;
  pageSize: number;
};

// Valor efetivo (suprimentos se houver; senão o do solicitante) fora do intervalo do item?
function foraDoIntervalo(valor: number, it: SolItem): boolean {
  if (it.itemValorMin != null && valor < it.itemValorMin) return true;
  if (it.itemValorMax != null && valor > it.itemValorMax) return true;
  return false;
}

function ValoresSolicitacoesPanel() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [fEstab, setFEstab] = useState<OptId[]>([]);
  const [fGrupo, setFGrupo] = useState<OptId[]>([]);
  const [fStatus, setFStatus] = useState<OptId[]>([]);
  const [page, setPage] = useState(1);

  const [editId, setEditId] = useState<string | null>(null);
  const [valor, setValor] = useState('');

  const { data: grupos = [] } = useQuery<Grupo[]>({
    queryKey: ['catalog', 'grupos'],
    queryFn: () => api.get('/catalog/grupos').then((r) => r.data),
    staleTime: 10 * 60_000,
  });
  const { data: estabs = [] } = useQuery<Estabelecimento[]>({
    queryKey: ['catalog', 'estabelecimentos'],
    queryFn: () => api.get('/catalog/estabelecimentos').then((r) => r.data),
    staleTime: 10 * 60_000,
  });

  const { data, isLoading, isFetching } = useQuery<ListSolResp>({
    queryKey: ['suprimentos', 'sol-itens', { q, fEstab, fGrupo, fStatus, page }],
    queryFn: () =>
      api
        .get('/suprimentos/solicitacoes-itens', {
          params: {
            q: q.trim() || undefined,
            estabelecimentoId: fEstab.length ? fEstab.join(',') : undefined,
            grupoId: fGrupo.length ? fGrupo.join(',') : undefined,
            status: fStatus.length ? fStatus.join(',') : undefined,
            page,
            pageSize: PAGE_SIZE,
          },
        })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const itens = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inicio = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const fim = Math.min(page * PAGE_SIZE, total);

  function abrirEdicao(it: SolItem) {
    setEditId(it.id);
    setValor(it.valorSuprimentos == null ? '' : String(it.valorSuprimentos));
  }

  const salvar = useMutation({
    mutationFn: (id: string) =>
      api.put(`/suprimentos/solicitacao-item/${id}/valor`, {
        valorSuprimentos: parseValor(valor),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suprimentos', 'sol-itens'] });
      setEditId(null);
    },
    onError: (e) => alert(apiErro(e)),
  });

  function resetPagina() {
    setPage(1);
  }

  return (
    <>
      <div className="flex flex-col lg:flex-row lg:items-end gap-3 mb-4">
        <div className="flex-1">
          <label className="label">Buscar</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input pl-9"
              placeholder="Descrição ou item…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                resetPagina();
              }}
            />
          </div>
        </div>
        <div className="w-full lg:w-56">
          <label className="label">Estabelecimento</label>
          <MultiSelectSearch
            value={fEstab}
            options={estabs.map((e) => ({ id: e.id, label: e.nome }))}
            onChange={(v) => {
              setFEstab(v);
              resetPagina();
            }}
          />
        </div>
        <div className="w-full lg:w-48">
          <label className="label">Grupo</label>
          <MultiSelectSearch
            value={fGrupo}
            options={grupos.map((g) => ({ id: g.id, label: g.nome }))}
            onChange={(v) => {
              setFGrupo(v);
              resetPagina();
            }}
          />
        </div>
        <div className="w-full lg:w-44">
          <label className="label">Status</label>
          <MultiSelectSearch
            value={fStatus}
            options={STATUS_OPCOES.filter((s) => s.value).map((s) => ({ id: s.value, label: s.label }))}
            onChange={(v) => {
              setFStatus(v);
              resetPagina();
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>
      ) : itens.length === 0 ? (
        <Empty icon={FileText} title="Nenhum item encontrado" />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="table-head">Solic.</th>
                  <th className="table-head">Item / Descrição</th>
                  <th className="table-head text-right">Qtd</th>
                  <th className="table-head text-right">Valor solicitante</th>
                  <th className="table-head text-right">Faixa do item</th>
                  <th className="table-head text-right">Valor suprimentos</th>
                  <th className="table-head text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => {
                  const emEdicao = editId === it.id;
                  const efetivo =
                    it.valorSuprimentos != null ? it.valorSuprimentos : it.valorUnitario;
                  const alerta = foraDoIntervalo(efetivo, it);
                  return (
                    <tr key={it.id} className="table-row align-middle">
                      <td className="table-cell">
                        <div className="font-medium tabular-nums">#{it.numero}</div>
                        <span className="badge bg-slate-100 text-slate-700 mt-1">
                          {STATUS_LABEL[it.status] ?? it.status}
                        </span>
                        {it.estabelecimentoNome && (
                          <div className="text-xs text-ink-muted mt-1 max-w-[160px] truncate">
                            {it.estabelecimentoNome}
                          </div>
                        )}
                      </td>
                      <td className="table-cell max-w-md">
                        <div className="font-medium truncate" title={it.itemNome ?? it.descricao}>
                          {it.itemNome ?? it.descricao}
                        </div>
                        {it.itemNome && it.descricao && (
                          <div className="text-xs text-ink-muted truncate" title={it.descricao}>
                            {it.descricao}
                          </div>
                        )}
                        {it.solicitanteNome && (
                          <div className="text-xs text-ink-muted truncate">
                            por {it.solicitanteNome}
                          </div>
                        )}
                      </td>
                      <td className="table-cell text-right tabular-nums">{it.quantidade}</td>
                      <td className="table-cell text-right tabular-nums">
                        {formatBRL(it.valorUnitario)}
                      </td>
                      <td className="table-cell text-right text-xs text-ink-soft tabular-nums whitespace-nowrap">
                        {it.itemValorMin == null && it.itemValorMax == null ? (
                          '—'
                        ) : (
                          <>
                            {it.itemValorMin == null ? '—' : formatBRL(it.itemValorMin)}
                            {' – '}
                            {it.itemValorMax == null ? '—' : formatBRL(it.itemValorMax)}
                          </>
                        )}
                      </td>
                      {emEdicao ? (
                        <td className="table-cell text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input text-right w-32 py-1"
                            value={valor}
                            onChange={(e) => setValor(e.target.value)}
                            placeholder="0,00"
                            autoFocus
                          />
                        </td>
                      ) : (
                        <td className="table-cell text-right tabular-nums">
                          {it.valorSuprimentos == null ? (
                            <span className="text-ink-muted">—</span>
                          ) : (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 font-medium',
                                alerta ? 'text-amber-700' : 'text-emerald-700',
                              )}
                            >
                              {alerta && <AlertTriangle className="w-3.5 h-3.5" />}
                              {formatBRL(it.valorSuprimentos)}
                            </span>
                          )}
                          {it.suprimentosPorNome && (
                            <div className="text-xs text-ink-muted truncate max-w-[140px]">
                              {it.suprimentosPorNome}
                            </div>
                          )}
                        </td>
                      )}
                      <td className="table-cell">
                        {emEdicao ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              className="btn-primary py-1 px-2 text-xs"
                              disabled={salvar.isPending}
                              onClick={() => salvar.mutate(it.id)}
                            >
                              <Save className="w-3.5 h-3.5" />{' '}
                              {salvar.isPending ? 'Salvando…' : 'Salvar'}
                            </button>
                            <button
                              className="btn-ghost py-1 px-2 text-xs"
                              onClick={() => setEditId(null)}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end">
                            <button
                              className="btn-ghost py-1 px-2 text-xs"
                              onClick={() => abrirEdicao(it)}
                            >
                              <Pencil className="w-3.5 h-3.5" /> Ajustar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border text-sm text-ink-soft">
            <div>
              Mostrando <b>{inicio}</b>–<b>{fim}</b> de <b>{total}</b>
              {isFetching && <span className="ml-2 text-ink-muted">atualizando…</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost py-1 px-2 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <span className="tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                className="btn-ghost py-1 px-2 disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
