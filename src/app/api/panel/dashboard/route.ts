import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { cleanNick, creatorWhere, diamondWhere } from "@/lib/creator-scope";
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
  const { agencySlug, scope, isAdmin: isAdminUser } = auth;
  const scopeFilter = creatorWhere(scope, agencySlug);
  const myDiamondWhere = await diamondWhere(scope, agencySlug);

  const period = parsePeriod(req.nextUrl.searchParams.get("period"));
  const { start, end } = monthRange(period);
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [
    totalCreators,
    activeCreators,
    newCreators,
    diamondAgg,
    agencyDiamondAgg,
    goalRow,
    topDiamondRows,
    pendingTasks,
    activeWithLatest,
  ] = await Promise.all([
    prisma.creator.count({ where: scopeFilter }),
    prisma.creator.count({ where: { ...scopeFilter, status: "activo" } }),
    prisma.creator.count({
      where: { ...scopeFilter, joinDate: { gte: start, lte: end } },
    }),
    prisma.diamondControl.aggregate({
      where: { period, ...myDiamondWhere },
      _sum: { diamonds: true, hours: true },
      _count: { _all: true },
    }),
    prisma.diamondControl.aggregate({
      where: { agencySlug, period },
      _sum: { diamonds: true },
    }),
    prisma.monthlyDiamondGoal.findUnique({
      where: { agencySlug_period: { agencySlug, period } },
      select: { target: true, updatedAt: true },
    }),
    prisma.diamondControl.findMany({
      where: { period, ...myDiamondWhere },
      include: {
        creator: { select: { id: true, name: true, niche: true } },
      },
      orderBy: [{ diamonds: "desc" }, { username: "asc" }],
      take: 5,
    }),
    prisma.task.findMany({
      where: scope.admin
        ? { agencySlug, status: { in: ["pendiente", "en_progreso"] } }
        : {
            agencySlug,
            status: { in: ["pendiente", "en_progreso"] },
            OR: [{ creatorId: null }, { creator: scopeFilter }],
          },
      include: { creator: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
    prisma.creator.findMany({
      where: { ...scopeFilter, status: "activo" },
      select: {
        id: true,
        name: true,
        metrics: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
      },
      take: 40,
      orderBy: { name: "asc" },
    }),
  ]);

  const agencyTotal = agencyDiamondAgg._sum.diamonds ?? 0;
  const myTotal = diamondAgg._sum.diamonds ?? 0;
  const target = goalRow?.target ?? 0;

  let managerContributions: {
    id: string;
    name: string;
    diamonds: number;
  }[] = [];

  if (scope.admin) {
    const [rows, managerUsers] = await Promise.all([
      prisma.diamondControl.findMany({
        where: { agencySlug, period },
        select: {
          diamonds: true,
          username: true,
          creator: {
            select: {
              manager: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.user.findMany({
        where: { agencySlug, role: "manager" },
        select: {
          id: true,
          name: true,
          creators: { select: { name: true, tiktokUser: true } },
        },
      }),
    ]);

    const nickToManager = new Map<string, { id: string; name: string }>();
    const totals = new Map<string, { id: string; name: string; diamonds: number }>();

    for (const m of managerUsers) {
      totals.set(m.id, { id: m.id, name: m.name, diamonds: 0 });
      for (const c of m.creators) {
        nickToManager.set(cleanNick(c.name), { id: m.id, name: m.name });
        const nick = cleanNick(c.tiktokUser || "");
        if (nick) nickToManager.set(nick, { id: m.id, name: m.name });
      }
    }

    let unassigned = 0;
    for (const row of rows) {
      const fromCreator = row.creator?.manager;
      const fromNick = nickToManager.get(cleanNick(row.username));
      const mgr = fromCreator
        ? { id: fromCreator.id, name: fromCreator.name }
        : fromNick;
      if (!mgr) {
        unassigned += row.diamonds;
        continue;
      }
      const prev = totals.get(mgr.id) ?? {
        id: mgr.id,
        name: mgr.name,
        diamonds: 0,
      };
      prev.diamonds += row.diamonds;
      totals.set(mgr.id, prev);
    }

    managerContributions = [...totals.values()].sort(
      (a, b) => b.diamonds - a.diamonds
    );
    if (unassigned > 0) {
      managerContributions.push({
        id: "unassigned",
        name: "Sin manager",
        diamonds: unassigned,
      });
    }
  }

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
      diamonds: myTotal,
      hours: Math.round(diamondAgg._sum.hours ?? 0),
      diamondUsers: diamondAgg._count._all,
    },
    diamondGoal: {
      target,
      agencyTotal,
      myTotal,
      canEdit: Boolean(isAdminUser),
      isManagerView: !scope.admin,
      updatedAt: goalRow?.updatedAt ?? null,
      managers: managerContributions,
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

const patchSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  target: z.number().int().min(0).max(1_000_000_000),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, isAdmin: isAdminUser, token } = auth;

  if (!isAdminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { period, target } = parsed.data;
  const updatedBy =
    typeof token.id === "string"
      ? token.id
      : typeof token.sub === "string"
        ? token.sub
        : null;

  const row = await prisma.monthlyDiamondGoal.upsert({
    where: { agencySlug_period: { agencySlug, period } },
    create: { agencySlug, period, target, updatedBy },
    update: { target, updatedBy },
    select: { target: true, updatedAt: true, period: true },
  });

  return NextResponse.json({ ok: true, ...row });
}
