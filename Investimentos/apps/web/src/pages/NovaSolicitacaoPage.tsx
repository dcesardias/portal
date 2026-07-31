import { useState, useMemo, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Plus,
  Minus,
  Trash2,
  Check,
  ArrowRight,
  ArrowLeft,
  Save,
  Package,
  Stethoscope,
  HardHat,
  ChevronDown,
  ChevronUp,
  CalendarClock,
} from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { SearchableSelect, type Opt } from '../components/SearchableSelect';
import { useCatalog } from '../hooks/useCatalog';
import { useMe } from '../hooks/useMe';
import { formatBRL, formatCentroCusto, cn } from '../lib/utils';
import { isAdmin } from '../lib/auth';
import { PageTour } from '../components/PageTour';
import type { TourStep } from '../components/GuidedTour';
import type { TipoItem } from '@investimentos/shared';

type TipoSolic = 'ITEM' | 'INSTRUMENTAL' | 'OBRA';

type ItemForm = {
  _uid: number; // identidade estável (para chave/acordeão) — não vai pro backend
  itemCatalogoId: number | null;
  grupoId: number | null;
  descricao: string;
  especificacao: string;
  motivoId: number | null;
  justificativa: string;
  quantidade: number;
  valorUnitario: number;
  dataPrevista: string; // yyyy-mm-dd (opcional) — data prevista deste item
  // escopo de obra
  ieDemolicoes: boolean;
  iePiso: boolean;
  ieForro: boolean;
  ieArCondicionado: boolean;
  ieMarcenaria: boolean;
  ieCaixilhos: boolean;
  // contexto do projeto (opcional, todos os tipos)
  justificativaPeriodo: string;
  publicoAlvo: string;
  volumePessoas: string;
  // só obra
  subtipoObra: SubtipoObra | '';
  subtipoObraOutros: string;
  escopoInicial: string;
  beneficiosProjeto: string;
  impactoRdc50: string;
  // só item
  modelosReferencia: string;
  justificativaClinica: string;
  infraAguaEsgoto: boolean;
  infraEletricaRegulada: boolean;
  infraBlindagem: boolean;
  infraClimatizacao: boolean;
  infraGasesMedicinais: boolean;
  infraPlugAndPlay: boolean;
  // só item de grupos de equipamentos ("Se aplicável")
  manutencaoPreventiva: ManutPreventiva | '';
  manutPeriodMensal: boolean;
  manutPeriodTrimestral: boolean;
  manutPeriodSemestral: boolean;
  manutPeriodAnual: boolean;
};

type ManutPreventiva = 'SIM_CALIBRACAO' | 'NAO_COMPLEXA' | 'NAO_SEI';

type SubtipoObra =
  | 'NOVA_CONSTRUCAO'
  | 'REFORMA_ESTRUTURAL'
  | 'REVITALIZACAO'
  | 'MANUTENCAO_CORRETIVA'
  | 'OUTROS';

let UID_SEQ = 0;
const nextUid = () => ++UID_SEQ;

const newItem = (): ItemForm => ({
  _uid: nextUid(),
  itemCatalogoId: null,
  grupoId: null,
  descricao: '',
  especificacao: '',
  motivoId: null,
  justificativa: '',
  quantidade: 1,
  valorUnitario: 0,
  dataPrevista: '',
  ieDemolicoes: false,
  iePiso: false,
  ieForro: false,
  ieArCondicionado: false,
  ieMarcenaria: false,
  ieCaixilhos: false,
  justificativaPeriodo: '',
  publicoAlvo: '',
  volumePessoas: '',
  subtipoObra: '',
  subtipoObraOutros: '',
  escopoInicial: '',
  beneficiosProjeto: '',
  impactoRdc50: '',
  modelosReferencia: '',
  justificativaClinica: '',
  infraAguaEsgoto: false,
  infraEletricaRegulada: false,
  infraBlindagem: false,
  infraClimatizacao: false,
  infraGasesMedicinais: false,
  infraPlugAndPlay: false,
  manutencaoPreventiva: '',
  manutPeriodMensal: false,
  manutPeriodTrimestral: false,
  manutPeriodSemestral: false,
  manutPeriodAnual: false,
});

const TIPOS: {
  key: TipoSolic;
  titulo: string;
  descricao: string;
  icon: typeof Package;
}[] = [
  { key: 'ITEM', titulo: 'Itens', descricao: 'Equipamentos, mobiliário, TI e afins', icon: Package },
  {
    key: 'INSTRUMENTAL',
    titulo: 'Instrumentais Cirúrgicos',
    descricao: 'Instrumentais do catálogo cirúrgico',
    icon: Stethoscope,
  },
  { key: 'OBRA', titulo: 'Obras e Reformas', descricao: 'Obras, reformas e infraestrutura', icon: HardHat },
];

const ESCOPO_OBRA: { key: keyof ItemForm; label: string }[] = [
  { key: 'ieDemolicoes', label: 'Demolições' },
  { key: 'iePiso', label: 'Piso' },
  { key: 'ieForro', label: 'Forro' },
  { key: 'ieArCondicionado', label: 'Ar-condicionado' },
  { key: 'ieMarcenaria', label: 'Marcenaria' },
  { key: 'ieCaixilhos', label: 'Caixilhos' },
];

const SUBTIPO_OBRA_OPCOES: { key: SubtipoObra; label: string; descricao: string }[] = [
  {
    key: 'NOVA_CONSTRUCAO',
    label: 'Nova construção',
    descricao: 'Ampliação de área construída / Nova ala',
  },
  {
    key: 'REFORMA_ESTRUTURAL',
    label: 'Reforma estrutural',
    descricao: 'Mudança de layout / Adequação normativa',
  },
  {
    key: 'REVITALIZACAO',
    label: 'Revitalização estética e funcional',
    descricao: 'Pintura, pisos, marcenaria',
  },
  {
    key: 'MANUTENCAO_CORRETIVA',
    label: 'Manutenção corretiva civil pesada',
    descricao: 'Infiltrações, fachada, telhado',
  },
  { key: 'OUTROS', label: 'Outros', descricao: 'Campo livre' },
];

const INFRA_ESPECIAL: { key: keyof ItemForm; label: string }[] = [
  { key: 'infraAguaEsgoto', label: 'Ponto de água / esgoto' },
  { key: 'infraEletricaRegulada', label: 'Rede elétrica regulada (Nobreak/Aterramento específico)' },
  { key: 'infraBlindagem', label: 'Blindagem de sala (Radiação/Magnetismo)' },
  { key: 'infraClimatizacao', label: 'Climatização dedicada' },
  { key: 'infraGasesMedicinais', label: 'Gases medicinais' },
];

// Opções mutuamente exclusivas: marcar "plug-and-play" limpa as demais e vice-versa.
const INFRA_PLUG_AND_PLAY: keyof ItemForm = 'infraPlugAndPlay';

const MANUT_PREVENTIVA_OPCOES: { key: ManutPreventiva; label: string }[] = [
  { key: 'SIM_CALIBRACAO', label: 'Sim, exige calibração ou revisão periódica obrigatória' },
  { key: 'NAO_COMPLEXA', label: 'Não exige manutenção complexa (Apenas limpeza ou cuidados básicos)' },
  { key: 'NAO_SEI', label: 'Não sei informar' },
];

const PERIODICIDADE_MANUT: { key: keyof ItemForm; label: string }[] = [
  { key: 'manutPeriodMensal', label: 'Mensal' },
  { key: 'manutPeriodTrimestral', label: 'Trimestral' },
  { key: 'manutPeriodSemestral', label: 'Semestral' },
  { key: 'manutPeriodAnual', label: 'Anual' },
];

// Normaliza (minúsculas, sem acentos) p/ comparar nomes de grupo com robustez.
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

// Campos de manutenção só valem para grupos de equipamentos (Reabilitação,
// Diagnósticos/Laboratoriais, Hospitalares, Oficina Ortopédica). Todos começam
// com "Equipamento(s)" — casamos por prefixo normalizado p/ tolerar variações.
function grupoExigeManutencao(grupoNome: string | undefined): boolean {
  if (!grupoNome) return false;
  return normalizar(grupoNome).startsWith('equipamento');
}

// Extrai mensagens legíveis do erro (inclui os `issues` do Zod devolvidos pelo backend).
function mensagensErro(error: unknown): string[] {
  const data = (
    error as {
      response?: {
        data?: { message?: string; issues?: { path?: (string | number)[]; message: string }[] };
      };
    }
  )?.response?.data;
  if (data?.issues?.length) {
    return data.issues.map((i) => {
      const campo = (i.path ?? []).join('.') || 'campo';
      return `${campo}: ${i.message}`;
    });
  }
  return [data?.message ?? 'Erro ao criar solicitação. Verifique os dados e tente de novo.'];
}

const GRUPO_OBRA = 9; // "Obras, Reformas e Serviços de Infraestrutura"
const GRUPO_INSTRUMENTAL = 7; // "Instrumentais Cirúrgicos"

// Grupo pré-definido conforme o tipo (obra/instrumental têm grupo fixo).
function grupoInicial(t: TipoSolic): number | null {
  if (t === 'OBRA') return GRUPO_OBRA;
  if (t === 'INSTRUMENTAL') return GRUPO_INSTRUMENTAL;
  return null;
}

// Item como vem do detalhe (GET /solicitacoes/:id) — usado para pré-preencher a edição.
type DetalheItem = {
  tipo: TipoSolic;
  grupoId: number;
  itemCatalogoId: number | null;
  descricao: string;
  especificacao: string | null;
  motivoId: number;
  justificativa: string;
  quantidade: number;
  valorUnitario: number;
  dataPrevista: string | null;
  ieDemolicoes: boolean;
  iePiso: boolean;
  ieForro: boolean;
  ieArCondicionado: boolean;
  ieMarcenaria: boolean;
  ieCaixilhos: boolean;
  justificativaPeriodo?: string | null;
  publicoAlvo?: string | null;
  volumePessoas?: string | null;
  subtipoObra?: SubtipoObra | null;
  subtipoObraOutros?: string | null;
  escopoInicial?: string | null;
  beneficiosProjeto?: string | null;
  impactoRdc50?: string | null;
  modelosReferencia?: string | null;
  justificativaClinica?: string | null;
  infraAguaEsgoto?: boolean;
  infraEletricaRegulada?: boolean;
  infraBlindagem?: boolean;
  infraClimatizacao?: boolean;
  infraGasesMedicinais?: boolean;
  infraPlugAndPlay?: boolean;
  manutencaoPreventiva?: ManutPreventiva | null;
  manutPeriodMensal?: boolean;
  manutPeriodTrimestral?: boolean;
  manutPeriodSemestral?: boolean;
  manutPeriodAnual?: boolean;
};
type DetalheSolic = {
  estabelecimentoId: number;
  unidadeNegocioId: number;
  centroCustoCodigo: string;
  projeto: string | null;
  itens: DetalheItem[];
};

// Regra de negócio: solicitações são sempre para o ANO SEGUINTE ao vigente.
// A data prevista fica limitada a esse ano-alvo (ano atual + 1).
const ANO_ALVO = new Date().getFullYear() + 1;
const MIN_DATA_PREVISTA = `${ANO_ALVO}-01-01`;
const MAX_DATA_PREVISTA = `${ANO_ALVO}-12-31`;

// Data prevista é opcional; se preenchida (yyyy-mm-dd), deve cair no ano-alvo.
function dataPrevistaValida(v: string): boolean {
  if (!v) return true;
  return Number(v.slice(0, 4)) === ANO_ALVO;
}

