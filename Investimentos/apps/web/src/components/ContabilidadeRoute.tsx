import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useMe } from '../hooks/useMe';

/**
 * Acesso à tela de Contabilidade (vínculo de material do Tasy e conta contábil
 * dos itens): liberada para CONTABILIDADE e ADMIN. Usa o usuário EFETIVO
 * (/users/me) — reage à simulação de usuário.
 */
export function ContabilidadeRoute({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return null;
  const pode =
    !!me?.perfis.includes('CONTABILIDADE') || !!me?.perfis.includes('ADMIN');
  if (!pode) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
