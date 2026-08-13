/**
 * Asigna datos existentes a Streamersfederation (no toca filas de elarbol).
 * Tras `npx prisma db push`:
 *   npx tsx prisma/assign-agency.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SLUG = "streamersfederation";

async function main() {
  const where = { agencySlug: { not: "elarbol" } as const };
  const data = { agencySlug: SLUG };

  const counts = await Promise.all([
    prisma.user.updateMany({ where, data }),
    prisma.creator.updateMany({ where, data }),
    prisma.diamondControl.updateMany({ where, data }),
    prisma.task.updateMany({ where, data }),
    prisma.campaign.updateMany({ where, data }),
    prisma.settlement.updateMany({ where, data }),
    prisma.contract.updateMany({ where, data }),
    prisma.bonoRecord.updateMany({ where, data }),
    prisma.kpiRecord.updateMany({ where, data }),
  ]);

  console.log("Backfill → streamersfederation:");
  console.log({
    users: counts[0].count,
    creators: counts[1].count,
    diamondControl: counts[2].count,
    tasks: counts[3].count,
    campaigns: counts[4].count,
    settlements: counts[5].count,
    contracts: counts[6].count,
    bonos: counts[7].count,
    kpi: counts[8].count,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
