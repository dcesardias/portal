/**
 * Testes UNITÁRIOS da máquina de estados da Solicitação (Onda 5).
 * Sem DB, sem Nest — lógica pura.
 */

import {
  canTransition,
  assertTransition,
  isTerminal,
} from '../../src/fluxo/state-machine';

describe('State machine — canTransition', () => {
  test('RASCUNHO → EM_APROVACAO permite', () => {
    expect(canTransition('RASCUNHO', 'EM_APROVACAO')).toBe(true);
  });
  test('RASCUNHO → APROVADO NÃO permite (deve passar por EM_APROVACAO)', () => {
    expect(canTransition('RASCUNHO', 'APROVADO')).toBe(false);
  });
  test('EM_APROVACAO → APROVADO/REPROVADO/EM_REVISAO/CANCELADO permite', () => {
    for (const to of ['APROVADO', 'REPROVADO', 'EM_REVISAO', 'CANCELADO'] as const) {
      expect(canTransition('EM_APROVACAO', to)).toBe(true);
    }
  });
  test('APROVADO é terminal — nenhuma transição permitida', () => {
    expect(canTransition('APROVADO', 'CANCELADO')).toBe(false);
    expect(canTransition('APROVADO', 'EM_APROVACAO')).toBe(false);
  });
  test('estados terminais bloqueiam qualquer transição', () => {
    expect(canTransition('CANCELADO', 'EM_APROVACAO')).toBe(false);
    expect(canTransition('REPROVADO', 'EM_APROVACAO')).toBe(false);
  });
  test('EM_REVISAO → EM_APROVACAO permite (após correção do solicitante)', () => {
    expect(canTransition('EM_REVISAO', 'EM_APROVACAO')).toBe(true);
  });
});

describe('State machine — assertTransition', () => {
  test('transição válida não lança', () => {
    expect(() => assertTransition('RASCUNHO', 'EM_APROVACAO')).not.toThrow();
  });
  test('transição inválida lança', () => {
    expect(() => assertTransition('RASCUNHO', 'APROVADO')).toThrow(
      'Transição inválida RASCUNHO → APROVADO',
    );
  });
});

describe('State machine — isTerminal', () => {
  test.each(['REPROVADO', 'CANCELADO', 'APROVADO'] as const)(
    '%s é terminal',
    (s) => expect(isTerminal(s)).toBe(true),
  );
  test.each(['RASCUNHO', 'EM_APROVACAO', 'EM_REVISAO'] as const)(
    '%s NÃO é terminal',
    (s) => expect(isTerminal(s)).toBe(false),
  );
});
