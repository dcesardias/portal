import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RestricaoSolicitanteCreate } from '@investimentos/shared';

@Injectable()
export class AdminRestricoesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId?: string) {
    const rows = await this.prisma.restricaoSolicitante.findMany({
      where: userId ? { userId } : {},
      include: { user: { select: { login: true, nome: true } } },
      orderBy: { criadoEm: 'desc' },
    });

    // Enriquece com a descrição do centro de custo (quando existir).
    const codigos = [...new Set(rows.map((r) => r.centroCustoCodigo).filter(Boolean))] as string[];
    const centros = codigos.length
      ? await this.prisma.centroCusto.findMany({
          where: { codigo: { in: codigos } },
          select: { codigo: true, descricao: true },
        })
      : [];
    const ccDesc = new Map(centros.map((c) => [c.codigo, c.descricao]));

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      usuarioLogin: r.user.login,
      usuarioNome: r.user.nome,
      centroCustoCodigo: r.centroCustoCodigo,
      centroCustoDescricao: r.centroCustoCodigo ? (ccDesc.get(r.centroCustoCodigo) ?? null) : null,
      contaContabil: r.contaContabil,
      criadoEm: r.criadoEm,
    }));
  }

  async create(dto: RestricaoSolicitanteCreate) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const centroCustoCodigo = dto.centroCustoCodigo?.trim() || null;
    const contaContabil = dto.contaContabil?.trim() || null;
    if (!centroCustoCodigo && !contaContabil) {
      throw new BadRequestException('Informe centro de custo e/ou conta contábil.');
    }

    // Evita duplicata exata (mesmo user + CC + conta).
    const dup = await this.prisma.restricaoSolicitante.findFirst({
      where: { userId: dto.userId, centroCustoCodigo, contaContabil },
    });
    if (dup) return this.getOne(dup.id);

    const created = await this.prisma.restricaoSolicitante.create({
      data: { userId: dto.userId, centroCustoCodigo, contaContabil },
    });
    return this.getOne(created.id);
  }

  async remove(id: string) {
    const row = await this.prisma.restricaoSolicitante.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Restrição não encontrada');
    await this.prisma.restricaoSolicitante.delete({ where: { id } });
  }

  private async getOne(id: string) {
    const all = await this.list();
    return all.find((r) => r.id === id)!;
  }
}
