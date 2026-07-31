/**
 * Testes UNITÁRIOS do envio em lote (`enviarLote`) — QA.
 * Sem DB real: PrismaService/FluxoResolver mockados; `enviar` é STUBADO via
 * jest.spyOn para provar só o agregado (dedup + parcial + resultados), que é
 * a responsabilidade própria de `enviarLote`.
 */

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SolicitacaoService } from '../../src/solicitacao/solicitacao.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { FluxoResolver } from '../../src/fluxo/fluxo.resolver';

function buildService() {
  const prisma = {
    solicitacao: {
      // enviarLote consulta o número da solicitação quando `enviar` falha
      // (para reportar no resultado); default null (sem número disponível).
      findUnique: jest.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaService;
  const resolver = {} as unknown as FluxoResolver;
  const service = new SolicitacaoService(prisma, resolver);
  return { service, prisma };
}

describe('SolicitacaoService.enviarLote — agregação e semântica parcial', () => {
  test('2 sucesso + 1 falha → enviadas:2, falhas:1, resultados com os 3 e erro preenchido no que falhou', async () => {
    const { service } = buildService();
    const enviarSpy = jest
      .spyOn(service, 'enviar')
      .mockImplementation(async (id: string) => {
        if (id === 'id-falha') {
          throw new BadRequestException('Não pode enviar em status APROVADO');
        }
        return { id, numero: id === 'id-1' ? 101 : 102 } as any;
      });

    const out = await service.enviarLote('user-1', ['id-1', 'id-2', 'id-falha']);

    expect(out.enviadas).toBe(2);
    expect(out.falhas).toBe(1);
    expect(out.resultados).toHaveLength(3);
    expect(enviarSpy).toHaveBeenCalledTimes(3);

    const r1 = out.resultados.find((r) => r.id === 'id-1')!;
    const r2 = out.resultados.find((r) => r.id === 'id-2')!;
    const rf = out.resultados.find((r) => r.id === 'id-falha')!;

    expect(r1).toMatchObject({ ok: true, numero: 101 });
    expect(r1.erro).toBeUndefined();
    expect(r2).toMatchObject({ ok: true, numero: 102 });
    expect(rf.ok).toBe(false);
    expect(rf.erro).toBe('Não pode enviar em status APROVADO');
  });

  test('um erro NÃO aborta os demais — a falha fica isolada no seu próprio resultado', async () => {
    const { service } = buildService();
    jest.spyOn(service, 'enviar').mockImplementation(async (id: string) => {
      if (id === 'meio') throw new Error('boom');
      return { id, numero: 1 } as any;
    });

    const out = await service.enviarLote('user-1', ['antes', 'meio', 'depois']);

    // Se o erro tivesse abortado o loop, 'depois' nunca teria sido processado.
    const idsProcessados = out.resultados.map((r) => r.id);
    expect(idsProcessados).toEqual(['antes', 'meio', 'depois']);
    expect(out.resultados.find((r) => r.id === 'depois')?.ok).toBe(true);
    expect(out.enviadas).toBe(2);
    expect(out.falhas).toBe(1);
  });

  test('dedup: ids repetidos [A, A, B] → enviar chamado 1x por id único, sem duplicata em resultados', async () => {
    const { service } = buildService();
    const enviarSpy = jest
      .spyOn(service, 'enviar')
      .mockImplementation(async (id: string) => ({ id, numero: 1 } as any));

    const out = await service.enviarLote('user-1', ['A', 'A', 'B']);

    expect(enviarSpy).toHaveBeenCalledTimes(2);
    expect(enviarSpy.mock.calls.map((c) => c[0])).toEqual(['A', 'B']);
    expect(out.resultados).toHaveLength(2);
    expect(out.resultados.map((r) => r.id)).toEqual(['A', 'B']);
    expect(out.enviadas).toBe(2);
    expect(out.falhas).toBe(0);
  });

  test('dono errado (Forbidden) vira falha isolada — nunca "envia" indevidamente', async () => {
    const { service } = buildService();
    jest
      .spyOn(service, 'enviar')
      .mockRejectedValue(new ForbiddenException('Não é o solicitante'));

    const out = await service.enviarLote('user-x', ['id-de-outro']);

    expect(out.enviadas).toBe(0);
    expect(out.falhas).toBe(1);
    expect(out.resultados[0]).toMatchObject({
      id: 'id-de-outro',
      ok: false,
      erro: 'Não é o solicitante',
    });
  });

  test('status inválido (BadRequest) vira falha isolada — nunca "envia" indevidamente', async () => {
    const { service } = buildService();
    jest
      .spyOn(service, 'enviar')
      .mockRejectedValue(new BadRequestException('Não pode enviar em status CANCELADO'));

    const out = await service.enviarLote('user-1', ['id-cancelado']);

    expect(out.enviadas).toBe(0);
    expect(out.falhas).toBe(1);
    expect(out.resultados[0].ok).toBe(false);
    expect(out.resultados[0].erro).toBe('Não pode enviar em status CANCELADO');
  });

  test('busca o número via prisma quando enviar falha (para reportar no resultado)', async () => {
    const { service, prisma } = buildService();
    (prisma.solicitacao.findUnique as jest.Mock).mockResolvedValue({ numero: 555 });
    jest.spyOn(service, 'enviar').mockRejectedValue(new BadRequestException('falhou'));

    const out = await service.enviarLote('user-1', ['id-1']);

    expect(out.resultados[0].numero).toBe(555);
    expect(prisma.solicitacao.findUnique).toHaveBeenCalledWith({
      where: { id: 'id-1' },
      select: { numero: true },
    });
  });
});
