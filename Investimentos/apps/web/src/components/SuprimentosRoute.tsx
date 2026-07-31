import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useMe } from '../hooks/useMe';

/**
 * Acesso à tela de Suprimentos (gestão de preços do catálogo e do valor
 * informado nas solicitações): liberada para SUPRIMENTOS e para ADMIN. Usa o
 * usuário EFETIVO (/users/me) — reage à simulação de usuário.
 */
export function SuprimentosRoute({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return null;
  const pode =
    !!me?.perfis.includes('SUPRIMENTOS') || !!me?.perfis.includes('ADMIN');
  if (!pode) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
