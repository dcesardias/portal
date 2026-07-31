import { z } from 'zod';

export const SolicitacaoStatusEnum = z.enum([
  'RASCUNHO',
  'EM_APROVACAO', // aguardando a 1ª decisão (nenhuma aprovação ainda)
  'APROVACAO_INICIAL', // 1º(s) nível(is) aprovado(s), aguardando a aprovação final
  'APROVADO', // aprovação final concluída
  'REPROVADO',
  'EM_REVISAO',
  'CANCELADO',
]);

export const TipoVerbaEnum = z.enum(['RP', 'VP']);

// Status da verba pública — preenchido só pelo admin, só em solicitações VP.
export const StatusVerbaPublicaEnum = z.enum([
  'PROPOSICAO',
  'SUBMETIDO',
  'CAPTACAO',
  'CONVENIAMENTO',
  'EXECUCAO',
  'CONCLUIDO',
  'ALOCAR',
]);

export const StatusVerbaPublicaInputSchema = z.object({
  statusVerbaPublica: StatusVerbaPublicaEnum.nullable(),
});

// Os 3 tipos de solicitação, cada um com regras próprias (ver refine abaixo).
export const TipoSolicitacaoItemEnum = z.enum(['ITEM', 'INSTRUMENTAL', 'OBRA']);

export const SolicitacaoItemInputSchema = z
  .object({
    tipo: TipoSolicitacaoItemEnum.default('ITEM'),
    grupoId: z.number().int().positive(),
    itemCatalogoId: z.number().int().positive().optional().nullable(),
    descricao: z.string().min(1).max(2000),
    especificacao: z.string().max(2000).optional().nullable(), // ITEM: "Fabricantes"
    modelosReferencia: z.string().max(2000).optional().nullable(), // ITEM: "Modelos de Referência"
    motivoId: z.number().int().positive(),
    justificativa: z.string().min(1).max(2000),
    // coerce: o front pode mandar número já convertido OU string (ex.: valorReferencia
    // do catálogo, que é Decimal → chega como string no JSON). Aceitamos os dois.
    quantidade: z.coerce.number().int().positive(),
    valorUnitario: z.coerce.number().positive(),
    // Data prevista POR ITEM (obrigatória) — cada item precisa da sua.
    dataPrevista: z.string({ required_error: 'Informe a data prevista.' }).datetime(),
    ieDemolicoes: z.boolean().optional(),
    iePiso: z.boolean().optional(),
    ieForro: z.boolean().optional(),
    ieArCondicionado: z.boolean().optional(),
    ieMarcenaria: z.boolean().optional(),
    ieCaixilhos: z.boolean().optional(),
    // Contexto do projeto (opcional, todos os tipos)
    justificativaPeriodo: z.string().max(500).optional().nullable(),
    publicoAlvo: z.string().max(2000).optional().nullable(),
    volumePessoas: z.string().max(2000).optional().nullable(),
    // Só OBRA
    subtipoObra: z
      .enum(['NOVA_CONSTRUCAO', 'REFORMA_ESTRUTURAL', 'REVITALIZACAO', 'MANUTENCAO_CORRETIVA', 'OUTROS'])
      .optional()
      .nullable(),
    subtipoObraOutros: z.string().max(255).optional().nullable(),
    escopoInicial: z.string().max(2000).optional().nullable(),
    beneficiosProjeto: z.string().max(2000).optional().nullable(),
    impactoRdc50: z.string().max(500).optional().nullable(),
    // Só ITEM
    justificativaClinica: z.string().max(2000).optional().nullable(),
    infraAguaEsgoto: z.boolean().optional(),
    infraEletricaRegulada: z.boolean().optional(),
    infraBlindagem: z.boolean().optional(),
    infraClimatizacao: z.boolean().optional(),
    infraGasesMedicinais: z.boolean().optional(),
    infraPlugAndPlay: z.boolean().optional(),
    // Só ITEM de grupos de equipamentos — "(Se aplicável)"
    manutencaoPreventiva: z
      .enum(['SIM_CALIBRACAO', 'NAO_COMPLEXA', 'NAO_SEI'])
      .optional()
      .nullable(),
    manutPeriodMensal: z.boolean().optional(),
    manutPeriodTrimestral: z.boolean().optional(),
    manutPeriodSemestral: z.boolean().optional(),
    manutPeriodAnual: z.boolean().optional(),
  })
  .superRefine((it, ctx) => {
    // Regra de negócio: as solicitações são sempre para o ANO SEGUINTE ao vigente.
    // Se informada, a data prevista deve cair exatamente no ano-alvo (ano atual + 1).
    if (it.dataPrevista != null) {
      const anoAlvo = new Date().getFullYear() + 1;
      const ano = new Date(it.dataPrevista).getUTCFullYear();
      if (ano !== anoAlvo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dataPrevista'],
          message: `A data prevista deve ser no ano de ${anoAlvo}.`,
        });
      }
    }

    // Campos exclusivos de Obra (contexto do projeto de obra).
    const temCamposObra =
      it.subtipoObra != null ||
      it.subtipoObraOutros ||
      it.escopoInicial ||
      it.beneficiosProjeto ||
      it.impactoRdc50;
    // Campos exclusivos de Item (justificativa clínica + infraestrutura especial).
    const temCamposItem =
      it.justificativaClinica ||
      it.infraAguaEsgoto ||
      it.infraEletricaRegulada ||
      it.infraBlindagem ||
      it.infraClimatizacao ||
      it.infraGasesMedicinais;

    if (it.tipo === 'OBRA') {
      // Obra não tem catálogo — é descrição livre + escopo.
      if (it.itemCatalogoId != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['itemCatalogoId'],
          message: 'Obras não usam catálogo — descreva o escopo livremente.',
        });
      }
      // Escopo Inicial da Obra é obrigatório.
      if (!it.escopoInicial || it.escopoInicial.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['escopoInicial'],
          message: 'Descreva o escopo inicial da obra.',
        });
      }
      // Campos clínicos/infraestrutura não valem para obra.
      if (temCamposItem) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tipo'],
          message: 'Campos de justificativa clínica/infraestrutura só valem para o tipo Item.',
        });
      }
    } else {
      // Itens e Instrumentais precisam de um item do catálogo.
      if (it.itemCatalogoId == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['itemCatalogoId'],
          message:
            it.tipo === 'INSTRUMENTAL'
              ? 'Selecione um instrumental do catálogo.'
              : 'Selecione um item do catálogo.',
        });
      }
      // Campos de escopo de obra não valem para itens/instrumentais.
      const temEscopo =
        it.ieDemolicoes ||
        it.iePiso ||
        it.ieForro ||
        it.ieArCondicionado ||
        it.ieMarcenaria ||
        it.ieCaixilhos;
      if (temEscopo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tipo'],
          message: 'Campos de escopo de obra só valem para solicitações do tipo Obra.',
        });
      }
      // Campos de contexto de obra também não valem para itens/instrumentais.
      if (temCamposObra) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tipo'],
          message: 'Campos de obra só valem para solicitações do tipo Obra.',
        });
      }
      // Campos clínicos/infraestrutura só valem para Item — não para Instrumental.
      if (it.tipo === 'INSTRUMENTAL' && temCamposItem) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tipo'],
          message: 'Campos de justificativa clínica/infraestrutura só valem para o tipo Item.',
        });
      }
    }
  });

