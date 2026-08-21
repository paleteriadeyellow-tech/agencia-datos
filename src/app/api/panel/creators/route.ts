import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { creatorWhere } from "@/lib/creator-scope";
import { prisma } from "@/lib/prisma";
import { currentMonth, monthRange } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, scope, isAdmin } = auth;
  const scopeFilter = creatorWhere(scope, agencySlug);

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? undefined;
  const niche = sp.get("niche") ?? undefined;
  const status = sp.get("status") ?? undefined;
  const group = sp.get("group") ?? undefined;

  const month = currentMonth();
  const { start, end } = monthRange(month);

  const [creators, niches, groups, managers, monthDiamonds] = await Promise.all([
    prisma.creator.findMany({
      where: {
        ...scopeFilter,
        AND: [
          q
            ? {
                OR: [
                  { name: { contains: q } },
                  { phone: { contains: q } },
                  { tiktokUser: { contains: q } },
                ],
              }
            : {},
          niche ? { niche } : {},
          status ? { status } : {},
          group ? { groupName: group } : {},
        ],
      },
      include: { manager: { select: { name: true } } },
    }),
    prisma.creator.findMany({
      where: scopeFilter,
      distinct: ["niche"],
      select: { niche: true },
      orderBy: { niche: "asc" },
    }),
    prisma.creator.findMany({
      where: { ...scopeFilter, groupName: { not: null } },
      distinct: ["groupName"],
      select: { groupName: true },
      orderBy: { groupName: "asc" },
    }),
    isAdmin
      ? prisma.user.findMany({
          where: { agencySlug },
          select: { id: true, name: true, role: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.metric.groupBy({
      by: ["creatorId"],
      where: {
        date: { gte: start, lte: end },
        creator: scopeFilter,
      },
      _sum: { diamonds: true },
    }),
  ]);

  const monthMap = Object.fromEntries(
    monthDiamonds.map((r) => [r.creatorId, r._sum.diamonds ?? 0])
  );

  const rows = creators
    .map((c) => {
      const fromMetrics = monthMap[c.id] ?? 0;
      const diamonds = Math.max(c.diamonds ?? 0, fromMetrics);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        niche: c.niche,
        joinDate: c.joinDate,
        tiktokUser: c.tiktokUser,
        groupName: c.groupName,
        status: c.status,
        livecoinsStatus: c.livecoinsStatus ?? "pendiente",
        country: c.country,
        notes: c.notes,
        managerId: c.managerId,
        managerName: c.manager?.name ?? null,
        diamonds,
        diamondsMonth: diamonds,
        diamondsTotal: Math.max(c.diamonds ?? 0, fromMetrics),
      };
    })
    .sort((a, b) => {
      if (b.diamonds !== a.diamonds) return b.diamonds - a.diamonds;
      return a.name.localeCompare(b.name);
    });

  return NextResponse.json({
    creators: rows,
    niches: niches.map((n) => n.niche),
    groups: groups
      .map((g) => g.groupName!)
      .filter(
        (g) =>
          g &&
          !g.toLowerCase().includes("no está en ningún grupo") &&
          !g.toLowerCase().includes("no esta en ningun grupo")
      ),
    managers,
    month,
  });
}
