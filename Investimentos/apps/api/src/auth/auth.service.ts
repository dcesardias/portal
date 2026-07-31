import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { hash, verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { createHash, randomUUID } from 'node:crypto';
import type { Env } from '../env.validation';

// Argon2id: m=19456 KiB, t=2, p=1
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

const JWT_ISSUER = 'investimentos-api';
const JWT_AUDIENCE = 'investimentos-web';

interface AccessPayload extends JWTPayload {
  sub: string;
  login: string;
  mcp?: boolean; // must-change-password claim (Onda 3 aplica restrição na UI)
  perfis?: string[]; // nomes dos perfis (papéis) do usuário, ex.: ['SOLICITANTE','ADMIN']
}

@Injectable()
export class AuthService {
  private readonly accessSecret: Uint8Array;
  private readonly refreshSecret: Uint8Array;
  private readonly accessTtlMs: number;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.accessSecret = new TextEncoder().encode(
      this.config.get('JWT_ACCESS_SECRET'),
    );
    this.refreshSecret = new TextEncoder().encode(
      this.config.get('JWT_REFRESH_SECRET'),
    );
    this.accessTtlMs = this.parseTtl(
      this.config.get('JWT_ACCESS_EXPIRES_IN'),
    );
    this.refreshTtlMs = this.parseTtl(
      this.config.get('JWT_REFRESH_EXPIRES_IN'),
    );
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  async login(login: string, senha: string) {
    const user = await this.users.findByLogin(login);

    // Verificação constante para evitar timing attack
    const DUMMY_HASH =
      '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    const senhaHash = user?.senhaHash ?? DUMMY_HASH;
    // Fix #13: verify lê parâmetros do próprio hash — sem segundo argumento
    const valida = await verify(senhaHash, senha);

    if (!user || !valida || !user.ativo) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const mustChangePwd = user.mustChangePwd === true;
    const perfis = await this.users.getPerfis(user.id);
    // Fix #5: emite token normal mas com claim mcp:true; UI de troca obrigatória → Onda 3
    const accessToken = await this.signAccess(user.id, user.login, mustChangePwd, perfis);
    const refreshToken = await this.issueRefresh(user.id, null, randomUUID());
    return { accessToken, refreshToken, mustChangePwd };
  }

  // ── SSO (bridge do Portal) ─────────────────────────────────────────────────
  // Login federado: o Portal (server-side, autenticado por segredo compartilhado)
  // afirma a identidade do usuário pelo e-mail. Sem senha — a autenticação já foi
  // feita pelo Portal. Emite os mesmos tokens que o login normal.
  async ssoLogin(email: string) {
    const user = await this.users.findByEmail(email);
    if (!user || !user.ativo) {
      throw new UnauthorizedException(
        'Usuário não habilitado no Investimentos',
      );
    }
    const perfis = await this.users.getPerfis(user.id);
    // mustChangePwd=false: usuário federado não usa senha local.
    const accessToken = await this.signAccess(user.id, user.login, false, perfis);
    const refreshToken = await this.issueRefresh(user.id, null, randomUUID());
    return { accessToken, refreshToken };
  }

  // ── Refresh ───────────────────────────────────────────────────────────────
  async refresh(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) {
      throw new UnauthorizedException('Token inválido');
    }

    // Reutilização detectada → revogar family inteira
    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Token reutilizado — sessão encerrada');
    }

    // Expirado
    if (stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Token expirado');
    }

    const user = await this.users.findById(stored.userId);
    if (!user || !user.ativo) {
      throw new UnauthorizedException('Usuário inativo');
    }

    // Rotação atômica: revoga anterior + emite novo
    const newRawToken = await this.issueRefresh(
      user.id,
      stored.id,
      stored.familyId,
    );

    // Revogar o token antigo (após emissão do novo para garantir atomicidade)
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const accessToken = await this.signAccess(
      user.id,
      user.login,
      false,
      await this.users.getPerfis(user.id),
    );
    return { accessToken, refreshToken: newRawToken };
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ── Validar access token (para guard) ────────────────────────────────────
  async verifyAccessToken(token: string): Promise<AccessPayload> {
    try {
      const { payload } = await jwtVerify(token, this.accessSecret, {
        algorithms: ['HS256'],
      });
      return payload as AccessPayload;
    } catch {
      throw new UnauthorizedException('Token de acesso inválido');
    }
  }

  // ── Hash de senha (uso externo: criação de usuário) ───────────────────────
  async hashPassword(senha: string): Promise<string> {
    this.validatePasswordPolicy(senha);
    return hash(senha, ARGON2_OPTIONS);
  }

  // ── Política de senha ─────────────────────────────────────────────────────
  validatePasswordPolicy(senha: string): void {
    const PASSWORD_REGEX =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{12,}$/;
    if (!PASSWORD_REGEX.test(senha)) {
      throw new BadRequestException(
        'Senha deve ter no mínimo 12 caracteres com maiúscula, minúscula, número e símbolo',
      );
    }
  }

  // ── Privados ──────────────────────────────────────────────────────────────
  private async signAccess(
    userId: string,
    login: string,
    mustChangePwd: boolean = false,
    perfis: string[] = [],
  ): Promise<string> {
    const now = new Date();
    const payload: AccessPayload = { sub: userId, login };
    if (mustChangePwd) payload.mcp = true;
    if (perfis.length > 0) payload.perfis = perfis;
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(new Date(now.getTime() + this.accessTtlMs))
      .sign(this.accessSecret);
  }

  private async issueRefresh(
    userId: string,
    parentId: string | null,
    familyId: string,
  ): Promise<string> {
    const rawToken = randomUUID() + '.' + randomUUID(); // 72+ chars aleatórios
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        familyId,
        parentId,
        expiresAt,
      },
    });

    return rawToken;
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private parseTtl(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) throw new Error(`TTL inválido: ${ttl}`);
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return value * multipliers[unit];
  }
}
