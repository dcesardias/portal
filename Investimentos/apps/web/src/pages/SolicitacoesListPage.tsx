import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FilePlus2, Search, Files, Send } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { Empty } from '../components/Empty';
import { MultiSelectSearch } from '../components/MultiSelectSearch';
import type { OptId } from '../components/SearchableSelect';
import { formatBRL, formatDateTime } from '../lib/utils';
import { usePermissions } from '../hooks/usePermissions';
import { PageTour } from '../components/PageTour';
import type { TourStep } from '../components/GuidedTour';
import type { SolicitacaoStatus } from '@investimentos/shared';

type Row = {
  id: string;
  numero: string;
  status: SolicitacaoStatus;
  criadaEm: string;
  criadaPor: string;
  etapaAtual: string | null;
  centroCustoCodigo: string;
  tipoVerba: 'RP' | 'VP' | null;
  projeto: string | null;
  itens: { quantidade: number; valorUnitario: number }[];
};

type ResultadoLote = {
  enviadas: number;
  falhas: number;
  resultados: Array<{ id: string; numero: string | number | null; ok: boolean; erro?: string }>;
};

const statusOptions: { value: SolicitacaoStatus; label: string }[] = [
  { value: 'RASCUNHO', label: 'Rascunho' },
  { value: 'EM_APROVACAO', label: 'Em aprovação' },
  { value: 'APROVACAO_INICIAL', label: 'Aprovação inicial' },
  { value: 'EM_REVISAO', label: 'Em revisão' },
  { value: 'APROVADO', label: 'Aprovação final' },
  { value: 'REPROVADO', label: 'Reprovadas' },
  { value: 'CANCELADO', label: 'Canceladas' },
];

