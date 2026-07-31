/**
 * ETL de migração — legado sc_orcamento → schema novo.
 *
 * IMPORTANTE: este script NÃO conecta a produção AACD (proibido).
 * O time de dados deve exportar `tb_investimento_unificado`,
 * `tb_investimentos_recebimentos`, `tb_investimento_naoprevisto` e
 * `tb_aprovadores` para CSV/JSON em ambiente isolado e apontar
 * `LEGACY_DUMP_DIR` para essa pasta local.
 *
 * Regras da carga (§9 do PLANO_MODERNIZACAO):
 * 1. tb_investimento_unificado → Solicitacao + SolicitacaoItem
 * 2. NM_APROVADOR_* / DT_APROV_* → Aprovacao (histórica) atada ao fluxo
 *    "3 Níveis" quando N1/N2/Final; "GPE Direto" quando só NM_APROVADOR_FINAL.
 * 3. tb_aprovadores → RegraAlcada (dedup: manter apenas nível FOCAL/SUP/FINAL,
 *    descartar camadas "admin"/"gestor").
 * 4. Descartar DS_CLASSE, DS_TIPO_INVESTIMENTO, STATUS (colunas mortas).
 * 5. Senhas NÃO são migradas — usuários entram por reset de senha.
 * 6. Recebimentos: casar via coalesce(ID_TAB_REC_ANTIGA, ID_INVESTIMENTO).
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();
const DUMP_DIR = process.env.LEGACY_DUMP_DIR;

if (!DUMP_DIR) {
  console.error('LEGACY_DUMP_DIR não definido — abortando.');
  process.exit(1);
}

interface LegacyInvestimento {
  ID_INVESTIMENTO: number;
  DS_SOLICITANTE: string;
  DS_ESTABELECIMENTO: string;
  DS_UNIDADE_NEGOCIO: string;
  CD_CENTRO_CUSTO: string;
  DS_GRUPO: string;
  NM_ITEM: string;
  DS_ITEM: string;
  DS_ESPECIFICACAO: string;
  DS_MOTIVO: string;
  DS_JUSTIFICATIVA: string;
  DS_PROJETO: string | null;
  QT_ITEM: number;
  VL_UNITARIO: number;
  VL_TOTAL: number;
  DT_SOLICITACAO: string;
  DT_RECURSO: string | null;
  CD_APROVACAO: number;
  NM_APROVADOR_SUP: string | null;
  DT_APROV_SUP: string | null;
  NM_APROVADOR_FINAL: string | null;
  DT_APROV_FINAL: string | null;
  DS_TIPO_VERBA: string | null;
  ID_TABELA_ANTIGA: number | null;
  IE_DEMOLICOES: number;
  IE_PISO: number;
  IE_FORRO: number;
  IE_AR_CONDICIONADO: number;
  IE_MARCENARIA: number;
  IE_CAIXILHOS: number;
}

const STATUS_LEGADO_MAP: Record<number, string> = {
  1: 'RASCUNHO',
  2: 'EM_APROVACAO',
  3: 'APROVADO',
  4: 'REPROVADO',
  5: 'RECEBIDO',
  9: 'CANCELADO', // "não previsto" no legado
};

function mapStatus(cd: number): string {
  return STATUS_LEGADO_MAP[cd] ?? 'CANCELADO';
}

async function loadInvestimentos(): Promise<LegacyInvestimento[]> {
  const raw = readFileSync(join(DUMP_DIR!, 'tb_investimento_unificado.json'), 'utf-8');
  return JSON.parse(raw);
}

async function migrarSolicitacoes() {
  const invs = await loadInvestimentos();
  console.log(`Migrando ${invs.length} solicitações do legado…`);

  // Agrupa por (DS_SOLICITANTE + DT_SOLICITACAO + CD_CENTRO_CUSTO) — proxy do "pedido"
  // já que o legado é flat (1 linha = 1 item).
  const grupos = new Map<string, LegacyInvestimento[]>();
  for (const inv of invs) {
    const key = `${inv.DS_SOLICITANTE}|${inv.DT_SOLICITACAO}|${inv.CD_CENTRO_CUSTO}`;
    const arr = grupos.get(key) ?? [];
    arr.push(inv);
    grupos.set(key, arr);
  }

  let criadas = 0;
  for (const [, itens] of grupos) {
    const head = itens[0];
    const solicitante = await prisma.user.findUnique({
      where: { login: head.DS_SOLICITANTE },
    });
    if (!solicitante) {
      console.warn(`Usuário ${head.DS_SOLICITANTE} não existe — pulando pedido`);
      continue;
    }
    await prisma.solicitacao.create({
      data: {
        solicitanteId: solicitante.id,
        estabelecimentoId: parseInt(head.DS_ESTABELECIMENTO, 10),
        unidadeNegocioId: parseInt(head.DS_UNIDADE_NEGOCIO, 10),
        centroCustoCodigo: head.CD_CENTRO_CUSTO,
        dtSolicitacao: new Date(head.DT_SOLICITACAO),
        dtRecurso: head.DT_RECURSO ? new Date(head.DT_RECURSO) : null,
        tipoVerba: head.DS_TIPO_VERBA === 'Verba Pública' ? 'VP' : 'RP',
        projeto: head.DS_PROJETO,
        status: mapStatus(head.CD_APROVACAO),
        itens: {
          create: itens.map((it) => ({
            grupoId: parseInt(it.DS_GRUPO, 10),
            descricao: it.DS_ITEM,
            especificacao: it.DS_ESPECIFICACAO,
            motivoId: parseInt(it.DS_MOTIVO, 10) || 1,
            justificativa: it.DS_JUSTIFICATIVA,
            quantidade: it.QT_ITEM,
            valorUnitario: it.VL_UNITARIO,
            valorTotal: it.VL_TOTAL,
            ieDemolicoes: Boolean(it.IE_DEMOLICOES),
            iePiso: Boolean(it.IE_PISO),
            ieForro: Boolean(it.IE_FORRO),
            ieArCondicionado: Boolean(it.IE_AR_CONDICIONADO),
            ieMarcenaria: Boolean(it.IE_MARCENARIA),
            ieCaixilhos: Boolean(it.IE_CAIXILHOS),
          })),
        },
      },
    });
    criadas++;
  }
  console.log(`✓ ${criadas} solicitações migradas`);
}

async function main() {
  console.log(`Iniciando ETL a partir de ${DUMP_DIR}`);
  await migrarSolicitacoes();
  console.log('ETL concluída.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
