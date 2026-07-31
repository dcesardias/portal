import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Segredo compartilhado com o Portal para o bridge de SSO (/auth/sso).
  // Só o Portal (server-side) conhece este valor; sem ele o endpoint SSO fica desativado.
  SSO_SHARED_SECRET: z.string().min(16).optional(),
});

export type Env = z.infer<typeof envSchema>;
