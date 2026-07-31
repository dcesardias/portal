import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  FilePlus2,
  Files,
  CheckSquare,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Eye,
  HelpCircle,
  BarChart3,
  Coins,
  Calculator,
  FileText,
  Gavel,
  LogOut as ExitSimIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn, initials } from '../lib/utils';
import { logout } from '../lib/auth';
import { api } from '../lib/api';
import { setSimulateUserId } from '../lib/simulation';
import { usePermissions } from '../hooks/usePermissions';
import { SearchableSelect } from './SearchableSelect';
import { GuidedTour, type TourStep } from './GuidedTour';
import { useTourRegistry } from './TourContext';
import { Logo } from './Logo';

// Mapeia rotas do menu -> id de destaque do tour.
const TOUR_KEY: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/solicitacoes/nova': 'nova',
  '/solicitacoes': 'minhas',
  '/aprovacoes': 'aprovacoes',
  '/relatorio': 'relatorio',
  '/admin': 'admin',
};

// Menu do solicitante (padrão). O Viewer usa um menu próprio (Dashboard + Relatório).
const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/solicitacoes/nova', label: 'Nova Solicitação', icon: FilePlus2 },
  { to: '/solicitacoes', label: 'Minhas Solicitações', icon: Files },
];

type AdminUsuarioResumo = { id: string; login: string; nome: string; ativo: boolean };

