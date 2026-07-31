import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export type Me = {
  id: string;
  login: string;
  nome: string;
  email: string;
  mustChangePwd: boolean;
  perfis: string[]; // sempre do usuário EFETIVO (o simulado, se houver)
  simulacao: {
    simulando: boolean;
    real: { id: string; login: string; nome: string; isAdmin: boolean };
  };
};

export function useMe() {
  return useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => api.get('/users/me').then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}
