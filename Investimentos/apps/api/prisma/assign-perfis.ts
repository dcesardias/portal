/**
 * Popula a tabela Perfil (SOLICITANTE/APROVADOR/APROVADOR_FINAL/ADMIN) e
 * atribui automaticamente os perfis aos usuários já migrados.
 *
 * REESCRITO em 2026-07-15 (2ª correção): a primeira versão deste script só
 * olhava `RegraAlcada` para inferir APROVADOR/APROVADOR_FINAL e assumia (com
 * base numa checagem incompleta, só da coluna `priv_admin`) que não havia
 * como inferir ADMIN do legado. Na verdade existe uma tabela de perfis real
 * no legado — `dbo.secusr_groups`/`secusr_users_groups` (já documentada em
 * DICIONARIO_DADOS.md, mas não usada na primeira versão) — com 5 grupos:
 *   1 Administrador · 2 Solicitante (padrão) · 3 Gestor · 4 GPE (aprovação
 *   final, ver DOCUMENTACAO_SISTEMA_ORCAMENTARIO.md §5) · 5 Regras Matriz
 *   (subconjunto do grupo 1, não traz gente nova).
 * Essa tabela é a fonte de verdade mais direta para "qual papel a pessoa
 * tinha" — RegraAlcada responde uma pergunta diferente ("quem é o aprovador
 * *designado* desta alçada específica"). Usamos a UNIÃO dos dois: ninguém
 * fica de fora só porque apareceu em uma fonte e não na outra (a checagem
 * fina de "pode aprovar ESSA solicitação" continua 100% via RegraAlcada em
 * AprovacaoService.podeAprovar — este perfil só libera a rota no RolesGuard).
 *
 * Regras finais:
 *   - SOLICITANTE: todo usuário ativo (papel base, ~todo mundo no legado
 *     também estava no grupo 2).
 *   - APROVADOR: grupo legado 3 "Gestor" OU RegraAlcada nível FOCAL/SUP.
 *   - APROVADOR_FINAL: grupo legado 4 "GPE" OU RegraAlcada nível FINAL.
 *   - ADMIN: explícito — dcesar, conuki (já confirmados antes) + rimacedo,
 *     srodrigues (achados no grupo legado 1 "Administrador" e confirmados
 *     com o usuário em 2026-07-15). `admin`/`admin2` também estavam no grupo
 *     1 no legado, mas são contas genéricas/técnicas — usuário decidiu
 *     deixá-las de fora do ADMIN por padrão.
 * Idempotente: pode ser re-executado sem duplicar UserPerfil.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PERFIS = ['SOLICITANTE', 'APROVADOR', 'APROVADOR_FINAL', 'ADMIN'] as const;
const PERFIL_DESCRICOES: Record<(typeof PERFIS)[number], string> = {
  SOLICITANTE: 'Pode criar e acompanhar suas próprias solicitações de investimento.',
  APROVADOR: 'Aprova solicitações de subordinados (alçada focal/supervisão), além de poder solicitar.',
  APROVADOR_FINAL: 'Realiza a aprovação final de solicitações já pré-aprovadas.',
  ADMIN: 'Gerencia cadastros, usuários, fluxos e configurações do sistema.',
};
// Confirmado com o usuário em 2026-07-15 (2ª rodada): dcesar/conuki (já
// confirmados antes) + rimacedo/srodrigues (achados no grupo legado
// "Administrador"). admin/admin2 deliberadamente de fora (contas genéricas).
const ADMIN_LOGINS = ['dcesar', 'conuki', 'rimacedo', 'srodrigues'];

// IDs dos grupos legados (dbo.secusr_groups) — ver DICIONARIO_DADOS.md §perfis.
const GRUPO_LEGADO = { ADMINISTRADOR: 1, SOLICITANTE: 2, GESTOR: 3, GPE: 4 } as const;

async function ensurePerfis(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const nome of PERFIS) {
    const perfil = await prisma.perfil.upsert({
      where: { nome },
      update: { descricao: PERFIL_DESCRICOES[nome] },
      create: { nome, descricao: PERFIL_DESCRICOES[nome] },
    });
    ids[nome] = perfil.id;
  }
  return ids;
}

async function atribuir(userId: string, perfilId: string, perfilNome: string, login: string) {
  const exists = await prisma.userPerfil.findUnique({
    where: { userId_perfilId: { userId, perfilId } },
  });
  if (exists) return false;
  await prisma.userPerfil.create({ data: { userId, perfilId } });
  console.log(`  + ${login} → ${perfilNome}`);
  return true;
}

async function main() {
  console.log('=== Atribuição de perfis (papéis) aos usuários ===\n');
  const perfilIds = await ensurePerfis();
  console.log('Perfis garantidos:', Object.keys(perfilIds).join(', '), '\n');

  const usuarios = await prisma.user.findMany({ where: { ativo: true } });
  const porLogin = new Map(usuarios.map((u) => [u.login, u]));

  // Grupos legados por login (dbo.secusr_users_groups) — fonte adicional,
  // independente de RegraAlcada, usada em união (ver comentário no topo).
  const gruposLegado: { login: string; group_id: number }[] = await prisma.$queryRawUnsafe(
    `SELECT login, group_id FROM dbo.secusr_users_groups`,
  );
  const loginsPorGrupo = new Map<number, Set<string>>();
  for (const { login, group_id } of gruposLegado) {
    if (!loginsPorGrupo.has(group_id)) loginsPorGrupo.set(group_id, new Set());
    loginsPorGrupo.get(group_id)!.add(login);
  }

  // 1) SOLICITANTE — base, todo usuário ativo
  let nSolicitante = 0;
  for (const u of usuarios) {
    if (await atribuir(u.id, perfilIds.SOLICITANTE, 'SOLICITANTE', u.login)) nSolicitante++;
  }
  console.log(`SOLICITANTE atribuído a ${nSolicitante} usuário(s) novo(s)\n`);

  // 2) APROVADOR — união de: grupo legado 3 "Gestor" + RegraAlcada nível FOCAL/SUP
  const focalSup = await prisma.regraAlcada.findMany({
    where: { nivel: { in: ['FOCAL', 'SUP'] } },
    select: { usuarioLogin: true },
    distinct: ['usuarioLogin'],
  });
  const loginsAprovador = new Set<string>([
    ...(loginsPorGrupo.get(GRUPO_LEGADO.GESTOR) ?? []),
    ...focalSup.map((r) => r.usuarioLogin),
  ]);
  let nAprovador = 0;
  let semUsuario = 0;
  for (const usuarioLogin of loginsAprovador) {
    const u = porLogin.get(usuarioLogin);
    if (!u) {
      semUsuario++;
      continue;
    }
    if (await atribuir(u.id, perfilIds.APROVADOR, 'APROVADOR', u.login)) nAprovador++;
  }
  console.log(`APROVADOR atribuído a ${nAprovador} usuário(s) novo(s) (${semUsuario} logins sem usuário migrado)\n`);

  // 3) APROVADOR_FINAL — união de: grupo legado 4 "GPE" + RegraAlcada nível FINAL
  const finais = await prisma.regraAlcada.findMany({
    where: { nivel: 'FINAL' },
    select: { usuarioLogin: true },
    distinct: ['usuarioLogin'],
  });
  const loginsFinal = new Set<string>([
    ...(loginsPorGrupo.get(GRUPO_LEGADO.GPE) ?? []),
    ...finais.map((r) => r.usuarioLogin),
  ]);
  let nFinal = 0;
  let semUsuarioFinal = 0;
  for (const usuarioLogin of loginsFinal) {
    const u = porLogin.get(usuarioLogin);
    if (!u) {
      semUsuarioFinal++;
      continue;
    }
    if (await atribuir(u.id, perfilIds.APROVADOR_FINAL, 'APROVADOR_FINAL', u.login)) nFinal++;
  }
  console.log(`APROVADOR_FINAL atribuído a ${nFinal} usuário(s) novo(s) (${semUsuarioFinal} logins sem usuário migrado)\n`);

  // 4) ADMIN — explícito
  let nAdmin = 0;
  for (const login of ADMIN_LOGINS) {
    const u = porLogin.get(login);
    if (!u) {
      console.warn(`  ! login '${login}' não encontrado entre usuários ativos — ADMIN não atribuído`);
      continue;
    }
    if (await atribuir(u.id, perfilIds.ADMIN, 'ADMIN', u.login)) nAdmin++;
  }
  console.log(`ADMIN atribuído a ${nAdmin} usuário(s) novo(s)\n`);

  console.log('=== Concluído ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
