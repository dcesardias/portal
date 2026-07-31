import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

// Argon2id params (m=19456 KiB, t=2, p=1)
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

async function main() {
  console.log('Iniciando seed…');

  // ── Usuário admin ────────────────────────────────────────────────────────
  const adminSenha = 'Admin@Inv3st!2026'; // mustChangePwd=true → usuário deve trocar no 1º acesso
  const adminHash = await hash(adminSenha, ARGON2_OPTIONS);

  const admin = await prisma.user.upsert({
    where: { login: 'admin' },
    update: {},
    create: {
      login: 'admin',
      nome: 'Administrador',
      email: 'admin@investimentos.local',
      senhaHash: adminHash,
      ativo: true,
      mustChangePwd: true,
    },
  });
  console.log(`Usuário admin: ${admin.id}`);

  // ── Fluxo 1: GPE Direto (1 etapa) ────────────────────────────────────────
  const fluxoGPE = await prisma.fluxo.upsert({
    where: { nome: 'GPE Direto' },
    update: {},
    create: {
      nome: 'GPE Direto',
      descricao: 'Aprovação direta pela Gerência de Planejamento e Estratégia',
      ativo: true,
      etapas: {
        create: [
          {
            ordem: 1,
            nome: 'Aprovação GPE',
            fonteAprovador: 'PERFIL',
            obrigatoria: true,
            permiteRevisao: true,
            aprovacaoParalela: false,
          },
        ],
      },
    },
  });
  console.log(`Fluxo GPE Direto: ${fluxoGPE.id}`);

  // ── Fluxo 2: 3 Níveis (3 etapas) ─────────────────────────────────────────
  const fluxo3N = await prisma.fluxo.upsert({
    where: { nome: '3 Níveis' },
    update: {},
    create: {
      nome: '3 Níveis',
      descricao: 'Aprovação em três níveis hierárquicos de alçada',
      ativo: true,
      etapas: {
        create: [
          {
            ordem: 1,
            nome: 'Alçada Focal',
            fonteAprovador: 'ALCADA_FOCAL',
            obrigatoria: true,
            permiteRevisao: true,
            aprovacaoParalela: false,
          },
          {
            ordem: 2,
            nome: 'Alçada Supervisão',
            fonteAprovador: 'ALCADA_SUP',
            obrigatoria: true,
            permiteRevisao: true,
            aprovacaoParalela: false,
          },
          {
            ordem: 3,
            nome: 'Alçada Final',
            fonteAprovador: 'ALCADA_FINAL',
            obrigatoria: true,
            permiteRevisao: false,
            aprovacaoParalela: false,
          },
        ],
      },
    },
  });
  console.log(`Fluxo 3 Níveis: ${fluxo3N.id}`);

  // ── Verificação ───────────────────────────────────────────────────────────
  const totalFluxos = await prisma.fluxo.count();
  const totalEtapas = await prisma.etapaFluxo.count();
  console.log(`Seed concluído: ${totalFluxos} fluxo(s), ${totalEtapas} etapa(s)`);

  if (totalFluxos !== 2) {
    throw new Error(`Esperado 2 fluxos, encontrado ${totalFluxos}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
