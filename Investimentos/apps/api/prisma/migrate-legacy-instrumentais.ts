/**
 * Migração dos INSTRUMENTAIS CIRÚRGICOS do legado (dbo.tb_instrumentaiscirurgicos, grupo 7)
 * para investimentos.ItemCatalogo com tipo='INSTRUMENTAL'.
 *
 * Decisão (confirmada com o usuário): reaproveitar ItemCatalogo com discriminador `tipo`,
 * em vez de tabela separada. Instrumentais preservam id de origem em `legadoId`, recebem novo
 * id (autoincrement) para não colidir com os ids de tb_itens já migrados como ITEM.
 *
 * Idempotente: recusa rodar se algum ItemCatalogo INSTRUMENTAL já estiver referenciado por
 * uma SolicitacaoItem (evita quebrar dado transacional); caso contrário, apaga os INSTRUMENTAL
 * existentes e reinsere. NÃO toca em nenhuma linha ITEM nem no legado dbo (só lê).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type LegadoInstrumental = {
  id_instrumentalcirurgico: number;
  nome_instrumentalcirurgico: string | null;
  agrupamento_instrumentalcirurgico: string | null;
  id_grupoinvestimento: number | null;
  valor_instrumentalcirurgico: number | null;
  tipo_verba: string | null;
  classe: string | null;
  Ativo: string | null;
};

async function main() {
  console.log("→ Lendo dbo.tb_instrumentaiscirurgicos ...");
  const legado = await prisma.$queryRawUnsafe<LegadoInstrumental[]>(
    `SELECT
        CAST(id_instrumentalcirurgico AS INT)      AS id_instrumentalcirurgico,
        nome_instrumentalcirurgico,
        agrupamento_instrumentalcirurgico,
        CAST(id_grupoinvestimento AS INT)          AS id_grupoinvestimento,
        CAST(valor_instrumentalcirurgico AS DECIMAL(14,2)) AS valor_instrumentalcirurgico,
        tipo_verba,
        classe,
        Ativo
     FROM dbo.tb_instrumentaiscirurgicos`,
  );
  console.log(`  ${legado.length} instrumentais no legado.`);

  // Garante que o grupo 7 (INSTRUMENTAL) existe no destino.
  const grupo7 = await prisma.grupoInvestimento.findUnique({ where: { id: 7 } });
  if (!grupo7) throw new Error("Grupo 7 (Instrumentais Cirúrgicos) não existe no destino — abortando.");

  // Guarda de idempotência: não apagar INSTRUMENTAL já usados em solicitações.
  const usados = await prisma.solicitacaoItem.count({
    where: { itemCatalogo: { tipo: "INSTRUMENTAL" } },
  });
  if (usados > 0) {
    throw new Error(
      `${usados} SolicitacaoItem já referenciam instrumentais — re-migração abortada para não quebrar dado transacional.`,
    );
  }

  const jaExistentes = await prisma.itemCatalogo.count({ where: { tipo: "INSTRUMENTAL" } });
  if (jaExistentes > 0) {
    console.log(`  Removendo ${jaExistentes} INSTRUMENTAL pré-existentes (re-migração limpa) ...`);
    await prisma.itemCatalogo.deleteMany({ where: { tipo: "INSTRUMENTAL" } });
  }

  // Alguns registros do legado podem ter grupo != 7; normalizamos para 7 (é a categoria INSTRUMENTAL).
  const dados = legado
    .filter((r) => r.nome_instrumentalcirurgico && r.nome_instrumentalcirurgico.trim() !== "")
    .map((r) => ({
      nome: r.nome_instrumentalcirurgico!.slice(0, 500),
      grupoId: 7,
      agrupamento: r.agrupamento_instrumentalcirurgico?.slice(0, 120) ?? null,
      classificacao: r.classe?.slice(0, 120) ?? null,
      valorReferencia: r.valor_instrumentalcirurgico ?? null,
      ativo: (r.Ativo ?? "S").toUpperCase() === "S",
      tipo: "INSTRUMENTAL",
      tipoVerba: r.tipo_verba?.slice(0, 30) ?? null,
      legadoId: r.id_instrumentalcirurgico ?? null,
    }));

  console.log(`→ Inserindo ${dados.length} instrumentais (tipo=INSTRUMENTAL) ...`);
  // createMany em lotes (SQL Server tem limite de parâmetros por statement).
  const LOTE = 200;
  let inseridos = 0;
  for (let i = 0; i < dados.length; i += LOTE) {
    const res = await prisma.itemCatalogo.createMany({ data: dados.slice(i, i + LOTE) });
    inseridos += res.count;
  }

  // Verificação real pós-migração (não confia no retorno do createMany).
  const totalInstrumental = await prisma.itemCatalogo.count({ where: { tipo: "INSTRUMENTAL" } });
  const totalItem = await prisma.itemCatalogo.count({ where: { tipo: "ITEM" } });
  const grupo7Count = await prisma.itemCatalogo.count({ where: { grupoId: 7 } });
  const amostra = await prisma.itemCatalogo.findMany({
    where: { tipo: "INSTRUMENTAL" },
    take: 3,
    select: { id: true, nome: true, legadoId: true, tipoVerba: true, valorReferencia: true, ativo: true },
  });

  console.log("\n=== VERIFICAÇÃO ===");
  console.log(`INSTRUMENTAL inseridos (create):     ${inseridos}`);
  console.log(`INSTRUMENTAL no banco (count real):  ${totalInstrumental}`);
  console.log(`ITEM no banco (não deve mudar):      ${totalItem}`);
  console.log(`Total grupo 7:                       ${grupo7Count}`);
  console.log("Amostra:", JSON.stringify(amostra, null, 2));
}

main()
  .catch((e) => {
    console.error("ERRO:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
