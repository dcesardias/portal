import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { PerfilNome } from '../constants/perfis';

interface AuthenticatedRequest extends Request {
  user?: { sub: string; login: string; perfis?: string[] };
}

/**
 * Deve ser usado APÓS JwtAuthGuard (depende de request.user já populado).
 * Rotas sem @Roles(...) são liberadas para qualquer usuário autenticado —
 * o guard só restringe quando há metadata explícita.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PerfilNome[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const perfis = request.user?.perfis ?? [];
    const autorizado = required.some((r) => perfis.includes(r));
    if (!autorizado) {
      throw new ForbiddenException('Usuário não tem perfil necessário para esta ação');
    }
    return true;
  }
}
