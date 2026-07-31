import type { PrismaService } from '../prisma/prisma.service';

/**
 * Registra um evento imutável em EventoAuditoria (trilha de rastreabilidade).
 * `dados` é serializado em JSON. Best-effort: uma falha de auditoria não deve
 * derrubar a operação de negócio, mas é logada.
 */
export async function registrarEvento(
  prisma: PrismaService,
  params: {
    entidade: string;
    entidadeId: string;
    usuarioId?: string | null;
    acao: string;
    dados?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await prisma.eventoAuditoria.create({
      data: {
        entidade: params.entidade,
        entidadeId: params.entidadeId,
        usuarioId: params.usuarioId ?? null,
        acao: params.acao,
        dadosJson: params.dados ? JSON.stringify(params.dados) : null,
      },
    });
  } catch (e) {
    console.error('[auditoria] falha ao registrar evento', params.acao, (e as Error).message);
  }
}

/**
 * Monta a linha do tempo de uma solicitação a partir de EventoAuditoria,
 * resolvendo o nome do autor de cada evento.
 */
export async function montarHistorico(prisma: PrismaService, solicitacaoId: string) {
  const eventos = await prisma.eventoAuditoria.findMany({
    where: { entidade: 'Solicitacao', entidadeId: solicitacaoId },
    orderBy: { data: 'asc' },
  });
  const userIds = [...new Set(eventos.map((e) => e.usuarioId).filter((x): x is string => !!x))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nome: true } })
    : [];
  const nomePorId = new Map(users.map((u) => [u.id, u.nome]));

  return eventos.map((e) => {
    let dados: Record<string, unknown> = {};
    if (e.dadosJson) {
      try {
        dados = JSON.parse(e.dadosJson) as Record<string, unknown>;
      } catch {
        /* ignora json inválido */
      }
    }
    return {
      acao: e.acao,
      data: e.data,
      autor: e.usuarioId ? (nomePorId.get(e.usuarioId) ?? null) : null,
      etapa: (dados.etapa as string) ?? null,
      comentario: (dados.comentario as string) ?? null,
    };
  });
}
