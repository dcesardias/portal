import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, Check, Filter } from 'lucide-react';
import { api } from '../../lib/api';
import { useCatalog } from '../../hooks/useCatalog';
import { Empty } from '../../components/Empty';
import { MultiSelectSearch } from '../../components/MultiSelectSearch';
import type { OptId } from '../../components/SearchableSelect';
import { formatBRL, formatDate, cn } from '../../lib/utils';

type Row = {
  id: string;
  numero: number;
  solicitanteNome: string;
  solicitanteLogin: string;
  estabelecimentoNome: string;
  status: string;
  tipoVerba: 'RP' | 'VP' | null;
  dtSolicitacao: string;
  valorTotal: number;
  tipos: string[];
};

const STATUSES = [
  'RASCUNHO',
  'EM_APROVACAO',
  'APROVACAO_INICIAL',
  'APROVADO',
  'REPROVADO',
  'EM_REVISAO',
  'CANCELADO',
];
const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  EM_APROVACAO: 'Em aprovação',
  APROVACAO_INICIAL: 'Aprovação inicial',
  APROVADO: 'Aprovação final',
  REPROVADO: 'Reprovado',
  EM_REVISAO: 'Em revisão',
  CANCELADO: 'Cancelado',
};
const TIPOS = [
  { v: 'ITEM', l: 'Itens' },
  { v: 'INSTRUMENTAL', l: 'Instrumentais' },
  { v: 'OBRA', l: 'Obras' },
];

