import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useMe } from '../hooks/useMe';

/**
 * Bloqueia acesso à fila de aprovação para quem não tem perfil de aprovador.
 * Usa o usuário EFETIVO (/users/me) — reage à simulação de usuário.
 */
export function ApproverRoute({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return null;
  const podeAprovar =
    !!me?.perfis.includes('APROVADOR') || !!me?.perfis.includes('APROVADOR_FINAL');
  if (!podeAprovar) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
