/**
 * Migração pontual dos CADASTROS (dados mestre) do banco legado (schema `dbo`,
 * sistema ScriptCase) para o schema `investimentos` (novo app), no mesmo
 * banco físico (SERVER55\DW / sc_orcamento). Escopo: apenas cadastros de
 * apoio, NÃO inclui histórico de solicitações/aprovações/recebimentos
 * (isso é tratado separadamente pelo ETL `migrate-legacy.ts`, que
 * deliberadamente exige um dump isolado via LEGACY_DUMP_DIR).
 *
 * Idempotente: usa upsert / verifica existência antes de inserir, então pode
 * ser rodado mais de uma vez sem duplicar dados.
 *
 * Mapeamento (decidido e confirmado com o usuário em 2026-07-15):
 *  - GrupoInvestimento  ← dbo.tb_grupos_investimento (categoria inferida pelo nome:
 *                         id=7 "Instrumentais Cirúrgicos" → INSTRUMENTAL,
 *                         id=9 "Obras, Reformas..." → OBRA, demais → ITEM)
 *  - Motivo             ← dbo.tb_motivos
 *  - ItemCatalogo       ← dbo.tb_itens (schema ampliado: nome NVarChar(500),
 *                         especificacao NVarChar(Max), + campo novo `definicao`)
 *  - Estabelecimento    ← dbo.vw_centrocusto_un (distinct)
 *  - UnidadeNegocio     ← dbo.vw_centrocusto_un (distinct por unidade+estabelecimento;
 *                         NR_SEQ_UNID_NEG não é globalmente único no legado —
 *                         mesmo código de unidade se repete em vários estabelecimentos
 *                         — então geramos IDs novos sequenciais)
 *  - CentroCusto        ← dbo.vw_centrocusto_un
 *  - RegraAlcada        ← dbo.tb_aprovadores (pivot ponto_focal/aprovador_sup/
 *                         aprovador_final → níveis FOCAL/SUP/FINAL; linhas com
 *                         id_grupoinvestimento=10 são ignoradas, órfãs no legado
 *                         — não existe em tb_grupos_investimento; aprovador_final
 *                         "dcesar-conuki-srodrigues" é 3 logins concatenados por
 *                         hífen → 3 regras FINAL separadas)
 *  - User               ← dbo.secusr_users (apenas active='Y'); NÃO reaproveita
 *                         a senha legada (5 chars, texto puro, aparenta ser senha
 *                         padrão compartilhada) — gera senha temporária aleatória
 *                         por usuário + mustChangePwd=true. Senhas temporárias são
 *                         gravadas em migration-temp-passwords.json (git-ignorado)
 *                         para o usuário distribuir e depois apagar o arquivo.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

function generateTempPassword(): string {
  return randomBytes(12).toString('base64url');
}

async function migrarGrupoInvestimento() {
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT id_grupoinvestimento, nome_grupoinvestimento, cd_conta_contabil FROM dbo.tb_grupos_investimento`,
  );
  let n = 0;
  for (const r of rows) {
    const id = Number(r.id_grupoinvestimento);
    const categoria = id === 7 ? 'INSTRUMENTAL' : id === 9 ? 'OBRA' : 'ITEM';
    await prisma.grupoInvestimento.upsert({
      where: { id },
      update: { nome: r.nome_grupoinvestimento, categoria, contaContabil: r.cd_conta_contabil },
      create: {
        id,
        nome: r.nome_grupoinvestimento,
        categoria,
        contaContabil: r.cd_conta_contabil,
        ativo: true,
      },
    });
    n++;
  }
  console.log(`GrupoInvestimento: ${n} migrados`);
}

function sqlStr(v: string | null | undefined): string {
  if (v == null) return 'NULL';
  return `N'${String(v).replace(/'/g, "''")}'`;
}
function sqlNum(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? 'NULL' : String(v);
}
function sqlBit(v: boolean): string {
  return v ? '1' : '0';
}

async function migrarMotivo() {
  const rows: any[] = await prisma.$queryRawUnsafe(`SELECT id_motivo, nome_motivo FROM dbo.tb_motivos`);
  const existentes = new Set(
    (await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM investimentos.Motivo`)).map((r) => Number(r.id)),
  );
  const novos = rows.filter((r) => !existentes.has(Number(r.id_motivo)));
  if (novos.length === 0) {
    console.log(`Motivo: 0 migrados (${rows.length} já existiam)`);
    return;
  }
  // Batch único (uma só chamada = uma só conexão) para IDENTITY_INSERT funcionar de verdade.
  let sql = `SET IDENTITY_INSERT investimentos.Motivo ON;\n`;
  for (const r of novos) {
    sql += `INSERT INTO investimentos.Motivo (id, nome, ativo) VALUES (${sqlNum(Number(r.id_motivo))}, ${sqlStr(r.nome_motivo)}, 1);\n`;
  }
  sql += `SET IDENTITY_INSERT investimentos.Motivo OFF;`;
  await prisma.$executeRawUnsafe(sql);
  console.log(`Motivo: ${novos.length} migrados`);
}

async function migrarItemCatalogo() {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT id_item, nome_item, agrupamento_item, classificacao_item, definicao_item,
           especificacao_item, valor_item, id_grupoinvestimento, Ativo, id_renem, ds_renem
    FROM dbo.tb_itens
  `);
  const gruposValidos = new Set(
    (await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM investimentos.GrupoInvestimento`)).map((r) => Number(r.id)),
  );
  const existentes = new Set(
    (await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM investimentos.ItemCatalogo`)).map((r) => Number(r.id)),
  );

  const validas = rows.filter((r) => {
    const grupoId = Number(r.id_grupoinvestimento);
    if (!gruposValidos.has(grupoId)) {
      console.warn(`  ! ItemCatalogo id_item=${r.id_item}: grupoId=${grupoId} não existe, pulando`);
      return false;
    }
    return true;
  });
  const novas = validas.filter((r) => !existentes.has(Number(r.id_item)));
  const atualizacoes = validas.filter((r) => existentes.has(Number(r.id_item)));

  const rowSql = (r: any) => {
    const id = Number(r.id_item);
    const grupoId = Number(r.id_grupoinvestimento);
    const valorNum = r.valor_item != null ? Number(r.valor_item) : null;
    const ativo = r.Ativo === 'S';
    const idRenem = r.id_renem != null ? String(r.id_renem) : null;
    return { id, grupoId, valor: sqlNum(valorNum), ativo, idRenem, r };
  };

  if (novas.length > 0) {
    let sql = `SET IDENTITY_INSERT investimentos.ItemCatalogo ON;\n`;
    for (const raw of novas) {
      const { id, grupoId, valor, ativo, idRenem, r } = rowSql(raw);
      sql += `INSERT INTO investimentos.ItemCatalogo
        (id, nome, grupoId, agrupamento, classificacao, definicao, especificacao, valorReferencia, ativo, idRenem, dsRenem)
        VALUES (${id}, ${sqlStr(r.nome_item)}, ${grupoId}, ${sqlStr(r.agrupamento_item)}, ${sqlStr(r.classificacao_item)},
        ${sqlStr(r.definicao_item)}, ${sqlStr(r.especificacao_item)}, ${valor}, ${sqlBit(ativo)}, ${sqlStr(idRenem)}, ${sqlStr(r.ds_renem)});\n`;
    }
    sql += `SET IDENTITY_INSERT investimentos.ItemCatalogo OFF;`;
    await prisma.$executeRawUnsafe(sql);
  }

  for (const raw of atualizacoes) {
    const { id, grupoId, valor, ativo, idRenem, r } = rowSql(raw);
    const sql = `UPDATE investimentos.ItemCatalogo SET
      nome = ${sqlStr(r.nome_item)}, grupoId = ${grupoId}, agrupamento = ${sqlStr(r.agrupamento_item)},
      classificacao = ${sqlStr(r.classificacao_item)}, definicao = ${sqlStr(r.definicao_item)},
      especificacao = ${sqlStr(r.especificacao_item)}, valorReferencia = ${valor}, ativo = ${sqlBit(ativo)},
      idRenem = ${sqlStr(idRenem)}, dsRenem = ${sqlStr(r.ds_renem)}
      WHERE id = ${id};`;
    await prisma.$executeRawUnsafe(sql);
  }

  console.log(`ItemCatalogo: ${novas.length} criados, ${atualizacoes.length} atualizados`);
}

async function migrarCatalogoLocalizacao() {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT CD_CENTRO_CUSTO, DS_CENTRO_CUSTO, NR_SEQ_UNID_NEG, DS_UNIDADE_NEGOCIO,
           CD_ESTABELECIMENTO, NM_FANTASIA_ESTAB
    FROM dbo.vw_centrocusto_un
  `);

  // Estabelecimento (distinct)
  const estabelecimentos = new Map<number, string>();
  for (const r of rows) {
    const id = Number(r.CD_ESTABELECIMENTO);
    if (!estabelecimentos.has(id)) estabelecimentos.set(id, r.NM_FANTASIA_ESTAB);
  }
  for (const [id, nome] of estabelecimentos) {
    await prisma.estabelecimento.upsert({
      where: { id },
      update: { nome },
      create: { id, nome, ativo: true },
    });
  }
  console.log(`Estabelecimento: ${estabelecimentos.size} migrados`);

  // UnidadeNegocio (NR_SEQ_UNID_NEG não é único globalmente → IDs novos sequenciais)
  const unidadeKeyToId = new Map<string, number>();
  const unidadeDefs = new Map<number, { nome: string; estabelecimentoId: number }>();
  let nextUnidadeId = 1;
  for (const r of rows) {
    const key = `${r.NR_SEQ_UNID_NEG}|${r.CD_ESTABELECIMENTO}`;
    if (!unidadeKeyToId.has(key)) {
      unidadeKeyToId.set(key, nextUnidadeId);
      unidadeDefs.set(nextUnidadeId, {
        nome: r.DS_UNIDADE_NEGOCIO,
        estabelecimentoId: Number(r.CD_ESTABELECIMENTO),
      });
      nextUnidadeId++;
    }
  }
  for (const [id, def] of unidadeDefs) {
    await prisma.unidadeNegocio.upsert({
      where: { id },
      update: { nome: def.nome, estabelecimentoId: def.estabelecimentoId },
      create: { id, nome: def.nome, estabelecimentoId: def.estabelecimentoId, ativo: true },
    });
  }
  console.log(
    `UnidadeNegocio: ${unidadeDefs.size} migrados (IDs gerados sequencialmente, não são o NR_SEQ_UNID_NEG original)`,
  );

  // CentroCusto
  const centrosVistos = new Set<string>();
  let nCentro = 0;
  for (const r of rows) {
    const codigo = String(r.CD_CENTRO_CUSTO);
    if (centrosVistos.has(codigo)) continue; // a view pode ter duplicatas de join
    centrosVistos.add(codigo);
    const key = `${r.NR_SEQ_UNID_NEG}|${r.CD_ESTABELECIMENTO}`;
    const unidadeId = unidadeKeyToId.get(key)!;
    await prisma.centroCusto.upsert({
      where: { codigo },
      update: { descricao: r.DS_CENTRO_CUSTO, unidadeId },
      create: { codigo, descricao: r.DS_CENTRO_CUSTO, unidadeId, ativo: true },
    });
    nCentro++;
  }
  console.log(`CentroCusto: ${nCentro} migrados`);
}

async function migrarRegraAlcada() {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT id_grupoinvestimento, id_estabelecimento, ponto_focal, aprovador_sup, aprovador_final
    FROM dbo.tb_aprovadores
  `);

  type Regra = { estabelecimentoId: number; grupoId: number; nivel: string; usuarioLogin: string };
  const dedup = new Map<string, Regra>();
  let orfaosGrupo = 0;

  for (const r of rows) {
    const grupoId = Math.round(Number(r.id_grupoinvestimento));
    const estabelecimentoId = Math.round(Number(r.id_estabelecimento));

    if (grupoId === 10) {
      orfaosGrupo++;
      continue; // confirmado com usuário: grupo 10 não existe em tb_grupos_investimento, pular
    }

    const add = (nivel: string, login: string) => {
      const key = `${estabelecimentoId}|${grupoId}|${nivel}|${login}`;
      dedup.set(key, { estabelecimentoId, grupoId, nivel, usuarioLogin: login });
    };

    if (r.ponto_focal) add('FOCAL', r.ponto_focal);
    if (r.aprovador_sup) add('SUP', r.aprovador_sup);
    if (r.aprovador_final) {
      // confirmado com usuário: "dcesar-conuki-srodrigues" = 3 logins distintos
      const logins =
        r.aprovador_final === 'dcesar-conuki-srodrigues'
          ? ['dcesar', 'conuki', 'srodrigues']
          : [r.aprovador_final];
      for (const login of logins) add('FINAL', login);
    }
  }

  let n = 0;
  for (const regra of dedup.values()) {
    const exists = await prisma.regraAlcada.findUnique({
      where: { estabelecimentoId_grupoId_nivel_usuarioLogin: regra },
    });
    if (!exists) {
      await prisma.regraAlcada.create({ data: regra });
      n++;
    }
  }
  console.log(
    `RegraAlcada: ${n} regras criadas (${orfaosGrupo} linhas com grupo=10 ignoradas, conforme confirmado)`,
  );
}

async function migrarUsuarios() {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT login, name, email FROM dbo.secusr_users WHERE active = 'Y'
  `);

  const tempPasswords: Record<string, string> = {};
  let n = 0;
  for (const r of rows) {
    const exists = await prisma.user.findUnique({ where: { login: r.login } });
    if (exists) continue;

    const tempPwd = generateTempPassword();
    const senhaHash = await hash(tempPwd, ARGON2_OPTIONS);
    await prisma.user.create({
      data: {
        login: r.login,
        nome: r.name,
        email: r.email,
        senhaHash,
        ativo: true,
        mustChangePwd: true,
      },
    });
    tempPasswords[r.login] = tempPwd;
    n++;
  }

  if (Object.keys(tempPasswords).length > 0) {
    const outPath = join(__dirname, 'migration-temp-passwords.json');
    writeFileSync(outPath, JSON.stringify(tempPasswords, null, 2), 'utf8');
    console.log(`User: ${n} migrados. Senhas temporárias gravadas em ${outPath}`);
    console.log('  >>> IMPORTANTE: distribua as senhas e apague esse arquivo em seguida. <<<');
  } else {
    console.log(`User: ${n} migrados (nenhum novo, já existiam)`);
  }
}

async function main() {
  console.log('=== Migração de cadastros legados (dbo → investimentos) ===\n');
  await migrarGrupoInvestimento();
  await migrarMotivo();
  await migrarItemCatalogo();
  await migrarCatalogoLocalizacao();
  await migrarRegraAlcada();
  await migrarUsuarios();
  console.log('\n=== Migração concluída ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
