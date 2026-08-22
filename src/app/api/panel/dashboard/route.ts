import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import {
  cleanNick,
  creatorWhere,
  diamondWhere,
  userIdFromToken,
} from "@/lib/creator-scope";
import { isMissingSchema, prisma } from "@/lib/prisma";
import { currentMonth, monthRange } from "@/lib/utils";

export const dynamic = "force-dynamic";

function parsePeriod(raw: string | null) {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return currentMonth();
  return raw;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  try {
  const { agencySlug, scope, isAdmin: isAdminUser, token } = auth;
  const currentUserId = userIdFromToken(token) ?? null;
  const scopeFilter = creatorWhere(scope, agencySlug);
  const myDiamondWhere = await diamondWhere(scope, agencySlug);

  const period = parsePeriod(req.nextUrl.searchParams.get("period"));
  const { start, end } = monthRange(period);
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const managerGoalRows = await prisma.managerMonthlyGoal
    .findMany({
      where: { agencySlug, period },
      select: { managerId: true, target: true },
    })
    .catch((e) => {
      if (isMissingSchema(e)) return [];
      throw e;
    });

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
        creator: {
          select: { id: true, name: true, niche: true, managerId: true },
        },
      },
      orderBy: [{ diamonds: "desc" }, { username: "asc" }],
      take: 80,
    }),
    prisma.task.findMany({
      where: scope.admin
        ? { agencySlug, status: { in: ["pendiente", "en_progreso"] } }
        : {
            agencySlug,
            status: { in: ["pendiente", "en_progreso"] },
            OR: [{ creatorId: null }, { creator: scopeFilter }],
          },
      include: {
        creator: { select: { name: true, managerId: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 40,
    }),
    prisma.creator.findMany({
      where: { ...scopeFilter, status: "activo" },
      select: {
        id: true,
        name: true,
        managerId: true,
        metrics: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const agencyTotal = agencyDiamondAgg._sum.diamonds ?? 0;
  const myTotal = diamondAgg._sum.diamonds ?? 0;
  const target = goalRow?.target ?? 0;

  const managerTargetById = new Map(
    managerGoalRows.map((g) => [g.managerId, g.target])
  );

  let managerContributions: {
    id: string;
    name: string;
    diamonds: number;
    target: number;
  }[] = [];
  const kpisByManager: Record<
    string,
    {
      totalCreators: number;
      activeCreators: number;
      newCreators: number;
      diamonds: number;
      hours: number;
      diamondUsers: number;
    }
  > = {};

  if (scope.admin) {
    const [rows, managerUsers] = await Promise.all([
      prisma.diamondControl.findMany({
        where: { agencySlug, period },
        select: {
          diamonds: true,
          hours: true,
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
          creators: {
            select: {
              name: true,
              tiktokUser: true,
              status: true,
              joinDate: true,
            },
          },
        },
      }),
    ]);

    const nickToManager = new Map<string, { id: string; name: string }>();
    const totals = new Map<
      string,
      { id: string; name: string; diamonds: number; target: number }
    >();

    for (const m of managerUsers) {
      totals.set(m.id, {
        id: m.id,
        name: m.name,
        diamonds: 0,
        target: managerTargetById.get(m.id) ?? 0,
      });
      kpisByManager[m.id] = {
        totalCreators: m.creators.length,
        activeCreators: m.creators.filter((c) => c.status === "activo").length,
        newCreators: m.creators.filter(
          (c) => c.joinDate >= start && c.joinDate <= end
        ).length,
        diamonds: 0,
        hours: 0,
        diamondUsers: 0,
      };
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
        target: managerTargetById.get(mgr.id) ?? 0,
      };
      prev.diamonds += row.diamonds;
      totals.set(mgr.id, prev);
      const kpis = kpisByManager[mgr.id];
      if (kpis) {
        kpis.diamonds += row.diamonds;
        kpis.hours += row.hours;
        kpis.diamondUsers += 1;
      }
    }

    managerContributions = [...totals.values()].sort(
      (a, b) => b.diamonds - a.diamonds
    );
    if (unassigned > 0) {
      managerContributions.push({
        id: "unassigned",
        name: "Sin manager",
        diamonds: unassigned,
        target: 0,
      });
    }
  }

  const inactiveCreators = activeWithLatest
    .filter((c) => {
      const last = c.metrics[0]?.date;
      return !last || last < fourteenDaysAgo;
    })
    .map((c) => ({ id: c.id, name: c.name, managerId: c.managerId }));

  for (const id of Object.keys(kpisByManager)) {
    kpisByManager[id]!.hours = Math.round(kpisByManager[id]!.hours);
  }

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
    kpisByManager,
    diamondGoal: {
      target,
      myTarget: currentUserId
        ? (managerTargetById.get(currentUserId) ?? 0)
        : 0,
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
      managerId: row.creator?.managerId ?? null,
    })),
    pendingTasks: pendingTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate,
      creatorName: t.creator?.name ?? "General",
      creatorId: t.creatorId,
      managerId: t.creator?.managerId ?? null,
    })),
    inactiveCreators,
  });
  } catch (e) {
    console.error("dashboard GET", e);
    return NextResponse.json(
      { error: "No se pudo cargar el overview. Reintenta." },
      { status: 500 }
    );
  }
}

