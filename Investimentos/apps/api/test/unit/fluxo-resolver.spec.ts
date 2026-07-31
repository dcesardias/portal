/**
 * Testes UNITÁRIOS do casamento de regras do FluxoResolver (Onda 5).
 * Testa apenas a função pura `matches`.
 */

import { matches } from '../../src/fluxo/fluxo.resolver';

// Prisma.Decimal é aceito como number/string; usar number funciona nos testes.
function regra(over: Partial<any> = {}): any {
  return {
    id: 'r1',
    prioridade: 10,
    estabelecimentoId: null,
    grupoId: null,
    tipoVerba: null,
    vlMin: null,
    vlMax: null,
    fluxoId: 'f1',
    isDefault: false,
    ...over,
  };
}

describe('FluxoResolver.matches — regra sem critérios casa qualquer contexto', () => {
  test('regra vazia casa com ctx vazio', () => {
    expect(matches(regra(), {})).toBe(true);
  });
  test('regra vazia casa com ctx cheio', () => {
    expect(
      matches(regra(), {
        estabelecimentoId: 1,
        grupoId: 2,
        tipoVerba: 'RP',
        valor: 1000,
      }),
    ).toBe(true);
  });
});

describe('FluxoResolver.matches — critérios específicos', () => {
  test('estabelecimentoId diferente NÃO casa', () => {
    const r = regra({ estabelecimentoId: 1 });
    expect(matches(r, { estabelecimentoId: 2 })).toBe(false);
  });
  test('estabelecimentoId igual casa', () => {
    const r = regra({ estabelecimentoId: 1 });
    expect(matches(r, { estabelecimentoId: 1 })).toBe(true);
  });
  test('grupoId diferente NÃO casa', () => {
    expect(matches(regra({ grupoId: 5 }), { grupoId: 4 })).toBe(false);
  });
  test('tipoVerba diferente NÃO casa', () => {
    expect(matches(regra({ tipoVerba: 'RP' }), { tipoVerba: 'VP' })).toBe(false);
  });
});

describe('FluxoResolver.matches — faixas de valor', () => {
  test('valor abaixo de vlMin NÃO casa', () => {
    expect(matches(regra({ vlMin: 10_000 }), { valor: 9_999 })).toBe(false);
  });
  test('valor no vlMin casa', () => {
    expect(matches(regra({ vlMin: 10_000 }), { valor: 10_000 })).toBe(true);
  });
  test('valor acima de vlMax NÃO casa', () => {
    expect(matches(regra({ vlMax: 5_000 }), { valor: 5_001 })).toBe(false);
  });
  test('valor no vlMax casa', () => {
    expect(matches(regra({ vlMax: 5_000 }), { valor: 5_000 })).toBe(true);
  });
  test('faixa completa: valor dentro casa', () => {
    expect(
      matches(regra({ vlMin: 100, vlMax: 1000 }), { valor: 500 }),
    ).toBe(true);
  });
});

describe('FluxoResolver.matches — regra default nunca casa por match direto', () => {
  test('isDefault=true retorna false (deve ser aplicada só via fallback)', () => {
    const r = regra({ isDefault: true });
    expect(matches(r, {})).toBe(false);
  });
});