export const SolicitacaoCreateSchema = z.object({
  estabelecimentoId: z.number().int().positive(),
  unidadeNegocioId: z.number().int().positive(),
  centroCustoCodigo: z.string().min(1).max(20),
  tipoVerba: TipoVerbaEnum.optional().nullable(),
  projeto: z.string().max(255).optional().nullable(),
  dtRecurso: z.string().datetime().optional().nullable(),
  itens: z.array(SolicitacaoItemInputSchema).min(1),
});

export const SolicitacaoUpdateSchema = SolicitacaoCreateSchema.partial();

// Admin cria uma solicitação RETROATIVA já com Aprovação Final (sem fluxo),
// escolhendo o solicitante e a data original da solicitação.
export const AdminSolicitacaoCreateSchema = SolicitacaoCreateSchema.extend({
  solicitanteId: z.string().uuid(),
  dtSolicitacao: z.string().min(1), // data original (yyyy-mm-dd ou ISO)
});

// Admin: troca direta de status (override), com justificativa opcional para a trilha.
export const AdminStatusSchema = z.object({
  status: SolicitacaoStatusEnum,
  justificativa: z.string().max(2000).optional().nullable(),
});

// Anotação do Gestor Focal (aprovador/aprovador final).
export const AnotacaoGFSchema = z.object({
  obsGF: z.string().max(2000).optional().nullable(),
});

// Anotações do GPE (admin): observação + validação + revisão anual (texto livre).
export const AnotacaoGPESchema = z.object({
  obsGPE: z.string().max(2000).optional().nullable(),
  validacao: z.string().max(500).optional().nullable(),
  revisaoAnual: z.string().max(2000).optional().nullable(),
});

