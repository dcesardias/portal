/**
 * Seed de DEMONSTRAÇÃO: cria 3 usuários e a alçada necessária para simular o
 * fluxo completo (solicitar → Focal → Supervisão → Final → aprovado/reprovado/revisão).
 * Idempotente. NÃO apaga nada do legado; só adiciona no schema investimentos.
 *
 * Cenário: Estabelecimento 1 × Grupo 1 (categoria ITEM), fluxo default "3 Níveis".
 *   - demo.solicitante  → cria as solicitações
 *   - demo.aprovador    → aprova Focal e Supervisão
 *   - demo.gpe          → aprova Final (GPE)
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();
const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const SENHA = 'Demo@Investe2026';

const ESTAB_DEMO = 1;
const GRUPO_DEMO = 1;

const USUARIOS = [
  { login: 'demo.solicitante', nome: 'Solicitante Demo', email: 'demo.solicitante@investimentos.local', perfis: ['SOLICITANTE'] },
  { login: 'demo.aprovador', nome: 'Ana Aprovadora (Focal/Sup)', email: 'demo.aprovador@investimentos.local', perfis: ['SOLICITANTE', 'APROVADOR'] },
  { login: 'demo.gpe', nome: 'Carlos GPE (Final)', email: 'demo.gpe@investimentos.local', perfis: ['SOLICITANTE', 'APROVADOR_FINAL'] },
];

async function main() {
  const senhaHash = await hash(SENHA, ARGON2);

  // Garante os 4 perfis
  const perfisDb = await prisma.perfil.findMany();
  const perfilId = new Map(perfisDb.map((p) => [p.nome, p.id]));

  for (const u of USUARIOS) {
    const user = await prisma.user.upsert({
      where: { login: u.login },
      update: { nome: u.nome, email: u.email, ativo: true, mustChangePwd: false, senhaHash },
      create: { login: u.login, nome: u.nome, email: u.email, ativo: true, mustChangePwd: false, senhaHash },
    });
    for (const p of u.perfis) {
      const pid = perfilId.get(p);
      if (!pid) continue;
      await prisma.userPerfil.upsert({
        where: { userId_perfilId: { userId: user.id, perfilId: pid } },
        update: {},
        create: { userId: user.id, perfilId: pid },
      });
    }
    console.log(`✓ usuário ${u.login} (${u.perfis.join('+')})`);
  }

  // Alçada para Estab 1 × Grupo 1
  const regras = [
    { nivel: 'FOCAL', usuarioLogin: 'demo.aprovador' },
    { nivel: 'SUP', usuarioLogin: 'demo.aprovador' },
    { nivel: 'FINAL', usuarioLogin: 'demo.gpe' },
  ];
  for (const r of regras) {
    const existe = await prisma.regraAlcada.findFirst({
      where: { estabelecimentoId: ESTAB_DEMO, grupoId: GRUPO_DEMO, nivel: r.nivel, usuarioLogin: r.usuarioLogin },
    });
    if (!existe) {
      await prisma.regraAlcada.create({
        data: { estabelecimentoId: ESTAB_DEMO, grupoId: GRUPO_DEMO, nivel: r.nivel, usuarioLogin: r.usuarioLogin },
      });
    }
    console.log(`✓ alçada Estab ${ESTAB_DEMO} × Grupo ${GRUPO_DEMO} · ${r.nivel} → ${r.usuarioLogin}`);
  }

  // Confere fluxo default
  const regraDefault = await prisma.regraFluxo.findFirst({ where: { isDefault: true }, include: { fluxo: true } });
  console.log(`\nFluxo default: ${regraDefault?.fluxo?.nome ?? 'NENHUM (configure em Admin → Fluxos)'}`);

  // Dados de contexto para o solicitante
  const unidade = await prisma.unidadeNegocio.findFirst({ where: { estabelecimentoId: ESTAB_DEMO } });
  const cc = unidade ? await prisma.centroCusto.findFirst({ where: { unidadeId: unidade.id } }) : null;

  console.log('\n=== CREDENCIAIS DEMO (senha única) ===');
  console.log(`senha: ${SENHA}`);
  USUARIOS.forEach((u) => console.log(`  ${u.login}  → ${u.nome} [${u.perfis.join(', ')}]`));
  console.log(`\nAo criar solicitação como demo.solicitante, use Estabelecimento ${ESTAB_DEMO}` +
    (unidade ? `, Unidade "${unidade.nome}"` : '') +
    (cc ? `, Centro de custo ${cc.codigo}` : '') + ', tipo Itens, Grupo 1.');
}

main().catch((e) => { console.error('ERRO:', e); process.exit(1); }).finally(() => prisma.$disconnect());
