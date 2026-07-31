import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FluxoResolver } from '../fluxo/fluxo.resolver';
import type {
  RegraFluxoCreate,
  RegraFluxoUpdate,
  SimularFluxo,
  FluxoCreate,
  FluxoUpdate,
  EtapaFluxoInput,
} from '@investimentos/shared';

@Injectable()
export class AdminFluxosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: FluxoResolver,
  ) {}

  async listFluxos() {
    return this.prisma.fluxo.findMany({
      orderBy: { nome: 'asc' },
      include: { etapas: { orderBy: { ordem: 'asc' } } },
    });
  }

  // ── CRUD do FLUXO em si (montador de etapas) ───────────────────────────────
  async createFluxo(dto: FluxoCreate) {
    const existe = await this.prisma.fluxo.findUnique({ where: { nome: dto.nome } });
    if (existe) throw new ConflictException(`Já existe um fluxo chamado "${dto.nome}"`);

    return this.prisma.fluxo.create({
      data: {
        nome: dto.nome,
        descricao: dto.descricao ?? null,
        ativo: dto.ativo ?? true,
        etapas: { create: this.etapasToData(dto.etapas) },
      },
      include: { etapas: { orderBy: { ordem: 'asc' } } },
    });
  }

  async updateFluxo(id: string, dto: FluxoUpdate) {
    const fluxo = await this.prisma.fluxo.findUnique({
      where: { id },
      include: { etapas: { select: { id: true } } },
    });
    if (!fluxo) throw new NotFoundException('Fluxo não encontrado');

    if (dto.nome && dto.nome !== fluxo.nome) {
      const outro = await this.prisma.fluxo.findUnique({ where: { nome: dto.nome } });
      if (outro) throw new ConflictException(`Já existe um fluxo chamado "${dto.nome}"`);
    }

    // Se vieram etapas, substitui todas — mas só se o fluxo não tiver aprovações
    // registradas (senão quebraria o histórico de quem já aprovou).
    if (dto.etapas) {
      const etapaIds = fluxo.etapas.map((e) => e.id);
      const usadas = etapaIds.length
        ? await this.prisma.aprovacao.count({ where: { etapaId: { in: etapaIds } } })
        : 0;
      if (usadas > 0) {
        throw new ConflictException(
          'Este fluxo já tem aprovações registradas — não é possível reescrever suas etapas. Crie um novo fluxo.',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.fluxo.update({
        where: { id },
        data: {
          ...(dto.nome !== undefined ? { nome: dto.nome } : {}),
          ...(dto.descricao !== undefined ? { descricao: dto.descricao } : {}),
          ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
        },
      });
      if (dto.etapas) {
        await tx.etapaFluxo.deleteMany({ where: { fluxoId: id } });
        await tx.etapaFluxo.createMany({
          data: this.etapasToData(dto.etapas).map((e) => ({ ...e, fluxoId: id })),
        });
      }
      return tx.fluxo.findUnique({
        where: { id },
        include: { etapas: { orderBy: { ordem: 'asc' } } },
      });
    });
  }

  async removeFluxo(id: string) {
    const fluxo = await this.prisma.fluxo.findUnique({
      where: { id },
      include: { etapas: { select: { id: true } }, regras: { select: { id: true } } },
    });
    if (!fluxo) throw new NotFoundException('Fluxo não encontrado');
    if (fluxo.regras.length > 0) {
      throw new ConflictException(
        `Fluxo em uso por ${fluxo.regras.length} regra(s) de seleção — remova as regras antes.`,
      );
    }
    const etapaIds = fluxo.etapas.map((e) => e.id);
    const usadas = etapaIds.length
      ? await this.prisma.aprovacao.count({ where: { etapaId: { in: etapaIds } } })
      : 0;
    if (usadas > 0) {
      throw new ConflictException('Fluxo com aprovações registradas — não pode ser removido.');
    }
    await this.prisma.$transaction([
      this.prisma.etapaFluxo.deleteMany({ where: { fluxoId: id } }),
      this.prisma.fluxo.delete({ where: { id } }),
    ]);
  }

  private etapasToData(etapas: EtapaFluxoInput[]) {
    return etapas.map((e, i) => ({
      ordem: i + 1,
      nome: e.nome,
      fonteAprovador: e.fonteAprovador,
      perfilAlvo: e.fonteAprovador === 'PERFIL' ? (e.perfilAlvo ?? null) : null,
      usuarioAlvoId: e.fonteAprovador === 'USUARIO' ? (e.usuarioAlvoId ?? null) : null,
      obrigatoria: e.obrigatoria ?? true,
      permiteRevisao: e.permiteRevisao ?? true,
      aprovacaoParalela: e.aprovacaoParalela ?? false,
    }));
  }

  async list() {
    const regras = await this.prisma.regraFluxo.findMany({
      orderBy: { prioridade: 'desc' },
      include: {
        fluxo: { include: { etapas: { orderBy: { ordem: 'asc' } } } },
        estabelecimento: true,
        grupo: true,
      },
    });
    return regras.map((r) => this.toDto(r));
  }

  async create(dto: RegraFluxoCreate) {
    await this.ensureFluxoExists(dto.fluxoId);
    const regra = await this.prisma.regraFluxo.create({
      data: {
        fluxoId: dto.fluxoId,
        prioridade: dto.prioridade,
        estabelecimentoId: dto.estabelecimentoId ?? null,
        grupoId: dto.grupoId ?? null,
        tipoVerba: dto.tipoVerba ?? null,
        vlMin: dto.vlMin ?? null,
        vlMax: dto.vlMax ?? null,
        isDefault: dto.isDefault ?? false,
      },
      include: {
        fluxo: { include: { etapas: { orderBy: { ordem: 'asc' } } } },
        estabelecimento: true,
        grupo: true,
      },
    });
    return this.toDto(regra);
  }

  async update(id: string, dto: RegraFluxoUpdate) {
    await this.ensureExists(id);
    if (dto.fluxoId) await this.ensureFluxoExists(dto.fluxoId);
    const regra = await this.prisma.regraFluxo.update({
      where: { id },
      data: {
        ...(dto.fluxoId !== undefined ? { fluxoId: dto.fluxoId } : {}),
        ...(dto.prioridade !== undefined ? { prioridade: dto.prioridade } : {}),
        ...(dto.estabelecimentoId !== undefined
          ? { estabelecimentoId: dto.estabelecimentoId }
          : {}),
        ...(dto.grupoId !== undefined ? { grupoId: dto.grupoId } : {}),
        ...(dto.tipoVerba !== undefined ? { tipoVerba: dto.tipoVerba } : {}),
        ...(dto.vlMin !== undefined ? { vlMin: dto.vlMin } : {}),
        ...(dto.vlMax !== undefined ? { vlMax: dto.vlMax } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      },
      include: {
        fluxo: { include: { etapas: { orderBy: { ordem: 'asc' } } } },
        estabelecimento: true,
        grupo: true,
      },
    });
    return this.toDto(regra);
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.regraFluxo.delete({ where: { id } });
  }

  async simular(ctx: SimularFluxo) {
    const { regra, alternativas } = await this.resolver.resolveComAlternativas(ctx);
    if (!regra) {
      throw new BadRequestException(
        'Nenhuma regra de fluxo (nem default) casa com esse contexto — cadastre ao menos uma regra com "isDefault".',
      );
    }
    return {
      regra: this.toDto(regra as never),
      alternativas: alternativas.map((a) => this.toDto(a as never)),
    };
  }

  private async ensureExists(id: string) {
    const row = await this.prisma.regraFluxo.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Regra de fluxo não encontrada');
    return row;
  }

  private async ensureFluxoExists(fluxoId: string) {
    const fluxo = await this.prisma.fluxo.findUnique({ where: { id: fluxoId } });
    if (!fluxo) throw new ConflictException('Fluxo informado não existe');
    return fluxo;
  }

  private toDto(r: {
    id: string;
    prioridade: number;
    estabelecimentoId: number | null;
    grupoId: number | null;
    tipoVerba: string | null;
    vlMin: unknown;
    vlMax: unknown;
    isDefault: boolean;
    fluxoId: string;
    fluxo: {
      id: string;
      nome: string;
      descricao: string | null;
      ativo: boolean;
      etapas: {
        id: string;
        ordem: number;
        nome: string;
        fonteAprovador: string;
        perfilAlvo: string | null;
        usuarioAlvoId: string | null;
        obrigatoria: boolean;
        permiteRevisao: boolean;
        aprovacaoParalela: boolean;
      }[];
    };
    estabelecimento?: { nome: string } | null;
    grupo?: { nome: string } | null;
  }) {
    return {
      id: r.id,
      prioridade: r.prioridade,
      estabelecimentoId: r.estabelecimentoId,
      estabelecimentoNome: r.estabelecimento?.nome ?? null,
      grupoId: r.grupoId,
      grupoNome: r.grupo?.nome ?? null,
      tipoVerba: r.tipoVerba,
      valorMin: r.vlMin != null ? Number(r.vlMin) : null,
      valorMax: r.vlMax != null ? Number(r.vlMax) : null,
      isDefault: r.isDefault,
      fluxoId: r.fluxoId,
      nome: r.fluxo.nome,
      etapas: r.fluxo.etapas,
    };
  }
}
