/**
 * Máquina de estados da Solicitação de Investimento.
 * Transições permitidas — qualquer outra é violação e o service deve lançar.
 */

export type Status =
  | 'RASCUNHO'
  | 'EM_APROVACAO'
  | 'APROVACAO_INICIAL'
  | 'APROVADO'
  | 'REPROVADO'
  | 'EM_REVISAO'
  | 'CANCELADO';

const TRANSITIONS: Record<Status, Status[]> = {
  RASCUNHO: ['EM_APROVACAO', 'CANCELADO'],
  EM_REVISAO: ['EM_APROVACAO', 'CANCELADO'],
  // 1ª aprovação num fluxo de múltiplas etapas leva a APROVACAO_INICIAL.
  EM_APROVACAO: ['APROVACAO_INICIAL', 'APROVADO', 'REPROVADO', 'EM_REVISAO', 'CANCELADO'],
  // Aprovação final (ou reprovar/revisar) a partir do estágio intermediário.
  APROVACAO_INICIAL: ['APROVADO', 'REPROVADO', 'EM_REVISAO', 'CANCELADO'],
  APROVADO: [], // terminal
  REPROVADO: [], // terminal
  CANCELADO: [], // terminal
};

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: Status, to: Status): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transição inválida ${from} → ${to}`);
  }
}

export function isTerminal(status: Status): boolean {
  return TRANSITIONS[status].length === 0;
}
