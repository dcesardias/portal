/**
 * Teste UNITÁRIO de SolicitacaoService.findMinhas (apps/api/src/solicitacao/solicitacao.service.ts).
 * Garantia de segurança: "ver tudo" do admin é feito via omissão do filtro
 * solicitanteId — nunca deve vazar dados de outro usuário para quem NÃO é admin.
 * PrismaService é mockado (findMany) e inspecionamos o `where` recebido.
 * rows=[] evita depender do mapper (toSolicitacaoDto) — aqui o alvo é o filtro.
 */

import { SolicitacaoService } from '../../src/solicitacao/solicitacao.service';

function makePrismaMock() {
  return {
    solicitacao: {
      findMany: jest.fn(async (_args: { where: Record<string, unknown> }) => [] as unknown[]),
    },
  };
}

describe('SolicitacaoService.findMinhas', () => {
  test('isAdmin=true → NÃO filtra por solicitanteId (retorna todas)', async () => {
    const prisma = makePrismaMock();
    const service = new SolicitacaoService(prisma as any, {} as any);

    const result = await service.findMinhas('user-1', { isAdmin: true });

    expect(result).toEqual([]);
    expect(prisma.solicitacao.findMany).toHaveBeenCalledTimes(1);
    const arg = prisma.solicitacao.findMany.mock.calls[0][0];
    expect(arg.where).not.toHaveProperty('solicitanteId');
  });

  test('isAdmin=true + status → mantém filtro status, sem solicitanteId', async () => {
    const prisma = makePrismaMock();
    const service = new SolicitacaoService(prisma as any, {} as any);

    await service.findMinhas('user-1', { isAdmin: true, status: 'EM_APROVACAO' });

    const arg = prisma.solicitacao.findMany.mock.calls[0][0];
    expect(arg.where).not.toHaveProperty('solicitanteId');
    expect(arg.where.status).toBe('EM_APROVACAO');
  });

  test('isAdmin=false → filtra por solicitanteId=userId', async () => {
    const prisma = makePrismaMock();
    const service = new SolicitacaoService(prisma as any, {} as any);

    await service.findMinhas('user-1', { isAdmin: false });

    const arg = prisma.solicitacao.findMany.mock.calls[0][0];
    expect(arg.where.solicitanteId).toBe('user-1');
  });

  test('opts ausente (undefined) → comportamento default é filtrar por solicitanteId (não vaza tudo por omissão)', async () => {
    const prisma = makePrismaMock();
    const service = new SolicitacaoService(prisma as any, {} as any);

    await service.findMinhas('user-1');

    const arg = prisma.solicitacao.findMany.mock.calls[0][0];
    expect(arg.where.solicitanteId).toBe('user-1');
  });

  test('isAdmin=false + status → filtra por solicitanteId E status', async () => {
    const prisma = makePrismaMock();
    const service = new SolicitacaoService(prisma as any, {} as any);

    await service.findMinhas('user-1', { isAdmin: false, status: 'RASCUNHO' });

    const arg = prisma.solicitacao.findMany.mock.calls[0][0];
    expect(arg.where.solicitanteId).toBe('user-1');
    expect(arg.where.status).toBe('RASCUNHO');
  });
});
