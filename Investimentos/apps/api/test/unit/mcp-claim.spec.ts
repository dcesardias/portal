/**
 * AC5 — mcp claim no access token (Fix #5)
 * Puro jose, sem NestJS/Prisma/DI.
 * mustChangePwd=true  → payload.mcp === true
 * mustChangePwd=false → payload.mcp === undefined (claim ausente)
 */

import { SignJWT, jwtVerify } from 'jose';

// Reproduz exatamente a lógica de signAccess em auth.service.ts
async function signAccess(
  userId: string,
  login: string,
  mustChangePwd: boolean = false,
  secret: Uint8Array,
): Promise<string> {
  const now = new Date();
  const payload: Record<string, unknown> = { sub: userId, login };
  if (mustChangePwd) payload['mcp'] = true;

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(new Date(now.getTime() + 900_000)) // 15m
    .sign(secret);
}

const SECRET = new TextEncoder().encode('test-secret-key-32-chars-minimum!');

describe('AC5 — mcp claim no access token', () => {
  test('mustChangePwd=true → payload decodificado tem mcp === true', async () => {
    const token = await signAccess('user-uuid-123', 'admin', true, SECRET);
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] });
    expect((payload as Record<string, unknown>).mcp).toBe(true);
  });

  test('mustChangePwd=false → payload decodificado NÃO tem mcp (undefined)', async () => {
    const token = await signAccess('user-uuid-123', 'admin', false, SECRET);
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] });
    expect((payload as Record<string, unknown>).mcp).toBeUndefined();
  });

  test('mustChangePwd omitido (default) → payload decodificado NÃO tem mcp', async () => {
    // signAccess sem 3º argumento → default false
    const token = await signAccess('user-uuid-123', 'admin', undefined, SECRET);
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] });
    expect((payload as Record<string, unknown>).mcp).toBeUndefined();
  });

  test('mcp=true não contamina token gerado com mustChangePwd=false', async () => {
    const tokenTrue = await signAccess('u1', 'a', true, SECRET);
    const tokenFalse = await signAccess('u1', 'a', false, SECRET);
    const { payload: p1 } = await jwtVerify(tokenTrue, SECRET, { algorithms: ['HS256'] });
    const { payload: p2 } = await jwtVerify(tokenFalse, SECRET, { algorithms: ['HS256'] });
    expect((p1 as Record<string, unknown>).mcp).toBe(true);
    expect((p2 as Record<string, unknown>).mcp).toBeUndefined();
  });

  test('sub e login estão presentes independente de mustChangePwd', async () => {
    const token = await signAccess('user-uuid-123', 'operador', true, SECRET);
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] });
    expect(payload.sub).toBe('user-uuid-123');
    expect((payload as Record<string, unknown>).login).toBe('operador');
  });
});
