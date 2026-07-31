/**
 * Migração complementar: traz TODOS os usuários do legado (dbo.secusr_users),
 * inclusive os que estavam `active='N'` lá (a primeira migração, em
 * `migrate-legacy-catalogs.ts`, só trouxe os 22 com active='Y' — deixando de
 * fora ~95 contas, algumas das quais são referenciadas em RegraAlcada
 * migradas, gerando "logins órfãos" sem usuário correspondente).
 *
 * Decidido com o usuário em 2026-07-16: os usuários que estavam inativos no
 * legado entram ATIVOS no sistema novo (ativo=true) — o admin decide depois,
 * pela própria tela de Administração, quem desativar ou excluir.
 *
 * Idempotente: pula qualquer login já existente em User (não sobrescreve
 * nada da primeira migração nem de contas já criadas manualmente).
 *
 * Tratamento de dados sujos encontrados no legado:
 *  - `njaime` tem `name` vazio → usa o login como nome (nome é NOT NULL).
 *  - `njaime` tem e-mail malformado (`njaime@aacd.org.brr`, com "rr" extra)
 *    → mantido FIEL ao legado, sem "corrigir" silenciosamente um dado de
 *    negócio; fica registrado no relatório final para o admin corrigir se
 *    quiser, pela tela de Usuários.
 *  - Contas que parecem genéricas/técnicas (admin, admin2, solicitante,
 *    superintendencia) são migradas normalmente também (usuário pediu
 *    explicitamente "todos deveriam ter sido migrados"), mas destacadas no
 *    relatório final para o admin avaliar se quer manter/excluir.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

const CONTAS_GENERICAS = ['admin', 'admin2', 'solicitante', 'superintendencia'];

function generateTempPassword(): string {
  return randomBytes(12).toString('base64url');
}

async function main() {
  console.log('=== Migração complementar: todos os usuários legados (active Y e N) ===\n');

  const rows: { login: string; name: string; email: string; active: string }[] =
    await prisma.$queryRawUnsafe(`
      SELECT login, name, email, active FROM dbo.secusr_users
    `);

  const tempPasswords: Record<string, string> = {};
  const nomeVazio: string[] = [];
  const genericas: string[] = [];
  let criados = 0;
  let pulados = 0;

  for (const r of rows) {
    const exists = await prisma.user.findUnique({ where: { login: r.login } });
    if (exists) {
      pulados++;
      continue;
    }

    const nome = r.name?.trim() ? r.name.trim() : r.login;
    if (!r.name?.trim()) nomeVazio.push(r.login);
    if (CONTAS_GENERICAS.includes(r.login.toLowerCase())) genericas.push(r.login);

    const tempPwd = generateTempPassword();
    const senhaHash = await hash(tempPwd, ARGON2_OPTIONS);

    await prisma.user.create({
      data: {
        login: r.login,
        nome,
        email: r.email,
        senhaHash,
        ativo: true, // decidido com o usuário: entram ativos, ele desativa/exclui depois
        mustChangePwd: true,
      },
    });
    tempPasswords[r.login] = tempPwd;
    criados++;
  }

  if (Object.keys(tempPasswords).length > 0) {
    const outPath = join(__dirname, 'migration-temp-passwords-complementar.json');
    writeFileSync(outPath, JSON.stringify(tempPasswords, null, 2), 'utf8');
    console.log(`Senhas temporárias gravadas em ${outPath}`);
    console.log('  >>> IMPORTANTE: distribua as senhas e apague esse arquivo em seguida. <<<\n');
  }

  console.log(`User: ${criados} migrados agora, ${pulados} já existiam (pulados).\n`);

  if (nomeVazio.length) {
    console.log(`⚠ Nome vazio no legado (usado o login como nome): ${nomeVazio.join(', ')}`);
  }
  if (genericas.length) {
    console.log(
      `⚠ Contas que parecem genéricas/técnicas (avalie manter/excluir): ${genericas.join(', ')}`,
    );
  }
  console.log(
    '⚠ "superintendencia" é referenciado em RegraAlcada mas NÃO existe em dbo.secusr_users — ' +
      'não há como migrar automaticamente; precisa decisão manual (criar usuário ou reatribuir as regras).',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
