import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useMe } from '../hooks/useMe';

/**
 * Acesso à Mesa de Aprovação Final: aprovadores finais (GPE) e admin. Usa o
 * usuário EFETIVO (/users/me) — reage à simulação de usuário.
 */
export function AprovadorFinalRoute({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return null;
  const pode =
    !!me?.perfis.includes('APROVADOR_FINAL') || !!me?.perfis.includes('ADMIN');
  if (!pode) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
