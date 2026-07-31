import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { useCatalog } from '../../hooks/useCatalog';
import { Empty } from '../../components/Empty';
import { SearchableSelect } from '../../components/SearchableSelect';
import { formatBRL, formatDate } from '../../lib/utils';

type Candidato = {
  solicitacaoId: string;
  itemId: string;
  numero: number;
  descricao: string;
  grupoNome: string | null;
  solicitanteId: string;
  solicitanteNome: string | null;
  estabelecimentoId: number;
  unidadeNegocioId: number;
  dtSolicitacaoOriginal: string;
  dataPrevistaOriginal: string | null;
  quantidade: number;
  valorTotal: number;
};

type Usuario = { id: string; nome: string; login: string; ativo?: boolean };

type Edit = { solicitanteId: string; dataOriginal: string; novaData: string };

const ANO_BASE = new Date().getFullYear();
const ANOS = [ANO_BASE - 1, ANO_BASE, ANO_BASE + 1];

const iso = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : '');
function maisUmAno(d: string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  dt.setUTCFullYear(dt.getUTCFullYear() + 1);
  return dt.toISOString().slice(0, 10);
}

function apiErro(e: unknown): string {
  return (
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    'Ocorreu um erro. Tente novamente.'
  );
}

export function AdminCarryoverPanel() {
  const qc = useQueryClient();
  const cat = useCatalog();
  const [ano, setAno] = useState(ANO_BASE);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [resultado, setResultado] = useState<{ sucesso: number; falhas: number } | null>(null);

  const estabById = useMemo(
    () => new Map(cat.estabelecimentos.map((e) => [e.id, e.nome])),
    [cat.estabelecimentos],
  );

  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ['admin', 'usuarios'],
    queryFn: () => api.get('/admin/usuarios').then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  const userOptions = usuarios
    .filter((u) => u.ativo !== false)
    .map((u) => ({ id: u.id, label: `${u.nome} (${u.login})` }));

  const { data: candidatos = [], isLoading } = useQuery<Candidato[]>({
    queryKey: ['admin', 'carryover', ano],
    queryFn: () =>
      api.get('/admin/solicitacoes/carryover/candidatos', { params: { ano } }).then((r) => r.data),
  });

  // Semeia os campos editáveis (solicitante e datas) ao carregar os candidatos.
  useEffect(() => {
    const next: Record<string, Edit> = {};
    for (const c of candidatos) {
      next[c.itemId] = {
        solicitanteId: c.solicitanteId,
        dataOriginal: iso(c.dtSolicitacaoOriginal),
        novaData: maisUmAno(c.dataPrevistaOriginal),
      };
    }
    setEdits(next);
    setSel(new Set());
    setResultado(null);
  }, [candidatos]);

  function patch(itemId: string, p: Partial<Edit>) {
    setEdits((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...p } }));
  }
  function toggle(itemId: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(itemId)) n.delete(itemId);
      else n.add(itemId);
      return n;
    });
  }
  const todosSelecionados = candidatos.length > 0 && candidatos.every((c) => sel.has(c.itemId));

  const gerar = useMutation({
    mutationFn: () => {
      const itens = [...sel]
        .map((itemId) => {
          const c = candidatos.find((x) => x.itemId === itemId)!;
          const e = edits[itemId];
          return {
            solicitacaoId: c.solicitacaoId,
            itemId,
            solicitanteId: e.solicitanteId,
            dataOriginal: e.dataOriginal,
            novaDataExecucao: e.novaData,
          };
        })
        .filter((i) => i.solicitanteId && i.dataOriginal && i.novaDataExecucao);
      return api.post('/admin/solicitacoes/carryover', { itens }).then((r) => r.data);
    },
    onSuccess: (res: { sucesso: number; falhas: number }) => {
      setResultado(res);
      qc.invalidateQueries({ queryKey: ['admin', 'carryover'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => alert(apiErro(e)),
  });

  const selecionadosValidos = [...sel].filter((id) => {
    const e = edits[id];
    return e && e.solicitanteId && e.dataOriginal && e.novaData;
  });

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
        <div className="w-full sm:w-40">
          <label className="label">Ano previsto (origem)</label>
          <select className="input" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {ANOS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="text-sm text-ink-soft sm:pb-2">
          Itens aprovados com data prevista em <b>{ano}</b>, ainda não prorrogados. Ajuste
          solicitante e datas e gere o carryover para o ano seguinte.
        </div>
        <div className="flex-1" />
        <button
          className="btn-success whitespace-nowrap"
          disabled={selecionadosValidos.length === 0 || gerar.isPending}
          onClick={() => gerar.mutate()}
        >
          <Send className="w-4 h-4" />{' '}
          {gerar.isPending
            ? 'Gerando…'
            : `Gerar carryover (${selecionadosValidos.length})`}
        </button>
      </div>

      {resultado && (
        <div className="card card-body mb-4 text-sm">
          <b className="text-emerald-700">{resultado.sucesso}</b> carryover(s) criado(s).
          {resultado.falhas > 0 && (
            <span className="text-amber-700"> {resultado.falhas} falharam (veja regras/itens já prorrogados).</span>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>
      ) : candidatos.length === 0 ? (
        <Empty
          icon={CalendarPlus}
          title="Nenhum item para prorrogar"
          description={`Não há itens aprovados com data prevista em ${ano} pendentes de carryover.`}
        />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="table-head w-8">
                    <input
                      type="checkbox"
                      checked={todosSelecionados}
                      onChange={(e) =>
                        setSel(e.target.checked ? new Set(candidatos.map((c) => c.itemId)) : new Set())
                      }
                    />
                  </th>
                  <th className="table-head">Nº</th>
                  <th className="table-head">Item</th>
                  <th className="table-head">Estab.</th>
                  <th className="table-head text-right">Valor</th>
                  <th className="table-head w-56">Solicitante</th>
                  <th className="table-head">Data original</th>
                  <th className="table-head">Nova data execução</th>
                </tr>
              </thead>
              <tbody>
                {candidatos.map((c) => {
                  const e = edits[c.itemId] ?? { solicitanteId: '', dataOriginal: '', novaData: '' };
                  const marcada = sel.has(c.itemId);
                  return (
                    <tr key={c.itemId} className="table-row align-middle">
                      <td className="table-cell">
                        <input type="checkbox" checked={marcada} onChange={() => toggle(c.itemId)} />
                      </td>
                      <td className="table-cell font-medium text-brand-700">
                        #{String(c.numero).padStart(5, '0')}
                      </td>
                      <td className="table-cell max-w-[18rem]">
                        <div className="truncate" title={c.descricao}>
                          {c.descricao}
                        </div>
                        <div className="text-xs text-ink-muted">
                          {c.grupoNome ?? '—'} · prev. {c.dataPrevistaOriginal ? formatDate(c.dataPrevistaOriginal) : '—'}
                        </div>
                      </td>
                      <td className="table-cell text-xs text-ink-soft">
                        {estabById.get(c.estabelecimentoId) ?? '—'}
                      </td>
                      <td className="table-cell text-right tabular-nums">{formatBRL(c.valorTotal)}</td>
                      <td className="table-cell">
                        <SearchableSelect
                          value={e.solicitanteId || null}
                          options={userOptions}
                          onChange={(id) => patch(c.itemId, { solicitanteId: id ? String(id) : '' })}
                          placeholder="Solicitante"
                        />
                      </td>
                      <td className="table-cell">
                        <input
                          type="date"
                          className="input py-1 w-40"
                          value={e.dataOriginal}
                          onChange={(ev) => patch(c.itemId, { dataOriginal: ev.target.value })}
                        />
                      </td>
                      <td className="table-cell">
                        <input
                          type="date"
                          className="input py-1 w-40"
                          value={e.novaData}
                          onChange={(ev) => patch(c.itemId, { novaData: ev.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
