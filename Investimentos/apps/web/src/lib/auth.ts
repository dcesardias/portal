import { api } from './api';
import { LoginSchema, type LoginDto } from '@investimentos/shared';

export async function login(data: LoginDto): Promise<{ accessToken: string }> {
  // Valida client-side antes de enviar
  LoginSchema.parse(data);
  const response = await api.post<{ accessToken: string }>('/auth/login', data);
  sessionStorage.setItem('access_token', response.data.accessToken);
  return response.data;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    sessionStorage.removeItem('access_token');
  }
}

export function isAuthenticated(): boolean {
  return !!sessionStorage.getItem('access_token');
}

interface TokenClaims {
  sub?: string;
  login?: string;
  perfis?: string[];
  mcp?: boolean;
}

/** Decodifica (sem validar assinatura — apenas leitura local) o payload do JWT armazenado. */
export function decodeToken(): TokenClaims | null {
  const token = sessionStorage.getItem('access_token');
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as TokenClaims;
  } catch {
    return null;
  }
}

/** Perfis (papéis) do usuário logado, ex.: ['SOLICITANTE','ADMIN']. */
export function getPerfis(): string[] {
  return decodeToken()?.perfis ?? [];
}

export function isAdmin(): boolean {
  return getPerfis().includes('ADMIN');
}

/** Pode atuar na fila de aprovação (tem alçada de aprovador em algum nível). */
export function isAprovador(): boolean {
  const p = getPerfis();
  return p.includes('APROVADOR') || p.includes('APROVADOR_FINAL');
}
