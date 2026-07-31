import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Filter, RotateCcw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';
import { useCatalog } from '../../hooks/useCatalog';
import { Empty } from '../../components/Empty';
import { MultiSelectSearch } from '../../components/MultiSelectSearch';
import type { OptId } from '../../components/SearchableSelect';
import { formatBRL, formatDate, formatDateTime, formatCentroCusto } from '../../lib/utils';

// Uma linha por ITEM (solicitação repetida + item + cadastro do catálogo).
type Row = {
  // Solicitação
  id: string;
  numero: number;
  dtSolicitacao: string;
  dtRecurso: string | null;
  status: string;
  tipoVerba: 'RP' | 'VP' | null;
  projeto: string | null;
  solicitanteNome: string;
  solicitanteLogin: string;
  estabelecimentoId: number;
  unidadeNegocioId: number;
  centroCustoCodigo: string;
  etapaAtual: string | null;
  prorrogada: boolean;
  obsGF: string | null;
  obsGPE: string | null;
  validacao: string | null;
  revisaoAnual: string | null;
  // Item
  itemId: string;
  tipo: string;
  grupoId: number;
  motivoId: number;
  descricao: string;
  fabricantes: string | null;
  modelosReferencia: string | null;
  justificativa: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  dataPrevista: string | null;
  prorrogadoParaAno: number | null;
  itemProrrogado: boolean;
  justificativaPeriodo: string | null;
  publicoAlvo: string | null;
  volumePessoas: string | null;
  subtipoObra: string | null;
  subtipoObraOutros: string | null;
  escopoInicial: string | null;
  beneficiosProjeto: string | null;
  impactoRdc50: string | null;
  ieDemolicoes: boolean;
  iePiso: boolean;
  ieForro: boolean;
  ieArCondicionado: boolean;
  ieMarcenaria: boolean;
  ieCaixilhos: boolean;
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
  // Cadastro do item (catálogo)
  catalogoNome: string | null;
  agrupamento: string | null;
  classificacao: string | null;
  cdMaterialTasy: string | null;
  dsMaterialTasy: string | null;
  movimentoContabil: string | null;
  valorReferencia: number | null;
  catValorMin: number | null;
  catValorMax: number | null;
  dolarizadoRenem: boolean | null;
  idRenem: string | null;
  dsRenem: string | null;
};

type RelatorioResp = { total: number; truncado: boolean; itens: Row[] };

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  EM_APROVACAO: 'Em aprovação',
  APROVACAO_INICIAL: 'Aprovação inicial',
  APROVADO: 'Aprovação final',
  REPROVADO: 'Reprovado',
  EM_REVISAO: 'Em revisão',
  CANCELADO: 'Cancelado',
};
const TIPO_LABEL: Record<string, string> = {
  ITEM: 'Item',
  INSTRUMENTAL: 'Instrumental',
  OBRA: 'Obra',
};
const MOVIMENTO_LABEL: Record<string, string> = {
  DESPESA: 'Despesa',
  INVESTIMENTO: 'Investimento',
};
const SUBTIPO_OBRA_LABEL: Record<string, string> = {
  NOVA_CONSTRUCAO: 'Nova construção',
  REFORMA_ESTRUTURAL: 'Reforma estrutural',
  REVITALIZACAO: 'Revitalização estética e funcional',
  MANUTENCAO_CORRETIVA: 'Manutenção corretiva civil pesada',
  OUTROS: 'Outros',
};
const MANUT_PREVENTIVA_LABEL: Record<string, string> = {
  SIM_CALIBRACAO: 'Sim, exige calibração/revisão periódica',
  NAO_COMPLEXA: 'Não exige manutenção complexa',
  NAO_SEI: 'Não sei informar',
};
// Booleano -> "Sim"/"" (célula vazia quando falso, mais limpo no Excel).
const sn = (b: boolean | null | undefined) => (b ? 'Sim' : '');

const FILTROS_VAZIOS = {
  estabelecimentoIds: [] as OptId[],
  unidadeNegocioIds: [] as OptId[],
  centroCustoCodigos: [] as OptId[],
  grupoIds: [] as OptId[],
  tipos: [] as OptId[],
  status: [] as OptId[],
  verba: [] as OptId[],
  anos: [] as OptId[],
  dataDe: '',
  dataAte: '',
  valorMin: '',
  valorMax: '',
  q: '',
};

// Opções de ano-alvo (ano da data prevista). Centradas no ciclo atual.
const ANO_BASE = new Date().getFullYear();
const ANOS_OPCOES = [ANO_BASE - 1, ANO_BASE, ANO_BASE + 1, ANO_BASE + 2, ANO_BASE + 3];

export function AdminRelatorioPanel() {
  const navigate = useNavigate();
  const cat = useCatalog();
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);

  const estabById = useMemo(
    () => new Map(cat.estabelecimentos.map((e) => [e.id, e.nome])),
    [cat.estabelecimentos],
  );
  const unidadeById = useMemo(() => new Map(cat.unidades.map((u) => [u.id, u.nome])), [cat.unidades]);
  const centroByCodigo = useMemo(
    () => new Map(cat.centros.map((c) => [c.codigo, c.descricao])),
    [cat.centros],
  );
  const grupoById = useMemo(() => new Map(cat.grupos.map((g) => [g.id, g.nome])), [cat.grupos]);
  const motivoById = useMemo(() => new Map(cat.motivos.map((m) => [m.id, m.nome])), [cat.motivos]);

  const inSet = (arr: OptId[], v: OptId) => arr.length === 0 || arr.includes(v);
  const unidadesFiltradas = cat.unidades.filter((u) =>
    inSet(filtros.estabelecimentoIds, u.estabelecimentoId),
  );
  // Nomes de unidade repetem entre estabelecimentos → filtramos por NOME
  // (uma opção por nome). O centro e a query expandem o nome para os ids.
  const unidadeOptions = [...new Set(unidadesFiltradas.map((u) => u.nome))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((n) => ({ id: n, label: n }));
  const centrosFiltrados = cat.centros.filter(
    (c) =>
      filtros.unidadeNegocioIds.length === 0 ||
      filtros.unidadeNegocioIds.includes(unidadeById.get(c.unidadeId) ?? ''),
  );
  // Expande os nomes de unidade selecionados para os ids correspondentes (backend filtra por id).
  const unidadeIdsCsv = filtros.unidadeNegocioIds.length
    ? unidadesFiltradas
        .filter((u) => filtros.unidadeNegocioIds.includes(u.nome))
        .map((u) => u.id)
        .join(',') || undefined
    : undefined;

  const csv = (a: OptId[]) => (a.length ? a.join(',') : undefined);
  const params = {
    estabelecimentoId: csv(filtros.estabelecimentoIds),
    unidadeNegocioId: unidadeIdsCsv,
    centroCustoCodigo: csv(filtros.centroCustoCodigos),
    grupoId: csv(filtros.grupoIds),
    tipo: csv(filtros.tipos),
    status: csv(filtros.status),
    verba: csv(filtros.verba),
    ano: csv(filtros.anos),
    dataDe: filtros.dataDe || undefined,
    dataAte: filtros.dataAte || undefined,
    valorMin: filtros.valorMin || undefined,
    valorMax: filtros.valorMax || undefined,
    q: filtros.q.trim() || undefined,
  };

  const { data, isLoading } = useQuery<RelatorioResp>({
    queryKey: ['admin', 'relatorio', params],
    queryFn: () => api.get('/admin/solicitacoes/relatorio', { params }).then((r) => r.data),
  });

  const rows = data?.itens ?? [];
  const grupoNome = (id: number) => grupoById.get(id) ?? `#${id}`;
  const escopoObra = (r: Row) =>
    [
      r.ieDemolicoes && 'Demolições',
      r.iePiso && 'Piso',
      r.ieForro && 'Forro',
      r.ieArCondicionado && 'Ar-condicionado',
      r.ieMarcenaria && 'Marcenaria',
      r.ieCaixilhos && 'Caixilhos',
    ]
      .filter(Boolean)
      .join(', ');
  const infraEspecial = (r: Row) =>
    r.infraPlugAndPlay
      ? 'Não necessita / plug-and-play'
      : [
          r.infraAguaEsgoto && 'Água/esgoto',
          r.infraEletricaRegulada && 'Elétrica regulada',
          r.infraBlindagem && 'Blindagem',
          r.infraClimatizacao && 'Climatização',
          r.infraGasesMedicinais && 'Gases medicinais',
        ]
          .filter(Boolean)
          .join(', ');
  const periodicidade = (r: Row) =>
    [
      r.manutPeriodMensal && 'Mensal',
      r.manutPeriodTrimestral && 'Trimestral',
      r.manutPeriodSemestral && 'Semestral',
      r.manutPeriodAnual && 'Anual',
    ]
      .filter(Boolean)
      .join(', ');

  function exportarExcel() {
    const dados = rows.map((r) => ({
      // Solicitação
      Número: r.numero,
      'Criada em': formatDateTime(r.dtSolicitacao),
      Status: STATUS_LABEL[r.status] ?? r.status,
      'Etapa atual': r.etapaAtual ?? '',
      Prorrogada: sn(r.prorrogada),
      Solicitante: r.solicitanteNome,
      Login: r.solicitanteLogin,
      Estabelecimento: estabById.get(r.estabelecimentoId) ?? '',
      Unidade: unidadeById.get(r.unidadeNegocioId) ?? '',
      'Centro de custo': formatCentroCusto(r.centroCustoCodigo, centroByCodigo.get(r.centroCustoCodigo) ?? ''),
      Projeto: r.projeto ?? '',
      Verba: r.tipoVerba ?? '',
      'Data prevista (solic.)': r.dtRecurso ? formatDate(r.dtRecurso) : '',
      // Item
      Tipo: TIPO_LABEL[r.tipo] ?? r.tipo,
      Grupo: grupoNome(r.grupoId),
      Motivo: motivoById.get(r.motivoId) ?? '',
      'Descrição/Especificação': r.descricao,
      Fabricantes: r.fabricantes ?? '',
      'Modelos de referência': r.modelosReferencia ?? '',
      Justificativa: r.justificativa,
      Quantidade: r.quantidade,
      'Valor unitário': r.valorUnitario,
      'Valor total': r.valorTotal,
      'Data prevista (item)': r.dataPrevista ? formatDate(r.dataPrevista) : '',
      'Prorrogado p/ ano': r.prorrogadoParaAno ?? '',
      'Veio de prorrogação': sn(r.itemProrrogado),
      'Justificativa do período': r.justificativaPeriodo ?? '',
      'Público-alvo': r.publicoAlvo ?? '',
      'Volume de pessoas': r.volumePessoas ?? '',
      // Obra
      'Tipo de solicitação (obra)': r.subtipoObra
        ? (SUBTIPO_OBRA_LABEL[r.subtipoObra] ?? r.subtipoObra) +
          (r.subtipoObra === 'OUTROS' && r.subtipoObraOutros ? `: ${r.subtipoObraOutros}` : '')
        : '',
      'Escopo inicial da obra': r.escopoInicial ?? '',
      'Escopo da obra': escopoObra(r),
      'Principais benefícios': r.beneficiosProjeto ?? '',
      'Impacta RDC 50?': r.impactoRdc50 ?? '',
      // Item (clínico/infra/manutenção)
      'Justificativa/evidência clínica': r.justificativaClinica ?? '',
      'Infraestrutura especial': infraEspecial(r),
      'Manutenção preventiva': r.manutencaoPreventiva
        ? (MANUT_PREVENTIVA_LABEL[r.manutencaoPreventiva] ?? r.manutencaoPreventiva)
        : '',
      'Periodicidade manutenção': periodicidade(r),
      // Anotações (etapas de aprovação)
      'Obs. Gestor Focal': r.obsGF ?? '',
      'Obs. GPE': r.obsGPE ?? '',
      Validação: r.validacao ?? '',
      'Revisão Anual': r.revisaoAnual ?? '',
      // Cadastro do item (catálogo)
      'Item (catálogo)': r.catalogoNome ?? '',
      Agrupamento: r.agrupamento ?? '',
      Classificação: r.classificacao ?? '',
      'Cód. material (Tasy)': r.cdMaterialTasy ?? '',
      'Material (Tasy)': r.dsMaterialTasy ?? '',
      'Movimento contábil': r.movimentoContabil ? (MOVIMENTO_LABEL[r.movimentoContabil] ?? r.movimentoContabil) : '',
      'Valor Renem': r.valorReferencia ?? '',
      'Valor mínimo (cad.)': r.catValorMin ?? '',
      'Valor máximo (cad.)': r.catValorMax ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Itens');
    const hoje = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `relatorio_itens_${hoje}.xlsx`);
  }

  const set = (patch: Partial<typeof FILTROS_VAZIOS>) => setFiltros((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="card">
        <div className="card-body space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-soft">
            <Filter className="w-4 h-4" /> Filtros
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="label">Estabelecimento</label>
              <MultiSelectSearch
                value={filtros.estabelecimentoIds}
                options={cat.estabelecimentos.map((e) => ({ id: e.id, label: e.nome }))}
                onChange={(v) => set({ estabelecimentoIds: v, unidadeNegocioIds: [], centroCustoCodigos: [] })}
              />
            </div>
            <div>
              <label className="label">Unidade</label>
              <MultiSelectSearch
                value={filtros.unidadeNegocioIds}
                options={unidadeOptions}
                onChange={(v) => set({ unidadeNegocioIds: v, centroCustoCodigos: [] })}
              />
            </div>
            <div className="min-w-0">
              <label className="label">Centro de custo</label>
              <MultiSelectSearch
                value={filtros.centroCustoCodigos}
                options={centrosFiltrados.map((c) => ({
                  id: c.codigo,
                  label: formatCentroCusto(c.codigo, c.descricao),
                }))}
                onChange={(v) => set({ centroCustoCodigos: v })}
                emptyText="Nenhum centro"
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
              <label className="label">Tipo</label>
              <MultiSelectSearch
                value={filtros.tipos}
                options={[
                  { id: 'ITEM', label: 'Itens' },
                  { id: 'INSTRUMENTAL', label: 'Instrumentais' },
                  { id: 'OBRA', label: 'Obras' },
                ]}
                onChange={(v) => set({ tipos: v })}
              />
            </div>
            <div>
              <label className="label">Ano previsto</label>
              <MultiSelectSearch
                value={filtros.anos}
                options={ANOS_OPCOES.map((a) => ({ id: a, label: String(a) }))}
                onChange={(v) => set({ anos: v })}
              />
            </div>
            <div>
              <label className="label">Status</label>
              <MultiSelectSearch
                value={filtros.status}
                options={Object.entries(STATUS_LABEL).map(([v, l]) => ({ id: v, label: l }))}
                onChange={(v) => set({ status: v })}
              />
            </div>
            <div>
              <label className="label">Verba</label>
              <MultiSelectSearch
                value={filtros.verba}
                options={[
                  { id: 'SEM', label: 'Sem verba' },
                  { id: 'RP', label: 'RP' },
                  { id: 'VP', label: 'VP' },
                ]}
                onChange={(v) => set({ verba: v })}
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
            <div>
              <label className="label">Data de</label>
              <input
                type="date"
                className="input"
                value={filtros.dataDe}
                onChange={(e) => set({ dataDe: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Data até</label>
              <input
                type="date"
                className="input"
                value={filtros.dataAte}
                onChange={(e) => set({ dataAte: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Valor mín. (R$)</label>
              <input
                type="number"
                className="input"
                value={filtros.valorMin}
                onChange={(e) => set({ valorMin: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="label">Valor máx. (R$)</label>
              <input
                type="number"
                className="input"
                value={filtros.valorMax}
                onChange={(e) => set({ valorMax: e.target.value })}
                placeholder="—"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn-ghost" onClick={() => setFiltros(FILTROS_VAZIOS)}>
              <RotateCcw className="w-4 h-4" /> Limpar filtros
            </button>
          </div>
        </div>
      </div>

      {/* Barra: total + exportar */}
      <div className="card">
        <div className="card-body flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-ink-soft">
            <strong className="text-ink">{data?.total ?? 0}</strong> item(ns)
            {data?.truncado && (
              <span className="text-amber-700"> · limitado a 5000 solicitações — refine os filtros</span>
            )}
            <span className="ml-2 text-ink-muted">
              (a exportação Excel traz todas as colunas)
            </span>
          </div>
          <button
            className="btn-primary"
            onClick={exportarExcel}
            disabled={rows.length === 0}
          >
            <FileSpreadsheet className="w-4 h-4" /> Exportar Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="card card-body text-center py-16 text-ink-soft">Carregando…</div>
      ) : rows.length === 0 ? (
        <Empty icon={FileSpreadsheet} title="Nenhum item" description="Ajuste os filtros acima." />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="table-head">Nº</th>
                  <th className="table-head">Item</th>
                  <th className="table-head">Tipo</th>
                  <th className="table-head">Grupo</th>
                  <th className="table-head text-right">Qtd</th>
                  <th className="table-head text-right">V.Unit.</th>
                  <th className="table-head text-right">Total</th>
                  <th className="table-head">Data prev.</th>
                  <th className="table-head">Status</th>
                  <th className="table-head">Solicitante</th>
                  <th className="table-head">Estabelecimento</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.itemId}
                    className="table-row cursor-pointer hover:bg-surface-alt transition"
                    onClick={() => navigate(`/solicitacoes/${r.id}`)}
                  >
                    <td className="table-cell font-medium text-brand-700">#{r.numero}</td>
                    <td className="table-cell max-w-[22rem] truncate" title={r.descricao}>
                      {r.descricao}
                      {(r.prorrogadoParaAno || r.itemProrrogado) && (
                        <span className="ml-2 badge bg-sky-100 text-sky-800">
                          {r.prorrogadoParaAno ? `prorrogado ${r.prorrogadoParaAno}` : 'prorrogado'}
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-xs text-ink-soft">{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
                    <td className="table-cell text-xs text-ink-soft max-w-[14rem] truncate">
                      {grupoNome(r.grupoId)}
                    </td>
                    <td className="table-cell text-right tabular-nums">{r.quantidade}</td>
                    <td className="table-cell text-right tabular-nums">{formatBRL(r.valorUnitario)}</td>
                    <td className="table-cell text-right tabular-nums font-medium">
                      {formatBRL(r.valorTotal)}
                    </td>
                    <td className="table-cell text-xs text-ink-soft">
                      {r.dataPrevista ? formatDate(r.dataPrevista) : '—'}
                    </td>
                    <td className="table-cell text-xs">{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td className="table-cell">
                      {r.solicitanteNome}
                      <div className="text-xs text-ink-soft">{r.solicitanteLogin}</div>
                    </td>
                    <td className="table-cell text-ink-soft">{estabById.get(r.estabelecimentoId) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
