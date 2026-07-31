import { useMe } from './useMe';

/**
 * RBAC de UI derivado do usuário EFETIVO (/users/me) — não do JWT. Quando um
 * admin está simulando outro usuário, `perfis`/`isAdmin`/`isAprovador` refletem
 * o simulado (menu e rotas mudam sozinhos); `realIsAdmin` é sempre do usuário
 * autenticado de verdade e controla quem pode ver o seletor de simulação.
 */
export function usePermissions() {
  const { data: me, isLoading } = useMe();
  const perfis = me?.perfis ?? [];

  return {
    me,
    isLoading,
    perfis,
    isAdmin: perfis.includes('ADMIN'),
    isAprovador: perfis.includes('APROVADOR') || perfis.includes('APROVADOR_FINAL'),
    isAprovadorFinal: perfis.includes('APROVADOR_FINAL'),
    isViewer: perfis.includes('VIEWER'),
    isSuprimentos: perfis.includes('SUPRIMENTOS'),
    isContabilidade: perfis.includes('CONTABILIDADE'),
    simulando: me?.simulacao?.simulando ?? false,
    realIsAdmin: me?.simulacao?.real.isAdmin ?? false,
    realNome: me?.simulacao?.real.nome,
    meNome: me?.nome,
  };
}
