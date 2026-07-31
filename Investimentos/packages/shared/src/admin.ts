import { z } from 'zod';
import { TipoVerbaEnum } from './solicitacao.js';

export const PerfilNomeEnum = z.enum([
  'SOLICITANTE',
  'APROVADOR',
  'APROVADOR_FINAL',
  'ADMIN',
  'VIEWER',
  'SUPRIMENTOS',
  'CONTABILIDADE',
]);

export const NivelAlcadaEnum = z.enum(['FOCAL', 'SUP', 'FINAL']);

// ── Usuários ──────────────────────────────────────────────────────────────
export const AdminUsuarioCreateSchema = z.object({
  login: z.string().trim().min(3).max(64),
  nome: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  perfis: z.array(PerfilNomeEnum).default([]),
});

export const AdminUsuarioUpdateSchema = z.object({
  nome: z.string().trim().min(2).max(255).optional(),
  email: z.string().trim().email().max(255).optional(),
});

export const AdminUsuarioAtivoSchema = z.object({
  ativo: z.boolean(),
});

export const AdminUsuarioPerfisSchema = z.object({
  perfis: z.array(PerfilNomeEnum),
});

// ── Alçadas de aprovação (RegraAlcada) ──────────────────────────────────────
export const RegraAlcadaCreateSchema = z.object({
  estabelecimentoId: z.number().int(),
  grupoId: z.number().int(),
  nivel: NivelAlcadaEnum,
  usuarioLogin: z.string().trim().min(1).max(64),
});

export const RegraAlcadaBulkCreateSchema = z.object({
  estabelecimentoId: z.number().int(),
  grupoIds: z.array(z.number().int()).min(1),
  nivel: NivelAlcadaEnum,
  usuarioLogin: z.string().trim().min(1).max(64),
});

// Nível não é editável aqui de propósito: ele é parte da identidade estrutural
// da regra (junto com estabelecimento + grupo — ver @@unique no schema Prisma),
// não um atributo solto do aprovador. Trocar o nível de uma regra existente
// deixaria o estabelecimento/grupo sem cobertura no nível antigo "por baixo dos
// panos". Para mover alguém de nível, crie uma nova regra no nível correto
// (bulk-matrix) e remova a antiga. Só o aprovador (usuarioLogin) é editável
// inline — é a operação segura de "essa vaga passa a ser de outra pessoa".
export const RegraAlcadaUpdateSchema = z.object({
  usuarioLogin: z.string().trim().min(1).max(64).optional(),
});

/** Cria/edita regras de alçada em lote para várias combinações de uma vez
 * (cross product de estabelecimentos x grupos x nível), no mesmo espírito da
 * lógica usada na migração legada (pivot ponto_focal/aprovador_sup/aprovador_final). */
export const RegraAlcadaBulkMatrixSchema = z.object({
  estabelecimentoIds: z.array(z.number().int()).min(1),
  grupoIds: z.array(z.number().int()).min(1),
  nivel: NivelAlcadaEnum,
  usuarioLogin: z.string().trim().min(1).max(64),
});

/** Reatribui em massa todas as RegraAlcada de um usuário origem para um destino
 * (ex.: gestor substituído). Detecta conflitos em vez de sobrescrever. */
export const SubstituirUsuarioAlcadaSchema = z.object({
  origemLogin: z.string().trim().min(1).max(64),
  destinoLogin: z.string().trim().min(1).max(64),
  estabelecimentoId: z.number().int().optional(),
});

// ── Fluxo de aprovação (Fluxo / RegraFluxo) ─────────────────────────────────
export const RegraFluxoCreateSchema = z.object({
  fluxoId: z.string().uuid(),
  prioridade: z.number().int(),
  estabelecimentoId: z.number().int().nullable().optional(),
  grupoId: z.number().int().nullable().optional(),
  tipoVerba: TipoVerbaEnum.nullable().optional(),
  vlMin: z.number().nonnegative().nullable().optional(),
  vlMax: z.number().nonnegative().nullable().optional(),
  isDefault: z.boolean().default(false),
});

export const RegraFluxoUpdateSchema = RegraFluxoCreateSchema.partial();

export const SimularFluxoSchema = z.object({
  estabelecimentoId: z.number().int().optional(),
  grupoId: z.number().int().optional(),
  tipoVerba: TipoVerbaEnum.optional(),
  valor: z.number().nonnegative().optional(),
});

// ── Fluxo + Etapas (montador de fluxo) ──────────────────────────────────────
export const FonteAprovadorEnum = z.enum([
  'ALCADA_FOCAL',
  'ALCADA_SUP',
  'ALCADA_FINAL',
  'PERFIL',
  'USUARIO',
]);

