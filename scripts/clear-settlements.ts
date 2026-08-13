import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const settlements = await prisma.settlement.deleteMany();
  console.log(`Liquidaciones borradas: ${settlements.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