export function NovaSolicitacaoPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cat = useCatalog();
  // Simulação agora permite ESCRITA: o admin age COMO o usuário simulado. Mantido
  // como constante para não desabilitar os botões desta tela — o banner global
  // (AppShell) já avisa que as ações são registradas em nome do simulado.
  const simulando = false;
  const { id: editId } = useParams<{ id: string }>();
  const isEdit = !!editId;

  const [step, setStep] = useState(1);
  const [tipo, setTipo] = useState<TipoSolic | null>(null);
  const [ctx, setCtx] = useState({
    estabelecimentoId: 0,
    unidadeNegocioId: 0,
    centroCustoCodigo: '',
    projeto: '',
  });

  // Modo ADMIN (só na criação): a solicitação nasce já em Aprovação Final, com
  // solicitante e data original informados (permite cadastro retroativo).
  const admin = isAdmin();
  const { data: me } = useMe();
  const [adminSolicitanteId, setAdminSolicitanteId] = useState('');
  const [adminData, setAdminData] = useState(() => new Date().toISOString().slice(0, 10));
  const { data: usuarios = [] } = useQuery<{ id: string; nome: string; login: string; ativo?: boolean }[]>({
    queryKey: ['admin', 'usuarios'],
    queryFn: () => api.get('/admin/usuarios').then((r) => r.data),
    enabled: admin && !isEdit,
    staleTime: 5 * 60_000,
  });
  // Default do solicitante = o próprio admin.
  useEffect(() => {
    if (admin && !isEdit && !adminSolicitanteId && me?.id) setAdminSolicitanteId(me.id);
  }, [admin, isEdit, adminSolicitanteId, me?.id]);
  const primeiro = newItem();
  const [itens, setItens] = useState<ItemForm[]>([primeiro]);
  // Acordeão: só um item aberto por vez; ao adicionar, o novo (topo) fica aberto.
  const [abertoUid, setAbertoUid] = useState<number>(primeiro._uid);

  // ── Modo edição: carrega a solicitação existente e pré-preenche o wizard ──
  const { data: existente } = useQuery<DetalheSolic>({
    queryKey: ['solicitacao', editId],
    queryFn: () => api.get(`/solicitacoes/${editId}`).then((r) => r.data),
    enabled: isEdit,
  });
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!isEdit || prefilled || !existente) return;
    const t = (existente.itens[0]?.tipo ?? 'ITEM') as TipoSolic;
    setTipo(t);
    setCtx({
      estabelecimentoId: existente.estabelecimentoId,
      unidadeNegocioId: existente.unidadeNegocioId,
      centroCustoCodigo: existente.centroCustoCodigo,
      projeto: existente.projeto ?? '',
    });
    const carregados: ItemForm[] = existente.itens.map((it) => ({
      ...newItem(),
      itemCatalogoId: it.itemCatalogoId,
      grupoId: it.grupoId,
      descricao: it.descricao,
      especificacao: it.especificacao ?? '',
      motivoId: it.motivoId,
      justificativa: it.justificativa,
      quantidade: it.quantidade,
      valorUnitario: Number(it.valorUnitario) || 0,
      dataPrevista: it.dataPrevista ? it.dataPrevista.slice(0, 10) : '',
      ieDemolicoes: it.ieDemolicoes,
      iePiso: it.iePiso,
      ieForro: it.ieForro,
      ieArCondicionado: it.ieArCondicionado,
      ieMarcenaria: it.ieMarcenaria,
      ieCaixilhos: it.ieCaixilhos,
      justificativaPeriodo: it.justificativaPeriodo ?? '',
      publicoAlvo: it.publicoAlvo ?? '',
      volumePessoas: it.volumePessoas ?? '',
      subtipoObra: it.subtipoObra ?? '',
      subtipoObraOutros: it.subtipoObraOutros ?? '',
      escopoInicial: it.escopoInicial ?? '',
      beneficiosProjeto: it.beneficiosProjeto ?? '',
      impactoRdc50: it.impactoRdc50 ?? '',
      modelosReferencia: it.modelosReferencia ?? '',
      justificativaClinica: it.justificativaClinica ?? '',
      infraAguaEsgoto: it.infraAguaEsgoto ?? false,
      infraEletricaRegulada: it.infraEletricaRegulada ?? false,
      infraBlindagem: it.infraBlindagem ?? false,
      infraClimatizacao: it.infraClimatizacao ?? false,
      infraGasesMedicinais: it.infraGasesMedicinais ?? false,
      infraPlugAndPlay: it.infraPlugAndPlay ?? false,
      manutencaoPreventiva: it.manutencaoPreventiva ?? '',
      manutPeriodMensal: it.manutPeriodMensal ?? false,
      manutPeriodTrimestral: it.manutPeriodTrimestral ?? false,
      manutPeriodSemestral: it.manutPeriodSemestral ?? false,
      manutPeriodAnual: it.manutPeriodAnual ?? false,
    }));
    setItens(carregados.length ? carregados : [newItem()]);
    setAbertoUid(carregados[0]?._uid ?? -1);
    setPrefilled(true);
  }, [isEdit, prefilled, existente]);

  const unidadesFiltradas = cat.unidades.filter((u) => u.estabelecimentoId === ctx.estabelecimentoId);
  const centrosFiltrados = cat.centros.filter((c) => c.unidadeId === ctx.unidadeNegocioId);

  // Catálogo aplicável ao tipo escolhido (obras não têm catálogo).
  const catalogoDoTipo = useMemo(() => {
    if (tipo === 'OBRA') return [];
    const alvo: TipoItem = tipo === 'INSTRUMENTAL' ? 'INSTRUMENTAL' : 'ITEM';
    return cat.itens.filter((i) => i.tipo === alvo);
  }, [cat.itens, tipo]);

  // Grupos aplicáveis: obras → só grupo obra; itens/instrumentais → grupos da categoria.
  const gruposDoTipo = useMemo(() => {
    if (tipo === 'OBRA') return cat.grupos.filter((g) => g.categoria === 'OBRA');
    if (tipo === 'INSTRUMENTAL') return cat.grupos.filter((g) => g.categoria === 'INSTRUMENTAL');
    return cat.grupos.filter((g) => g.categoria === 'ITEM');
  }, [cat.grupos, tipo]);

  const adminOk = !admin || isEdit || (!!adminSolicitanteId && !!adminData);
  const canStep2 =
    tipo && ctx.estabelecimentoId && ctx.unidadeNegocioId && ctx.centroCustoCodigo && adminOk;

  function itemValido(it: ItemForm): boolean {
    const baseOk =
      !!it.grupoId &&
      !!it.motivoId &&
      it.descricao.trim().length >= 2 &&
      it.justificativa.trim().length >= 2 &&
      it.quantidade > 0 &&
      it.valorUnitario > 0 &&
      it.dataPrevista.trim() !== '' && // obrigatória
      dataPrevistaValida(it.dataPrevista); // e no ano-alvo
    if (tipo === 'OBRA') return baseOk && it.escopoInicial.trim().length >= 2;
    return baseOk && !!it.itemCatalogoId; // itens/instrumentais exigem catálogo
  }

  const itensValidos = itens.every(itemValido);
  const total = itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);

  // Evidencia os campos obrigatórios vazios quando o usuário mira o botão de
  // finalização (que fica desabilitado até tudo estar preenchido). Também abre
  // o primeiro item incompleto (que pode estar minimizado no acordeão).
  const [showErros, setShowErros] = useState(false);
  function revelarErros() {
    if (itensValidos) return;
    const inv = itens.find((it) => !itemValido(it));
    if (inv) setAbertoUid(inv._uid);
    setShowErros(true);
  }

  function updateItem(idx: number, patch: Partial<ItemForm>) {
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function pickCatalogoItem(idx: number, itemId: number) {
    const item = catalogoDoTipo.find((i) => i.id === itemId);
    if (!item) return;
    updateItem(idx, {
      itemCatalogoId: item.id,
      grupoId: item.grupoId,
      descricao: item.nome,
      // valorReferencia pode chegar como string (Decimal). Coage para número.
      valorUnitario: Number(item.valorReferencia) || 0,
    });
  }

  function escolherTipo(t: TipoSolic) {
    setTipo(t);
    // Reinicia itens com grupo pré-definido (obra/instrumental têm grupo fixo).
    const it = { ...newItem(), grupoId: grupoInicial(t) };
    setItens([it]);
    setAbertoUid(it._uid);
  }

  // Adiciona um item NOVO no TOPO (os já preenchidos descem) e o deixa aberto;
  // os demais ficam minimizados (acordeão).
  function adicionarItem() {
    const it = { ...newItem(), grupoId: tipo ? grupoInicial(tipo) : null };
    setItens((prev) => [it, ...prev]);
    setAbertoUid(it._uid);
  }

  function removerItem(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx));
  }

  // Opções do seletor de item para uma linha (filtradas por grupo no caso de ITEM).
  function opcoesItem(it: ItemForm): Opt[] {
    const base =
      tipo === 'ITEM' ? catalogoDoTipo.filter((c) => c.grupoId === it.grupoId) : catalogoDoTipo;
    return base.map((c) => ({
      id: c.id,
      label: c.nome,
      hint: c.valorReferencia ? `ref: ${formatBRL(c.valorReferencia)}` : undefined,
    }));
  }

  const create = useMutation({
    mutationFn: () => {
      const payload = {
        estabelecimentoId: ctx.estabelecimentoId,
        unidadeNegocioId: ctx.unidadeNegocioId,
        centroCustoCodigo: ctx.centroCustoCodigo,
        tipoVerba: null, // definido pela administração (GPE), não pelo solicitante
        projeto: ctx.projeto || null,
        // dtRecurso agora é derivado no backend a partir das datas dos itens.
        itens: itens.map((it) => ({
          tipo,
          grupoId: it.grupoId!,
          itemCatalogoId: tipo === 'OBRA' ? null : it.itemCatalogoId,
          descricao: it.descricao,
          especificacao: it.especificacao || null,
          motivoId: it.motivoId!,
          justificativa: it.justificativa,
          quantidade: Number(it.quantidade) || 0,
          valorUnitario: Number(it.valorUnitario) || 0,
          dataPrevista: it.dataPrevista
            ? new Date(`${it.dataPrevista}T12:00:00`).toISOString()
            : null,
          // Contexto do projeto — todos os tipos.
          justificativaPeriodo: it.justificativaPeriodo || null,
          publicoAlvo: it.publicoAlvo || null,
          volumePessoas: it.volumePessoas || null,
          ...(tipo === 'OBRA'
            ? {
                ieDemolicoes: it.ieDemolicoes,
                iePiso: it.iePiso,
                ieForro: it.ieForro,
                ieArCondicionado: it.ieArCondicionado,
                ieMarcenaria: it.ieMarcenaria,
                ieCaixilhos: it.ieCaixilhos,
                subtipoObra: it.subtipoObra || null,
                subtipoObraOutros: it.subtipoObra === 'OUTROS' ? it.subtipoObraOutros || null : null,
                escopoInicial: it.escopoInicial || null,
                beneficiosProjeto: it.beneficiosProjeto || null,
                impactoRdc50: it.impactoRdc50 || null,
              }
            : {}),
          ...(tipo === 'ITEM'
            ? {
                modelosReferencia: it.modelosReferencia || null,
                justificativaClinica: it.justificativaClinica || null,
                infraAguaEsgoto: it.infraAguaEsgoto,
                infraEletricaRegulada: it.infraEletricaRegulada,
                infraBlindagem: it.infraBlindagem,
                infraClimatizacao: it.infraClimatizacao,
                infraGasesMedicinais: it.infraGasesMedicinais,
                infraPlugAndPlay: it.infraPlugAndPlay,
                // Manutenção só p/ grupos de equipamentos; senão vai vazio.
                ...(grupoExigeManutencao(cat.grupos.find((g) => g.id === it.grupoId)?.nome)
                  ? {
                      manutencaoPreventiva: it.manutencaoPreventiva || null,
                      manutPeriodMensal: it.manutPeriodMensal,
                      manutPeriodTrimestral: it.manutPeriodTrimestral,
                      manutPeriodSemestral: it.manutPeriodSemestral,
                      manutPeriodAnual: it.manutPeriodAnual,
                    }
                  : {}),
              }
            : {}),
        })),
      };
      // Criação → POST. Edição → PUT: admin usa o endpoint de admin (edita
      // qualquer pedido); o próprio solicitante usa o endpoint do dono (só
      // rascunho/revisão, validado no backend). Decisão de endpoint usa o
      // papel REAL do JWT (não o efetivo) — escrita nunca ocorre em
      // simulação, então isso não é afetado por ela.
      if (!isEdit) {
        // Admin cria já em Aprovação Final (retroativa), com solicitante e data.
        if (admin) {
          return api.post('/admin/solicitacoes/nova', {
            ...payload,
            solicitanteId: adminSolicitanteId,
            dtSolicitacao: new Date(`${adminData}T12:00:00`).toISOString(),
          });
        }
        return api.post('/solicitacoes', payload);
      }
      return isAdmin()
        ? api.put(`/admin/solicitacoes/${editId}`, payload)
        : api.put(`/solicitacoes/${editId}`, payload);
    },
    onSuccess: (res) => {
      qc.invalidateQueries();
      navigate(`/solicitacoes/${isEdit ? editId : res.data.id}`);
    },
  });

  const tipoInfo = TIPOS.find((t) => t.key === tipo);

  // ── Tutorial guiado desta tela (dirige o wizard pelos 3 passos) ──────────
  // Guarda o passo em que o usuário estava ao abrir o tour, para restaurar ao
  // fechar — assim reabrir pelo (?) no meio do preenchimento não o desloca.
  const stepBeforeTourRef = useRef(1);
  const tourSteps: TourStep[] = [
    {
      target: '[data-tour="nova-stepper"]',
      title: 'Uma solicitação em 3 passos',
      body: 'Tipo & Contexto → Itens → Revisão. Vou te levar por cada etapa; nada é salvo até você concluir.',
    },
    {
      target: '[data-tour="nova-tipo"]',
      title: 'Passo 1 — Tipo',
      body: 'Escolha o tipo: Itens, Instrumentais Cirúrgicos ou Obras e Reformas. Ao escolher, aparecem logo abaixo os campos de estabelecimento, unidade de negócio e centro de custo.',
      onEnter: () => setStep(1),
    },
    {
      target: '[data-tour="nova-continuar"]',
      title: 'Contexto e avançar',
      body: 'Preencha o estabelecimento, a unidade e o centro de custo (o projeto é opcional) e clique em Continuar para ir aos itens.',
      onEnter: () => setStep(1),
    },
    {
      target: '[data-tour="nova-additem"]',
      title: 'Passo 2 — Itens',
      body: 'Adicione um ou mais itens. Em cada item você informa grupo, descrição, quantidade, valor unitário, motivo e justificativa.',
      onEnter: () => setStep(2),
    },
    {
      target: '[data-tour="nova-revisar"]',
      title: 'Revisar',
      body: 'Com os itens completos, clique em Revisar para conferir tudo antes de salvar. Campos obrigatórios em branco ficam destacados.',
      onEnter: () => setStep(2),
    },
    {
      target: '[data-tour="nova-salvar"]',
      title: 'Passo 3 — Salvar',
      body: 'Confira o resumo e salve como rascunho. O envio para aprovação é feito depois, em “Minhas Solicitações” ou na tela de detalhe do pedido.',
      onEnter: () => setStep(3),
    },
    {
      title: 'Pronto! 🎉',
      body: 'Esse é o fluxo completo. Você pode rever este tutorial a qualquer momento pelo botão de ajuda (?) no topo.',
    },
  ];

  return (
    <>
      <PageTour
        pageKey="nova"
        steps={tourSteps}
        autoStart={!isEdit}
        onOpen={() => {
          stepBeforeTourRef.current = step;
        }}
        onClose={() => setStep(stepBeforeTourRef.current)}
      />
      <PageHeader
        title={isEdit ? 'Editar Solicitação' : 'Nova Solicitação'}
        subtitle={
          isEdit
            ? 'Altere os dados e os itens e salve as alterações'
            : 'Escolha o tipo, preencha os dados e revise antes de enviar para aprovação'
        }
      />

      {simulando && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          Modo simulação — leitura apenas. Não é possível salvar ou enviar nesta visualização.
        </div>
      )}

      <div data-tour="nova-stepper">
        <Stepper current={step} />
      </div>

      <div className="card mt-6">
        {/* ── Passo 1: Tipo + Contexto ── */}
        {step === 1 && (
          <div className="card-body space-y-6">
            <div>
              <h3 className="font-semibold text-ink text-lg mb-1">Tipo de solicitação</h3>
              <p className="text-sm text-ink-soft mb-4">
                Cada tipo tem um formulário próprio — instrumentais usam o catálogo cirúrgico, obras
                descrevem o escopo.
              </p>
              <div data-tour="nova-tipo" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {TIPOS.map((t) => {
                  const Icon = t.icon;
                  const active = tipo === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => escolherTipo(t.key)}
                      className={cn(
                        'text-left p-4 rounded-xl border-2 transition flex gap-3 items-start',
                        active
                          ? 'border-brand bg-brand-50'
                          : 'border-surface-border bg-white hover:border-brand-200',
                      )}
                    >
                      <div
                        className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                          active ? 'bg-brand text-white' : 'bg-surface-alt text-ink-soft',
                        )}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-ink">{t.titulo}</div>
                        <div className="text-xs text-ink-soft mt-0.5">{t.descricao}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {tipo && (
              <div className="pt-2">
                <h3 className="font-semibold text-ink text-lg mb-4">Localização orçamentária</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Estabelecimento *</label>
                    <select
                      className="input"
                      value={ctx.estabelecimentoId || ''}
                      onChange={(e) =>
                        setCtx((c) => ({
                          ...c,
                          estabelecimentoId: Number(e.target.value),
                          unidadeNegocioId: 0,
                          centroCustoCodigo: '',
                        }))
                      }
                    >
                      <option value="">Selecione…</option>
                      {cat.estabelecimentos.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">Unidade de negócio *</label>
                    <select
                      className="input"
                      value={ctx.unidadeNegocioId || ''}
                      onChange={(e) =>
                        setCtx((c) => ({
                          ...c,
                          unidadeNegocioId: Number(e.target.value),
                          centroCustoCodigo: '',
                        }))
                      }
                      disabled={!ctx.estabelecimentoId}
                    >
                      <option value="">
                        {ctx.estabelecimentoId ? 'Selecione…' : 'Escolha o estabelecimento primeiro'}
                      </option>
                      {unidadesFiltradas.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="label">Centro de custo *</label>
                    <SearchableSelect
                      value={ctx.centroCustoCodigo || null}
                      options={centrosFiltrados.map((c) => ({
                        id: c.codigo,
                        label: formatCentroCusto(c.codigo, c.descricao),
                      }))}
                      onChange={(v) => setCtx((c) => ({ ...c, centroCustoCodigo: v ? String(v) : '' }))}
                      disabled={!ctx.unidadeNegocioId}
                      disabledText="Escolha a unidade primeiro"
                      placeholder="Pesquisar centro de custo…"
                      emptyText="Nenhum centro nesta unidade"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="label">Projeto (opcional)</label>
                    <input
                      className="input"
                      placeholder="Ex.: Modernização Bloco Cirúrgico"
                      value={ctx.projeto}
                      onChange={(e) => setCtx((c) => ({ ...c, projeto: e.target.value }))}
                    />
                  </div>

                  {admin && !isEdit && (
                    <>
                      <div className="md:col-span-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                        <b>Modo administrador:</b> esta solicitação será criada já em{' '}
                        <b>Aprovação Final</b>, sem passar pelo fluxo. Informe o solicitante e a
                        data original — permite cadastro retroativo (itens de anos anteriores).
                      </div>
                      <div>
                        <label className="label">Solicitante *</label>
                        <SearchableSelect
                          value={adminSolicitanteId || null}
                          options={usuarios
                            .filter((u) => u.ativo !== false)
                            .map((u) => ({ id: u.id, label: `${u.nome} (${u.login})` }))}
                          onChange={(v) => setAdminSolicitanteId(v ? String(v) : '')}
                          placeholder="Selecione o solicitante"
                        />
                      </div>
                      <div>
                        <label className="label">Data da solicitação *</label>
                        <input
                          type="date"
                          className="input"
                          value={adminData}
                          onChange={(e) => setAdminData(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-surface-border">
              <button
                data-tour="nova-continuar"
                className="btn-primary"
                disabled={!canStep2}
                onClick={() => setStep(2)}
              >
                Continuar <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Passo 2: Itens (ramificado por tipo) ── */}
        {step === 2 && (
          <div className="card-body space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-ink text-lg">
                  {tipo === 'OBRA' ? 'Itens da obra' : tipoInfo?.titulo}
                </h3>
                <p className="text-sm text-ink-soft">
                  {tipo === 'OBRA'
                    ? 'Descreva o escopo — obras não usam catálogo.'
                    : tipo === 'INSTRUMENTAL'
                      ? 'Selecione os instrumentais do catálogo cirúrgico.'
                      : 'Selecione os itens do catálogo.'}
                </p>
              </div>
              <button
                type="button"
                data-tour="nova-additem"
                onClick={adicionarItem}
                className="btn-secondary"
              >
                <Plus className="w-4 h-4" /> Adicionar
              </button>
            </div>

            <div className="space-y-4">
              {itens.map((it, idx) => {
                const aberto = it._uid === abertoUid;
                const completo = itemValido(it);
                const titulo =
                  it.descricao.trim() || (tipo === 'OBRA' ? 'Nova obra' : 'Novo item');
                // Marca campo obrigatório vazio (só evidencia depois de mirar "Revisar").
                const erro = {
                  grupo: showErros && !it.grupoId,
                  catalogo: showErros && tipo !== 'OBRA' && !it.itemCatalogoId,
                  motivo: showErros && !it.motivoId,
                  descricao: showErros && it.descricao.trim().length < 2,
                  quantidade: showErros && !(it.quantidade > 0),
                  valor: showErros && !(it.valorUnitario > 0),
                  justificativa: showErros && it.justificativa.trim().length < 2,
                  // Escopo Inicial da Obra é obrigatório (só OBRA).
                  escopo: showErros && tipo === 'OBRA' && it.escopoInicial.trim().length < 2,
                  // Obrigatória: vazia evidencia ao mirar "Revisar"; ano errado é imediato.
                  dataPrevista:
                    (showErros && !it.dataPrevista) ||
                    (!!it.dataPrevista && !dataPrevistaValida(it.dataPrevista)),
                };
                return (
                <div
                  key={it._uid}
                  className="border border-surface-border rounded-xl bg-surface-alt overflow-hidden"
                >
                  {/* Cabeçalho do acordeão — clique minimiza/expande o item */}
                  <div className="flex items-center gap-3 p-3">
                    <button
                      type="button"
                      onClick={() => setAbertoUid(aberto ? -1 : it._uid)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      {aberto ? (
                        <ChevronUp className="w-4 h-4 text-ink-soft shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-ink-soft shrink-0" />
                      )}
                      <span className="text-sm font-semibold text-ink truncate">{titulo}</span>
                      {!completo && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent-100 text-accent-700 shrink-0">
                          incompleto
                        </span>
                      )}
                    </button>
                    <div className="text-sm text-ink-soft tabular-nums shrink-0">
                      {it.quantidade}× ·{' '}
                      <b className="text-ink">{formatBRL(it.quantidade * it.valorUnitario)}</b>
                    </div>
                    {itens.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removerItem(idx)}
                        className="btn-ghost text-red-600 hover:bg-red-50 shrink-0"
                        title="Remover item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {aberto && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0 px-4 pb-4">
                    {/* ITEM: grupo primeiro, para filtrar o seletor de item */}
                    {tipo === 'ITEM' && (
                      <div className="min-w-0">
                        <label className="label">Grupo *</label>
                        <select
                          className={cn('input', erro.grupo && 'input-error')}
                          value={it.grupoId ?? ''}
                          onChange={(e) =>
                            // troca de grupo limpa o item escolhido (pode não pertencer ao novo grupo)
                            updateItem(idx, {
                              grupoId: Number(e.target.value),
                              itemCatalogoId: null,
                            })
                          }
                        >
                          <option value="">Selecione…</option>
                          {gruposDoTipo.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.nome}
                            </option>
                          ))}
                        </select>
                        {erro.grupo && <div className="err">Selecione o grupo.</div>}
                      </div>
                    )}

                    {/* Item do catálogo (busca) — itens e instrumentais */}
                    {tipo !== 'OBRA' && (
                      <div className={cn('min-w-0', tipo === 'INSTRUMENTAL' && 'md:col-span-2')}>
                        <label className="label">
                          {tipo === 'INSTRUMENTAL' ? 'Instrumental do catálogo *' : 'Item do catálogo *'}
                        </label>
                        <div
                          className={cn(
                            'rounded-lg',
                            erro.catalogo && 'ring-2 ring-red-300',
                          )}
                        >
                          <SearchableSelect
                            value={it.itemCatalogoId}
                            options={opcoesItem(it)}
                            onChange={(v) => {
                              if (v) pickCatalogoItem(idx, Number(v));
                              else updateItem(idx, { itemCatalogoId: null });
                            }}
                            disabled={tipo === 'ITEM' && !it.grupoId}
                            disabledText="Escolha o grupo primeiro"
                            placeholder={
                              tipo === 'INSTRUMENTAL' ? 'Pesquisar instrumental…' : 'Pesquisar item…'
                            }
                            emptyText="Nenhum item neste grupo"
                          />
                        </div>
                        {erro.catalogo && (
                          <div className="err">
                            Selecione um {tipo === 'INSTRUMENTAL' ? 'instrumental' : 'item'} do
                            catálogo.
                          </div>
                        )}
                      </div>
                    )}

                    <div className="min-w-0">
                      <label className="label">Motivo *</label>
                      <select
                        className={cn('input', erro.motivo && 'input-error')}
                        value={it.motivoId ?? ''}
                        onChange={(e) => updateItem(idx, { motivoId: Number(e.target.value) })}
                      >
                        <option value="">Selecione…</option>
                        {cat.motivos.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome}
                          </option>
                        ))}
                      </select>
                      {erro.motivo && <div className="err">Selecione o motivo.</div>}
                    </div>

                    <div className="md:col-span-2">
                      <label className="label">
                        {tipo === 'OBRA'
                          ? 'Nome do Projeto/Intervenção *'
                          : tipo === 'ITEM'
                            ? 'Descrição e Especificação *'
                            : 'Descrição *'}
                      </label>
                      {tipo === 'ITEM' ? (
                        <textarea
                          className={cn('input resize-none', erro.descricao && 'input-error')}
                          rows={3}
                          value={it.descricao}
                          onChange={(e) => updateItem(idx, { descricao: e.target.value })}
                          placeholder="Detalhes e especificação do item solicitado"
                        />
                      ) : (
                        <input
                          className={cn('input', erro.descricao && 'input-error')}
                          value={it.descricao}
                          onChange={(e) => updateItem(idx, { descricao: e.target.value })}
                          placeholder={
                            tipo === 'OBRA'
                              ? 'Ex.: Reforma da recepção da unidade'
                              : 'Ex.: Ultrassom terapêutico 1MHz/3MHz'
                          }
                        />
                      )}
                      {erro.descricao && <div className="err">Informe a descrição.</div>}
                    </div>

                    {/* Fabricantes + Modelos de Referência — só ITEM (opcionais) */}
                    {tipo === 'ITEM' && (
                      <>
                        <div className="md:col-span-2">
                          <label className="label">Fabricantes</label>
                          <textarea
                            className="input resize-none"
                            rows={2}
                            value={it.especificacao}
                            onChange={(e) => updateItem(idx, { especificacao: e.target.value })}
                            placeholder="Ex.: Marca X; Marca Z"
                          />
                          <div className="help">
                            Liste pelo menos duas marcas sugeridas ou padrão (caso seja item comum).
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <label className="label">Modelos de Referência</label>
                          <textarea
                            className="input resize-none"
                            rows={2}
                            value={it.modelosReferencia}
                            onChange={(e) => updateItem(idx, { modelosReferencia: e.target.value })}
                            placeholder="Ex.: Modelo Y; Modelo W"
                          />
                        </div>
                      </>
                    )}

                    {/* Tipo de Solicitação + Escopo Inicial da Obra — só OBRA (opcionais) */}
                    {tipo === 'OBRA' && (
                      <div className="md:col-span-2">
                        <label className="label">Tipo de Solicitação</label>
                        <div className="flex flex-wrap gap-2">
                          {SUBTIPO_OBRA_OPCOES.map((op) => {
                            const checked = it.subtipoObra === op.key;
                            return (
                              <button
                                key={op.key}
                                type="button"
                                onClick={() => updateItem(idx, { subtipoObra: checked ? '' : op.key })}
                                className={cn(
                                  'px-3 py-1.5 rounded-lg border text-sm transition text-left',
                                  checked
                                    ? 'bg-brand text-white border-brand'
                                    : 'bg-white text-ink border-surface-border hover:border-brand',
                                )}
                                title={op.descricao}
                              >
                                {op.label}
                              </button>
                            );
                          })}
                        </div>
                        {it.subtipoObra === 'OUTROS' && (
                          <input
                            className="input mt-2"
                            value={it.subtipoObraOutros}
                            onChange={(e) => updateItem(idx, { subtipoObraOutros: e.target.value })}
                            placeholder="Descreva o tipo de solicitação"
                          />
                        )}
                      </div>
                    )}

                    {tipo === 'OBRA' && (
                      <div className="md:col-span-2">
                        <label className="label">Escopo Inicial da Obra *</label>
                        <textarea
                          className={cn('input resize-none', erro.escopo && 'input-error')}
                          rows={2}
                          value={it.escopoInicial}
                          onChange={(e) => updateItem(idx, { escopoInicial: e.target.value })}
                        />
                        {erro.escopo ? (
                          <div className="err">Descreva o escopo inicial da obra.</div>
                        ) : (
                          <div className="help">
                            Descreva brevemente as principais alterações físicas necessárias
                          </div>
                        )}
                      </div>
                    )}

                    {/* Escopo de obra */}
                    {tipo === 'OBRA' && (
                      <div className="md:col-span-2">
                        <label className="label">Escopo da obra</label>
                        <div className="flex flex-wrap gap-2">
                          {ESCOPO_OBRA.map((es) => {
                            const checked = it[es.key] as boolean;
                            return (
                              <button
                                key={es.key}
                                type="button"
                                onClick={() => updateItem(idx, { [es.key]: !checked })}
                                className={cn(
                                  'px-3 py-1.5 rounded-lg border text-sm transition',
                                  checked
                                    ? 'bg-brand text-white border-brand'
                                    : 'bg-white text-ink border-surface-border hover:border-brand',
                                )}
                              >
                                {es.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="label">Quantidade *</label>
                      <QtyStepper
                        value={it.quantidade}
                        error={erro.quantidade}
                        onChange={(q) => updateItem(idx, { quantidade: q })}
                      />
                      {erro.quantidade && <div className="err">Quantidade deve ser ≥ 1.</div>}
                    </div>

                    <div>
                      {(() => {
                        // Faixa de referência (mín–máx) do item de catálogo escolhido,
                        // mostrada ao lado do título só quando ambos estão cadastrados.
                        const catItem =
                          tipo !== 'OBRA' && it.itemCatalogoId != null
                            ? catalogoDoTipo.find((c) => c.id === it.itemCatalogoId)
                            : undefined;
                        const temFaixa =
                          catItem?.valorMin != null && catItem?.valorMax != null;
                        return (
                          <label className="label flex items-center justify-between gap-2 flex-wrap">
                            <span>{tipo === 'OBRA' ? 'Valor estimado *' : 'Valor unitário *'}</span>
                            {temFaixa && (
                              <span
                                className="text-xs font-normal text-ink-muted"
                                title="Faixa de referência cadastrada para este item"
                              >
                                Ref.: {formatBRL(catItem!.valorMin!)} – {formatBRL(catItem!.valorMax!)}
                              </span>
                            )}
                          </label>
                        );
                      })()}
                      <MoneyInput
                        value={it.valorUnitario}
                        error={erro.valor}
                        onChange={(v) => updateItem(idx, { valorUnitario: v })}
                      />
                      {erro.valor && <div className="err">Informe um valor maior que zero.</div>}
                    </div>

                    <div className="md:col-span-2">
                      <label className="label">Justificativa *</label>
                      <textarea
                        className={cn('input resize-none', erro.justificativa && 'input-error')}
                        rows={2}
                        value={it.justificativa}
                        onChange={(e) => updateItem(idx, { justificativa: e.target.value })}
                        placeholder="Por que este investimento é necessário?"
                      />
                      {erro.justificativa && (
                        <div className="err">Escreva a justificativa.</div>
                      )}
                    </div>

                    <div>
                      <label className="label">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="w-3.5 h-3.5" />
                          {tipo === 'OBRA' ? 'Data prevista de entrega *' : 'Data prevista *'}
                        </span>
                      </label>
                      <input
                        type="date"
                        className={cn('input', erro.dataPrevista && 'input-error')}
                        value={it.dataPrevista}
                        min={MIN_DATA_PREVISTA}
                        max={MAX_DATA_PREVISTA}
                        onChange={(e) => updateItem(idx, { dataPrevista: e.target.value })}
                      />
                      {erro.dataPrevista ? (
                        <div className="err">
                          {!it.dataPrevista
                            ? 'Informe a data prevista.'
                            : `A data prevista deve ser no ano de ${ANO_ALVO}.`}
                        </div>
                      ) : (
                        <div className="help">
                          Quando este item precisa estar disponível (somente {ANO_ALVO}).
                        </div>
                      )}
                    </div>

                    {/* Contexto do projeto — todos os tipos (opcionais) */}
                    <div>
                      <label className="label">Justificativa para o período escolhido</label>
                      <input
                        className="input"
                        value={it.justificativaPeriodo}
                        onChange={(e) => updateItem(idx, { justificativaPeriodo: e.target.value })}
                        placeholder="Ex.: período de baixa sazonalidade de pacientes"
                      />
                      <div className="help">
                        Exemplos: período de baixa sazonalidade de pacientes, interdição
                        programada, urgência por risco de sinistro.
                      </div>
                    </div>

                    {/* Público-Alvo e Volume: não entram no formulário de Instrumental. */}
                    {tipo !== 'INSTRUMENTAL' && (
                      <>
                        <div className="md:col-span-2">
                          <label className="label">Público-Alvo Principal</label>
                          <textarea
                            className="input resize-none"
                            rows={2}
                            value={it.publicoAlvo}
                            onChange={(e) => updateItem(idx, { publicoAlvo: e.target.value })}
                          />
                          <div className="help">
                            Exemplos: pacientes do SUS/Convênio, acompanhantes, equipe assistencial
                            específica.
                          </div>
                        </div>

                        <div className="md:col-span-2">
                          <label className="label">Volume de Pessoas Impactadas</label>
                          <textarea
                            className="input resize-none"
                            rows={2}
                            value={it.volumePessoas}
                            onChange={(e) => updateItem(idx, { volumePessoas: e.target.value })}
                          />
                          <div className="help">
                            Exemplos: aumento no número de leitos, consultórios ou postos de
                            atendimento, quantitativos.
                          </div>
                        </div>
                      </>
                    )}

                    {/* Só OBRA — após Volume de Pessoas Impactadas */}
                    {tipo === 'OBRA' && (
                      <div className="md:col-span-2">
                        <label className="label">Principais Benefícios do Projeto</label>
                        <textarea
                          className="input resize-none"
                          rows={2}
                          value={it.beneficiosProjeto}
                          onChange={(e) => updateItem(idx, { beneficiosProjeto: e.target.value })}
                        />
                        <div className="help">
                          Exemplos: Para a segurança do paciente, humanização do ambiente,
                          ergonomia da equipe ou fluxos de hotelaria.
                        </div>
                      </div>
                    )}

                    {tipo === 'OBRA' && (
                      <div className="md:col-span-2">
                        <label className="label">A obra impacta o fluxo de RDC 50 (Anvisa)?</label>
                        <input
                          className="input"
                          value={it.impactoRdc50}
                          onChange={(e) => updateItem(idx, { impactoRdc50: e.target.value })}
                        />
                        <div className="help">
                          Modifica fluxos de áreas limpas/sujas, barreiras físicas ou
                          acessibilidade?
                        </div>
                      </div>
                    )}

                    {/* Só ITEM — após Volume de Pessoas Impactadas */}
                    {tipo === 'ITEM' && (
                      <div className="md:col-span-2">
                        <label className="label">
                          Justificativa ou Evidência Científica, Normativa e Alinhamento Clínico
                        </label>
                        <textarea
                          className="input resize-none"
                          rows={2}
                          value={it.justificativaClinica}
                          onChange={(e) => updateItem(idx, { justificativaClinica: e.target.value })}
                        />
                        <div className="help">
                          O item atende a critérios da ANVISA, normas de ergonomia NR-17,
                          acessibilidade NBR 9050 ou estudos sobre ambientes terapêuticos? O uso
                          é respaldado por diretrizes clínicas? O equipamento atende a alguma
                          linha de cuidado específica da instituição?
                        </div>
                      </div>
                    )}

                    {tipo === 'ITEM' && (
                      <div className="md:col-span-2">
                        <label className="label">Necessita de Infraestrutura Especial?</label>
                        <div className="text-xs text-ink-soft mb-1.5">
                          Selecione todas as que se aplicam
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {INFRA_ESPECIAL.map((inf) => {
                            const checked = it[inf.key] as boolean;
                            return (
                              <button
                                key={inf.key}
                                type="button"
                                // Marcar uma necessidade real limpa "plug-and-play".
                                onClick={() =>
                                  updateItem(idx, { [inf.key]: !checked, infraPlugAndPlay: false })
                                }
                                className={cn(
                                  'px-3 py-1.5 rounded-lg border text-sm transition',
                                  checked
                                    ? 'bg-brand text-white border-brand'
                                    : 'bg-white text-ink border-surface-border hover:border-brand',
                                )}
                              >
                                {inf.label}
                              </button>
                            );
                          })}
                          {/* Opção exclusiva: limpa todas as necessidades ao marcar. */}
                          <button
                            type="button"
                            onClick={() =>
                              updateItem(idx, {
                                infraPlugAndPlay: !it.infraPlugAndPlay,
                                infraAguaEsgoto: false,
                                infraEletricaRegulada: false,
                                infraBlindagem: false,
                                infraClimatizacao: false,
                                infraGasesMedicinais: false,
                              })
                            }
                            className={cn(
                              'px-3 py-1.5 rounded-lg border text-sm transition',
                              it.infraPlugAndPlay
                                ? 'bg-brand text-white border-brand'
                                : 'bg-white text-ink border-surface-border hover:border-brand',
                            )}
                          >
                            Não necessita / Equipamento plug-and-play
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Manutenção — só ITEM de grupos de equipamentos ("Se aplicável") */}
                    {tipo === 'ITEM' &&
                      grupoExigeManutencao(cat.grupos.find((g) => g.id === it.grupoId)?.nome) && (
                        <>
                          <div className="md:col-span-2">
                            <label className="label">
                              Necessidade de Manutenção Preventiva (Se aplicável)
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {MANUT_PREVENTIVA_OPCOES.map((op) => {
                                const checked = it.manutencaoPreventiva === op.key;
                                return (
                                  <button
                                    key={op.key}
                                    type="button"
                                    onClick={() =>
                                      updateItem(idx, {
                                        manutencaoPreventiva: checked ? '' : op.key,
                                      })
                                    }
                                    className={cn(
                                      'px-3 py-1.5 rounded-lg border text-sm transition text-left',
                                      checked
                                        ? 'bg-brand text-white border-brand'
                                        : 'bg-white text-ink border-surface-border hover:border-brand',
                                    )}
                                  >
                                    {op.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="md:col-span-2">
                            <label className="label">
                              Periodicidade da Manutenção Recomendada (Se aplicável)
                            </label>
                            <div className="text-xs text-ink-soft mb-1.5">
                              Selecione todas as que se aplicam
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {PERIODICIDADE_MANUT.map((p) => {
                                const checked = it[p.key] as boolean;
                                return (
                                  <button
                                    key={p.key}
                                    type="button"
                                    onClick={() => updateItem(idx, { [p.key]: !checked })}
                                    className={cn(
                                      'px-3 py-1.5 rounded-lg border text-sm transition',
                                      checked
                                        ? 'bg-brand text-white border-brand'
                                        : 'bg-white text-ink border-surface-border hover:border-brand',
                                    )}
                                  >
                                    {p.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}

                    <div className="md:col-span-2 text-right text-sm text-ink-soft tabular-nums">
                      Subtotal:{' '}
                      <b className="text-ink">{formatBRL(it.quantidade * it.valorUnitario)}</b>
                    </div>
                  </div>
                  )}
                </div>
                );
              })}
            </div>

            {showErros && !itensValidos && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                Há campos obrigatórios em branco (destacados em vermelho). Preencha-os para
                continuar.
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-surface-border">
              <div className="text-sm">
                Total:{' '}
                <span className="font-semibold text-ink tabular-nums text-lg">{formatBRL(total)}</span>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setStep(1)}>
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                {/* onMouseEnter no wrapper: botão desabilitado não dispara eventos de mouse.
                    Ao mirar "Revisar" com campos vazios, evidenciamos os obrigatórios. */}
                <span data-tour="nova-revisar" onMouseEnter={revelarErros}>
                  <button
                    className="btn-primary"
                    disabled={!itensValidos}
                    onClick={() => setStep(3)}
                  >
                    Revisar <ArrowRight className="w-4 h-4" />
                  </button>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Passo 3: Revisão ── */}
        {step === 3 && (
          <div className="card-body space-y-6">
            <h3 className="font-semibold text-ink text-lg">Revisão</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-surface-alt p-4 rounded-lg">
              <Field label="Tipo" value={tipoInfo?.titulo} />
              <Field
                label="Estabelecimento"
                value={cat.estabelecimentos.find((e) => e.id === ctx.estabelecimentoId)?.nome}
              />
              <Field label="Unidade" value={cat.unidades.find((u) => u.id === ctx.unidadeNegocioId)?.nome} />
              <Field label="Centro de custo" value={ctx.centroCustoCodigo} />
              <Field label="Tipo de verba" value="Definido pela administração" />
              <Field label="Itens" value={String(itens.length)} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="table-head">Descrição</th>
                    <th className="table-head">Data prev.</th>
                    <th className="table-head text-right">Qtd</th>
                    <th className="table-head text-right">V.Unit.</th>
                    <th className="table-head text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it, i) => (
                    <tr key={i} className="table-row">
                      <td className="table-cell">
                        {it.descricao}
                        <div className="text-xs text-ink-soft">
                          {cat.grupos.find((g) => g.id === it.grupoId)?.nome} ·{' '}
                          {cat.motivos.find((m) => m.id === it.motivoId)?.nome}
                          {tipo === 'OBRA' &&
                            ESCOPO_OBRA.filter((es) => it[es.key]).length > 0 &&
                            ` · ${ESCOPO_OBRA.filter((es) => it[es.key])
                              .map((es) => es.label)
                              .join(', ')}`}
                        </div>
                      </td>
                      <td className="table-cell tabular-nums text-ink-soft">
                        {it.dataPrevista
                          ? new Date(`${it.dataPrevista}T12:00:00`).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>
                      <td className="table-cell text-right tabular-nums">{it.quantidade}</td>
                      <td className="table-cell text-right tabular-nums">
                        {formatBRL(it.valorUnitario)}
                      </td>
                      <td className="table-cell text-right tabular-nums font-medium">
                        {formatBRL(it.quantidade * it.valorUnitario)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-brand-200 bg-brand-50">
                    <td className="table-cell font-semibold" colSpan={4}>
                      Total
                    </td>
                    <td className="table-cell text-right font-semibold text-lg tabular-nums">
                      {formatBRL(total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {create.isError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <div className="font-medium">Não foi possível salvar:</div>
                <ul className="list-disc list-inside mt-1">
                  {mensagensErro(create.error).map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-surface-border">
              <button className="btn-secondary" onClick={() => setStep(2)}>
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
              <button
                data-tour="nova-salvar"
                className="btn-primary"
                onClick={() => create.mutate()}
                disabled={create.isPending || simulando}
                title={simulando ? 'Indisponível durante a simulação' : undefined}
              >
                <Save className="w-4 h-4" />
                {create.isPending
                  ? 'Salvando…'
                  : isEdit
                    ? 'Salvar alterações'
                    : admin
                      ? 'Criar (Aprovação Final)'
                      : 'Salvar como rascunho'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Stepper de quantidade com botões − / + (mín. 1).
function QtyStepper({
  value,
  error,
  onChange,
}: {
  value: number;
  error?: boolean;
  onChange: (v: number) => void;
}) {
  const set = (v: number) => onChange(Math.max(1, Math.floor(Number.isFinite(v) ? v : 1)));
  return (
    <div
      className={cn(
        'flex items-stretch rounded-lg border border-surface-border overflow-hidden bg-white focus-within:ring-2 focus-within:ring-brand',
        error && 'border-red-400',
      )}
    >
      <button
        type="button"
        className="px-3 text-ink-soft hover:bg-surface-alt disabled:opacity-40"
        onClick={() => set(value - 1)}
        disabled={value <= 1}
        aria-label="Diminuir"
      >
        <Minus className="w-4 h-4" />
      </button>
      <input
        type="number"
        min="1"
        className="w-full text-center border-x border-surface-border py-2 text-sm text-ink focus:outline-none"
        value={value}
        onChange={(e) => set(Number(e.target.value))}
      />
      <button
        type="button"
        className="px-3 text-ink-soft hover:bg-surface-alt"
        onClick={() => set(value + 1)}
        aria-label="Aumentar"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

// Campo de valor em Real: exibe formatado (R$ 1.234,56), edita por centavos e tem
// atalhos +10 / +100 / +1000.
function MoneyInput({
  value,
  error,
  onChange,
}: {
  value: number;
  error?: boolean;
  onChange: (v: number) => void;
}) {
  const display = value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Interpreta os dígitos digitados como centavos (padrão de input de moeda BR).
  const parse = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    return digits ? parseInt(digits, 10) / 100 : 0;
  };
  return (
    <div>
      <div
        className={cn(
          'flex items-center rounded-lg border border-surface-border bg-white overflow-hidden focus-within:ring-2 focus-within:ring-brand',
          error && 'border-red-400',
        )}
      >
        <span className="px-3 self-stretch flex items-center text-sm text-ink-soft bg-surface-alt">
          R$
        </span>
        <input
          type="text"
          inputMode="numeric"
          className="w-full px-3 py-2 text-sm text-ink text-right focus:outline-none tabular-nums"
          value={display}
          onChange={(e) => onChange(parse(e.target.value))}
        />
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {[10, 100, 1000].map((inc) => (
          <button
            key={inc}
            type="button"
            className="flex-1 text-xs py-1 rounded-md border border-surface-border text-ink-soft hover:border-brand hover:text-brand transition tabular-nums"
            onClick={() => onChange(value + inc)}
          >
            +{inc.toLocaleString('pt-BR')}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-xs text-ink-soft uppercase tracking-wide">{label}</div>
      <div className="font-medium text-ink">{value || '—'}</div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = ['Tipo & Contexto', 'Itens', 'Revisão'];
  return (
    <div className="flex items-center gap-3">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <div key={label} className="flex items-center gap-3 flex-1">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0',
                done
                  ? 'bg-brand text-white'
                  : active
                    ? 'bg-brand-100 text-brand-800 ring-2 ring-brand'
                    : 'bg-surface-alt text-ink-muted',
              )}
            >
              {done ? <Check className="w-4 h-4" /> : n}
            </div>
            <div
              className={cn('text-sm font-medium', active || done ? 'text-ink' : 'text-ink-muted')}
            >
              {label}
            </div>
            {i < steps.length - 1 && (
              <div className={cn('flex-1 h-px', done ? 'bg-brand' : 'bg-surface-border')} />
            )}
          </div>
        );
      })}
    </div>
  );
}
