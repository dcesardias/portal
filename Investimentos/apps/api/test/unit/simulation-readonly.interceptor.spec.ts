/**
 * Testes UNITÁRIOS do SimulationReadonlyInterceptor
 * (apps/api/src/common/interceptors/simulation-readonly.interceptor.ts).
 * Garantia de segurança: enquanto um ADMIN estiver simulando outro usuário
 * (header x-simulate-user), qualquer método de escrita (POST/PUT/DELETE/PATCH)
 * deve ser bloqueado com ForbiddenException. Leitura (GET) nunca é bloqueada.
 * ExecutionContext e CallHandler são mockados — sem HTTP real, sem Nest bootstrap.
 */

import { ForbiddenException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { SimulationReadonlyInterceptor } from '../../src/common/interceptors/simulation-readonly.interceptor';

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

function makeCallHandler(): CallHandler {
  return { handle: jest.fn(() => of('ok')) };
}

describe('SimulationReadonlyInterceptor', () => {
  let interceptor: SimulationReadonlyInterceptor;

  beforeEach(() => {
    interceptor = new SimulationReadonlyInterceptor();
  });

  test.each(['POST', 'PUT', 'DELETE', 'PATCH'])(
    '%s + header x-simulate-user + req.user.perfis inclui ADMIN → ForbiddenException',
    (method) => {
      const req = {
        method,
        headers: { 'x-simulate-user': 'alvo-1' },
        user: { sub: 'admin-1', login: 'admin', perfis: ['ADMIN'] },
      };
      const handler = makeCallHandler();
      expect(() => interceptor.intercept(makeContext(req), handler)).toThrow(
        ForbiddenException,
      );
      expect(handler.handle).not.toHaveBeenCalled();
    },
  );

  test('GET + header presente → passa (não bloqueia, mesmo admin simulando)', () => {
    const req = {
      method: 'GET',
      headers: { 'x-simulate-user': 'alvo-1' },
      user: { sub: 'admin-1', login: 'admin', perfis: ['ADMIN'] },
    };
    const handler = makeCallHandler();
    const result$ = interceptor.intercept(makeContext(req), handler);
    expect(handler.handle).toHaveBeenCalledTimes(1);
    expect(result$).toBeDefined();
  });

  test('POST sem header → passa', () => {
    const req = {
      method: 'POST',
      headers: {},
      user: { sub: 'admin-1', login: 'admin', perfis: ['ADMIN'] },
    };
    const handler = makeCallHandler();
    interceptor.intercept(makeContext(req), handler);
    expect(handler.handle).toHaveBeenCalledTimes(1);
  });

  test('POST com header mas req.user NÃO admin → passa (simulação não é honrada; interceptor não bloqueia)', () => {
    const req = {
      method: 'POST',
      headers: { 'x-simulate-user': 'alvo-1' },
      user: { sub: 'user-1', login: 'joao', perfis: ['SOLICITANTE'] },
    };
    const handler = makeCallHandler();
    interceptor.intercept(makeContext(req), handler);
    expect(handler.handle).toHaveBeenCalledTimes(1);
  });

  test('POST com header, req.user ausente (sem perfis) → passa (isAdmin=false por fallback)', () => {
    const req = {
      method: 'POST',
      headers: { 'x-simulate-user': 'alvo-1' },
      user: undefined,
    };
    const handler = makeCallHandler();
    interceptor.intercept(makeContext(req), handler);
    expect(handler.handle).toHaveBeenCalledTimes(1);
  });

  test('POST com header array (duplicado) + admin → ForbiddenException', () => {
    const req = {
      method: 'POST',
      headers: { 'x-simulate-user': ['alvo-1', 'alvo-2'] },
      user: { sub: 'admin-1', login: 'admin', perfis: ['ADMIN'] },
    };
    const handler = makeCallHandler();
    expect(() => interceptor.intercept(makeContext(req), handler)).toThrow(
      ForbiddenException,
    );
  });
});
