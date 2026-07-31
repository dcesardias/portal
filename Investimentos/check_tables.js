const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.$queryRawUnsafe("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'investimentos' ORDER BY TABLE_NAME");
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });