import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  RegraAlcadaCreate,
  RegraAlcadaBulkCreate,
  RegraAlcadaBulkMatrix,
  RegraAlcadaUpdate,
  SubstituirUsuarioAlcada,
} from '@investimentos/shared';

@Injectable()
export class AdminAlcadasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: { estabelecimentoId?: number; nivel?: string }) {
    const rows = await this.prisma.regraAlcada.findMany({
      where: {
        ...(filter.estabelecimentoId ? { estabelecimentoId: filter.estabelecimentoId } : {}),
        ...(filter.nivel ? { nivel: filter.nivel } : {}),
      },
      include: { estabelecimento: true, grupo: true },
      orderBy: [{ estabelecimentoId: 'asc' }, { grupoId: 'asc' }, { nivel: 'asc' }],
    });

    const logins = [...new Set(rows.map((r) => r.usuarioLogin))];
    const usuarios = logins.length
      ? await this.prisma.user.findMany({ where: { login: { in: logins } } })
      : [];
    const usuarioPorLogin = new Map(usuarios.map((u) => [u.login, u]));

    return rows.map((r) => ({
      id: r.id,
      estabelecimentoId: r.estabelecimentoId,
      estabelecimentoNome: r.estabelecimento.nome,
      grupoId: r.grupoId,
      grupoNome: r.grupo.nome,
      nivel: r.nivel,
      usuarioLogin: r.usuarioLogin,
      usuarioNome: usuarioPorLogin.get(r.usuarioLogin)?.nome ?? null,
      usuarioAtivo: usuarioPorLogin.get(r.usuarioLogin)?.ativo ?? null,
    }));
  }

  async create(dto: RegraAlcadaCreate) {
    try {
      return await this.prisma.regraAlcada.create({ data: dto });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async createBulk(dto: RegraAlcadaBulkCreate) {
    // SQL Server não suporta `skipDuplicates` no createMany — filtra manualmente
    // as combinações já existentes antes de inserir.
    const existentes = await this.prisma.regraAlcada.findMany({
      where: {
        estabelecimentoId: dto.estabelecimentoId,
        nivel: dto.nivel,
        usuarioLogin: dto.usuarioLogin,
        grupoId: { in: dto.grupoIds },
      },
      select: { grupoId: true },
    });
    const jaExistentes = new Set(existentes.map((e) => e.grupoId));
    const novos = dto.grupoIds.filter((g) => !jaExistentes.has(g));

    if (novos.length > 0) {
      await this.prisma.regraAlcada.createMany({
        data: novos.map((grupoId) => ({
          estabelecimentoId: dto.estabelecimentoId,
          grupoId,
          nivel: dto.nivel,
          usuarioLogin: dto.usuarioLogin,
        })),
      });
    }

    return { criadas: novos.length, solicitadas: dto.grupoIds.length };
  }

  /** Cria em lote para várias combinações estabelecimento x grupo de uma vez
   * (cross product), mesma lógica de dedupe do createBulk, mas sem restringir
   * a um único estabelecimento — cobre o caso "esse aprovador cuida desses
   * grupos em várias unidades ao mesmo tempo". */
  async createBulkMatrix(dto: RegraAlcadaBulkMatrix) {
    const existentes = await this.prisma.regraAlcada.findMany({
      where: {
        estabelecimentoId: { in: dto.estabelecimentoIds },
        nivel: dto.nivel,
        usuarioLogin: dto.usuarioLogin,
        grupoId: { in: dto.grupoIds },
      },
      select: { estabelecimentoId: true, grupoId: true },
    });
    const jaExistentes = new Set(existentes.map((e) => `${e.estabelecimentoId}|${e.grupoId}`));

    const novos: { estabelecimentoId: number; grupoId: number; nivel: string; usuarioLogin: string }[] =
      [];
    for (const estabelecimentoId of dto.estabelecimentoIds) {
      for (const grupoId of dto.grupoIds) {
        const key = `${estabelecimentoId}|${grupoId}`;
        if (!jaExistentes.has(key)) {
          novos.push({ estabelecimentoId, grupoId, nivel: dto.nivel, usuarioLogin: dto.usuarioLogin });
        }
      }
    }

    if (novos.length > 0) {
      await this.prisma.regraAlcada.createMany({ data: novos });
    }

    return {
      criadas: novos.length,
      solicitadas: dto.estabelecimentoIds.length * dto.grupoIds.length,
    };
  }

  /** Reatribui em massa todas as regras de alçada de um usuário (origem) para
   * outro (destino) — ex.: gestor substituído. Não sobrescreve silenciosamente:
   * combinações onde o destino já tem regra própria ficam como conflito e são
   * reportadas, não tocadas. */
  async substituirUsuario(dto: SubstituirUsuarioAlcada) {
    if (dto.origemLogin === dto.destinoLogin) {
      throw new BadRequestException('Usuário de origem e destino não podem ser o mesmo');
    }
    const [origem, destino] = await Promise.all([
      this.prisma.user.findUnique({ where: { login: dto.origemLogin } }),
      this.prisma.user.findUnique({ where: { login: dto.destinoLogin } }),
    ]);
    if (!origem) throw new NotFoundException(`Usuário de origem "${dto.origemLogin}" não encontrado`);
    if (!destino) throw new NotFoundException(`Usuário de destino "${dto.destinoLogin}" não encontrado`);

    const regrasOrigem = await this.prisma.regraAlcada.findMany({
      where: {
        usuarioLogin: dto.origemLogin,
        ...(dto.estabelecimentoId ? { estabelecimentoId: dto.estabelecimentoId } : {}),
      },
    });

    if (regrasOrigem.length === 0) {
      return { substituidas: 0, conflitos: [] as { estabelecimentoId: number; grupoId: number; nivel: string }[] };
    }

    const regrasDestino = await this.prisma.regraAlcada.findMany({
      where: { usuarioLogin: dto.destinoLogin },
      select: { estabelecimentoId: true, grupoId: true, nivel: true },
    });
    const chavesDestino = new Set(
      regrasDestino.map((r) => `${r.estabelecimentoId}|${r.grupoId}|${r.nivel}`),
    );

    const paraAtualizar: string[] = [];
    const conflitos: { estabelecimentoId: number; grupoId: number; nivel: string }[] = [];
    for (const r of regrasOrigem) {
      const chave = `${r.estabelecimentoId}|${r.grupoId}|${r.nivel}`;
      if (chavesDestino.has(chave)) {
        conflitos.push({ estabelecimentoId: r.estabelecimentoId, grupoId: r.grupoId, nivel: r.nivel });
      } else {
        paraAtualizar.push(r.id);
      }
    }

    if (paraAtualizar.length > 0) {
      await this.prisma.regraAlcada.updateMany({
        where: { id: { in: paraAtualizar } },
        data: { usuarioLogin: dto.destinoLogin },
      });
    }

    return { substituidas: paraAtualizar.length, conflitos };
  }

  async update(id: string, dto: RegraAlcadaUpdate) {
    await this.ensureExists(id);
    try {
      return await this.prisma.regraAlcada.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.regraAlcada.delete({ where: { id } });
  }

  private async ensureExists(id: string) {
    const row = await this.prisma.regraAlcada.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Regra de alçada não encontrada');
    return row;
  }

  private mapUniqueError(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException(
        'Já existe uma regra para essa combinação de estabelecimento, grupo, nível e usuário',
      );
    }
    return e;
  }
}
