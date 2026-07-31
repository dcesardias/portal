import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileDown, Filter, RotateCcw, FileText } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { Empty } from '../components/Empty';
import { MultiSelectSearch } from '../components/MultiSelectSearch';
import type { OptId } from '../components/SearchableSelect';
import { useCatalog } from '../hooks/useCatalog';
import { usePermissions } from '../hooks/usePermissions';
import { formatBRL, formatDate, formatDateTime } from '../lib/utils';

type Situacao = 'PENDENTE' | 'APROVADO' | 'REPROVADO' | 'REVISAO';

type Row = {
  id: string;
  numero: number;
  dtSolicitacao: string;
  status: string;
  situacao: Situacao;
  decisaoData: string | null;
  decisaoJustificativa: string | null;
  etapaAtual: string | null;
  solicitanteNome: string;
  estabelecimentoId: number;
  grupoId: number;
  tipo: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  dataPrevista: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  EM_APROVACAO: 'Em aprovação',
  APROVACAO_INICIAL: 'Aprovação inicial',
  APROVADO: 'Aprovação final',
  REPROVADO: 'Reprovado',
  EM_REVISAO: 'Em revisão',
  CANCELADO: 'Cancelado',
};

const SITUACAO: Record<Situacao, { label: string; badge: string; pdf: string }> = {
  PENDENTE: { label: 'Pendente p/ mim', badge: 'bg-amber-100 text-amber-800', pdf: '#92400e|#fef3c7' },
  APROVADO: { label: 'Aprovado', badge: 'bg-emerald-100 text-emerald-800', pdf: '#065f46|#d1fae5' },
  REPROVADO: { label: 'Reprovado', badge: 'bg-red-100 text-red-700', pdf: '#991b1b|#fee2e2' },
  REVISAO: { label: 'Devolvido p/ revisão', badge: 'bg-orange-100 text-orange-800', pdf: '#9a3412|#ffedd5' },
};

const TIPO_LABEL: Record<string, string> = { ITEM: 'Item', INSTRUMENTAL: 'Instrumental', OBRA: 'Obra' };