export function AppShell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const {
    me,
    isAdmin,
    isAprovador,
    isAprovadorFinal,
    isViewer,
    isSuprimentos,
    isContabilidade,
    simulando,
    realIsAdmin,
  } = usePermissions();
  const { replayPage } = useTourRegistry();

  // ── Tutorial guiado (spotlight) ──────────────────────────────────────────
  const [tourRun, setTourRun] = useState(false);

  const tourSteps: TourStep[] = [
    {
      title: 'Bem-vindo ao AACD Investe 👋',
      body: 'Em poucos passos você aprende a usar o sistema de solicitações de investimento. Dá pra rever este tutorial quando quiser pelo botão de ajuda (?) no topo.',
    },
    {
      target: '[data-tour="nova"]',
      title: 'Criar uma solicitação',
      body: 'Comece por aqui. Escolha estabelecimento, unidade e centro de custo; adicione os itens (equipamento, obra ou instrumental) com quantidade, valor e justificativa; e envie para aprovação.',
    },
    {
      target: '[data-tour="minhas"]',
      title: 'Acompanhar',
      body: 'Aqui você vê o status de cada pedido (rascunho, em aprovação, aprovado, reprovado…). Rascunhos podem ser editados e reenviados.',
    },
    {
      target: '[data-tour="dashboard"]',
      title: 'Visão geral',
      body: 'O Dashboard resume os totais e a distribuição das solicitações por grupo.',
    },
    ...(isAprovador
      ? [
          {
            target: '[data-tour="aprovacoes"]',
            title: 'Fila de Aprovação',
            body: 'Os pedidos que dependem da sua aprovação aparecem aqui. Abra cada um, confira os itens e escolha Aprovar, Reprovar ou Pedir revisão.',
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            target: '[data-tour="admin"]',
            title: 'Administração',
            body: 'Configurações do sistema: catálogo de itens, usuários, alçadas e fluxos de aprovação, tipos de verba e relatórios.',
          },
        ]
      : []),
    {
      target: '[data-tour="ajuda"]',
      title: 'Precisou de ajuda?',
      body: 'Quando quiser rever o tutorial da tela em que você está, é só clicar aqui. Bom trabalho!',
    },
  ];

  function startTour() {
    setOpen(true); // garante o menu visível no mobile
    setTourRun(true);
  }
  // Botão (?): reabre o tour da tela atual; se a tela não tiver tour próprio,
  // cai para o tour de navegação (visão geral do menu lateral).
  function onHelp() {
    if (!replayPage()) startTour();
  }
  function closeTour() {
    setTourRun(false);
    if (me) {
      try {
        localStorage.setItem(`investfacil_tour_v1_${me.id}`, '1');
      } catch {
        /* localStorage indisponível — ignora */
      }
    }
  }

  // Abre automaticamente no primeiro acesso de cada usuário.
  // NUNCA em modo simulação: o admin está só visualizando como outro usuário —
  // o `me` efetivo muda para o simulado (que "nunca viu" o tour) e dispararia.
  useEffect(() => {
    if (!me || simulando) return;
    let seen = true;
    try {
      seen = !!localStorage.getItem(`investfacil_tour_v1_${me.id}`);
    } catch {
      seen = true;
    }
    if (seen) return;
    const t = setTimeout(() => {
      setOpen(true);
      setTourRun(true);
    }, 700);
    return () => clearTimeout(t);
  }, [me, simulando]);

  // Lista de usuários para o seletor de simulação — só carrega para quem
  // realmente é admin (o efetivo pode não ser, durante a própria simulação).
  const { data: usuarios = [] } = useQuery<AdminUsuarioResumo[]>({
    queryKey: ['admin', 'usuarios'],
    queryFn: () => api.get('/admin/usuarios').then((r) => r.data),
    enabled: realIsAdmin,
    staleTime: 5 * 60_000,
  });

  const simular = useMutation({
    mutationFn: (id: string) => api.post(`/admin/usuarios/${id}/simular`).then((r) => r.data),
    onSuccess: (_data, id) => {
      setSimulateUserId(id);
      qc.invalidateQueries();
    },
  });

  function sairDaSimulacao() {
    setSimulateUserId(null);
    qc.invalidateQueries();
  }

  // Viewer é só-leitura: enxerga apenas Dashboard + Relatório.
  // Demais perfis usam o menu padrão (com "Fila" p/ aprovador e "Administração" p/ admin).
  const navItems = isViewer
    ? [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/relatorio', label: 'Relatório', icon: BarChart3 },
      ]
    : [
        ...nav,
        ...(isAprovador
          ? [
              { to: '/aprovacoes', label: 'Fila de Aprovação', icon: CheckSquare },
              { to: '/meu-relatorio', label: 'Relatório', icon: FileText },
            ]
          : []),
        ...(isAprovadorFinal || isAdmin
          ? [{ to: '/mesa-final', label: 'Mesa de Aprovação Final', icon: Gavel }]
          : []),
        ...(isSuprimentos || isAdmin
          ? [{ to: '/suprimentos', label: 'Suprimentos', icon: Coins }]
          : []),
        ...(isContabilidade || isAdmin
          ? [{ to: '/contabilidade', label: 'Contabilidade', icon: Calculator }]
          : []),
        ...(isAdmin ? [{ to: '/admin', label: 'Administração', icon: ShieldCheck }] : []),
      ];

  async function onLogout() {
    await logout();
    // Volta para a tela de LOGIN da própria aplicação (full-load). O `?logout=1`
    // impede o SSO silencioso de relogar na hora usando a sessão do Portal.
    window.location.href = '/aacdinveste/login?logout=1';
  }

  return (
    <div className="min-h-screen flex bg-surface-alt">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-surface-border flex flex-col transition-transform md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="h-16 px-5 flex items-center gap-3 border-b border-surface-border">
          <div className="w-9 h-9 rounded-lg bg-white border border-surface-border flex items-center justify-center p-1 shadow-sm">
            <Logo
              className="max-h-full max-w-full object-contain"
              fallback={<span className="text-brand-700 font-bold">A</span>}
            />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink leading-tight">AACD Investe</div>
            <div className="text-xs text-ink-soft leading-tight">Solicitação de investimentos</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                data-tour={TOUR_KEY[item.to]}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition',
                    isActive
                      ? 'bg-brand-50 text-brand-800'
                      : 'text-ink-soft hover:bg-surface-alt hover:text-ink',
                  )
                }
                // `end` evita que "/solicitacoes" (Minhas) fique ativo em
                // "/solicitacoes/nova" — sem isso, o match é por prefixo e dois
                // itens do menu acendem juntos.
                end={item.to === '/dashboard' || item.to === '/solicitacoes'}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {simulando && (
          <div className="bg-amber-500 text-white text-sm px-4 md:px-6 py-2 flex items-center justify-between gap-3 flex-wrap sticky top-0 z-30">
            <span className="inline-flex items-center gap-2">
              <Eye className="w-4 h-4 flex-shrink-0" />
              Agindo como <b>{me?.nome}</b> — as ações são registradas em nome dele
            </span>
            <button
              onClick={sairDaSimulacao}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white/15 hover:bg-white/25 transition text-xs font-medium"
            >
              <ExitSimIcon className="w-3.5 h-3.5" /> Sair da simulação
            </button>
          </div>
        )}

        <header className="h-16 bg-white border-b border-surface-border flex items-center px-4 md:px-6 gap-4 sticky top-0 z-20">
          <button
            className="md:hidden p-2 rounded-lg hover:bg-surface-alt"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {realIsAdmin && !simulando && (
            <div className="w-full max-w-xs">
              <SearchableSelect
                value={null}
                options={usuarios
                  .filter((u) => u.ativo)
                  .map((u) => ({ id: u.id, label: `${u.nome} (${u.login})` }))}
                onChange={(id) => id && simular.mutate(String(id))}
                placeholder="Simular usuário…"
              />
            </div>
          )}

          <div className="flex-1" />

          {/* Usuário logado + Sair — canto superior direito */}
          <div className="flex items-center gap-3">
            <button
              data-tour="ajuda"
              onClick={onHelp}
              className="p-2 rounded-lg text-ink-soft hover:bg-surface-alt hover:text-ink transition"
              title="Ajuda — ver tutorial desta tela"
              aria-label="Ajuda — ver tutorial desta tela"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="min-w-0 leading-tight text-right">
                <div className="text-sm font-medium text-ink truncate max-w-[200px]">
                  {me?.nome ?? me?.login ?? '—'}
                </div>
                <div className="text-xs text-ink-muted truncate max-w-[200px]">
                  {me?.email ?? ''}
                </div>
              </div>
              <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center font-semibold text-sm">
                {initials(me?.nome ?? me?.login ?? '?')}
              </div>
            </div>
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm text-ink-soft hover:bg-surface-alt rounded-lg transition"
            >
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 min-w-0">
          <Outlet />
        </main>
      </div>

      <GuidedTour steps={tourSteps} run={tourRun} onClose={closeTour} />
    </div>
  );
}