export const EtapaFluxoInputSchema = z
  .object({
    nome: z.string().trim().min(1).max(120),
    fonteAprovador: FonteAprovadorEnum,
    perfilAlvo: PerfilNomeEnum.nullable().optional(),
    usuarioAlvoId: z.string().uuid().nullable().optional(),
    obrigatoria: z.boolean().default(true),
    permiteRevisao: z.boolean().default(true),
    aprovacaoParalela: z.boolean().default(false),
  })
  .superRefine((e, ctx) => {
    if (e.fonteAprovador === 'PERFIL' && !e.perfilAlvo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['perfilAlvo'],
        message: 'Etapa por Perfil exige selecionar o perfil.',
      });
    }
    if (e.fonteAprovador === 'USUARIO' && !e.usuarioAlvoId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['usuarioAlvoId'],
        message: 'Etapa por Usuário exige selecionar o usuário.',
      });
    }
  });

export const FluxoCreateSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(500).nullable().optional(),
  ativo: z.boolean().default(true),
  etapas: z.array(EtapaFluxoInputSchema).min(1),
});

export const FluxoUpdateSchema = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  descricao: z.string().trim().max(500).nullable().optional(),
  ativo: z.boolean().optional(),
  // Quando presente, substitui TODAS as etapas do fluxo (só permitido se o
  // fluxo ainda não tiver aprovações registradas — senão quebraria histórico).
  etapas: z.array(EtapaFluxoInputSchema).min(1).optional(),
});

// ── Tipo de verba em lote (só admin/GPE define) ─────────────────────────────
export const SolicitacaoVerbaBulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  tipoVerba: TipoVerbaEnum.nullable(), // null = limpar / "sem verba"
});

// ── Restrição de solicitante (opcional) ─────────────────────────────────────
export const RestricaoSolicitanteCreateSchema = z
  .object({
    userId: z.string().uuid(),
    centroCustoCodigo: z.string().trim().max(20).nullable().optional(),
    contaContabil: z.string().trim().max(60).nullable().optional(),
  })
  .refine((d) => !!(d.centroCustoCodigo || d.contaContabil), {
    message: 'Informe centro de custo e/ou conta contábil.',
    path: ['centroCustoCodigo'],
  });

export type PerfilNome = z.infer<typeof PerfilNomeEnum>;
export type NivelAlcada = z.infer<typeof NivelAlcadaEnum>;
export type AdminUsuarioCreate = z.infer<typeof AdminUsuarioCreateSchema>;
export type AdminUsuarioUpdate = z.infer<typeof AdminUsuarioUpdateSchema>;
export type AdminUsuarioAtivo = z.infer<typeof AdminUsuarioAtivoSchema>;
export type AdminUsuarioPerfis = z.infer<typeof AdminUsuarioPerfisSchema>;
export type RegraAlcadaCreate = z.infer<typeof RegraAlcadaCreateSchema>;
export type RegraAlcadaBulkCreate = z.infer<typeof RegraAlcadaBulkCreateSchema>;
export type RegraAlcadaUpdate = z.infer<typeof RegraAlcadaUpdateSchema>;
export type RegraAlcadaBulkMatrix = z.infer<typeof RegraAlcadaBulkMatrixSchema>;
export type SubstituirUsuarioAlcada = z.infer<typeof SubstituirUsuarioAlcadaSchema>;
export type RegraFluxoCreate = z.infer<typeof RegraFluxoCreateSchema>;
export type RegraFluxoUpdate = z.infer<typeof RegraFluxoUpdateSchema>;
export type SimularFluxo = z.infer<typeof SimularFluxoSchema>;
export type FonteAprovador = z.infer<typeof FonteAprovadorEnum>;
export type EtapaFluxoInput = z.infer<typeof EtapaFluxoInputSchema>;
export type FluxoCreate = z.infer<typeof FluxoCreateSchema>;
export type FluxoUpdate = z.infer<typeof FluxoUpdateSchema>;
export type RestricaoSolicitanteCreate = z.infer<typeof RestricaoSolicitanteCreateSchema>;
export type SolicitacaoVerbaBulk = z.infer<typeof SolicitacaoVerbaBulkSchema>;

// ── Carryover (prorrogação com dados informados pelo admin) ──────────────────
export const CarryoverItemSchema = z.object({
  solicitacaoId: z.string().uuid(),
  itemId: z.string().uuid(),
  solicitanteId: z.string().uuid(),
  dataOriginal: z.string().min(1), // data real da solicitação (yyyy-mm-dd)
  novaDataExecucao: z.string().min(1), // nova data de execução (yyyy-mm-dd)
});
export const CarryoverSchema = z.object({
  itens: z.array(CarryoverItemSchema).min(1).max(500),
});
export type CarryoverItem = z.infer<typeof CarryoverItemSchema>;
export type CarryoverInput = z.infer<typeof CarryoverSchema>;

// ── Itens de catálogo (ItemCatalogo) ────────────────────────────────────────
export const TipoItemCatalogoEnum = z.enum(['ITEM', 'INSTRUMENTAL']);

