import type { SolicitacaoStatus } from '@investimentos/shared';
import { cn } from '../lib/utils';

const styles: Record<SolicitacaoStatus, { label: string; className: string }> = {
  RASCUNHO: { label: 'Rascunho', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  EM_APROVACAO: { label: 'Em aprovação', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  APROVACAO_INICIAL: { label: 'Aprovação inicial', className: 'bg-sky-100 text-sky-800 border-sky-200' },
  APROVADO: { label: 'Aprovação final', className: 'bg-brand-100 text-brand-800 border-brand-200' },
  REPROVADO: { label: 'Reprovado', className: 'bg-red-100 text-red-700 border-red-200' },
  EM_REVISAO: { label: 'Em revisão', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  CANCELADO: { label: 'Cancelado', className: 'bg-slate-100 text-slate-500 border-slate-200 line-through' },
};

export function StatusBadge({ status }: { status: SolicitacaoStatus }) {
  const s = styles[status];
  return <span className={cn('badge border', s.className)}>{s.label}</span>;
}
