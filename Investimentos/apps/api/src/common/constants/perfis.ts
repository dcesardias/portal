/**
 * Nomes canônicos dos perfis (papéis) de usuário no sistema.
 * Usado tanto para popular a tabela Perfil quanto pelos guards/decorators
 * de autorização (@Roles). Um usuário pode acumular mais de um perfil.
 */
export const PERFIS = {
  SOLICITANTE: 'SOLICITANTE',
  APROVADOR: 'APROVADOR',
  APROVADOR_FINAL: 'APROVADOR_FINAL',
  ADMIN: 'ADMIN',
  VIEWER: 'VIEWER',
  SUPRIMENTOS: 'SUPRIMENTOS',
  CONTABILIDADE: 'CONTABILIDADE',
} as const;

export type PerfilNome = (typeof PERFIS)[keyof typeof PERFIS];

export const PERFIL_DESCRICOES: Record<PerfilNome, string> = {
  SOLICITANTE: 'Pode criar e acompanhar suas próprias solicitações de investimento.',
  APROVADOR:
    'Aprova solicitações de subordinados (alçada focal/supervisão), além de poder solicitar.',
  APROVADOR_FINAL: 'Realiza a aprovação final de solicitações já pré-aprovadas.',
  ADMIN: 'Gerencia cadastros, usuários, fluxos e configurações do sistema.',
  VIEWER: 'Visualiza o Dashboard e o Relatório de todas as solicitações. Não cria nem aprova.',
  SUPRIMENTOS:
    'Gerencia os preços do catálogo (referência, mínimo e máximo) e ajusta o valor informado pelos solicitantes nas solicitações.',
  CONTABILIDADE:
    'Vincula os itens do catálogo ao material do Tasy e à conta contábil (não edita preços).',
};
