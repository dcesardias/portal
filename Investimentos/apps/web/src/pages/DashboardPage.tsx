import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Clock,
  FilePlus2,
  CheckCircle2,
  XCircle,
  Wallet,
  ListFilter,
  CheckSquare,
  Send,
} from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { formatBRL, formatDateTime, cn } from '../lib/utils';
import { StatusBadge } from '../components/StatusBadge';
import { usePermissions } from '../hooks/usePermissions';
import { PageTour } from '../components/PageTour';
import type { TourStep } from '../components/GuidedTour';
import type { SolicitacaoStatus } from '@investimentos/shared';

type Dashboard = {
  total: number;
  emAprovacao: number;
  aprovadas: number;
  reprovadas: number;
  valorTotal: number;
  porGrupo: { grupo: string; valor: number }[];
  porStatus: { status: string; count: number }[];
};

type Row = {
  id: string;
  numero: string;
  status: SolicitacaoStatus;
  criadaEm: string;
  criadaPor: string;
  etapaAtual: string | null;
  itens: { quantidade: number; valorUnitario: number }[];
};

export function DashboardPage() {
  const navigate = useNavigate();
  const { isAprovador, isViewer } = usePermissions();
  // Simulação agora permite ESCRITA (o admin age COMO o usuário simulado); não
  // gateia os atalhos. O banner global (AppShell) avisa o admin.
  const simulando = false;
  const { data: kpis } = useQuery<Dashboard>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/relatorios/dashboard').then((r) => r.data),
  });

  const { data: recentes = [] } = useQuery<Row[]>({
    queryKey: ['minhas'],
    queryFn: () => api.get('/solicitacoes/minhas').then((r) => r.data),
  });

  const maxGrupo = Math.max(1, ...(kpis?.porGrupo.map((g) => g.valor) ?? [1]));

  const tourSteps: TourStep[] = [
    {
      title: 'Este é o seu Dashboard 📊',
      body: isViewer
        ? 'Aqui você acompanha a visão geral de todas as solicitações de investimento. Vou mostrar rapidinho o que há nesta tela.'
        : 'Aqui você tem a visão geral das suas solicitações de investimento. Vou mostrar rapidinho o que há nesta tela.',
    },
    ...(isViewer
      ? []
      : [
          {
            target: '[data-tour="dash-nova"]',
            title: 'Criar uma solicitação',
            body: 'O atalho principal: começa uma nova solicitação de investimento num fluxo guiado de 3 etapas.',
          },
        ]),
    {
      target: '[data-tour="dash-kpis"]',
      title: 'Indicadores',
      body: 'Um resumo rápido: total de solicitações, quantas aguardam aprovação, aprovadas e reprovadas.',
    },
    {
      target: '[data-tour="dash-grupos"]',
      title: 'Distribuição por grupo',
      body: 'Mostra como o valor demandado no ano se distribui entre os grupos de investimento.',
    },
    {
      target: '[data-tour="dash-recentes"]',
      title: 'Solicitações recentes',
      body: isViewer
        ? 'As solicitações mais recentes de todos os usuários. Clique numa linha para abrir os detalhes.'
        : 'Suas últimas solicitações. Clique em qualquer linha para abrir os detalhes, ou em “Ver todas” para a lista completa.',
    },
    ...(isViewer
      ? []
      : [
          {
            target: '[data-tour="dash-acoes"]',
            title: 'Ações rápidas',
            body: isAprovador
              ? 'Atalhos para criar uma solicitação, retomar rascunhos e abrir a fila de itens aguardando a sua aprovação.'
              : 'Atalhos para criar uma solicitação e retomar rascunhos pendentes de envio.',
          },
        ]),
  ];

  return (
    <>
      <PageTour pageKey="dashboard" steps={tourSteps} />
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral das solicitações de investimento"
        actions={
          isViewer ? undefined : simulando ? (
            <span
              data-tour="dash-nova"
              className="btn-primary opacity-50 cursor-not-allowed"
              title="Indisponível durante a simulação"
            >
              <FilePlus2 className="w-4 h-4" /> Nova solicitação
            </span>
          ) : (
            <Link to="/solicitacoes/nova" data-tour="dash-nova" className="btn-primary">
              <FilePlus2 className="w-4 h-4" /> Nova solicitação
            </Link>
          )
        }
      />

      {/* KPIs */}
      <div data-tour="dash-kpis" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          icon={ListFilter}
          label="Total de solicitações"
          value={kpis?.total ?? '—'}
          accent="brand"
        />
        <KpiCard
          icon={Clock}
          label="Aguardando aprovação"
          value={kpis?.emAprovacao ?? '—'}
          accent="amber"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Aprovadas"
          value={kpis?.aprovadas ?? '—'}
          accent="emerald"
        />
        <KpiCard
          icon={XCircle}
          label="Reprovadas"
          value={kpis?.reprovadas ?? '—'}
          accent="red"
        />
      </div>

      {/* Valor total demandado + distribuição por grupo (os grupos somam o total) */}
      <div data-tour="dash-grupos" className="card mb-6">
        <div className="card-body">
          {/* Cabeçalho: valor total demandado em destaque */}
          <div className="flex items-center gap-3 pb-4 mb-4 border-b border-surface-border">
            <div className="w-11 h-11 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-ink-soft uppercase tracking-wide">
                Valor total demandado
              </div>
              <div className="text-2xl font-semibold text-ink tabular-nums">
                {kpis ? formatBRL(kpis.valorTotal) : '—'}
              </div>
            </div>
            <span className="ml-auto self-start text-xs text-ink-soft">Ano corrente</span>
          </div>

          {/* Distribuição por grupo */}
          <h3 className="font-semibold text-ink mb-3">Distribuição por grupo</h3>
          <div className="space-y-3">
            {(kpis?.porGrupo ?? []).map((g) => (
              <div key={g.grupo}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-ink">{g.grupo}</span>
                  <span className="text-ink-soft tabular-nums">{formatBRL(g.valor)}</span>
                </div>
                <div className="h-2 bg-surface-alt rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand"
                    style={{ width: `${Math.max(3, (g.valor / maxGrupo) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {kpis && kpis.porGrupo.length === 0 && (
              <div className="text-sm text-ink-soft">Nenhum valor demandado no período.</div>
            )}
            {!kpis && <div className="text-sm text-ink-soft">Carregando…</div>}
          </div>
        </div>
      </div>

      {/* Recentes */}
      <div data-tour="dash-recentes" className="card">
        <div className="card-header">
          <h3 className="font-semibold text-ink">Solicitações recentes</h3>
          <Link to="/solicitacoes" className="text-sm text-brand-700 hover:underline inline-flex items-center gap-1">
            Ver todas <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="table-head">Número</th>
                <th className="table-head">Criada em</th>
                <th className="table-head">Criada por</th>
                <th className="table-head">Etapa atual</th>
                <th className="table-head text-right">Valor</th>
                <th className="table-head">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentes.slice(0, 6).map((r) => (
                <tr
                  key={r.id}
                  className="table-row cursor-pointer hover:bg-surface-alt transition"
                  onClick={() => navigate(`/solicitacoes/${r.id}`)}
                >
                  <td className="table-cell font-medium text-brand-700">{r.numero}</td>
                  <td className="table-cell text-ink-soft">{formatDateTime(r.criadaEm)}</td>
                  <td className="table-cell">{r.criadaPor}</td>
                  <td className="table-cell text-ink-soft">{r.etapaAtual ?? '—'}</td>
                  <td className="table-cell text-right tabular-nums">
                    {formatBRL(r.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0))}
                  </td>
                  <td className="table-cell">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
              {recentes.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-ink-soft">
                    Nenhuma solicitação encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick actions — ocultas para o Viewer (só-leitura) */}
      <div
        data-tour="dash-acoes"
        className={cn(
          'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6',
          isViewer && 'hidden',
        )}
      >
        <QuickAction
          to="/solicitacoes/nova"
          icon={FilePlus2}
          title="Criar solicitação"
          desc="Fluxo guiado em 3 etapas"
          disabled={simulando}
        />
        <QuickAction
          to="/solicitacoes?status=RASCUNHO"
          icon={Send}
          title="Enviar rascunhos"
          desc="Retome e envie seus pedidos pendentes"
          disabled={simulando}
        />
        {isAprovador && (
          <QuickAction to="/aprovacoes" icon={CheckSquare} title="Aprovar pendentes" desc="Fila de itens aguardando você" />
        )}
      </div>
    </>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Clock;
  label: string;
  value: string | number;
  accent: 'brand' | 'amber' | 'emerald' | 'red';
}) {
  const bg = {
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
  }[accent];
  return (
    <div className="card">
      <div className="card-body flex items-center gap-4">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${bg}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs text-ink-soft uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-semibold text-ink tabular-nums">{value}</div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  title,
  desc,
  disabled,
}: {
  to: string;
  icon: typeof Clock;
  title: string;
  desc: string;
  disabled?: boolean;
}) {
  const content = (
    <>
      <div className="w-11 h-11 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center group-hover:bg-brand group-hover:text-white transition">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-ink">{title}</div>
        <div className="text-xs text-ink-soft">{desc}</div>
      </div>
      <ArrowRight className="w-4 h-4 text-ink-muted group-hover:text-brand" />
    </>
  );

  if (disabled) {
    return (
      <div
        className="card card-body flex items-center gap-4 opacity-50 cursor-not-allowed"
        title="Indisponível durante a simulação"
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      to={to}
      className="card card-body hover:border-brand hover:shadow-lg transition group flex items-center gap-4"
    >
      {content}
    </Link>
  );
}