export function SolicitacoesListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { simulando } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status') as SolicitacaoStatus | null;
  const [fStatus, setFStatus] = useState<OptId[]>(statusParam ? [statusParam] : []);
  const [search, setSearch] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [resultado, setResultado] = useState<ResultadoLote | null>(null);

  function onChangeStatus(vals: OptId[]) {
    setFStatus(vals);
    setSelecionados(new Set());
    setResultado(null);
    setSearchParams(vals.length === 1 ? { status: String(vals[0]) } : {});
  }

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ['minhas'],
    queryFn: () => api.get('/solicitacoes/minhas').then((r) => r.data),
  });

  const filtered = rows
    .filter((r) => fStatus.length === 0 || fStatus.includes(r.status))
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.numero.toLowerCase().includes(q) ||
        r.criadaPor.toLowerCase().includes(q) ||
        (r.projeto ?? '').toLowerCase().includes(q)
      );
    });

  const rascunhosVisiveis = filtered.filter((r) => r.status === 'RASCUNHO');
  const todosRascunhosSelecionados =
    rascunhosVisiveis.length > 0 && rascunhosVisiveis.every((r) => selecionados.has(r.id));
  // Um rascunho selecionado pode ficar oculto depois que o usuário muda a busca
  // (o filtro de status já limpa a seleção) — o envio e a contagem do botão
  // consideram só o que está VISÍVEL agora, nunca o que ficou escondido.
  const idsSelecionadosVisiveis = rascunhosVisiveis
    .filter((r) => selecionados.has(r.id))
    .map((r) => r.id);

  function toggleSelecionado(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTodosRascunhos() {
    setSelecionados((prev) => {
      if (todosRascunhosSelecionados) {
        const next = new Set(prev);
        rascunhosVisiveis.forEach((r) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      rascunhosVisiveis.forEach((r) => next.add(r.id));
      return next;
    });
  }

  const enviarLote = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<ResultadoLote>('/solicitacoes/enviar-lote', { ids }).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries();
      setSelecionados(new Set());
      setResultado(data);
    },
  });

  const tourSteps: TourStep[] = [
    {
      title: 'Minhas Solicitações 📁',
      body: 'Aqui ficam todas as solicitações que você criou ou acompanha. Veja rapidamente o que dá para fazer nesta tela.',
    },
    {
      target: '[data-tour="lista-nova"]',
      title: 'Nova solicitação',
      body: 'Cria uma nova solicitação do zero, no fluxo guiado de 3 etapas.',
    },
    {
      target: '[data-tour="lista-busca"]',
      title: 'Buscar',
      body: 'Filtre a lista por número, nome do projeto ou solicitante.',
    },
    {
      target: '[data-tour="lista-status"]',
      title: 'Filtrar por status',
      body: 'Mostre só rascunhos, em aprovação, aprovadas, reprovadas… Útil para focar no que precisa de ação.',
    },
    {
      title: 'Enviar rascunhos em lote',
      body: 'Rascunhos têm uma caixinha de seleção. Marque um ou vários e use “Enviar selecionados” para mandar tudo de uma vez para aprovação.',
    },
    {
      target: '[data-tour="lista-tabela"]',
      title: 'Sua lista',
      body: 'Clique em qualquer linha para abrir os detalhes da solicitação. A coluna Status mostra em que etapa cada pedido está.',
    },
  ];

  return (
    <>
      <PageTour pageKey="solicitacoes" steps={tourSteps} />
      <PageHeader
        title="Minhas Solicitações"
        subtitle="Todas as solicitações que você criou ou está acompanhando"
        actions={
          simulando ? (
            <span
              data-tour="lista-nova"
              className="btn-primary opacity-50 cursor-not-allowed"
              title="Indisponível durante a simulação"
            >
              <FilePlus2 className="w-4 h-4" /> Nova solicitação
            </span>
          ) : (
            <Link to="/solicitacoes/nova" data-tour="lista-nova" className="btn-primary">
              <FilePlus2 className="w-4 h-4" /> Nova solicitação
            </Link>
          )
        }
      />

      <div className="card mb-4">
        <div className="card-body flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              data-tour="lista-busca"
              className="input pl-9"
              placeholder="Buscar por número, projeto ou solicitante…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div data-tour="lista-status" className="w-full sm:max-w-xs">
            <MultiSelectSearch
              value={fStatus}
              options={statusOptions.map((o) => ({ id: o.value, label: o.label }))}
              onChange={onChangeStatus}
              placeholder="Todos os status"
            />
          </div>
        </div>
      </div>

      {idsSelecionadosVisiveis.length > 0 && (
        <div className="card mb-4 border-brand-200">
          <div className="card-body flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-ink">
              {idsSelecionadosVisiveis.length} rascunho{idsSelecionadosVisiveis.length > 1 ? 's' : ''}{' '}
              selecionado{idsSelecionadosVisiveis.length > 1 ? 's' : ''}
            </span>
            <button
              className="btn-primary"
              disabled={enviarLote.isPending || simulando}
              title={simulando ? 'Indisponível durante a simulação' : undefined}
              onClick={() => enviarLote.mutate(idsSelecionadosVisiveis)}
            >
              <Send className="w-4 h-4" />
              {enviarLote.isPending
                ? 'Enviando…'
                : `Enviar selecionados (${idsSelecionadosVisiveis.length})`}
            </button>
          </div>
          {enviarLote.isError && (
            <div className="card-body pt-0 text-sm text-red-700">
              Não foi possível concluir o envio. Tente de novo.
            </div>
          )}
        </div>
      )}

      {resultado && (
        <div
          className={`card mb-4 ${resultado.falhas > 0 ? 'border-amber-200' : 'border-emerald-200'}`}
        >
          <div className="card-body text-sm space-y-2">
            <div className={resultado.falhas > 0 ? 'text-amber-800' : 'text-emerald-800'}>
              {resultado.enviadas} enviada{resultado.enviadas !== 1 ? 's' : ''} · {resultado.falhas}{' '}
              falhou{resultado.falhas !== 1 ? 'ram' : ''}
            </div>
            {resultado.falhas > 0 && (
              <ul className="text-ink-soft list-disc pl-5 space-y-0.5">
                {resultado.resultados
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li key={r.id}>
                      {r.numero ?? r.id} — {r.erro}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>
      ) : filtered.length === 0 ? (
        <Empty
          icon={Files}
          title="Nenhuma solicitação encontrada"
          description="Ajuste os filtros ou crie uma nova solicitação."
          action={
            simulando ? undefined : (
              <Link to="/solicitacoes/nova" className="btn-primary">
                <FilePlus2 className="w-4 h-4" /> Criar solicitação
              </Link>
            )
          }
        />
      ) : (
        <div data-tour="lista-tabela" className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="table-head w-10">
                    {rascunhosVisiveis.length > 0 && (
                      <input
                        type="checkbox"
                        checked={todosRascunhosSelecionados}
                        onChange={toggleTodosRascunhos}
                        aria-label="Selecionar todos os rascunhos visíveis"
                      />
                    )}
                  </th>
                  <th className="table-head">Número</th>
                  <th className="table-head">Criada em</th>
                  <th className="table-head">Solicitante</th>
                  <th className="table-head">CC</th>
                  <th className="table-head">Verba</th>
                  <th className="table-head">Etapa</th>
                  <th className="table-head text-right">Valor</th>
                  <th className="table-head">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="table-row cursor-pointer hover:bg-surface-alt transition"
                    onClick={() => navigate(`/solicitacoes/${r.id}`)}
                  >
                    <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                      {r.status === 'RASCUNHO' && (
                        <input
                          type="checkbox"
                          checked={selecionados.has(r.id)}
                          onChange={() => toggleSelecionado(r.id)}
                          aria-label={`Selecionar ${r.numero}`}
                        />
                      )}
                    </td>
                    <td className="table-cell font-medium text-brand-700">{r.numero}</td>
                    <td className="table-cell text-ink-soft">{formatDateTime(r.criadaEm)}</td>
                    <td className="table-cell">{r.criadaPor}</td>
                    <td className="table-cell font-mono text-xs">{r.centroCustoCodigo}</td>
                    <td className="table-cell">
                      {r.tipoVerba ? (
                        <span
                          className={`badge ${
                            r.tipoVerba === 'RP'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-violet-100 text-violet-800'
                          }`}
                        >
                          {r.tipoVerba}
                        </span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="table-cell text-ink-soft">{r.etapaAtual ?? '—'}</td>
                    <td className="table-cell text-right tabular-nums">
                      {formatBRL(r.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0))}
                    </td>
                    <td className="table-cell">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