export function AdminVerbaPanel() {
  const qc = useQueryClient();
  const cat = useCatalog();

  const [filtros, setFiltros] = useState({
    estabelecimentoIds: [] as OptId[],
    grupoIds: [] as OptId[],
    tipos: [] as OptId[],
    status: [] as OptId[],
    verba: [] as OptId[],
  });
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [alvo, setAlvo] = useState<'RP' | 'VP' | 'SEM'>('RP');

  const csv = (a: OptId[]) => (a.length ? a.join(',') : undefined);
  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ['admin', 'solicitacoes', filtros],
    queryFn: () =>
      api
        .get('/admin/solicitacoes', {
          params: {
            estabelecimentoId: csv(filtros.estabelecimentoIds),
            grupoId: csv(filtros.grupoIds),
            tipo: csv(filtros.tipos),
            status: csv(filtros.status),
            verba: csv(filtros.verba),
          },
        })
        .then((r) => r.data),
  });

  const aplicar = useMutation({
    mutationFn: () =>
      api.put('/admin/solicitacoes/verba', {
        ids: [...selecionados],
        tipoVerba: alvo === 'SEM' ? null : alvo,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'solicitacoes'] });
      setSelecionados(new Set());
    },
  });

  const todosMarcados = rows.length > 0 && rows.every((r) => selecionados.has(r.id));
  function toggleTodos() {
    setSelecionados(todosMarcados ? new Set() : new Set(rows.map((r) => r.id)));
  }
  function toggle(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const gruposLabel = useMemo(
    () => new Map(cat.grupos.map((g) => [g.id, g.nome])),
    [cat.grupos],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-50 border border-brand-100">
        <Wallet className="w-5 h-5 text-brand-700 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-ink">
          O <strong>tipo de verba</strong> (RP — Recursos Próprios / VP — Verba de Projeto) é definido
          aqui pela administração, não pelo solicitante. Filtre as solicitações, marque as desejadas e
          aplique a verba em lote.
        </p>
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="card-body">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-ink-soft">
            <Filter className="w-4 h-4" /> Filtros
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="label">Estabelecimento</label>
              <MultiSelectSearch
                value={filtros.estabelecimentoIds}
                options={cat.estabelecimentos.map((e) => ({ id: e.id, label: e.nome }))}
                onChange={(v) => setFiltros((f) => ({ ...f, estabelecimentoIds: v }))}
              />
            </div>
            <div>
              <label className="label">Grupo</label>
              <MultiSelectSearch
                value={filtros.grupoIds}
                options={cat.grupos.map((g) => ({ id: g.id, label: g.nome }))}
                onChange={(v) => setFiltros((f) => ({ ...f, grupoIds: v }))}
              />
            </div>
            <div>
              <label className="label">Tipo</label>
              <MultiSelectSearch
                value={filtros.tipos}
                options={TIPOS.map((t) => ({ id: t.v, label: t.l }))}
                onChange={(v) => setFiltros((f) => ({ ...f, tipos: v }))}
              />
            </div>
            <div>
              <label className="label">Status</label>
              <MultiSelectSearch
                value={filtros.status}
                options={STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s] ?? s }))}
                onChange={(v) => setFiltros((f) => ({ ...f, status: v }))}
              />
            </div>
            <div>
              <label className="label">Situação da verba</label>
              <MultiSelectSearch
                value={filtros.verba}
                options={[
                  { id: 'SEM', label: 'Sem verba definida' },
                  { id: 'RP', label: 'RP' },
                  { id: 'VP', label: 'VP' },
                ]}
                onChange={(v) => setFiltros((f) => ({ ...f, verba: v }))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Barra de ação em lote */}
      <div className="card">
        <div className="card-body flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="text-sm text-ink-soft">
            <strong className="text-ink">{selecionados.size}</strong> selecionada(s) de {rows.length}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-surface-border overflow-hidden">
              {(['RP', 'VP', 'SEM'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setAlvo(v)}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium transition',
                    alvo === v ? 'bg-brand text-white' : 'bg-white text-ink hover:bg-surface-alt',
                  )}
                >
                  {v === 'SEM' ? 'Limpar' : v}
                </button>
              ))}
            </div>
            <button
              className="btn-primary"
              disabled={selecionados.size === 0 || aplicar.isPending}
              onClick={() => aplicar.mutate()}
            >
              <Check className="w-4 h-4" />
              {aplicar.isPending ? 'Aplicando…' : 'Aplicar aos selecionados'}
            </button>
          </div>
        </div>
        {aplicar.data && (
          <div className="px-4 pb-3 text-sm text-emerald-700">
            {(aplicar.data as { data: { atualizadas: number } }).data.atualizadas} solicitação(ões)
            atualizada(s).
          </div>
        )}
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>
      ) : rows.length === 0 ? (
        <Empty icon={Wallet} title="Nenhuma solicitação" description="Ajuste os filtros acima." />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="table-head w-10">
                    <input type="checkbox" checked={todosMarcados} onChange={toggleTodos} />
                  </th>
                  <th className="table-head">Nº</th>
                  <th className="table-head">Solicitante</th>
                  <th className="table-head">Estabelecimento</th>
                  <th className="table-head">Tipo</th>
                  <th className="table-head">Status</th>
                  <th className="table-head text-right">Valor</th>
                  <th className="table-head">Verba</th>
                  <th className="table-head">Data</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={cn('table-row cursor-pointer', selecionados.has(r.id) && 'bg-brand-50')}
                    onClick={() => toggle(r.id)}
                  >
                    <td className="table-cell">
                      <input
                        type="checkbox"
                        checked={selecionados.has(r.id)}
                        onChange={() => toggle(r.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="table-cell font-medium">#{r.numero}</td>
                    <td className="table-cell">
                      {r.solicitanteNome}
                      <div className="text-xs text-ink-soft">{r.solicitanteLogin}</div>
                    </td>
                    <td className="table-cell text-ink-soft">{r.estabelecimentoNome}</td>
                    <td className="table-cell text-xs text-ink-soft">
                      {r.tipos
                        .map((t) => (t === 'INSTRUMENTAL' ? 'Instrum.' : t === 'OBRA' ? 'Obra' : 'Item'))
                        .join(', ')}
                    </td>
                    <td className="table-cell text-xs">{r.status}</td>
                    <td className="table-cell text-right tabular-nums">{formatBRL(r.valorTotal)}</td>
                    <td className="table-cell">
                      {r.tipoVerba ? (
                        <span
                          className={cn(
                            'badge border-0',
                            r.tipoVerba === 'RP'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-violet-100 text-violet-800',
                          )}
                        >
                          {r.tipoVerba}
                        </span>
                      ) : (
                        <span className="text-ink-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="table-cell text-xs text-ink-soft">{formatDate(r.dtSolicitacao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length >= 500 && (
            <div className="px-4 py-2 text-xs text-ink-muted border-t border-surface-border">
              Mostrando as primeiras 500 solicitações — refine os filtros para ver outras.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
