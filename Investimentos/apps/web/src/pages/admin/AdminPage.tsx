import { useState } from 'react';
import {
  Users,
  Shield,
  Workflow,
  Lock,
  Wallet,
  FileSpreadsheet,
  Package,
  CalendarPlus,
} from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { cn } from '../../lib/utils';
import { AdminUsuariosPanel } from './AdminUsuariosPanel';
import { AdminAlcadasPanel } from './AdminAlcadasPanel';
import { AdminFluxosPanel } from './AdminFluxosPanel';
import { AdminRestricoesPanel } from './AdminRestricoesPanel';
import { AdminVerbaPanel } from './AdminVerbaPanel';
import { AdminRelatorioPanel } from './AdminRelatorioPanel';
import { AdminItensPanel } from './AdminItensPanel';
import { AdminCarryoverPanel } from './AdminCarryoverPanel';

const tabs = [
  { key: 'relatorio', label: 'Relatório', icon: FileSpreadsheet },
  { key: 'itens', label: 'Catálogo de Itens', icon: Package },
  { key: 'usuarios', label: 'Usuários', icon: Users },
  { key: 'alcadas', label: 'Alçadas de Aprovação', icon: Shield },
  { key: 'fluxos', label: 'Fluxos de Aprovação', icon: Workflow },
  { key: 'verba', label: 'Tipo de Verba', icon: Wallet },
  { key: 'carryover', label: 'Carryover', icon: CalendarPlus },
  { key: 'restricoes', label: 'Restrições de Solicitante', icon: Lock },
] as const;

type TabKey = (typeof tabs)[number]['key'];

const SUBTITLES: Record<TabKey, string> = {
  relatorio: 'Relatório completo de todas as solicitações — filtre e exporte para Excel',
  itens: 'Cadastre e gerencie os itens do catálogo (nome, grupo, valor de referência, RENEM)',
  usuarios: 'Cadastre pessoas, defina perfis de acesso e gerencie senhas',
  alcadas: 'Defina quem aprova cada estabelecimento × grupo (Focal, Supervisão, Final)',
  fluxos: 'Monte os fluxos de aprovação e as regras que decidem qual fluxo se aplica',
  verba: 'Defina o tipo de verba (RP/VP) das solicitações em lote, com filtros',
  carryover: 'Prorrogue itens aprovados deste ano para o próximo — informe solicitante e datas',
  restricoes: 'Opcional — limite um solicitante a centros de custo / contas específicas',
};

export function AdminPage() {
  const [tab, setTab] = useState<TabKey>('relatorio');

  return (
    <>
      <PageHeader title="Administração" subtitle={SUBTITLES[tab]} />

      <div className="flex flex-wrap gap-1 mb-6 border-b border-surface-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap',
                active
                  ? 'border-brand text-brand-800'
                  : 'border-transparent text-ink-soft hover:text-ink',
              )}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'relatorio' && <AdminRelatorioPanel />}
      {tab === 'itens' && <AdminItensPanel />}
      {tab === 'usuarios' && <AdminUsuariosPanel />}
      {tab === 'alcadas' && <AdminAlcadasPanel />}
      {tab === 'fluxos' && <AdminFluxosPanel />}
      {tab === 'verba' && <AdminVerbaPanel />}
      {tab === 'carryover' && <AdminCarryoverPanel />}
      {tab === 'restricoes' && <AdminRestricoesPanel />}
    </>
  );
}
