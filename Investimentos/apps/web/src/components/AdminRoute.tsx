import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useMe } from '../hooks/useMe';

/**
 * Bloqueia acesso direto por URL a rotas administrativas para quem não tem
 * perfil ADMIN. Usa o usuário EFETIVO (/users/me): se um admin estiver
 * simulando um usuário sem ADMIN, a rota redireciona — coerente com "ver o
 * que ele vê".
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return null;
  if (!me?.perfis.includes('ADMIN')) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
