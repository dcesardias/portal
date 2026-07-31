/**
 * Testes UNITÁRIOS dos schemas Zod compartilhados de catálogo/solicitação.
 * Sem DB, sem Nest — valida os contratos de entrada.
 */

import {
  SolicitacaoCreateSchema,
  CategoriaGrupoEnum,
  AprovacaoInputSchema,
} from '@investimentos/shared';

describe('SolicitacaoCreateSchema', () => {
  const base = {
    estabelecimentoId: 1,
    unidadeNegocioId: 1,
    centroCustoCodigo: 'CC001',
    itens: [
      {
        tipo: 'ITEM' as const,
        grupoId: 1,
        itemCatalogoId: 10,
        descricao: 'Cadeira ergonômica',
        motivoId: 1,
        justificativa: 'Ergonomia',
        quantidade: 2,
        valorUnitario: 500,
      },
    ],
  };

  test('input mínimo válido passa', () => {
    expect(() => SolicitacaoCreateSchema.parse(base)).not.toThrow();
  });
  test('sem itens → falha', () => {
    expect(() => SolicitacaoCreateSchema.parse({ ...base, itens: [] })).toThrow();
  });
  test('quantidade zero → falha', () => {
    const bad = { ...base, itens: [{ ...base.itens[0], quantidade: 0 }] };
    expect(() => SolicitacaoCreateSchema.parse(bad)).toThrow();
  });
  test('valorUnitario negativo → falha', () => {
    const bad = { ...base, itens: [{ ...base.itens[0], valorUnitario: -1 }] };
    expect(() => SolicitacaoCreateSchema.parse(bad)).toThrow();
  });
  test('tipoVerba="XX" (não RP/VP) → falha', () => {
    expect(() =>
      SolicitacaoCreateSchema.parse({ ...base, tipoVerba: 'XX' as unknown as 'RP' }),
    ).toThrow();
  });

  // ── Regras por tipo (itens/instrumentais/obras) ──
  test('ITEM sem itemCatalogoId → falha', () => {
    const bad = {
      ...base,
      itens: [{ ...base.itens[0], itemCatalogoId: undefined }],
    };
    expect(() => SolicitacaoCreateSchema.parse(bad)).toThrow();
  });
  test('INSTRUMENTAL sem itemCatalogoId → falha', () => {
    const bad = {
      ...base,
      itens: [{ ...base.itens[0], tipo: 'INSTRUMENTAL' as const, itemCatalogoId: undefined }],
    };
    expect(() => SolicitacaoCreateSchema.parse(bad)).toThrow();
  });
  test('OBRA sem catálogo, só descrição/escopo → passa', () => {
    const obra = {
      ...base,
      itens: [
        {
          tipo: 'OBRA' as const,
          grupoId: 9,
          descricao: 'Reforma da recepção',
          motivoId: 1,
          justificativa: 'Modernização',
          quantidade: 1,
          valorUnitario: 15000,
          iePiso: true,
          ieForro: true,
        },
      ],
    };
    expect(() => SolicitacaoCreateSchema.parse(obra)).not.toThrow();
  });
  test('OBRA com itemCatalogoId → falha (obra não usa catálogo)', () => {
    const bad = {
      ...base,
      itens: [
        {
          tipo: 'OBRA' as const,
          grupoId: 9,
          itemCatalogoId: 10,
          descricao: 'Reforma',
          motivoId: 1,
          justificativa: 'x',
          quantidade: 1,
          valorUnitario: 100,
        },
      ],
    };
    expect(() => SolicitacaoCreateSchema.parse(bad)).toThrow();
  });
  test('ITEM com campo de escopo de obra → falha', () => {
    const bad = {
      ...base,
      itens: [{ ...base.itens[0], iePiso: true }],
    };
    expect(() => SolicitacaoCreateSchema.parse(bad)).toThrow();
  });
});

describe('CategoriaGrupoEnum', () => {
  test.each(['ITEM', 'OBRA', 'INSTRUMENTAL'])('%s é válido', (c) => {
    expect(() => CategoriaGrupoEnum.parse(c)).not.toThrow();
  });
  test('OUTRO → falha', () => {
    expect(() => CategoriaGrupoEnum.parse('OUTRO')).toThrow();
  });
});

describe('AprovacaoInputSchema', () => {
  test.each(['APROVADO', 'REPROVADO', 'REVISAO'])('%s é válido', (d) => {
    expect(() => AprovacaoInputSchema.parse({ decisao: d })).not.toThrow();
  });
  test('decisao inválida → falha', () => {
    expect(() => AprovacaoInputSchema.parse({ decisao: 'SIM' })).toThrow();
  });
});
