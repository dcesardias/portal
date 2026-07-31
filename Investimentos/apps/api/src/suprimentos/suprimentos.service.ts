import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminItensService, type ListItensParams } from '../admin/admin-itens.service';
import type { SuprimentosPreco } from '@investimentos/shared';

export interface ListSolicitacaoItensParams {
  q?: string;
  estabelecimentoIds?: number[];
  grupoIds?: number[];
  itemCatalogoId?: number;
  status?: string[];
  page: number;
  pageSize: number;
}

@Injectable()
export class SuprimentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly itens: AdminItensService,
  ) {}

  // ── Preços do catálogo ─────────────────────────────────────────────────────
  // Listagem reaproveita a do admin (mesma paginação/busca).
  listItens(p: ListItensParams) {
    return this.itens.list(p);
  }

  /**
   * Atualiza SOMENTE os três campos de preço do item. Campos não enviados
   * mantêm o valor atual. Valida min <= max considerando os valores já gravados
   * (o refine do Zod só cobre quando ambos vêm no mesmo payload).
   */
  async updatePrecos(id: number, dto: SuprimentosPreco) {
    const found = await this.prisma.itemCatalogo.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Item não encontrado');

    const data: Prisma.ItemCatalogoUncheckedUpdateInput = {};
    if (dto.valorReferencia !== undefined) data.valorReferencia = dto.valorReferencia;
    if (dto.valorMin !== undefined) data.valorMin = dto.valorMin;
    if (dto.valorMax !== undefined) data.valorMax = dto.valorMax;

    const efetivoMin =
      dto.valorMin !== undefined
        ? dto.valorMin
        : found.valorMin == null
          ? null
          : Number(found.valorMin);
    const efetivoMax =
      dto.valorMax !== undefined
        ? dto.valorMax
        : found.valorMax == null
          ? null
          : Number(found.valorMax);
    if (efetivoMin != null && efetivoMax != null && efetivoMin > efetivoMax) {
      throw new BadRequestException(
        'Valor mínimo não pode ser maior que o valor máximo.',
      );
    }

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

  // ── Valor informado nas solicitações ───────────────────────────────────────
  async listSolicitacaoItens(p: ListSolicitacaoItensParams) {
    const temSolFiltro = !!(p.estabelecimentoIds?.length || p.status?.length);
    const where: Prisma.SolicitacaoItemWhereInput = {
      ...(p.grupoIds?.length ? { grupoId: { in: p.grupoIds } } : {}),
      ...(p.itemCatalogoId ? { itemCatalogoId: p.itemCatalogoId } : {}),
      ...(temSolFiltro
        ? {
            solicitacao: {
              ...(p.estabelecimentoIds?.length
                ? { estabelecimentoId: { in: p.estabelecimentoIds } }
                : {}),
              ...(p.status?.length ? { status: { in: p.status } } : {}),
            },
          }
        : {}),
      ...(p.q
        ? {
            OR: [
              { descricao: { contains: p.q } },
              { itemCatalogo: { nome: { contains: p.q } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.solicitacaoItem.findMany({
        where,
        orderBy: [{ solicitacao: { numero: 'desc' } }, { descricao: 'asc' }],
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
        include: {
          solicitacao: {
            select: {
              id: true,
              numero: true,
              status: true,
              estabelecimento: { select: { id: true, nome: true } },
              solicitante: { select: { nome: true } },
            },
          },
          grupo: { select: { id: true, nome: true } },
          itemCatalogo: {
            select: { id: true, nome: true, valorMin: true, valorMax: true, valorReferencia: true },
          },
          suprimentosPor: { select: { nome: true } },
        },
      }),
      this.prisma.solicitacaoItem.count({ where }),
    ]);

    const num = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));
    return {
      items: rows.map((r) => ({
        id: r.id,
        solicitacaoId: r.solicitacao.id,
        numero: r.solicitacao.numero,
        status: r.solicitacao.status,
        estabelecimentoNome: r.solicitacao.estabelecimento?.nome ?? null,
        solicitanteNome: r.solicitacao.solicitante?.nome ?? null,
        grupoNome: r.grupo?.nome ?? null,
        descricao: r.descricao,
        itemCatalogoId: r.itemCatalogoId,
        itemNome: r.itemCatalogo?.nome ?? null,
        quantidade: r.quantidade,
        valorUnitario: Number(r.valorUnitario),
        valorSuprimentos: num(r.valorSuprimentos),
        itemValorMin: num(r.itemCatalogo?.valorMin ?? null),
        itemValorMax: num(r.itemCatalogo?.valorMax ?? null),
        itemValorReferencia: num(r.itemCatalogo?.valorReferencia ?? null),
        suprimentosPorNome: r.suprimentosPor?.nome ?? null,
        suprimentosEm: r.suprimentosEm,
      })),
      total,
      page: p.page,
      pageSize: p.pageSize,
    };
  }

  /**
   * Grava o valor de suprimentos sobre um item de solicitação, preservando o
   * valorUnitario original do solicitante. `null` limpa o ajuste (e o carimbo).
   */
  async setValorItem(id: string, valorSuprimentos: number | null, usuarioId: string) {
    const found = await this.prisma.solicitacaoItem.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Item de solicitação não encontrado');

    await this.prisma.solicitacaoItem.update({
      where: { id },
      data:
        valorSuprimentos == null
          ? { valorSuprimentos: null, suprimentosPorId: null, suprimentosEm: null }
          : {
              valorSuprimentos,
              suprimentosPorId: usuarioId,
              suprimentosEm: new Date(),
            },
    });
    return { ok: true };
  }
}
