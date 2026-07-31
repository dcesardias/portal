import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import type { Env } from '../env.validation';

const COOKIE_NAME = 'refresh_token';

@Controller('auth')
export class AuthController {
  private readonly refreshTtlSec: number;

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {
    // 7d em segundos
    this.refreshTtlSec = this.parseTtlToSeconds(
      this.config.get('JWT_REFRESH_EXPIRES_IN'),
    );
  }

  // POST /api/v1/auth/login — limitado a 5 tentativas / 60s por IP
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.login(
      dto.login,
      dto.senha,
    );

    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  // POST /api/v1/auth/sso — bridge de SSO com o Portal.
  // Só o Portal (server-side) chama, provando-se via header x-sso-secret.
  // O Portal já autenticou o usuário e afirma a identidade em x-portal-email.
  // Externamente inalcançável: o proxy do Portal bloqueia esta rota vinda do browser.
  @Post('sso')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async sso(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const configured: string | undefined = this.config.get('SSO_SHARED_SECRET');
    if (!configured) {
      throw new ServiceUnavailableException('SSO não configurado');
    }

    const provided = this.headerValue(req.headers['x-sso-secret']);
    if (!provided || !this.secretMatches(provided, configured)) {
      throw new UnauthorizedException('Credencial de SSO inválida');
    }

    const email = this.headerValue(req.headers['x-portal-email'])
      ?.toLowerCase()
      .trim();
    if (!email) {
      throw new BadRequestException('E-mail do Portal ausente');
    }

    const { accessToken, refreshToken } =
      await this.authService.ssoLogin(email);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  // POST /api/v1/auth/refresh
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken: string | undefined = req.cookies?.[COOKIE_NAME];
    if (!rawToken) {
      throw new UnauthorizedException('Refresh token ausente');
    }

    const { accessToken, refreshToken } =
      await this.authService.refresh(rawToken);

    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  // POST /api/v1/auth/logout
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken: string | undefined = req.cookies?.[COOKIE_NAME];
    if (rawToken) {
      await this.authService.logout(rawToken);
    }
    // clearCookie deve replicar as mesmas options do set, senão o browser não remove
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',   // strict quebrava refresh em nova aba
      maxAge: this.refreshTtlSec * 1_000,
      path: '/api/v1/auth',
    });
  }

  // Header pode chegar como string | string[] | undefined — normaliza p/ 1 valor.
  private headerValue(v: string | string[] | undefined): string | undefined {
    if (!v) return undefined;
    return Array.isArray(v) ? v[0] : v;
  }

  // Comparação em tempo constante (evita timing attack no segredo compartilhado).
  private secretMatches(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }

  private parseTtlToSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) throw new Error(`TTL inválido: ${ttl}`);
    const value = parseInt(match[1], 10);
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    return value * multipliers[match[2]];
  }
}
