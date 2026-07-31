import { useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import {
  Package,
  Plus,
  Pencil,
  Power,
  Trash2,
  Search,
  Save,
  X,
  Link2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';
import { cn, formatBRL } from '../../lib/utils';
import { Empty } from '../../components/Empty';
import { SearchableSelect, type OptId } from '../../components/SearchableSelect';
import { MultiSelectSearch } from '../../components/MultiSelectSearch';
import { MaterialTasyPicker, ContaContabilPicker } from '../../components/CatalogoPickers';

type Grupo = { id: number; nome: string };
type TipoItem = 'ITEM' | 'INSTRUMENTAL';

type Item = {
  id: number;
  nome: string;
  grupoId: number;
  grupoNome: string | null;
  tipo: string;
  agrupamento: string | null;
  classificacao: string | null;
  definicao: string | null;
  especificacao: string | null;
  valorReferencia: number | null;
  valorMin: number | null;
  valorMax: number | null;
  movimentoContabil: 'DESPESA' | 'INVESTIMENTO' | null;
  dolarizadoRenem: boolean;
  idRenem: string | null;
  dsRenem: string | null;
  tipoVerba: string | null;
  cdMaterialTasy: string | null;
  dsMaterialTasy: string | null;
  cdContaContabil: string | null;
  dsContaContabil: string | null;
  ativo: boolean;
};

type ListResp = {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
};

// Linha da exportação: item + colunas que não aparecem no formulário (ex.: legado).
type CatalogoRow = Item & { legadoId: number | null };

const PAGE_SIZE = 20;
const TIPO_VERBA_OPCOES = ['Verba Própria', 'Verba Pública'];

const FORM_VAZIO = {
  nome: '',
  grupoId: null as number | null,
  tipo: 'ITEM' as TipoItem,
  agrupamento: '',
  classificacao: '',
  valorReferencia: '',
  valorMin: '',
  valorMax: '',
  movimentoContabil: '' as '' | 'DESPESA' | 'INVESTIMENTO',
  dolarizadoRenem: false,
  idRenem: '',
  dsRenem: '',
  tipoVerba: '',
  definicao: '',
  especificacao: '',
  cdMaterialTasy: '' as string,
  dsMaterialTasy: '' as string,
  cdContaContabil: '' as string,
  dsContaContabil: '' as string,
  ativo: true,
};

function apiErro(e: unknown): string {
  return (
    (e as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ?? 'Ocorreu um erro. Tente novamente.'
  );
}

export function AdminItensPanel() {
  const qc = useQueryClient();

  // Filtros
  const [q, setQ] = useState('');
  const [fGrupo, setFGrupo] = useState<OptId[]>([]);
  const [fTipo, setFTipo] = useState<OptId[]>([]);
  const [fAtivo, setFAtivo] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);

  // Formulário (criar/editar)
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...FORM_VAZIO });

  function resetFiltrosPagina() {
    setPage(1);
  }

  const { data: grupos = [] } = useQuery<Grupo[]>({
    queryKey: ['catalog', 'grupos'],
    queryFn: () => api.get('/catalog/grupos').then((r) => r.data),
    staleTime: 10 * 60_000,
  });

  const grupoOptions = grupos.map((g) => ({ id: g.id, label: g.nome }));

  const { data, isLoading, isFetching } = useQuery<ListResp>({
    queryKey: ['admin', 'itens', { q, fGrupo, fTipo, fAtivo, page }],
    queryFn: () =>
      api
        .get('/admin/itens', {
          params: {
            q: q.trim() || undefined,
            grupoId: fGrupo.length ? fGrupo.join(",") : undefined,
            tipo: fTipo.length ? fTipo.join(",") : undefined,
            ativo: fAtivo || undefined,
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

  const [exportando, setExportando] = useState(false);

  // Exporta a base do catálogo (todos os itens que casam com os filtros atuais)
  // com TODAS as colunas da tabela ItemCatalogo.
  async function exportarExcel() {
    setExportando(true);
    try {
      const { data: linhas } = await api.get<CatalogoRow[]>('/admin/itens/export', {
        params: {
          q: q.trim() || undefined,
          grupoId: fGrupo.length ? fGrupo.join(",") : undefined,
          tipo: fTipo.length ? fTipo.join(",") : undefined,
          ativo: fAtivo || undefined,
        },
      });
      const TIPO: Record<string, string> = { ITEM: 'Item', INSTRUMENTAL: 'Instrumental' };
      const MOV: Record<string, string> = { DESPESA: 'Despesa', INVESTIMENTO: 'Investimento' };
      const sn = (b: boolean | null | undefined) => (b ? 'Sim' : 'Não');
      const dados = linhas.map((r) => ({
        ID: r.id,
        Nome: r.nome,
        Tipo: TIPO[r.tipo] ?? r.tipo,
        Grupo: r.grupoNome ?? '',
        Agrupamento: r.agrupamento ?? '',
        Classificação: r.classificacao ?? '',
        Definição: r.definicao ?? '',
        Especificação: r.especificacao ?? '',
        'Valor Renem': r.valorReferencia ?? '',
        'Valor mínimo': r.valorMin ?? '',
        'Valor máximo': r.valorMax ?? '',
        'Movimento contábil': r.movimentoContabil ? (MOV[r.movimentoContabil] ?? r.movimentoContabil) : '',
        'Dolarizado (RENEM)': sn(r.dolarizadoRenem),
        'Tipo de verba': r.tipoVerba ?? '',
        'ID RENEM': r.idRenem ?? '',
        'Descrição RENEM': r.dsRenem ?? '',
        'Cód. material (Tasy)': r.cdMaterialTasy ?? '',
        'Material (Tasy)': r.dsMaterialTasy ?? '',
        'Cód. conta contábil': r.cdContaContabil ?? '',
        'Conta contábil': r.dsContaContabil ?? '',
        Ativo: sn(r.ativo),
        'ID legado': r.legadoId ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(dados);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Catálogo de Itens');
      XLSX.writeFile(wb, `catalogo_itens_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      alert(apiErro(e));
    } finally {
      setExportando(false);
    }
  }

  function abrirNovo() {
    setEditId(null);
    setForm({ ...FORM_VAZIO });
    setShowForm(true);
  }

  function abrirEdicao(it: Item) {
    setEditId(it.id);
    setForm({
      nome: it.nome,
      grupoId: it.grupoId,
      tipo: (it.tipo === 'INSTRUMENTAL' ? 'INSTRUMENTAL' : 'ITEM') as TipoItem,
      agrupamento: it.agrupamento ?? '',
      classificacao: it.classificacao ?? '',
      valorReferencia: it.valorReferencia == null ? '' : String(it.valorReferencia),
      valorMin: it.valorMin == null ? '' : String(it.valorMin),
      valorMax: it.valorMax == null ? '' : String(it.valorMax),
      movimentoContabil: it.movimentoContabil ?? '',
      dolarizadoRenem: it.dolarizadoRenem ?? false,
      idRenem: it.idRenem ?? '',
      dsRenem: it.dsRenem ?? '',
      tipoVerba: it.tipoVerba ?? '',
      definicao: it.definicao ?? '',
      especificacao: it.especificacao ?? '',
      cdMaterialTasy: it.cdMaterialTasy ?? '',
      dsMaterialTasy: it.dsMaterialTasy ?? '',
      cdContaContabil: it.cdContaContabil ?? '',
      dsContaContabil: it.dsContaContabil ?? '',
      ativo: it.ativo,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function fecharForm() {
    setShowForm(false);
    setEditId(null);
  }

  function payload() {
    return {
      nome: form.nome.trim(),
      grupoId: form.grupoId,
      tipo: form.tipo,
      agrupamento: form.agrupamento.trim() || null,
      classificacao: form.classificacao.trim() || null,
      definicao: form.definicao.trim() || null,
      especificacao: form.especificacao.trim() || null,
      valorReferencia:
        form.valorReferencia.trim() === '' ? null : Number(form.valorReferencia),
      valorMin: form.valorMin.trim() === '' ? null : Number(form.valorMin),
      valorMax: form.valorMax.trim() === '' ? null : Number(form.valorMax),
      movimentoContabil: form.movimentoContabil || null,
      dolarizadoRenem: form.dolarizadoRenem,
      idRenem: form.idRenem.trim() || null,
      dsRenem: form.dsRenem.trim() || null,
      tipoVerba: form.tipo === 'INSTRUMENTAL' ? form.tipoVerba || null : null,
      cdMaterialTasy: form.cdMaterialTasy || null,
      dsMaterialTasy: form.cdMaterialTasy ? form.dsMaterialTasy || null : null,
      cdContaContabil: form.cdContaContabil || null,
      dsContaContabil: form.cdContaContabil ? form.dsContaContabil || null : null,
      ativo: form.ativo,
    };
  }

  const salvar = useMutation({
    mutationFn: () =>
      editId
        ? api.put(`/admin/itens/${editId}`, payload()).then((r) => r.data)
        : api.post('/admin/itens', payload()).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'itens'] });
      fecharForm();
    },
  });

  const toggleAtivo = useMutation({
    mutationFn: (it: Item) =>
      api.put(`/admin/itens/${it.id}/ativo`, { ativo: !it.ativo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'itens'] }),
  });

  const excluir = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/itens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'itens'] }),
    onError: (e) => alert(apiErro(e)),
  });

  const valorInvalido =
    form.valorReferencia.trim() !== '' && isNaN(Number(form.valorReferencia));
  const canSubmit =
    form.nome.trim().length >= 2 && form.grupoId != null && !valorInvalido;

  return (
    <>
      {/* Barra de filtros + ação */}
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
                resetFiltrosPagina();
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
              resetFiltrosPagina();
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
              resetFiltrosPagina();
            }}
          />
        </div>
        <div className="w-full lg:w-36">
          <label className="label">Status</label>
          <select
            className="input"
            value={fAtivo}
            onChange={(e) => {
              setFAtivo(e.target.value as '' | 'true' | 'false');
              resetFiltrosPagina();
            }}
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </div>
        <button
          className="btn-secondary whitespace-nowrap"
          onClick={exportarExcel}
          disabled={exportando}
          title="Exporta a base de itens (todas as colunas) respeitando os filtros atuais"
        >
          <FileSpreadsheet className="w-4 h-4" /> {exportando ? 'Exportando…' : 'Exportar Excel'}
        </button>
        <button className="btn-primary whitespace-nowrap" onClick={abrirNovo}>
          <Plus className="w-4 h-4" /> Novo item
        </button>
      </div>

      {/* Formulário criar/editar */}
      {showForm && (
        <div className="card mb-6 border-2 border-brand">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold text-ink">
              {editId ? 'Editar item' : 'Novo item'}
            </h3>
            <button className="btn-ghost" onClick={fecharForm}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="card-body space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">Nome *</label>
                <input
                  className="input"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  placeholder="Nome do item"
                />
              </div>
              <div>
                <label className="label">Grupo *</label>
                <SearchableSelect
                  value={form.grupoId}
                  options={grupoOptions}
                  onChange={(id) =>
                    setForm((f) => ({ ...f, grupoId: id == null ? null : Number(id) }))
                  }
                  placeholder="Selecione o grupo"
                />
              </div>
              <div>
                <label className="label">Tipo *</label>
                <select
                  className="input"
                  value={form.tipo}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tipo: e.target.value as TipoItem }))
                  }
                >
                  <option value="ITEM">Item</option>
                  <option value="INSTRUMENTAL">Instrumental</option>
                </select>
              </div>
              <div>
                <label className="label">Valor Renem (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={cn('input', valorInvalido && 'input-error')}
                  value={form.valorReferencia}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, valorReferencia: e.target.value }))
                  }
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="label">Valor Mínimo (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  value={form.valorMin}
                  onChange={(e) => setForm((f) => ({ ...f, valorMin: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="label">Valor Máximo (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  value={form.valorMax}
                  onChange={(e) => setForm((f) => ({ ...f, valorMax: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="label">Movimento contábil</label>
                <select
                  className="input"
                  value={form.movimentoContabil}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      movimentoContabil: e.target.value as '' | 'DESPESA' | 'INVESTIMENTO',
                    }))
                  }
                >
                  <option value="">—</option>
                  <option value="DESPESA">Despesa</option>
                  <option value="INVESTIMENTO">Investimento</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 py-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.dolarizadoRenem}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dolarizadoRenem: e.target.checked }))
                    }
                  />
                  Dolarizado (RENEM)
                </label>
              </div>
              {form.tipo === 'INSTRUMENTAL' && (
                <div>
                  <label className="label">Tipo de verba</label>
                  <select
                    className="input"
                    value={form.tipoVerba}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tipoVerba: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {TIPO_VERBA_OPCOES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Agrupamento</label>
                <input
                  className="input"
                  value={form.agrupamento}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, agrupamento: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="label">Classificação</label>
                <input
                  className="input"
                  value={form.classificacao}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, classificacao: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="label">ID RENEM</label>
                <input
                  className="input"
                  value={form.idRenem}
                  onChange={(e) => setForm((f) => ({ ...f, idRenem: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Descrição RENEM</label>
                <input
                  className="input"
                  value={form.dsRenem}
                  onChange={(e) => setForm((f) => ({ ...f, dsRenem: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Definição</label>
                <textarea
                  className="input resize-y"
                  rows={2}
                  value={form.definicao}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, definicao: e.target.value }))
                  }
                  placeholder="O que é / para que serve"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Especificação</label>
                <textarea
                  className="input resize-y"
                  rows={3}
                  value={form.especificacao}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, especificacao: e.target.value }))
                  }
                  placeholder="Especificação técnica detalhada"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Material do Tasy (vínculo)</label>
                <MaterialTasyPicker
                  cd={form.cdMaterialTasy}
                  ds={form.dsMaterialTasy}
                  onPick={(cd, ds) =>
                    setForm((f) => ({ ...f, cdMaterialTasy: cd, dsMaterialTasy: ds }))
                  }
                  onClear={() =>
                    setForm((f) => ({ ...f, cdMaterialTasy: '', dsMaterialTasy: '' }))
                  }
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Conta contábil (vínculo)</label>
                <ContaContabilPicker
                  cd={form.cdContaContabil}
                  ds={form.dsContaContabil}
                  onPick={(cd, ds) =>
                    setForm((f) => ({ ...f, cdContaContabil: cd, dsContaContabil: ds }))
                  }
                  onClear={() =>
                    setForm((f) => ({ ...f, cdContaContabil: '', dsContaContabil: '' }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
                />
                Item ativo (disponível para solicitações)
              </label>
            </div>

            {salvar.isError && <div className="err">{apiErro(salvar.error)}</div>}

            <div className="flex gap-2">
              <button
                className="btn-primary"
                disabled={!canSubmit || salvar.isPending}
                onClick={() => salvar.mutate()}
              >
                <Save className="w-4 h-4" />{' '}
                {salvar.isPending ? 'Salvando…' : editId ? 'Salvar alterações' : 'Criar item'}
              </button>
              <button className="btn-ghost" onClick={fecharForm}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabela */}
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
                  <th className="table-head">Nome</th>
                  <th className="table-head">Grupo</th>
                  <th className="table-head">Tipo</th>
                  <th className="table-head text-right">Valor Renem</th>
                  <th className="table-head">Material Tasy</th>
                  <th className="table-head">Status</th>
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
                      {it.agrupamento && (
                        <div className="text-xs text-ink-muted truncate">
                          {it.agrupamento}
                        </div>
                      )}
                      {it.cdContaContabil && (
                        <div
                          className="text-xs text-sky-700 truncate"
                          title={it.dsContaContabil ?? it.cdContaContabil}
                        >
                          Conta {it.cdContaContabil}
                        </div>
                      )}
                    </td>
                    <td className="table-cell text-ink-soft">{it.grupoNome ?? '—'}</td>
                    <td className="table-cell">
                      <span
                        className={cn(
                          'badge',
                          it.tipo === 'INSTRUMENTAL'
                            ? 'bg-violet-100 text-violet-800'
                            : 'bg-slate-100 text-slate-700',
                        )}
                      >
                        {it.tipo === 'INSTRUMENTAL' ? 'Instrumental' : 'Item'}
                      </span>
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {it.valorReferencia == null ? '—' : formatBRL(it.valorReferencia)}
                    </td>
                    <td className="table-cell">
                      {it.cdMaterialTasy ? (
                        <div className="flex items-start gap-1.5 max-w-[220px]">
                          <Link2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div
                              className="text-xs text-ink truncate"
                              title={it.dsMaterialTasy ?? ''}
                            >
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
                      <span
                        className={cn(
                          'badge',
                          it.ativo
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600',
                        )}
                      >
                        {it.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <button
                          className="btn-ghost py-1 px-2 text-xs"
                          onClick={() => abrirEdicao(it)}
                        >
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </button>
                        <button
                          className="btn-ghost py-1 px-2 text-xs"
                          disabled={toggleAtivo.isPending}
                          onClick={() => toggleAtivo.mutate(it)}
                        >
                          <Power className="w-3.5 h-3.5" /> {it.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                        <button
                          className="btn-ghost py-1 px-2 text-xs text-red-600 hover:bg-red-50"
                          disabled={excluir.isPending}
                          onClick={() => {
                            if (confirm(`Excluir o item "${it.nome}"?`)) {
                              excluir.mutate(it.id);
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
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
