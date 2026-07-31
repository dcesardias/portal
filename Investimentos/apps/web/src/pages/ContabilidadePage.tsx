import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  Calculator,
  Search,
  Save,
  X,
  Pencil,
  Link2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { Empty } from '../components/Empty';
import { MultiSelectSearch } from '../components/MultiSelectSearch';
import type { OptId } from '../components/SearchableSelect';
import { MaterialTasyPicker, ContaContabilPicker } from '../components/CatalogoPickers';
import { cn } from '../lib/utils';

const PAGE_SIZE = 20;

type Grupo = { id: number; nome: string };

type Item = {
  id: number;
  nome: string;
  grupoNome: string | null;
  tipo: string;
  agrupamento: string | null;
  cdMaterialTasy: string | null;
  dsMaterialTasy: string | null;
  cdContaContabil: string | null;
  dsContaContabil: string | null;
  ativo: boolean;
};

type ListResp = { items: Item[]; total: number; page: number; pageSize: number };

function apiErro(e: unknown): string {
  return (
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    'Ocorreu um erro. Tente novamente.'
  );
}

export function ContabilidadePage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [fGrupo, setFGrupo] = useState<OptId[]>([]);
  const [fTipo, setFTipo] = useState<OptId[]>([]);
  const [page, setPage] = useState(1);

  // Edição (modal) dos vínculos de um item.
  const [editId, setEditId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState('');
  const [cdTasy, setCdTasy] = useState('');
  const [dsTasy, setDsTasy] = useState('');
  const [cdConta, setCdConta] = useState('');
  const [dsConta, setDsConta] = useState('');

  const { data: grupos = [] } = useQuery<Grupo[]>({
    queryKey: ['catalog', 'grupos'],
    queryFn: () => api.get('/catalog/grupos').then((r) => r.data),
    staleTime: 10 * 60_000,
  });
  const grupoOptions = grupos.map((g) => ({ id: g.id, label: g.nome }));

  const { data, isLoading, isFetching } = useQuery<ListResp>({
    queryKey: ['contabilidade', 'itens', { q, fGrupo, fTipo, page }],
    queryFn: () =>
      api
        .get('/contabilidade/itens', {
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

  function abrirEdicao(it: Item) {
    setEditId(it.id);
    setEditNome(it.nome);
    setCdTasy(it.cdMaterialTasy ?? '');
    setDsTasy(it.dsMaterialTasy ?? '');
    setCdConta(it.cdContaContabil ?? '');
    setDsConta(it.dsContaContabil ?? '');
  }

  const salvar = useMutation({
    mutationFn: (id: number) =>
      api.put(`/contabilidade/itens/${id}/vinculos`, {
        cdMaterialTasy: cdTasy || null,
        dsMaterialTasy: cdTasy ? dsTasy || null : null,
        cdContaContabil: cdConta || null,
        dsContaContabil: cdConta ? dsConta || null : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contabilidade', 'itens'] });
      setEditId(null);
    },
    onError: (e) => alert(apiErro(e)),
  });

  function resetPagina() {
    setPage(1);
  }

  return (
    <>
      <PageHeader
        title="Contabilidade"
        subtitle="Vincule cada item ao material do Tasy e à conta contábil"
      />

      {/* Filtros */}
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

      {/* Tabela */}
      {isLoading ? (
        <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>
      ) : itens.length === 0 ? (
        <Empty icon={Calculator} title="Nenhum item encontrado" />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="table-head">Item</th>
                  <th className="table-head">Grupo</th>
                  <th className="table-head">Material Tasy</th>
                  <th className="table-head">Conta contábil</th>
                  <th className="table-head text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => (
                  <tr key={it.id} className="table-row align-top">
                    <td className="table-cell font-medium max-w-md">
                      <div className="truncate" title={it.nome}>
                        {it.nome}
                      </div>
                      {!it.ativo && (
                        <span className="badge bg-slate-100 text-slate-600 mt-1">Inativo</span>
                      )}
                    </td>
                    <td className="table-cell text-ink-soft">{it.grupoNome ?? '—'}</td>
                    <td className="table-cell">
                      {it.cdMaterialTasy ? (
                        <div className="flex items-start gap-1.5 max-w-[220px]">
                          <Link2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs text-ink truncate" title={it.dsMaterialTasy ?? ''}>
                              {it.dsMaterialTasy ?? '(sem descrição)'}
                            </div>
                            <div className="text-xs text-ink-muted">Cód {it.cdMaterialTasy}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="table-cell">
                      {it.cdContaContabil ? (
                        <div className="flex items-start gap-1.5 max-w-[220px]">
                          <Link2 className="w-3.5 h-3.5 text-sky-600 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs text-ink truncate" title={it.dsContaContabil ?? ''}>
                              {it.dsContaContabil ?? '(sem descrição)'}
                            </div>
                            <div className="text-xs text-ink-muted">Conta {it.cdContaContabil}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end">
                        <button className="btn-secondary py-1 px-2.5 text-xs" onClick={() => abrirEdicao(it)}>
                          <Pencil className="w-3.5 h-3.5" /> Editar vínculos
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

      {/* Modal de edição de vínculos */}
      {editId != null && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !salvar.isPending && setEditId(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-surface-border flex items-center gap-2">
              <Calculator className="w-5 h-5 text-brand-700" />
              <h3 className="font-semibold text-ink flex-1 min-w-0 truncate" title={editNome}>
                Vínculos — {editNome}
              </h3>
              <button
                className="btn-ghost py-1 px-2"
                onClick={() => setEditId(null)}
                disabled={salvar.isPending}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="label">Material do Tasy</label>
                <MaterialTasyPicker
                  cd={cdTasy}
                  ds={dsTasy}
                  searchPath="/contabilidade/materiais-tasy"
                  onPick={(cd, ds) => {
                    setCdTasy(cd);
                    setDsTasy(ds);
                  }}
                  onClear={() => {
                    setCdTasy('');
                    setDsTasy('');
                  }}
                />
              </div>
              <div>
                <label className="label">Conta contábil</label>
                <ContaContabilPicker
                  cd={cdConta}
                  ds={dsConta}
                  searchPath="/contabilidade/contas-contabeis"
                  onPick={(cd, ds) => {
                    setCdConta(cd);
                    setDsConta(ds);
                  }}
                  onClear={() => {
                    setCdConta('');
                    setDsConta('');
                  }}
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-surface-border flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEditId(null)} disabled={salvar.isPending}>
                Cancelar
              </button>
              <button
                className={cn('btn-primary')}
                onClick={() => salvar.mutate(editId)}
                disabled={salvar.isPending}
              >
                <Save className="w-4 h-4" /> {salvar.isPending ? 'Salvando…' : 'Salvar vínculos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
