import { z } from 'zod';

export const EstabelecimentoSchema = z.object({
  id: z.number().int(),
  nome: z.string(),
  ativo: z.boolean(),
});

export const UnidadeNegocioSchema = z.object({
  id: z.number().int(),
  nome: z.string(),
  estabelecimentoId: z.number().int(),
  ativo: z.boolean(),
});

export const CentroCustoSchema = z.object({
  codigo: z.string(),
  descricao: z.string(),
  unidadeId: z.number().int(),
  ativo: z.boolean(),
});

export const CategoriaGrupoEnum = z.enum(['ITEM', 'OBRA', 'INSTRUMENTAL']);

export const GrupoInvestimentoSchema = z.object({
  id: z.number().int(),
  nome: z.string(),
  categoria: CategoriaGrupoEnum,
  contaContabil: z.string().nullable(),
  ativo: z.boolean(),
});

export const TipoItemEnum = z.enum(['ITEM', 'INSTRUMENTAL']);

export const ItemCatalogoSchema = z.object({
  id: z.number().int(),
  nome: z.string(),
  grupoId: z.number().int(),
  agrupamento: z.string().nullable(),
  classificacao: z.string().nullable(),
  definicao: z.string().nullable(),
  especificacao: z.string().nullable(),
  valorReferencia: z.number().nullable(),
  valorMin: z.number().nullable(),
  valorMax: z.number().nullable(),
  ativo: z.boolean(),
  tipo: TipoItemEnum,
  tipoVerba: z.string().nullable(),
});

export const MotivoSchema = z.object({
  id: z.number().int(),
  nome: z.string(),
  ativo: z.boolean(),
});

export type Estabelecimento = z.infer<typeof EstabelecimentoSchema>;
export type UnidadeNegocio = z.infer<typeof UnidadeNegocioSchema>;
export type CentroCusto = z.infer<typeof CentroCustoSchema>;
export type CategoriaGrupo = z.infer<typeof CategoriaGrupoEnum>;
export type GrupoInvestimento = z.infer<typeof GrupoInvestimentoSchema>;
export type TipoItem = z.infer<typeof TipoItemEnum>;
export type ItemCatalogo = z.infer<typeof ItemCatalogoSchema>;
export type Motivo = z.infer<typeof MotivoSchema>;
