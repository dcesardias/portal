import type { Request } from 'express';
import type { UsersService } from '../users/users.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PERFIS } from './constants/perfis';
import { registrarEvento } from './auditoria';

/**
 * Throttle de auditoria de simulação: resolveEffective roda a cada request
 * (inclusive todo GET) enquanto o admin simula, então logar sem limite
 * poluiria a trilha. Loga no máximo 1x a cada 10min por par (admin→alvo).
 * Best-effort, em memória — vale só para esta instância do processo (não é
 * persistido nem sincronizado entre réplicas; um restart reseta o throttle).
 */
const AUDITORIA_SIMULACAO_THROTTLE_MS = 10 * 60 * 1000;
const ultimoLogSimulacao = new Map<string, number>();

async function registrarInicioSimulacao(
  prisma: PrismaService,
  real: { id: string; login: string },
  alvoId: string,
): Promise<void> {
  const chave = `${real.id}->${alvoId}`;
  const agora = Date.now();
  const ultimo = ultimoLogSimulacao.get(chave);
  if (ultimo != null && agora - ultimo < AUDITORIA_SIMULACAO_THROTTLE_MS) return;
  ultimoLogSimulacao.set(chave, agora);
  await registrarEvento(prisma, {
    entidade: 'Simulacao',
    entidadeId: alvoId,
    usuarioId: real.id,
    acao: 'SIMULACAO_INICIADA',
    dados: { adminId: real.id, adminLogin: real.login, alvo: alvoId },
  });
}

export interface EffectiveUser {
  id: string;
  login: string;
  perfis: string[];
  simulando: boolean;
  real: {
    id: string;
    login: string;
    nome: string | null;
    isAdmin: boolean;
  };
}

interface RequestWithUser extends Request {
  user?: { sub: string; login: string; perfis?: string[] };
}

/** O header HTTP pode chegar duplicado (array) — usa sempre o primeiro valor. */
function normalizeHeader(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Resolve o usuário EFETIVO da requisição: o próprio usuário autenticado, ou —
 * se ele for ADMIN e mandar o header `x-simulate-user` apontando para um alvo
 * existente — o usuário simulado. Sempre inclui `real` (identidade verdadeira,
 * do JWT), para o front distinguir "quem realmente está logado".
 * Deve ser chamado APÓS o JwtAuthGuard (depende de req.user já populado).
 *
 * `prisma` é OPCIONAL só para não quebrar chamadores antigos/testes que ainda
 * passam 2 argumentos — mas todo endpoint real DEVE passá-lo: é o que torna a
 * auditoria de início de simulação AUTORITATIVA NO SERVIDOR (não depende do
 * front chamar um endpoint separado antes; um curl direto com o header
 * também é registrado).
 */
export async function resolveEffective(
  req: RequestWithUser,
  users: UsersService,
  prisma?: PrismaService,
): Promise<EffectiveUser> {
  const realId = req.user?.sub;
  const realLogin = req.user?.login;
  if (!realId || !realLogin) {
    throw new Error('resolveEffective chamado sem req.user — falta JwtAuthGuard antes');
  }

  const realPerfis = req.user?.perfis ?? (await users.getPerfis(realId));
  const realIsAdmin = realPerfis.includes(PERFIS.ADMIN);
  const realUser = await users.findById(realId);

  const real = {
    id: realId,
    login: realLogin,
    nome: realUser?.nome ?? null,
    isAdmin: realIsAdmin,
  };

  const simulateHeader = normalizeHeader(req.headers['x-simulate-user'] as string | string[] | undefined);

  if (simulateHeader && realIsAdmin) {
    const alvo = await users.findById(simulateHeader);
    if (alvo) {
      const perfisAlvo = await users.getPerfis(alvo.id);
      if (prisma) {
        await registrarInicioSimulacao(prisma, { id: real.id, login: real.login }, alvo.id);
      }
      return {
        id: alvo.id,
        login: alvo.login,
        perfis: perfisAlvo,
        simulando: true,
        real,
      };
    }
  }

  return {
    id: real.id,
    login: real.login,
    perfis: realPerfis,
    simulando: false,
    real,
  };
}
