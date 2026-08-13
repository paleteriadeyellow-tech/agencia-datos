import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { currentMonth, monthRange } from "@/lib/utils";

export const dynamic = "force-dynamic";

function parsePeriod(raw: string | null) {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return currentMonth();
  return raw;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug } = auth;

  const period = parsePeriod(req.nextUrl.searchParams.get("period"));
  const { start, end } = monthRange(period);
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [
    totalCreators,
    activeCreators,
    newCreators,
    diamondAgg,
    topDiamondRows,
    pendingTasks,
    activeWithLatest,
  ] = await Promise.all([
    prisma.creator.count({ where: { agencySlug } }),
    prisma.creator.count({ where: { agencySlug, status: "activo" } }),
    prisma.creator.count({
      where: { agencySlug, joinDate: { gte: start, lte: end } },
    }),
    prisma.diamondControl.aggregate({
      where: { agencySlug, period },
      _sum: { diamonds: true, hours: true },
      _count: { _all: true },
    }),
    prisma.diamondControl.findMany({
      where: { agencySlug, period },
      include: {
        creator: { select: { id: true, name: true, niche: true } },
      },
      orderBy: [{ diamonds: "desc" }, { username: "asc" }],
      take: 5,
    }),
    prisma.task.findMany({
      where: {
        agencySlug,
        status: { in: ["pendiente", "en_progreso"] },
      },
      include: { creator: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
    prisma.creator.findMany({
      where: { agencySlug, status: "activo" },
      select: {
        id: true,
        name: true,
        metrics: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
      },
      take: 40,
      orderBy: { name: "asc" },
    }),
  ]);

  const inactiveCreators = activeWithLatest
    .filter((c) => {
      const last = c.metrics[0]?.date;
      return !last || last < fourteenDaysAgo;
    })
    .slice(0, 5)
    .map((c) => ({ id: c.id, name: c.name }));

  return NextResponse.json({
    month: period,
    kpis: {
      totalCreators,
      activeCreators,
      newCreators,
      diamonds: diamondAgg._sum.diamonds ?? 0,
      hours: Math.round(diamondAgg._sum.hours ?? 0),
      diamondUsers: diamondAgg._count._all,
    },
    topCreators: topDiamondRows.map((row, i) => ({
      rank: i + 1,
      id: row.creatorId ?? row.id,
      creatorId: row.creatorId,
      username: row.username,
      name: row.creator?.name ?? row.username,
      niche: row.creator?.niche ?? "—",
      diamonds: row.diamonds,
      hours: row.hours,
    })),
    pendingTasks: pendingTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate,
      creatorName: t.creator?.name ?? "General",
    })),
    inactiveCreators,
  });
}
