import { z } from 'zod';

// ── Política de senha (OWASP / argon2id) ──────────────────────────────────
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{12,}$/;

export const PasswordSchema = z
  .string()
  .min(12, 'Senha deve ter no mínimo 12 caracteres')
  .regex(
    PASSWORD_REGEX,
    'Senha deve conter maiúscula, minúscula, número e símbolo',
  );

// ── Auth endpoints ────────────────────────────────────────────────────────
export const LoginSchema = z.object({
  login: z.string().min(1).max(64),
  senha: z.string().min(1),
});

export const TokenPairSchema = z.object({
  accessToken: z.string(),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().optional(), // pode vir via cookie ou body
});

// ── Types ─────────────────────────────────────────────────────────────────
export type LoginDto = z.infer<typeof LoginSchema>;
export type TokenPair = z.infer<typeof TokenPairSchema>;
