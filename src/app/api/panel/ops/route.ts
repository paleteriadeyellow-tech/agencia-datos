import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { creatorWhere } from "@/lib/creator-scope";
import { prisma } from "@/lib/prisma";
import { currentMonth } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Periodos YYYY-MM cubiertos entre inicio y fin (inclusive por mes). */
function periodsBetween(start: Date, end: Date) {
  const periods: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    periods.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`
    );
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return periods;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, scope } = auth;
  const scopeFilter = creatorWhere(scope, agencySlug);

  const [creators, campaigns, settlements, contracts, diamondRows] =
    await Promise.all([
    prisma.creator.findMany({
      where: scopeFilter,
      select: { id: true, name: true, tiktokUser: true, diamonds: true, managerId: true },
      orderBy: { diamonds: "desc" },
    }),
    prisma.campaign.findMany({
      where: { agencySlug },
      include: {
        creators: {
          include: {
            creator: { select: { id: true, name: true, tiktokUser: true } },
          },
        },
      },
      orderBy: { startDate: "desc" },
    }),
    prisma.settlement.findMany({
      where: scope.admin ? { agencySlug } : { agencySlug, creator: scopeFilter },
      include: { creator: { select: { id: true, name: true } } },
      orderBy: [{ month: "desc" }, { createdAt: "desc" }],
    }),
    prisma.contract.findMany({
      where: scope.admin ? { agencySlug } : { agencySlug, creator: scopeFilter },
      include: { creator: { select: { name: true, id: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.diamondControl.findMany({
      where: { agencySlug },
      select: {
        period: true,
        username: true,
        diamonds: true,
        hours: true,
        creatorId: true,
        id: true,
        creator: { select: { id: true, name: true, tiktokUser: true } },
      },
    }),
  ]);

  // Diamantes del mes actual para ordenar sugerencias (Control de diamantes)
  const month = currentMonth();
  const diamondsByCreatorId = new Map<string, number>();
  const diamondsByNick = new Map<string, number>();
  for (const row of diamondRows) {
    if (row.period !== month) continue;
    const nick = row.username.toLowerCase();
    diamondsByNick.set(nick, (diamondsByNick.get(nick) ?? 0) + row.diamonds);
    if (row.creatorId) {
      diamondsByCreatorId.set(
        row.creatorId,
        (diamondsByCreatorId.get(row.creatorId) ?? 0) + row.diamonds
      );
    }
  }

  const creatorsSorted = [...creators]
    .map((c) => {
      const nick = (c.tiktokUser || c.name).replace(/^@/, "").trim().toLowerCase();
      const diamonds = Math.max(
        c.diamonds ?? 0,
        diamondsByCreatorId.get(c.id) ?? 0,
        diamondsByNick.get(nick) ?? 0
      );
      return { ...c, diamonds };
    })
    .sort((a, b) => {
      if (b.diamonds !== a.diamonds) return b.diamonds - a.diamonds;
      return a.name.localeCompare(b.name);
    });

  const allPeriods = new Set<string>();
  for (const c of campaigns) {
    for (const p of periodsBetween(c.startDate, c.endDate)) allPeriods.add(p);
  }

  const diamondForCampaigns = diamondRows.filter((r) => allPeriods.has(r.period));

  const thisMonth = settlements.filter((s) => s.month === month);

  return NextResponse.json({
    creators: creatorsSorted,
    campaigns: campaigns.map((c) => {
      const periods = new Set(periodsBetween(c.startDate, c.endDate));
      const assignedIds = new Set(c.creators.map((cc) => cc.creatorId));
      const assignedUsers = new Set(
        c.creators
          .map((cc) => cc.creator.tiktokUser?.toLowerCase())
          .filter(Boolean) as string[]
      );

      // Progreso desde Control de diamantes (mismo periodo de la campaña)
      const byUser = new Map<
        string,
        {
          id: string;
          name: string;
          tiktokUser: string | null;
          progressDiamonds: number;
          progressHours: number;
        }
      >();

      for (const row of diamondForCampaigns) {
        if (!periods.has(row.period)) continue;
        const nick = row.username.toLowerCase();
        // Con asignados: solo esos. Sin asignar: todos los importados del mes.
        if (assignedIds.size > 0) {
          const linked =
            (row.creatorId && assignedIds.has(row.creatorId)) ||
            assignedUsers.has(nick);
          if (!linked) continue;
        }
        const prev = byUser.get(nick);
        if (prev) {
          prev.progressDiamonds += row.diamonds;
          prev.progressHours += row.hours;
        } else {
          byUser.set(nick, {
            id: row.creatorId ?? row.id,
            name: row.creator?.name ?? row.username,
            tiktokUser: row.creator?.tiktokUser ?? row.username,
            progressDiamonds: row.diamonds,
            progressHours: row.hours,
          });
        }
      }

      for (const cc of c.creators) {
        const nick = (cc.creator.tiktokUser || cc.creator.name).toLowerCase();
        if (!byUser.has(nick)) {
          byUser.set(nick, {
            id: cc.creator.id,
            name: cc.creator.name,
            tiktokUser: cc.creator.tiktokUser,
            progressDiamonds: 0,
            progressHours: 0,
          });
        }
      }

      const participants = [...byUser.values()].sort(
        (a, b) => b.progressDiamonds - a.progressDiamonds
      );

      return {
        id: c.id,
        name: c.name,
        description: c.description,
        startDate: c.startDate,
        endDate: c.endDate,
        targetDiamonds: c.targetDiamonds,
        targetHours: c.targetHours,
        status: c.status,
        assignedCreatorIds: c.creators.map((cc) => cc.creatorId),
        creators: participants,
      };
    }),
    finance: {
      month,
      agencyTotal: thisMonth.reduce((a, s) => a + s.agencyAmount, 0),
      creatorTotal: thisMonth.reduce((a, s) => a + s.creatorAmount, 0),
      pending: thisMonth.filter((s) => s.status === "pendiente").length,
      settlements: settlements.map((s) => ({
        id: s.id,
        month: s.month,
        creatorId: s.creatorId,
        creatorName: s.creator.name,
        diamonds: s.diamonds,
        hours: s.hours,
        days: s.days,
        estimatedPay: s.estimatedPay,
        agencyAmount: s.agencyAmount,
        agencyPercent: s.agencyPercent,
        creatorAmount: s.creatorAmount,
        status: s.status,
        notes: s.notes,
      })),
    },
    contracts: contracts.map((c) => ({
      id: c.id,
      title: c.title,
      creatorId: c.creatorId,
      creatorName: c.creator.name,
      status: c.status,
      startDate: c.startDate,
      endDate: c.endDate,
      fileUrl: c.fileUrl,
    })),
  });
}
