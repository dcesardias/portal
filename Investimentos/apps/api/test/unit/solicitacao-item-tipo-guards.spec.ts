/**
 * Testes UNITÁRIOS das guardas de tipo no superRefine de SolicitacaoItemInputSchema
 * (packages/shared/src/solicitacao.ts): campos exclusivos de OBRA não valem fora de OBRA,
 * campos exclusivos de ITEM (justificativaClinica/infra*) não valem fora de ITEM,
 * e campos "TODOS" (justificativaPeriodo/publicoAlvo/volumePessoas) são livres p/ qualquer tipo.
 * Sem DB, sem Nest — exercita safeParse diretamente.
 */

import { SolicitacaoItemInputSchema } from '@investimentos/shared';

const camposTodos = {
  justificativaPeriodo: 'Período de execução do projeto',
  publicoAlvo: 'Pacientes ambulatoriais',
  volumePessoas: 'Aprox. 200 pessoas/mês',
};

const baseItem = {
  grupoId: 1,
  descricao: 'Descrição do item',
  motivoId: 1,
  justificativa: 'Justificativa qualquer',
  quantidade: 1,
  valorUnitario: 100,
};

describe('SolicitacaoItemInputSchema — guardas de tipo (safeParse)', () => {
  test('1) OBRA válido com campos OBRA + "TODOS" preenchidos → success', () => {
    const item = {
      ...baseItem,
      tipo: 'OBRA' as const,
      subtipoObra: 'REFORMA_ESTRUTURAL' as const,
      subtipoObraOutros: null,
      escopoInicial: 'Reforma da ala pediátrica',
      beneficiosProjeto: 'Melhora no fluxo de atendimento',
      impactoRdc50: 'Adequação à RDC 50',
      ...camposTodos,
    };
    const result = SolicitacaoItemInputSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  test('2) ITEM válido com justificativaClinica + infra* + "TODOS" → success', () => {
    const item = {
      ...baseItem,
      tipo: 'ITEM' as const,
      itemCatalogoId: 10,
      justificativaClinica: 'Necessário para reabilitação motora',
      infraAguaEsgoto: true,
      infraEletricaRegulada: true,
      infraBlindagem: true,
      infraClimatizacao: true,
      infraGasesMedicinais: true,
      ...camposTodos,
    };
    const result = SolicitacaoItemInputSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  test('3) INSTRUMENTAL com justificativaClinica preenchido → FALHA', () => {
    const item = {
      ...baseItem,
      tipo: 'INSTRUMENTAL' as const,
      itemCatalogoId: 20,
      justificativaClinica: 'Necessário para reabilitação motora',
    };
    const result = SolicitacaoItemInputSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('4a) INSTRUMENTAL com campo OBRA (escopoInicial) → FALHA', () => {
    const item = {
      ...baseItem,
      tipo: 'INSTRUMENTAL' as const,
      itemCatalogoId: 20,
      escopoInicial: 'Escopo indevido',
    };
    const result = SolicitacaoItemInputSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('4b) ITEM com campo OBRA (escopoInicial) → FALHA', () => {
    const item = {
      ...baseItem,
      tipo: 'ITEM' as const,
      itemCatalogoId: 10,
      escopoInicial: 'Escopo indevido',
    };
    const result = SolicitacaoItemInputSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('5a) OBRA com infra*=true → FALHA', () => {
    const item = {
      ...baseItem,
      tipo: 'OBRA' as const,
      infraAguaEsgoto: true,
    };
    const result = SolicitacaoItemInputSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('5b) OBRA com justificativaClinica → FALHA', () => {
    const item = {
      ...baseItem,
      tipo: 'OBRA' as const,
      justificativaClinica: 'Justificativa indevida para obra',
    };
    const result = SolicitacaoItemInputSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test.each(['ITEM', 'INSTRUMENTAL', 'OBRA'] as const)(
    '6) tipo=%s com só campos "TODOS" preenchidos → success (não rejeita)',
    (tipo) => {
      const item = {
        ...baseItem,
        tipo,
        ...(tipo === 'OBRA' ? {} : { itemCatalogoId: 10 }),
        ...camposTodos,
      };
      const result = SolicitacaoItemInputSchema.safeParse(item);
      expect(result.success).toBe(true);
    },
  );
});
