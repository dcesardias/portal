/**
 * Teste UNITÁRIO de RelatoriosService.dashboard (apps/api/src/relatorios/relatorios.service.ts).
 * Cobre: filtro de escopo (admin vê tudo, não-admin só o próprio solicitanteId),
 * agregação por status (total/emAprovacao/aprovadas/reprovadas/porStatus) e
 * coerção Decimal→number ao somar valorTotal/porGrupo (gotcha conhecido do projeto:
 * Decimal do Prisma vira string/objeto no JSON, nunca deve vazar sem Number()).
 * PrismaService é mockado (groupBy + findMany).
 */

import { RelatoriosService } from '../../src/relatorios/relatorios.service';

function makePrismaMock(opts: {
  byStatus: { status: string; _count: { _all: number } }[];
  itens: { valorTotal: unknown; grupo: { nome: string } | null }[];
}) {
  return {
    solicitacao: {
      groupBy: jest.fn(async (_args: { where: Record<string, unknown> }) => opts.byStatus),
    },
    solicitacaoItem: {
      findMany: jest.fn(
        async (_args: { where: { solicitacao: Record<string, unknown> } }) => opts.itens,
      ),
    },
  };
}

describe('RelatoriosService.dashboard', () => {
  test('isAdmin=true → NÃO filtra por solicitanteId', async () => {
    const prisma = makePrismaMock({ byStatus: [], itens: [] });
    const service = new RelatoriosService(prisma as any);

    await service.dashboard({ userId: 'user-1', isAdmin: true });

    const groupByArg = prisma.solicitacao.groupBy.mock.calls[0][0];
    expect(groupByArg.where).not.toHaveProperty('solicitanteId');
    const findManyArg = prisma.solicitacaoItem.findMany.mock.calls[0][0];
    expect(findManyArg.where.solicitacao).not.toHaveProperty('solicitanteId');
  });

  test('isAdmin=false → filtra por solicitanteId=userId', async () => {
    const prisma = makePrismaMock({ byStatus: [], itens: [] });
    const service = new RelatoriosService(prisma as any);

    await service.dashboard({ userId: 'user-1', isAdmin: false });

    const groupByArg = prisma.solicitacao.groupBy.mock.calls[0][0];
    expect(groupByArg.where.solicitanteId).toBe('user-1');
    const findManyArg = prisma.solicitacaoItem.findMany.mock.calls[0][0];
    expect(findManyArg.where.solicitacao.solicitanteId).toBe('user-1');
  });

  test('agrega contagens por status corretamente', async () => {
    const prisma = makePrismaMock({
      byStatus: [
        { status: 'EM_APROVACAO', _count: { _all: 3 } },
        { status: 'RASCUNHO', _count: { _all: 3 } },
        { status: 'CANCELADO', _count: { _all: 1 } },
      ],
      itens: [],
    });
    const service = new RelatoriosService(prisma as any);

    const result = await service.dashboard({ userId: 'user-1', isAdmin: true });

    expect(result.total).toBe(7);
    expect(result.emAprovacao).toBe(3);
    expect(result.aprovadas).toBe(0);
    expect(result.reprovadas).toBe(0);
    expect(result.porStatus).toEqual([
      { status: 'EM_APROVACAO', count: 3 },
      { status: 'RASCUNHO', count: 3 },
      { status: 'CANCELADO', count: 1 },
    ]);
  });

  test('coage Decimal→number e agrupa por grupo.nome (ordenado desc); sem grupo cai em "Sem grupo"', async () => {
    const prisma = makePrismaMock({
      byStatus: [],
      itens: [
        { valorTotal: '100.50' as unknown, grupo: { nome: 'Obras' } },
        { valorTotal: '50.00' as unknown, grupo: { nome: 'Obras' } },
        { valorTotal: '200.00' as unknown, grupo: { nome: 'Equipamentos' } },
        { valorTotal: '10.00' as unknown, grupo: null },
      ],
    });
    const service = new RelatoriosService(prisma as any);

    const result = await service.dashboard({ userId: 'user-1', isAdmin: true });

    expect(typeof result.valorTotal).toBe('number');
    expect(result.valorTotal).toBeCloseTo(360.5);
    expect(result.porGrupo[0]).toEqual({ grupo: 'Equipamentos', valor: 200 });
    expect(result.porGrupo[1]).toEqual({ grupo: 'Obras', valor: 150.5 });
    expect(result.porGrupo.find((g) => g.grupo === 'Sem grupo')).toEqual({
      grupo: 'Sem grupo',
      valor: 10,
    });
    for (const g of result.porGrupo) {
      expect(typeof g.valor).toBe('number');
    }
  });
});
