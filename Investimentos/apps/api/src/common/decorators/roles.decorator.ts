import { SetMetadata } from '@nestjs/common';
import type { PerfilNome } from '../constants/perfis';

export const ROLES_KEY = 'roles';

/**
 * Marca uma rota (ou controller inteiro) como restrita a um ou mais perfis.
 * O usuário precisa ter AO MENOS UM dos perfis listados (OR, não AND).
 * Deve ser usado junto com RolesGuard, aplicado depois de JwtAuthGuard.
 */
export const Roles = (...roles: PerfilNome[]) => SetMetadata(ROLES_KEY, roles);
