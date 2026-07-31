import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ItemCatalogoCreate,
  ItemCatalogoUpdate,
} from '@investimentos/shared';

export interface ListItensParams {
  q?: string;
  grupoIds?: number[];
  tipos?: string[];
  ativo?: boolean;
  page: number;
  pageSize: number;
}

// Campos de texto opcionais: "" vindo do form vira null no banco.
const TEXT_FIELDS = [
  'agrupamento',
  'classificacao',
  'definicao',
  'especificacao',
  'idRenem',
  'dsRenem',
  'tipoVerba',
  'movimentoContabil',
] as const;

type ItemComGrupo = Prisma.ItemCatalogoGetPayload<{
  include: { grupo: { select: { id: true; nome: true } } };
}>;

@Injectable()
export class AdminItensService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly incGrupo = { grupo: { select: { id: true, nome: true } } };

  private toDto(r: ItemComGrupo) {
    const { grupo, ...rest } = r;
    return {
      ...rest,
      valorReferencia:
        rest.valorReferencia == null ? null : Number(rest.valorReferencia),
      valorMin: rest.valorMin == null ? null : Number(rest.valorMin),
      valorMax: rest.valorMax == null ? null : Number(rest.valorMax),
      grupoNome: grupo?.nome ?? null,
    };
  }

  // Normaliza strings vazias -> null (Prisma grava NULL em vez de "").
  private norm<T extends Record<string, unknown>>(dto: T): T {
    const out: Record<string, unknown> = { ...dto };
    for (const k of TEXT_FIELDS) {
      if (out[k] === '') out[k] = null;
    }
    // Vínculo Tasy: código vazio -> null; sem código, zera também a descrição.
    if ('cdMaterialTasy' in out) {
      if (out.cdMaterialTasy === '') out.cdMaterialTasy = null;
      if (out.cdMaterialTasy == null) out.dsMaterialTasy = null;
    }
    if (out.dsMaterialTasy === '') out.dsMaterialTasy = null;
    // Conta contábil: código vazio -> null; sem código, zera também a descrição.
    if ('cdContaContabil' in out) {
      if (out.cdContaContabil === '') out.cdContaContabil = null;
      if (out.cdContaContabil == null) out.dsContaContabil = null;
    }
    if (out.dsContaContabil === '') out.dsContaContabil = null;
    return out as T;
  }

  // Busca materiais na view dbo.vw_materiais_tasy (Tasy). Mínimo 2 caracteres.
  async searchMateriais(q: string, limit = 30) {
    const term = (q ?? '').trim();
    if (term.length < 2) return [];
    const esc = term.replace(/[%_[]/g, (m) => `[${m}]`);
    const contem = `%${esc}%`;
    const prefixo = `${esc}%`;
    // COLLATE Latin1_General_CI_AI -> busca por descrição ignora acento e caixa
    // (a coluna é acento-sensível). Ordena: código exato > prefixo de código > nome.
    const rows = await this.prisma.$queryRaw<
      { cdMaterial: string; dsMaterial: string; dsClasse: string | null }[]
    >`
      SELECT TOP (${limit})
        CAST(cd_material_tasy AS varchar(40)) AS cdMaterial,
        ds_material_tasy        AS dsMaterial,
        ds_classe_material_tasy AS dsClasse
      FROM dbo.vw_materiais_tasy
      WHERE ds_material_tasy COLLATE Latin1_General_CI_AI LIKE ${contem}
         OR CAST(cd_material_tasy AS varchar(40)) LIKE ${prefixo}
      ORDER BY
        CASE WHEN CAST(cd_material_tasy AS varchar(40)) = ${term} THEN 0
             WHEN CAST(cd_material_tasy AS varchar(40)) LIKE ${prefixo} THEN 1
             ELSE 2 END,
        ds_material_tasy`;
    return rows;
  }

  // Busca contas contábeis na view dbo.VW_CONTA_CONTABIL_PESSOAL. Mínimo 2 caracteres.
  async searchContas(q: string, limit = 30) {
    const term = (q ?? '').trim();
    if (term.length < 2) return [];
    const esc = term.replace(/[%_[]/g, (m) => `[${m}]`);
    const contem = `%${esc}%`;
    const prefixo = `${esc}%`;
    // COLLATE Latin1_General_CI_AI -> busca ignora acento/caixa. Ordena: código
    // exato > prefixo de código > descrição.
    const rows = await this.prisma.$queryRaw<
      { cdContaContabil: string; dsContaContabil: string }[]
    >`
      SELECT TOP (${limit})
        CAST(CD_CONTA_CONTABIL AS varchar(20)) AS cdContaContabil,
        DS_CONTA_CONTABIL                       AS dsContaContabil
      FROM dbo.VW_CONTA_CONTABIL_PESSOAL
      WHERE DS_CONTA_CONTABIL COLLATE Latin1_General_CI_AI LIKE ${contem}
         OR CAST(CD_CONTA_CONTABIL AS varchar(20)) LIKE ${prefixo}
      ORDER BY
        CASE WHEN CAST(CD_CONTA_CONTABIL AS varchar(20)) = ${term} THEN 0
             WHEN CAST(CD_CONTA_CONTABIL AS varchar(20)) LIKE ${prefixo} THEN 1
             ELSE 2 END,
        CD_CONTA_CONTABIL`;
    return rows;
  }

  // Filtros compartilhados por list (paginado) e exportAll (base completa).
  private buildWhere(p: {
    q?: string;
    grupoIds?: number[];
    tipos?: string[];
    ativo?: boolean;
  }): Prisma.ItemCatalogoWhereInput {
    return {
      ...(p.tipos?.length ? { tipo: { in: p.tipos } } : {}),
      ...(p.grupoIds?.length ? { grupoId: { in: p.grupoIds } } : {}),
      ...(p.ativo != null ? { ativo: p.ativo } : {}),
      ...(p.q
        ? {
            OR: [
              { nome: { contains: p.q } },
              { agrupamento: { contains: p.q } },
              { idRenem: { contains: p.q } },
              { dsRenem: { contains: p.q } },
            ],
          }
        : {}),
    };
  }

  // Exportação: TODOS os itens que casam com os filtros (sem paginação), com
  // todas as colunas do catálogo. Usado pelo botão "Exportar Excel".
  async exportAll(p: { q?: string; grupoIds?: number[]; tipos?: string[]; ativo?: boolean }) {
    const rows = await this.prisma.itemCatalogo.findMany({
      where: this.buildWhere(p),
      orderBy: { nome: 'asc' },
      include: this.incGrupo,
    });
    return rows.map((r) => this.toDto(r));
  }

  async list(p: ListItensParams) {
    const where = this.buildWhere(p);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.itemCatalogo.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
        include: this.incGrupo,
      }),
      this.prisma.itemCatalogo.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.toDto(r)),
      total,
      page: p.page,
      pageSize: p.pageSize,
    };
  }

  async create(dto: ItemCatalogoCreate) {
    await this.ensureGrupo(dto.grupoId);
    const data = this.norm(dto) as Prisma.ItemCatalogoUncheckedCreateInput;
    const r = await this.prisma.itemCatalogo.create({
      data,
      include: this.incGrupo,
    });
    return this.toDto(r);
  }

  async update(id: number, dto: ItemCatalogoUpdate) {
    await this.ensureExists(id);
    if (dto.grupoId != null) await this.ensureGrupo(dto.grupoId);
    const data = this.norm(dto) as Prisma.ItemCatalogoUncheckedUpdateInput;
    const r = await this.prisma.itemCatalogo.update({
      where: { id },
      data,
      include: this.incGrupo,
    });
    return this.toDto(r);
  }

  async setAtivo(id: number, ativo: boolean) {
    await this.ensureExists(id);
    const r = await this.prisma.itemCatalogo.update({
      where: { id },
      data: { ativo },
      include: this.incGrupo,
    });
    return this.toDto(r);
  }

  async remove(id: number) {
    await this.ensureExists(id);
    // FK onDelete: NoAction — não dá pra excluir item usado em solicitação.
    const refs = await this.prisma.solicitacaoItem.count({
      where: { itemCatalogoId: id },
    });
    if (refs > 0) {
      throw new ConflictException(
        `Este item está em uso em ${refs} solicitação(ões) e não pode ser excluído. Desative-o.`,
      );
    }
    await this.prisma.itemCatalogo.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureExists(id: number) {
    const found = await this.prisma.itemCatalogo.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Item não encontrado');
  }

  private async ensureGrupo(grupoId: number) {
    const g = await this.prisma.grupoInvestimento.findUnique({
      where: { id: grupoId },
    });
    if (!g) throw new NotFoundException('Grupo de investimento inválido');
  }
}
