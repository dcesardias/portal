/**
 * Testes UNITÁRIOS do EnviarLoteSchema (zod) — QA.
 */

import { EnviarLoteSchema } from '@investimentos/shared';

const uuid1 = '11111111-1111-4111-8111-111111111111';
const uuid2 = '22222222-2222-4222-8222-222222222222';

describe('EnviarLoteSchema', () => {
  test('aceita lista com 1 uuid válido', () => {
    const r = EnviarLoteSchema.safeParse({ ids: [uuid1] });
    expect(r.success).toBe(true);
  });

  test('aceita lista com múltiplos uuids válidos', () => {
    const r = EnviarLoteSchema.safeParse({ ids: [uuid1, uuid2] });
    expect(r.success).toBe(true);
  });

  test('rejeita lista vazia', () => {
    const r = EnviarLoteSchema.safeParse({ ids: [] });
    expect(r.success).toBe(false);
  });

  test('rejeita id não-uuid', () => {
    const r = EnviarLoteSchema.safeParse({ ids: ['nao-e-uuid'] });
    expect(r.success).toBe(false);
  });

  test('rejeita mais de 100 ids', () => {
    const ids = Array.from({ length: 101 }, (_, i) =>
      `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    );
    const r = EnviarLoteSchema.safeParse({ ids });
    expect(r.success).toBe(false);
  });

  test('aceita exatamente 100 ids (limite)', () => {
    const ids = Array.from({ length: 100 }, (_, i) =>
      `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    );
    const r = EnviarLoteSchema.safeParse({ ids });
    expect(r.success).toBe(true);
  });

  test('rejeita ausência de ids', () => {
    const r = EnviarLoteSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});
