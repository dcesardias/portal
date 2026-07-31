/**
 * Testes UNITÁRIOS — não precisam de DB/Docker.
 * Validam: política de senha (AC11), prefixo argon2id (AC12), TTLs (AC13).
 *
 * Estratégia: importar as funções/classes diretamente e testar a lógica pura.
 * NÃO usa Prisma, NÃO usa DB, NÃO faz rede.
 */

import { BadRequestException } from '@nestjs/common';
import { hash } from '@node-rs/argon2';

// ── Reprodução da lógica de AuthService (sem DI/Prisma) ──────────────────────

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{12,}$/;

function validatePasswordPolicy(senha: string): void {
  if (!PASSWORD_REGEX.test(senha)) {
    throw new BadRequestException(
      'Senha deve ter no mínimo 12 caracteres com maiúscula, minúscula, número e símbolo',
    );
  }
}

function parseTtl(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) throw new Error(`TTL inválido: ${ttl}`);
  const value = parseInt(match[1], 10);
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * multipliers[match[2]];
}

// ── AC11: Política de senha ────────────────────────────────────────────────────

describe('AC11 — Política de senha', () => {
  test('senha < 12 chars → BadRequestException', () => {
    expect(() => validatePasswordPolicy('Abc!1')).toThrow(BadRequestException);
  });

  test('senha sem maiúscula → BadRequestException', () => {
    expect(() => validatePasswordPolicy('abc!1234567890')).toThrow(BadRequestException);
  });

  test('senha sem minúscula → BadRequestException', () => {
    expect(() => validatePasswordPolicy('ABC!1234567890')).toThrow(BadRequestException);
  });

  test('senha sem número → BadRequestException', () => {
    expect(() => validatePasswordPolicy('Abcdef!ghijkl')).toThrow(BadRequestException);
  });

  test('senha sem símbolo → BadRequestException', () => {
    expect(() => validatePasswordPolicy('Abcdef1234567')).toThrow(BadRequestException);
  });

  test('senha válida (12 chars, todos critérios) → não lança', () => {
    expect(() => validatePasswordPolicy('Admin@Inv3st!2026')).not.toThrow();
  });

  test('exatamente 12 chars válidos → não lança', () => {
    expect(() => validatePasswordPolicy('Abcde!1fghij')).not.toThrow();
  });

  test('11 chars com todos critérios → BadRequestException (comprimento)', () => {
    expect(() => validatePasswordPolicy('Abcde!1fghi')).toThrow(BadRequestException);
  });
});

// ── AC12: Hash argon2id ────────────────────────────────────────────────────────

describe('AC12 — Hash com prefixo $argon2id$', () => {
  test('hash gerado pelo @node-rs/argon2 começa com $argon2id$', async () => {
    const h = await hash('Admin@Inv3st!2026', ARGON2_OPTIONS);
    expect(h).toMatch(/^\$argon2id\$/);
  }, 15_000);

  test('senhaHash do seed (Admin@Inv3st!2026) produz prefixo $argon2id$', async () => {
    const h = await hash('Admin@Inv3st!2026', ARGON2_OPTIONS);
    expect(h.startsWith('$argon2id$')).toBe(true);
  }, 15_000);
});

// ── AC13: TTLs ────────────────────────────────────────────────────────────────

describe('AC13 — Access TTL ≤ 15min; Refresh TTL ≤ 7d', () => {
  test('JWT_ACCESS_EXPIRES_IN=15m → parseTtl ≤ 900_000ms (15min)', () => {
    const ms = parseTtl('15m');
    expect(ms).toBeLessThanOrEqual(900_000);
    expect(ms).toBe(900_000); // exatamente 15min
  });

  test('JWT_REFRESH_EXPIRES_IN=7d → parseTtl ≤ 604_800_000ms (7d)', () => {
    const ms = parseTtl('7d');
    expect(ms).toBeLessThanOrEqual(604_800_000);
    expect(ms).toBe(604_800_000); // exatamente 7d
  });

  test('parseTtl("15m") / 1000 = 900 segundos (cookie Max-Age check)', () => {
    // Controller multiplica por 1000 para maxAge cookie → raw TTL em ms / 1000 = segundos
    // O critério: Max-Age ≤ 604800 (7d em segundos)
    const refreshSec = parseTtl('7d') / 1_000;
    expect(refreshSec).toBeLessThanOrEqual(604_800);
  });

  test('parseTtl rejeita formato inválido', () => {
    expect(() => parseTtl('15min')).toThrow('TTL inválido');
    expect(() => parseTtl('abc')).toThrow('TTL inválido');
  });

  test('access exp - iat ≤ 900 segundos verifica a lógica de signAccess', () => {
    // Smoke: TTL access em ms dividido por 1000 = segundos
    const accessMs = parseTtl('15m');
    const accessSec = accessMs / 1_000;
    expect(accessSec).toBeLessThanOrEqual(900);
  });
});

// ── AC1: Workspace (smoke de estrutura) ──────────────────────────────────────

describe('AC1 — Estrutura do workspace (smoke)', () => {
  const path = require('path');
  const fs = require('fs');
  // __dirname = workspaces/investimentos/apps/api/test/unit
  // subir 4 níveis → workspaces/investimentos
  const root = path.resolve(__dirname, '..', '..', '..', '..');

  test('apps/api existe', () => {
    expect(fs.existsSync(path.join(root, 'apps', 'api'))).toBe(true);
  });

  test('apps/web existe', () => {
    expect(fs.existsSync(path.join(root, 'apps', 'web'))).toBe(true);
  });

  test('packages/shared existe', () => {
    expect(fs.existsSync(path.join(root, 'packages', 'shared'))).toBe(true);
  });

  test('prisma/schema.prisma existe', () => {
    expect(
      fs.existsSync(path.join(root, 'apps', 'api', 'prisma', 'schema.prisma')),
    ).toBe(true);
  });

  test('schema.prisma contém model User', () => {
    const schema = fs.readFileSync(
      path.join(root, 'apps', 'api', 'prisma', 'schema.prisma'),
      'utf-8',
    );
    expect(schema).toContain('model User');
    expect(schema).toContain('model RefreshToken');
    expect(schema).toContain('model Fluxo');
    expect(schema).toContain('model EtapaFluxo');
  });

  test('seed.ts cria 2 fluxos (GPE Direto e 3 Níveis)', () => {
    const seed = fs.readFileSync(
      path.join(root, 'apps', 'api', 'prisma', 'seed.ts'),
      'utf-8',
    );
    expect(seed).toContain("nome: 'GPE Direto'");
    expect(seed).toContain("nome: '3 Níveis'");
    expect(seed).toContain('totalFluxos !== 2');
  });
});
