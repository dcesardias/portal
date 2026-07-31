/**
 * Testes UNITÁRIOS de resolveEffective (apps/api/src/common/effective-user.ts).
 * Garantia de segurança: só ADMIN consegue "simular usuário" via header
 * x-simulate-user; para qualquer outro caso, cai no fallback do usuário real.
 * UsersService é mockado (findById/getPerfis) — sem Prisma, sem DB, sem rede.
 */

import { resolveEffective } from '../../src/common/effective-user';
import type { UsersService } from '../../src/users/users.service';
import { PERFIS } from '../../src/common/constants/perfis';

type MockReq = {
  user?: { sub: string; login: string; perfis?: string[] };
  headers: Record<string, string | string[] | undefined>;
};

function makeUsersMock(overrides: Partial<UsersService> = {}): UsersService {
  return {
    findById: jest.fn(),
    getPerfis: jest.fn(),
    ...overrides,
  } as unknown as UsersService;
}

describe('resolveEffective', () => {
  test('admin real + header X-Simulate-User + alvo existe → efetivo=alvo, simulando=true, perfis do alvo', async () => {
    const req: MockReq = {
      user: { sub: 'admin-1', login: 'admin', perfis: [PERFIS.ADMIN] },
      headers: { 'x-simulate-user': 'alvo-1' },
    };
    const users = makeUsersMock({
      findById: jest.fn(async (id: string) => {
        if (id === 'admin-1') return { id: 'admin-1', nome: 'Admin Real' } as any;
        if (id === 'alvo-1') return { id: 'alvo-1', login: 'alvo', nome: 'Usuário Alvo' } as any;
        return null;
      }),
      getPerfis: jest.fn(async (id: string) => (id === 'alvo-1' ? [PERFIS.SOLICITANTE] : [])),
    });

    const eff = await resolveEffective(req as any, users);

    expect(eff.id).toBe('alvo-1');
    expect(eff.login).toBe('alvo');
    expect(eff.simulando).toBe(true);
    expect(eff.perfis).toEqual([PERFIS.SOLICITANTE]);
    expect(eff.real).toEqual({
      id: 'admin-1',
      login: 'admin',
      nome: 'Admin Real',
      isAdmin: true,
    });
  });

  test('header presente + usuário real NÃO admin → IGNORA (efetivo=real, simulando=false)', async () => {
    const req: MockReq = {
      user: { sub: 'user-1', login: 'joao', perfis: [PERFIS.SOLICITANTE] },
      headers: { 'x-simulate-user': 'alvo-1' },
    };
    const findByIdMock = jest.fn(async (id: string) =>
      id === 'user-1' ? ({ id: 'user-1', nome: 'João' } as any) : ({ id: 'alvo-1' } as any),
    );
    const users = makeUsersMock({ findById: findByIdMock, getPerfis: jest.fn() });

    const eff = await resolveEffective(req as any, users);

    expect(eff.id).toBe('user-1');
    expect(eff.simulando).toBe(false);
    expect(eff.perfis).toEqual([PERFIS.SOLICITANTE]);
    expect(eff.real.isAdmin).toBe(false);
    // Garantia crítica: não-admin não deve nem tentar resolver o alvo simulado.
    expect(findByIdMock).toHaveBeenCalledTimes(1);
    expect(findByIdMock).toHaveBeenCalledWith('user-1');
  });

  test('header presente + real admin + alvo INEXISTENTE → ignora (fallback real)', async () => {
    const req: MockReq = {
      user: { sub: 'admin-1', login: 'admin', perfis: [PERFIS.ADMIN] },
      headers: { 'x-simulate-user': 'nao-existe' },
    };
    const users = makeUsersMock({
      findById: jest.fn(async (id: string) =>
        id === 'admin-1' ? ({ id: 'admin-1', nome: 'Admin Real' } as any) : null,
      ),
      getPerfis: jest.fn(async () => [PERFIS.ADMIN]),
    });

    const eff = await resolveEffective(req as any, users);

    expect(eff.id).toBe('admin-1');
    expect(eff.simulando).toBe(false);
    expect(eff.real.isAdmin).toBe(true);
  });

  test('sem header → efetivo=real, simulando=false, bloco real presente com isAdmin correto', async () => {
    const req: MockReq = {
      user: { sub: 'user-1', login: 'joao', perfis: [PERFIS.SOLICITANTE] },
      headers: {},
    };
    const users = makeUsersMock({
      findById: jest.fn(async () => ({ id: 'user-1', nome: 'João' } as any)),
      getPerfis: jest.fn(async () => [PERFIS.SOLICITANTE]),
    });

    const eff = await resolveEffective(req as any, users);

    expect(eff.id).toBe('user-1');
    expect(eff.simulando).toBe(false);
    expect(eff.real).toEqual({
      id: 'user-1',
      login: 'joao',
      nome: 'João',
      isAdmin: false,
    });
  });

  test('header como array → normaliza (usa primeiro) e simula o primeiro alvo', async () => {
    const req: MockReq = {
      user: { sub: 'admin-1', login: 'admin', perfis: [PERFIS.ADMIN] },
      headers: { 'x-simulate-user': ['alvo-1', 'alvo-2'] },
    };
    const findByIdMock = jest.fn(async (id: string) => {
      if (id === 'admin-1') return { id: 'admin-1', nome: 'Admin Real' } as any;
      if (id === 'alvo-1') return { id: 'alvo-1', login: 'alvo-um', nome: 'Alvo Um' } as any;
      if (id === 'alvo-2') return { id: 'alvo-2', login: 'alvo-dois', nome: 'Alvo Dois' } as any;
      return null;
    });
    const users = makeUsersMock({
      findById: findByIdMock,
      getPerfis: jest.fn(async (id: string) => (id === 'alvo-1' ? [PERFIS.SOLICITANTE] : [])),
    });

    const eff = await resolveEffective(req as any, users);

    expect(eff.id).toBe('alvo-1');
    expect(eff.login).toBe('alvo-um');
    expect(eff.simulando).toBe(true);
    // Prova que usou o PRIMEIRO valor do array, nunca o segundo.
    expect(findByIdMock).not.toHaveBeenCalledWith('alvo-2');
  });

  test('sem req.user (guard não rodou antes) → lança Error explícito', async () => {
    const req: MockReq = { headers: {} };
    const users = makeUsersMock();
    await expect(resolveEffective(req as any, users)).rejects.toThrow(
      'resolveEffective chamado sem req.user — falta JwtAuthGuard antes',
    );
  });

  describe('auditoria server-side (prisma passado)', () => {
    function makePrismaMock() {
      return { eventoAuditoria: { create: jest.fn().mockResolvedValue({}) } } as any;
    }

    test('simulação HONRADA + prisma passado → registra EventoAuditoria SIMULACAO_INICIADA', async () => {
      const req: MockReq = {
        user: { sub: 'admin-aud-1', login: 'admin', perfis: [PERFIS.ADMIN] },
        headers: { 'x-simulate-user': 'alvo-aud-1' },
      };
      const users = makeUsersMock({
        findById: jest.fn(async (id: string) => {
          if (id === 'admin-aud-1') return { id: 'admin-aud-1', nome: 'Admin Real' } as any;
          if (id === 'alvo-aud-1') return { id: 'alvo-aud-1', login: 'alvo', nome: 'Alvo' } as any;
          return null;
        }),
        getPerfis: jest.fn(async () => [PERFIS.SOLICITANTE]),
      });
      const prisma = makePrismaMock();

      await resolveEffective(req as any, users, prisma);

      expect(prisma.eventoAuditoria.create).toHaveBeenCalledTimes(1);
      const args = prisma.eventoAuditoria.create.mock.calls[0][0];
      expect(args.data.entidade).toBe('Simulacao');
      expect(args.data.entidadeId).toBe('alvo-aud-1');
      expect(args.data.usuarioId).toBe('admin-aud-1');
      expect(args.data.acao).toBe('SIMULACAO_INICIADA');
      expect(JSON.parse(args.data.dadosJson)).toEqual({
        adminId: 'admin-aud-1',
        adminLogin: 'admin',
        alvo: 'alvo-aud-1',
      });
    });

    test('chamadas repetidas do MESMO par admin→alvo dentro da janela → loga só 1x (throttle)', async () => {
      const req: MockReq = {
        user: { sub: 'admin-aud-2', login: 'admin2', perfis: [PERFIS.ADMIN] },
        headers: { 'x-simulate-user': 'alvo-aud-2' },
      };
      const users = makeUsersMock({
        findById: jest.fn(async (id: string) => {
          if (id === 'admin-aud-2') return { id: 'admin-aud-2', nome: 'Admin Real 2' } as any;
          if (id === 'alvo-aud-2') return { id: 'alvo-aud-2', login: 'alvo2', nome: 'Alvo 2' } as any;
          return null;
        }),
        getPerfis: jest.fn(async () => [PERFIS.SOLICITANTE]),
      });
      const prisma = makePrismaMock();

      await resolveEffective(req as any, users, prisma);
      await resolveEffective(req as any, users, prisma);
      await resolveEffective(req as any, users, prisma);

      expect(prisma.eventoAuditoria.create).toHaveBeenCalledTimes(1);
    });

    test('sem prisma (chamador antigo) → não tenta auditar, só resolve o efetivo normalmente', async () => {
      const req: MockReq = {
        user: { sub: 'admin-aud-3', login: 'admin3', perfis: [PERFIS.ADMIN] },
        headers: { 'x-simulate-user': 'alvo-aud-3' },
      };
      const users = makeUsersMock({
        findById: jest.fn(async (id: string) => {
          if (id === 'admin-aud-3') return { id: 'admin-aud-3', nome: 'Admin Real 3' } as any;
          if (id === 'alvo-aud-3') return { id: 'alvo-aud-3', login: 'alvo3', nome: 'Alvo 3' } as any;
          return null;
        }),
        getPerfis: jest.fn(async () => [PERFIS.SOLICITANTE]),
      });

      const eff = await resolveEffective(req as any, users);

      expect(eff.simulando).toBe(true);
      expect(eff.id).toBe('alvo-aud-3');
    });
  });
});
