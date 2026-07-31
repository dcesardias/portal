import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useMe } from '../hooks/useMe';

/**
 * Acesso à tela de Relatório: liberada para VIEWER (só-leitura de todas as
 * solicitações) e para ADMIN. Usa o usuário EFETIVO (/users/me) — reage à
 * simulação de usuário.
 */
export function RelatorioRoute({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return null;
  const pode = !!me?.perfis.includes('VIEWER') || !!me?.perfis.includes('ADMIN');
  if (!pode) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
