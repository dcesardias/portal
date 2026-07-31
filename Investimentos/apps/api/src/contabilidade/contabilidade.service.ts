import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminItensService, type ListItensParams } from '../admin/admin-itens.service';
import type { ContabilidadeVinculo } from '@investimentos/shared';

@Injectable()
export class ContabilidadeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly itens: AdminItensService,
  ) {}

  // Listagem/busca reaproveita a do admin (mesma paginação/filtros).
  listItens(p: ListItensParams) {
    return this.itens.list(p);
  }

  searchMateriais(q: string) {
    return this.itens.searchMateriais(q);
  }

  searchContas(q: string) {
    return this.itens.searchContas(q);
  }

  /**
   * Atualiza SOMENTE os vínculos do item (material do Tasy e conta contábil).
   * Não toca em preços nem em nenhum outro atributo. Mantém a regra 1-para-1 do
   * material do Tasy; a conta contábil pode se repetir entre itens.
   */
  async updateVinculos(id: number, dto: ContabilidadeVinculo) {
    const found = await this.prisma.itemCatalogo.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Item não encontrado');

    // Normaliza: código vazio -> null; sem código, zera também a descrição.
    const cdTasy = dto.cdMaterialTasy?.trim() || null;
    const dsTasy = cdTasy ? dto.dsMaterialTasy?.trim() || null : null;
    const cdConta = dto.cdContaContabil?.trim() || null;
    const dsConta = cdConta ? dto.dsContaContabil?.trim() || null : null;

    const data: Prisma.ItemCatalogoUncheckedUpdateInput = {
      cdMaterialTasy: cdTasy,
      dsMaterialTasy: dsTasy,
      cdContaContabil: cdConta,
      dsContaContabil: dsConta,
    };

    const r = await this.prisma.itemCatalogo.update({
      where: { id },
      data,
      include: { grupo: { select: { id: true, nome: true } } },
    });
    const { grupo, ...rest } = r;
    return {
      ...rest,
      valorReferencia: rest.valorReferencia == null ? null : Number(rest.valorReferencia),
      valorMin: rest.valorMin == null ? null : Number(rest.valorMin),
      valorMax: rest.valorMax == null ? null : Number(rest.valorMax),
      grupoNome: grupo?.nome ?? null,
    };
  }
}