// Edição pelo aprovador (Gestor Focal / admin) ANTES de aprovar: só campos
// opcionais + valor unitário. Identidade (descrição, qtd, catálogo, motivo,
// data prevista, escopo inicial) é imutável aqui.
export const AprovadorEditItemSchema = z.object({
  id: z.string().uuid(),
  valorUnitario: z.coerce.number().positive().optional(),
  especificacao: z.string().max(2000).optional().nullable(),
  modelosReferencia: z.string().max(2000).optional().nullable(),
  justificativaPeriodo: z.string().max(500).optional().nullable(),
  publicoAlvo: z.string().max(2000).optional().nullable(),
  volumePessoas: z.string().max(2000).optional().nullable(),
  beneficiosProjeto: z.string().max(2000).optional().nullable(),
  impactoRdc50: z.string().max(500).optional().nullable(),
  justificativaClinica: z.string().max(2000).optional().nullable(),
  infraAguaEsgoto: z.boolean().optional(),
  infraEletricaRegulada: z.boolean().optional(),
  infraBlindagem: z.boolean().optional(),
  infraClimatizacao: z.boolean().optional(),
  infraGasesMedicinais: z.boolean().optional(),
  infraPlugAndPlay: z.boolean().optional(),
  manutencaoPreventiva: z
    .enum(['SIM_CALIBRACAO', 'NAO_COMPLEXA', 'NAO_SEI'])
    .optional()
    .nullable(),
  manutPeriodMensal: z.boolean().optional(),
  manutPeriodTrimestral: z.boolean().optional(),
  manutPeriodSemestral: z.boolean().optional(),
  manutPeriodAnual: z.boolean().optional(),
  subtipoObra: z
    .enum(['NOVA_CONSTRUCAO', 'REFORMA_ESTRUTURAL', 'REVITALIZACAO', 'MANUTENCAO_CORRETIVA', 'OUTROS'])
    .optional()
    .nullable(),
  subtipoObraOutros: z.string().max(255).optional().nullable(),
  ieDemolicoes: z.boolean().optional(),
  iePiso: z.boolean().optional(),
  ieForro: z.boolean().optional(),
  ieArCondicionado: z.boolean().optional(),
  ieMarcenaria: z.boolean().optional(),
  ieCaixilhos: z.boolean().optional(),
});

export const AprovadorEditSchema = z.object({
  itens: z.array(AprovadorEditItemSchema).min(1),
});

export const DecisaoEnum = z.enum(['APROVADO', 'REPROVADO', 'REVISAO']);

export const AprovacaoInputSchema = z.object({
  decisao: DecisaoEnum,
  justificativa: z.string().max(2000).optional().nullable(),
});

// Envio em lote (rascunhos) — semântica PARCIAL: cada id resolve seu próprio
// fluxo e pode falhar isoladamente, sem derrubar os demais.
export const EnviarLoteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

// Decisão de aprovação em LOTE (Mesa de Aprovação Final): aplica a mesma decisão
// a várias solicitações (ex.: aprovar um grupo/agrupamento inteiro). Semântica
// PARCIAL — cada solicitação é decidida isoladamente e pode falhar sem afetar
// as demais.
export const AprovacaoLoteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  decisao: DecisaoEnum,
  justificativa: z.string().max(2000).optional().nullable(),
});

export type SolicitacaoStatus = z.infer<typeof SolicitacaoStatusEnum>;
export type TipoVerba = z.infer<typeof TipoVerbaEnum>;
export type StatusVerbaPublica = z.infer<typeof StatusVerbaPublicaEnum>;
export type StatusVerbaPublicaInput = z.infer<typeof StatusVerbaPublicaInputSchema>;
export type SolicitacaoItemInput = z.infer<typeof SolicitacaoItemInputSchema>;
export type SolicitacaoCreate = z.infer<typeof SolicitacaoCreateSchema>;
export type SolicitacaoUpdate = z.infer<typeof SolicitacaoUpdateSchema>;
export type AdminSolicitacaoCreate = z.infer<typeof AdminSolicitacaoCreateSchema>;
export type Decisao = z.infer<typeof DecisaoEnum>;
export type AprovacaoInput = z.infer<typeof AprovacaoInputSchema>;
export type AdminStatusInput = z.infer<typeof AdminStatusSchema>;
export type EnviarLoteInput = z.infer<typeof EnviarLoteSchema>;
export type AprovacaoLoteInput = z.infer<typeof AprovacaoLoteSchema>;
export type AnotacaoGF = z.infer<typeof AnotacaoGFSchema>;
export type AnotacaoGPE = z.infer<typeof AnotacaoGPESchema>;
export type AprovadorEditItem = z.infer<typeof AprovadorEditItemSchema>;
export type AprovadorEdit = z.infer<typeof AprovadorEditSchema>;