const FILTROS_VAZIOS = {
  situacoes: [] as OptId[],
  grupoIds: [] as OptId[],
  q: '',
  dataDe: '',
  dataAte: '',
};

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function AprovadorRelatorioPage() {
  const navigate = useNavigate();
  const cat = useCatalog();
  const { me } = usePermissions();
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);

  const estabById = useMemo(
    () => new Map(cat.estabelecimentos.map((e) => [e.id, e.nome])),
    [cat.estabelecimentos],
  );
  const grupoById = useMemo(() => new Map(cat.grupos.map((g) => [g.id, g.nome])), [cat.grupos]);

  const params = {
    situacao: filtros.situacoes.length ? filtros.situacoes.join(',') : undefined,
    grupoId: filtros.grupoIds.length ? filtros.grupoIds.join(',') : undefined,
    q: filtros.q.trim() || undefined,
    dataDe: filtros.dataDe || undefined,
    dataAte: filtros.dataAte || undefined,
  };

  const { data, isLoading } = useQuery<{ total: number; itens: Row[] }>({
    queryKey: ['aprovacoes', 'relatorio', params],
    queryFn: () => api.get('/aprovacoes/relatorio', { params }).then((r) => r.data),
  });

  const rows = data?.itens ?? [];
  const set = (patch: Partial<typeof FILTROS_VAZIOS>) => setFiltros((f) => ({ ...f, ...patch }));

  const totais = useMemo(() => {
    const valor = rows.reduce((s, r) => s + r.valorTotal, 0);
    const porSit = { PENDENTE: 0, APROVADO: 0, REPROVADO: 0, REVISAO: 0 } as Record<Situacao, number>;
    for (const r of rows) porSit[r.situacao]++;
    return { valor, porSit };
  }, [rows]);

  function baixarPdf() {
    if (rows.length === 0) return;
    const hoje = new Date();
    const filtroChips = [
      filtros.situacoes.length &&
        `Situação: ${filtros.situacoes.map((s) => SITUACAO[s as Situacao]?.label ?? s).join(', ')}`,
      filtros.grupoIds.length &&
        `Grupo: ${filtros.grupoIds.map((g) => grupoById.get(Number(g)) ?? g).join(', ')}`,
      filtros.q.trim() && `Busca: “${filtros.q.trim()}”`,
      filtros.dataDe && `De: ${formatDate(filtros.dataDe)}`,
      filtros.dataAte && `Até: ${formatDate(filtros.dataAte)}`,
    ].filter(Boolean) as string[];

    const linhas = rows
      .map((r) => {
        const [fg, bg] = SITUACAO[r.situacao].pdf.split('|');
        return `<tr>
          <td class="num">#${String(r.numero).padStart(5, '0')}</td>
          <td>${esc(formatDate(r.dtSolicitacao))}</td>
          <td>${esc(r.solicitanteNome)}</td>
          <td>${esc(estabById.get(r.estabelecimentoId) ?? '—')}</td>
          <td>${esc(grupoById.get(r.grupoId) ?? '—')}</td>
          <td class="desc">${esc(r.descricao)}<span class="tipo">${esc(TIPO_LABEL[r.tipo] ?? r.tipo)}</span></td>
          <td class="right">${r.quantidade}</td>
          <td class="right">${esc(formatBRL(r.valorUnitario))}</td>
          <td class="right strong">${esc(formatBRL(r.valorTotal))}</td>
          <td><span class="pill" style="color:${fg};background:${bg}">${esc(SITUACAO[r.situacao].label)}</span></td>
          <td>${esc(STATUS_LABEL[r.status] ?? r.status)}</td>
        </tr>`;
      })
      .join('');

    const resumoChips = [
      `${rows.length} itens`,
      `Total ${formatBRL(totais.valor)}`,
      totais.porSit.PENDENTE ? `${totais.porSit.PENDENTE} pendentes` : '',
      totais.porSit.APROVADO ? `${totais.porSit.APROVADO} aprovados` : '',
      totais.porSit.REPROVADO ? `${totais.porSit.REPROVADO} reprovados` : '',
      totais.porSit.REVISAO ? `${totais.porSit.REVISAO} devolvidos` : '',
    ]
      .filter(Boolean)
      .map((t) => `<span class="chip">${esc(t)}</span>`)
      .join('');

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Relatório de Aprovações</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1f2430; margin: 0; }
        .head { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #c01f1c; padding-bottom: 12px; }
        .mark { width: 42px; height: 42px; border-radius: 10px; background: #a01a18; color: #fff;
                display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; }
        .head h1 { font-size: 18px; margin: 0; color: #831a18; }
        .head .sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
        .meta { margin-left: auto; text-align: right; font-size: 10px; color: #6b7280; }
        .chips { margin: 12px 0 4px; }
        .chip { display: inline-block; font-size: 10px; font-weight: 600; color: #831a18;
                background: #fbe4e2; border: 1px solid #f5c6c2; border-radius: 999px; padding: 3px 9px; margin: 0 6px 6px 0; }
        .filtros { font-size: 10px; color: #6b7280; margin-bottom: 8px; }
        .filtros b { color: #374151; }
        table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
        thead th { background: #831a18; color: #fff; text-align: left; padding: 6px 7px; font-weight: 600;
                   text-transform: uppercase; letter-spacing: .3px; font-size: 8.5px; }
        tbody td { padding: 5px 7px; border-bottom: 1px solid #eceff3; vertical-align: top; }
        tbody tr:nth-child(even) { background: #faf6f6; }
        .right { text-align: right; white-space: nowrap; }
        .num { color: #a01a18; font-weight: 700; white-space: nowrap; }
        .strong { font-weight: 700; }
        .desc { max-width: 260px; }
        .tipo { display: block; font-size: 8px; color: #9aa1ac; text-transform: uppercase; margin-top: 1px; }
        .pill { display: inline-block; font-size: 8.5px; font-weight: 700; border-radius: 999px; padding: 2px 8px; white-space: nowrap; }
        tfoot td { padding: 8px 7px; font-weight: 700; border-top: 2px solid #c01f1c; font-size: 10px; }
        .foot { margin-top: 12px; font-size: 9px; color: #9aa1ac; text-align: center; }
      </style></head><body>
      <div class="head">
        <div class="mark">A</div>
        <div>
          <h1>Relatório de Aprovações</h1>
          <div class="sub">AACD Investe — Solicitação de investimentos</div>
        </div>
        <div class="meta">
          Aprovador: <b>${esc(me?.nome ?? me?.login ?? '—')}</b><br>
          Gerado em ${esc(formatDateTime(hoje.toISOString()))}
        </div>
      </div>
      <div class="chips">${resumoChips}</div>
      ${filtroChips.length ? `<div class="filtros"><b>Filtros:</b> ${esc(filtroChips.join('  ·  '))}</div>` : ''}
      <table>
        <thead><tr>
          <th>Nº</th><th>Data</th><th>Solicitante</th><th>Estabelecimento</th><th>Grupo</th>
          <th>Item</th><th class="right">Qtd</th><th class="right">V. Unit.</th><th class="right">Total</th>
          <th>Minha situação</th><th>Status atual</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr>
          <td colspan="8" class="right">Total geral</td>
          <td class="right">${esc(formatBRL(totais.valor))}</td>
          <td colspan="2"></td>
        </tr></tfoot>
      </table>
      <div class="foot">AACD Investe · Relatório gerado automaticamente · ${esc(formatDate(hoje.toISOString()))}</div>
      <script>window.onload = function(){ window.focus(); window.print(); }</script>
      </body></html>`;

    const win = window.open('', '_blank');
    if (!win) {
      alert('Permita pop-ups para gerar o PDF (o relatório abre em uma nova aba para impressão).');
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  return (
    <>
      <PageHeader
        title="Relatório de Aprovações"
        subtitle="Solicitações da sua alçada — pendentes e o que você já decidiu"
      />

      {/* Filtros */}
      <div className="card mb-4">
        <div className="card-body space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-soft">
            <Filter className="w-4 h-4" /> Filtros
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="label">Situação</label>
              <MultiSelectSearch
                value={filtros.situacoes}
                options={[
                  { id: 'PENDENTE', label: 'Pendentes p/ mim' },
                  { id: 'APROVADO', label: 'Aprovadas por mim' },
                  { id: 'REPROVADO', label: 'Reprovadas por mim' },
                  { id: 'REVISAO', label: 'Devolvidas p/ revisão' },
                ]}
                onChange={(v) => set({ situacoes: v })}
              />
            </div>
            <div>
              <label className="label">Grupo</label>
              <MultiSelectSearch
                value={filtros.grupoIds}
                options={cat.grupos.map((g) => ({ id: g.id, label: g.nome }))}
                onChange={(v) => set({ grupoIds: v })}
              />
            </div>
            <div>
              <label className="label">Busca (nº, projeto, solicitante)</label>
              <input
                className="input"
                value={filtros.q}
                onChange={(e) => set({ q: e.target.value })}
                placeholder="Ex.: 142, reforma, joão"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">De</label>
                <input
                  type="date"
                  className="input"
                  value={filtros.dataDe}
                  onChange={(e) => set({ dataDe: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Até</label>
                <input
                  type="date"
                  className="input"
                  value={filtros.dataAte}
                  onChange={(e) => set({ dataAte: e.target.value })}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn-ghost" onClick={() => setFiltros(FILTROS_VAZIOS)}>
              <RotateCcw className="w-4 h-4" /> Limpar filtros
            </button>
          </div>
        </div>
      </div>

      {/* Barra: total + PDF */}
      <div className="card mb-4">
        <div className="card-body flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-ink-soft flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <strong className="text-ink">{rows.length}</strong> item(ns)
            </span>
            <span>
              Total <strong className="text-ink tabular-nums">{formatBRL(totais.valor)}</strong>
            </span>
            {totais.porSit.PENDENTE > 0 && (
              <span className="text-amber-700">{totais.porSit.PENDENTE} pendentes</span>
            )}
          </div>
          <button className="btn-primary" onClick={baixarPdf} disabled={rows.length === 0}>
            <FileDown className="w-4 h-4" /> Baixar PDF
          </button>
        </div>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>
      ) : rows.length === 0 ? (
        <Empty
          icon={FileText}
          title="Nada por aqui"
          description="Nenhuma solicitação na sua alçada — nem pendente, nem decidida por você — com esses filtros."
        />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="table-head">Nº</th>
                  <th className="table-head">Data</th>
                  <th className="table-head">Solicitante</th>
                  <th className="table-head">Estabelecimento</th>
                  <th className="table-head">Grupo</th>
                  <th className="table-head">Item</th>
                  <th className="table-head text-right">Qtd</th>
                  <th className="table-head text-right">V. Unit.</th>
                  <th className="table-head text-right">Total</th>
                  <th className="table-head">Minha situação</th>
                  <th className="table-head">Status atual</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.id}-${i}`}
                    className="table-row cursor-pointer hover:bg-surface-alt transition"
                    onClick={() => navigate(`/solicitacoes/${r.id}`)}
                  >
                    <td className="table-cell font-medium text-brand-700">
                      #{String(r.numero).padStart(5, '0')}
                    </td>
                    <td className="table-cell text-xs text-ink-soft">{formatDate(r.dtSolicitacao)}</td>
                    <td className="table-cell">{r.solicitanteNome}</td>
                    <td className="table-cell text-ink-soft">{estabById.get(r.estabelecimentoId) ?? '—'}</td>
                    <td className="table-cell text-xs text-ink-soft max-w-[12rem] truncate">
                      {grupoById.get(r.grupoId) ?? '—'}
                    </td>
                    <td className="table-cell max-w-[20rem] truncate" title={r.descricao}>
                      {r.descricao}
                    </td>
                    <td className="table-cell text-right tabular-nums">{r.quantidade}</td>
                    <td className="table-cell text-right tabular-nums">{formatBRL(r.valorUnitario)}</td>
                    <td className="table-cell text-right tabular-nums font-medium">
                      {formatBRL(r.valorTotal)}
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${SITUACAO[r.situacao].badge}`}>
                        {SITUACAO[r.situacao].label}
                      </span>
                    </td>
                    <td className="table-cell text-xs">{STATUS_LABEL[r.status] ?? r.status}</td>
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