export const ItemCatalogoCreateSchema = z.object({
  nome: z.string().trim().min(2).max(500),
  grupoId: z.number().int().positive(),
  tipo: TipoItemCatalogoEnum.default('ITEM'),
  agrupamento: z.string().trim().max(120).optional().nullable(),
  classificacao: z.string().trim().max(120).optional().nullable(),
  definicao: z.string().trim().max(1000).optional().nullable(),
  especificacao: z.string().trim().max(8000).optional().nullable(),
  valorReferencia: z.number().nonnegative().max(999999999999.99).optional().nullable(),
  valorMin: z.number().nonnegative().max(999999999999.99).optional().nullable(),
  valorMax: z.number().nonnegative().max(999999999999.99).optional().nullable(),
  movimentoContabil: z.enum(['DESPESA', 'INVESTIMENTO']).optional().nullable(),
  dolarizadoRenem: z.boolean().optional(),
  idRenem: z.string().trim().max(40).optional().nullable(),
  dsRenem: z.string().trim().max(255).optional().nullable(),
  tipoVerba: z.string().trim().max(30).optional().nullable(),
  // Vínculo 1-para-1 com material do Tasy (view dbo.vw_materiais_tasy).
  cdMaterialTasy: z.string().trim().max(40).optional().nullable(),
  dsMaterialTasy: z.string().trim().max(255).optional().nullable(),
  // Vínculo à conta contábil (view dbo.VW_CONTA_CONTABIL_PESSOAL).
  cdContaContabil: z.string().trim().max(20).optional().nullable(),
  dsContaContabil: z.string().trim().max(255).optional().nullable(),
  ativo: z.boolean().default(true),
});

// Material do Tasy retornado pela busca (view dbo.vw_materiais_tasy).
export const MaterialTasySchema = z.object({
  cdMaterial: z.string(),
  dsMaterial: z.string(),
  dsClasse: z.string().nullable(),
});
export type MaterialTasy = z.infer<typeof MaterialTasySchema>;

// Conta contábil retornada pela busca (view dbo.VW_CONTA_CONTABIL_PESSOAL).
export const ContaContabilSchema = z.object({
  cdContaContabil: z.string(),
  dsContaContabil: z.string(),
});
export type ContaContabil = z.infer<typeof ContaContabilSchema>;

export const ItemCatalogoUpdateSchema = ItemCatalogoCreateSchema.partial();
export const ItemCatalogoAtivoSchema = z.object({ ativo: z.boolean() });

export type TipoItemCatalogo = z.infer<typeof TipoItemCatalogoEnum>;
export type ItemCatalogoCreate = z.infer<typeof ItemCatalogoCreateSchema>;
export type ItemCatalogoUpdate = z.infer<typeof ItemCatalogoUpdateSchema>;
export type ItemCatalogoAtivo = z.infer<typeof ItemCatalogoAtivoSchema>;

// ── Suprimentos ─────────────────────────────────────────────────────────────
// Gestão de preços do catálogo pelo perfil SUPRIMENTOS: SÓ os três campos de
// valor (referência/Renem, mínimo, máximo). Demais atributos continuam só com
// ADMIN via /admin/itens. `min <= max` validado no refine.
export const SuprimentosPrecoSchema = z
  .object({
    valorReferencia: z.number().nonnegative().max(999999999999.99).optional().nullable(),
    valorMin: z.number().nonnegative().max(999999999999.99).optional().nullable(),
    valorMax: z.number().nonnegative().max(999999999999.99).optional().nullable(),
  })
  .refine(
    (v) => v.valorMin == null || v.valorMax == null || v.valorMin <= v.valorMax,
    { message: 'Valor mínimo não pode ser maior que o valor máximo.', path: ['valorMin'] },
  );

// Ajuste do valor informado pelo solicitante num item de solicitação. Grava em
// campo separado (valorSuprimentos), preservando o valorUnitario original.
// `null` limpa o ajuste (volta a "sem valor de suprimentos").
export const SuprimentosValorItemSchema = z.object({
  valorSuprimentos: z.number().nonnegative().max(999999999999.99).nullable(),
});

export type SuprimentosPreco = z.infer<typeof SuprimentosPrecoSchema>;
export type SuprimentosValorItem = z.infer<typeof SuprimentosValorItemSchema>;

// ── Contabilidade ───────────────────────────────────────────────────────────
// Vínculos do item que o perfil CONTABILIDADE gerencia: material do Tasy e conta
// contábil. NÃO toca em preços. `null`/'' limpa o vínculo.
export const ContabilidadeVinculoSchema = z.object({
  cdMaterialTasy: z.string().trim().max(40).optional().nullable(),
  dsMaterialTasy: z.string().trim().max(255).optional().nullable(),
  cdContaContabil: z.string().trim().max(20).optional().nullable(),
  dsContaContabil: z.string().trim().max(255).optional().nullable(),
});

export type ContabilidadeVinculo = z.infer<typeof ContabilidadeVinculoSchema>;