const patchSchema = z
  .object({
    period: z.string().regex(/^\d{4}-\d{2}$/),
    target: z.number().int().min(0).max(1_000_000_000).optional(),
    managerId: z.string().min(1).optional(),
    managerTarget: z.number().int().min(0).max(1_000_000_000).optional(),
    managerTargets: z
      .array(
        z.object({
          id: z.string().min(1),
          target: z.number().int().min(0).max(1_000_000_000),
        })
      )
      .optional(),
  })
  .refine(
    (d) =>
      d.target !== undefined ||
      d.managerTarget !== undefined ||
      (d.managerTargets && d.managerTargets.length > 0),
    { message: "Nada que guardar" }
  );

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

  const { period, target, managerId, managerTarget, managerTargets } =
    parsed.data;
  const updatedBy =
    typeof token.id === "string"
      ? token.id
      : typeof token.sub === "string"
        ? token.sub
        : null;

  const toSave: { id: string; target: number }[] = [
    ...(managerTargets ?? []),
    ...(managerId && managerTarget !== undefined
      ? [{ id: managerId, target: managerTarget }]
      : []),
  ].filter((m) => m.id !== "unassigned");

  if (toSave.length > 0) {
    const validManagers = await prisma.user.findMany({
      where: {
        agencySlug,
        role: "manager",
        id: { in: toSave.map((m) => m.id) },
      },
      select: { id: true },
    });
    const allowed = new Set(validManagers.map((m) => m.id));
    const ops = toSave
      .filter((m) => allowed.has(m.id))
      .map((m) =>
        prisma.managerMonthlyGoal.upsert({
          where: {
            agencySlug_period_managerId: {
              agencySlug,
              period,
              managerId: m.id,
            },
          },
          create: {
            agencySlug,
            period,
            managerId: m.id,
            target: m.target,
          },
          update: { target: m.target },
        })
      );
    if (ops.length) {
      try {
        await prisma.$transaction(ops);
      } catch (e) {
        if (!isMissingSchema(e)) throw e;
        return NextResponse.json(
          { error: "Falta actualizar la base. Corre prisma db push." },
          { status: 500 }
        );
      }
    }
  }

  if (target !== undefined) {
    const row = await prisma.monthlyDiamondGoal.upsert({
      where: { agencySlug_period: { agencySlug, period } },
      create: { agencySlug, period, target, updatedBy },
      update: { target, updatedBy },
      select: { target: true, updatedAt: true, period: true },
    });
    return NextResponse.json({ ok: true, ...row });
  }

  return NextResponse.json({ ok: true, period });
}
