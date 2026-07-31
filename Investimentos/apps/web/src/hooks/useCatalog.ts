import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  Estabelecimento,
  UnidadeNegocio,
  CentroCusto,
  GrupoInvestimento,
  ItemCatalogo,
  Motivo,
} from '@investimentos/shared';

export function useCatalog() {
  const estabelecimentos =
    useQuery<Estabelecimento[]>({
      queryKey: ['cat', 'estabelecimentos'],
      queryFn: () => api.get('/catalog/estabelecimentos').then((r) => r.data),
      staleTime: 5 * 60_000,
    }).data ?? [];

  const unidades =
    useQuery<UnidadeNegocio[]>({
      queryKey: ['cat', 'unidades'],
      queryFn: () => api.get('/catalog/unidades').then((r) => r.data),
      staleTime: 5 * 60_000,
    }).data ?? [];

  const centros =
    useQuery<CentroCusto[]>({
      queryKey: ['cat', 'centros'],
      queryFn: () => api.get('/catalog/centros-custo').then((r) => r.data),
      staleTime: 5 * 60_000,
    }).data ?? [];

  const grupos =
    useQuery<GrupoInvestimento[]>({
      queryKey: ['cat', 'grupos'],
      queryFn: () => api.get('/catalog/grupos').then((r) => r.data),
      staleTime: 5 * 60_000,
    }).data ?? [];

  const itens =
    useQuery<ItemCatalogo[]>({
      queryKey: ['cat', 'itens'],
      queryFn: () => api.get('/catalog/itens').then((r) => r.data),
      staleTime: 5 * 60_000,
    }).data ?? [];

  const motivos =
    useQuery<Motivo[]>({
      queryKey: ['cat', 'motivos'],
      queryFn: () => api.get('/catalog/motivos').then((r) => r.data),
      staleTime: 5 * 60_000,
    }).data ?? [];

  return { estabelecimentos, unidades, centros, grupos, itens, motivos };
}
