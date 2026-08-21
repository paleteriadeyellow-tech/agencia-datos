import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import {
  assertCreatorAccess,
  cleanNick,
  creatorWhere,
} from "@/lib/creator-scope";
import { prisma } from "@/lib/prisma";
import {
  currentMonth,
  pctChange,
  periodMeta,
  prevPeriod,
  weekBounds,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

function parsePeriod(raw: string | null) {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return currentMonth();
  return raw;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, scope, token } = auth;
  const scopeFilter = creatorWhere(scope, agencySlug);
  const period = parsePeriod(req.nextUrl.searchParams.get("period"));
  const previous = prevPeriod(period);
  const meta = periodMeta(period);
  const week = weekBounds();
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [
    creators,
    diamondNow,
    diamondPrev,
    goals,
    kpiRows,
    contracts,
    schedules,
    importLogs,
    templates,
    agencyGoal,
    managerUsers,
    rosterAll,
  ] = await Promise.all([
    prisma.creator.findMany({
      where: scopeFilter,
      select: {
        id: true,
        name: true,
        phone: true,
        niche: true,
        country: true,
        status: true,
        tiktokUser: true,
        livecoinsStatus: true,
        managerId: true,
        manager: { select: { id: true, name: true } },
        metrics: {
          orderBy: { date: "desc" },
          take: 1,
          select: { date: true },
        },
        portalToken: { select: { token: true } },
      },
    }),
    prisma.diamondControl.findMany({
      where: { agencySlug, period },
      select: {
        username: true,
        diamonds: true,
        hours: true,
        days: true,
        creatorId: true,
        creator: { select: { id: true, managerId: true } },
      },
    }),
    prisma.diamondControl.findMany({
      where: { agencySlug, period: previous },
      select: {
        username: true,
        diamonds: true,
        hours: true,
        days: true,
        creatorId: true,
        creator: { select: { id: true, managerId: true } },
      },
    }),
    prisma.creatorGoal.findMany({
      where: { agencySlug, period },
    }),
    prisma.kpiRecord.findMany({
      where: { agencySlug, period },
      select: { nombre: true },
    }),
    prisma.contract.findMany({
      where: { agencySlug },
      select: {
        creatorId: true,
        status: true,
        endDate: true,
        title: true,
      },
    }),
    prisma.liveSchedule.findMany({
      where: {
        startAt: { gte: week.start, lte: week.end },
        creator: scopeFilter,
      },
      include: { creator: { select: { id: true, name: true, tiktokUser: true } } },
      orderBy: { startAt: "asc" },
    }),
    prisma.diamondImportLog.findMany({
      where: { agencySlug, period },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.waTemplate.findMany({
      where: { agencySlug },
      orderBy: { createdAt: "desc" },
    }),
    prisma.monthlyDiamondGoal.findUnique({
      where: { agencySlug_period: { agencySlug, period } },
      select: { target: true },
    }),
    prisma.user.findMany({
      where: { agencySlug },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.creator.findMany({
      where: { agencySlug },
      select: {
        id: true,
        name: true,
        tiktokUser: true,
        status: true,
        managerId: true,
      },
    }),
  ]);

  const creatorById = new Map(creators.map((c) => [c.id, c]));
  const creatorByNick = new Map<string, (typeof creators)[0]>();
  for (const c of creators) {
    creatorByNick.set(cleanNick(c.name), c);
    if (c.tiktokUser) creatorByNick.set(cleanNick(c.tiktokUser), c);
  }

  const inScopeNick = (username: string, creatorId: string | null) => {
    if (scope.admin) return true;
    if (creatorId && creatorById.has(creatorId)) return true;
    return creatorByNick.has(cleanNick(username));
  };

  type Totals = { diamonds: number; hours: number; days: number };
  const empty = (): Totals => ({ diamonds: 0, hours: 0, days: 0 });
  const nowByCreator = new Map<string, Totals>();
  const prevByCreator = new Map<string, Totals>();
  let nowAgency = empty();
  let prevAgency = empty();

  function addTo(
    map: Map<string, Totals>,
    agency: Totals,
    row: {
      username: string;
      diamonds: number;
      hours: number;
      days?: number;
      creatorId: string | null;
    }
  ) {
    if (!inScopeNick(row.username, row.creatorId)) return;
    const c =
      (row.creatorId && creatorById.get(row.creatorId)) ||
      creatorByNick.get(cleanNick(row.username));
    const key = c?.id ?? `nick:${cleanNick(row.username)}`;
    const prev = map.get(key) ?? empty();
    prev.diamonds += row.diamonds;
    prev.hours += row.hours;
    prev.days += row.days ?? 0;
    map.set(key, prev);
    agency.diamonds += row.diamonds;
    agency.hours += row.hours;
    agency.days += row.days ?? 0;
  }

  for (const row of diamondNow) addTo(nowByCreator, nowAgency, row);
  for (const row of diamondPrev) addTo(prevByCreator, prevAgency, row);

  const goalByCreator = new Map(goals.map((g) => [g.creatorId, g]));
  const kpiNicks = new Set(kpiRows.map((k) => cleanNick(k.nombre)));

  const contractsByCreator = new Map<string, typeof contracts>();
  for (const ct of contracts) {
    const list = contractsByCreator.get(ct.creatorId) ?? [];
    list.push(ct);
    contractsByCreator.set(ct.creatorId, list);
  }

  const managerMap = new Map<
    string,
    { id: string; name: string; diamonds: number; hours: number; active: number }
  >();
  const rosterById = new Map(rosterAll.map((c) => [c.id, c]));
  const nickToManager = new Map<string, string>();
  for (const c of rosterAll) {
    if (!c.managerId) continue;
    nickToManager.set(cleanNick(c.name), c.managerId);
    if (c.tiktokUser) nickToManager.set(cleanNick(c.tiktokUser), c.managerId);
  }
  const managerIdsWithRoster = new Set(
    rosterAll.map((c) => c.managerId).filter((id): id is string => Boolean(id))
  );
  for (const u of managerUsers) {
    if (u.role !== "manager" && !managerIdsWithRoster.has(u.id)) continue;
    managerMap.set(u.id, {
      id: u.id,
      name: u.name,
      diamonds: 0,
      hours: 0,
      active: 0,
    });
  }
  for (const c of rosterAll) {
    if (!c.managerId) continue;
    const row = managerMap.get(c.managerId);
    if (row && c.status === "activo") row.active += 1;
  }
  for (const row of diamondNow) {
    const fromCreator = row.creatorId
      ? rosterById.get(row.creatorId)?.managerId
      : null;
    const managerId =
      fromCreator ?? nickToManager.get(cleanNick(row.username)) ?? null;
    if (!managerId) continue;
    const entry = managerMap.get(managerId);
    if (!entry) continue;
    entry.diamonds += row.diamonds;
    entry.hours += row.hours;
  }

  const nicheMap = new Map<string, number>();
  const countryMap = new Map<string, number>();
  for (const c of creators) {
    const stats = nowByCreator.get(c.id);
    const d = stats?.diamonds ?? 0;
    nicheMap.set(c.niche || "Otros", (nicheMap.get(c.niche || "Otros") ?? 0) + d);
    const country = (c.country || "MX").toUpperCase();
    countryMap.set(country, (countryMap.get(country) ?? 0) + d);
  }

  const creatorCards = creators
    .filter((c) => c.status === "activo")
    .map((c) => {
      const stats = nowByCreator.get(c.id) ?? empty();
      const prev = prevByCreator.get(c.id) ?? empty();
      const goal = goalByCreator.get(c.id);
      const lastLive = c.metrics[0]?.date ?? null;
      const drop =
        prev.diamonds > 0
          ? ((stats.diamonds - prev.diamonds) / prev.diamonds) * 100
          : 0;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        niche: c.niche,
        country: c.country,
        tiktokUser: c.tiktokUser,
        managerName: c.manager?.name ?? null,
        livecoinsStatus: c.livecoinsStatus,
        diamonds: stats.diamonds,
        hours: stats.hours,
        days: stats.days,
        prevDiamonds: prev.diamonds,
        dropPct: drop,
        lastLive,
        targetDiamonds: goal?.targetDiamonds ?? 0,
        targetHours: goal?.targetHours ?? 0,
        portalToken: c.portalToken?.token ?? null,
      };
    })
    .sort((a, b) => b.diamonds - a.diamonds);

  const alerts: {
    id: string;
    creatorId: string;
    name: string;
    phone: string;
    country: string | null;
    type: string;
    label: string;
    severity: "warning" | "danger" | "cyan";
  }[] = [];

  for (const c of creators) {
    if (c.status !== "activo") continue;
    const stats = nowByCreator.get(c.id) ?? empty();
    const prev = prevByCreator.get(c.id) ?? empty();
    const last = c.metrics[0]?.date;
    const cts = contractsByCreator.get(c.id) ?? [];
    const activeCt = cts.find((x) => x.status === "activo");
    const nick = cleanNick(c.tiktokUser || c.name);

    if (!last || last < fourteenDaysAgo) {
      alerts.push({
        id: `inactive-${c.id}`,
        creatorId: c.id,
        name: c.name,
        phone: c.phone,
        country: c.country,
        type: "inactive",
        label: "Sin LIVE reciente (14+ días)",
        severity: "warning",
      });
    }
    if (prev.diamonds >= 20000 && stats.diamonds < prev.diamonds * 0.7) {
      alerts.push({
        id: `drop-${c.id}`,
        creatorId: c.id,
        name: c.name,
        phone: c.phone,
        country: c.country,
        type: "drop",
        label: `Cayó ${Math.round(((prev.diamonds - stats.diamonds) / prev.diamonds) * 100)}% vs mes anterior`,
        severity: "danger",
      });
    }
    if (c.livecoinsStatus === "pendiente") {
      alerts.push({
        id: `livecoins-${c.id}`,
        creatorId: c.id,
        name: c.name,
        phone: c.phone,
        country: c.country,
        type: "livecoins",
        label: "App Livecoins pendiente",
        severity: "cyan",
      });
    }
    if (!kpiNicks.has(nick) && !kpiNicks.has(cleanNick(c.name))) {
      alerts.push({
        id: `kpi-${c.id}`,
        creatorId: c.id,
        name: c.name,
        phone: c.phone,
        country: c.country,
        type: "kpi",
        label: "Sin envío de KPI este mes",
        severity: "warning",
      });
    }
    if (!activeCt) {
      alerts.push({
        id: `nocontract-${c.id}`,
        creatorId: c.id,
        name: c.name,
        phone: c.phone,
        country: c.country,
        type: "nocontract",
        label: "Sin contrato activo",
        severity: "warning",
      });
    } else if (activeCt.endDate && activeCt.endDate <= in30) {
      alerts.push({
        id: `expiring-${c.id}`,
        creatorId: c.id,
        name: c.name,
        phone: c.phone,
        country: c.country,
        type: "expiring",
        label: `Contrato por vencer (${activeCt.title})`,
        severity: "danger",
      });
    }
  }

  const severityRank = { danger: 0, warning: 1, cyan: 2 };
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const atRisk = creatorCards
    .filter((c) => c.diamonds === 0 || c.days < 10 || (c.lastLive && new Date(c.lastLive) < fourteenDaysAgo))
    .slice(0, 5);
  const top = creatorCards.filter((c) => c.diamonds > 0).slice(0, 3);

  const dailyPace = nowAgency.diamonds / meta.dayElapsed;
  const projected = Math.round(dailyPace * meta.daysInMonth);
  const target = agencyGoal?.target ?? 0;
  const needPerDay =
    target > nowAgency.diamonds && meta.daysLeft > 0
      ? Math.ceil((target - nowAgency.diamonds) / meta.daysLeft)
      : 0;

  return NextResponse.json({
    period,
    previous,
    viewer: { id: token.id, name: token.name ?? "", isManagerView: !scope.admin },
    trend: {
      diamonds: nowAgency.diamonds,
      hours: nowAgency.hours,
      prevDiamonds: prevAgency.diamonds,
      prevHours: prevAgency.hours,
      diamondsPct: pctChange(nowAgency.diamonds, prevAgency.diamonds),
      hoursPct: pctChange(nowAgency.hours, prevAgency.hours),
    },
    projection: {
      dayElapsed: meta.dayElapsed,
      daysInMonth: meta.daysInMonth,
      daysLeft: meta.daysLeft,
      dailyPace: Math.round(dailyPace),
      projected,
      target,
      needPerDay,
    },
    podium: top,
    checkin: { atRisk, top },
    alerts: alerts.slice(0, 40),
    managers: [...managerMap.values()].sort((a, b) => b.diamonds - a.diamonds),
    niches: [...nicheMap.entries()]
      .map(([name, diamonds]) => ({ name, diamonds }))
      .sort((a, b) => b.diamonds - a.diamonds),
    countries: [...countryMap.entries()]
      .map(([name, diamonds]) => ({ name, diamonds }))
      .sort((a, b) => b.diamonds - a.diamonds),
    goals: creatorCards
      .filter((c) => c.targetDiamonds > 0 || c.targetHours > 0)
      .slice(0, 12),
    calendar: schedules.map((s) => ({
      id: s.id,
      startAt: s.startAt,
      durationMin: s.durationMin,
      status: s.status,
      notes: s.notes,
      creatorId: s.creatorId,
      creatorName: s.creator.name,
      username: s.creator.tiktokUser,
    })),
    importLogs: importLogs.map((l) => ({
      id: l.id,
      period: l.period,
      userName: l.userName,
      filename: l.filename,
      upserted: l.upserted,
      skipped: l.skipped,
      createdAt: l.createdAt,
    })),
    templates,
  });
}

const postSchema = z.object({
  action: z.enum([
    "note",
    "goal",
    "template",
    "delete-template",
    "schedule",
    "portal",
    "task",
  ]),
  creatorId: z.string().optional(),
  body: z.string().optional(),
  period: z.string().optional(),
  targetDiamonds: z.number().optional(),
  targetHours: z.number().optional(),
  name: z.string().optional(),
  id: z.string().optional(),
  startAt: z.string().optional(),
  durationMin: z.number().optional(),
  notes: z.string().optional(),
  title: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, scope, token } = auth;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const data = parsed.data;
  const period = parsePeriod(data.period ?? null);

  if (data.action === "template") {
    const name = (data.name || "").trim();
    const body = (data.body || "").trim();
    if (!name || !body) {
      return NextResponse.json({ error: "Nombre y texto son obligatorios" }, { status: 400 });
    }
    const row = await prisma.waTemplate.create({
      data: { agencySlug, name, body },
    });
    return NextResponse.json({ ok: true, row });
  }

  if (data.action === "delete-template") {
    if (!data.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    await prisma.waTemplate.deleteMany({ where: { id: data.id, agencySlug } });
    return NextResponse.json({ ok: true });
  }

  if (!data.creatorId) {
    return NextResponse.json({ error: "Falta creador" }, { status: 400 });
  }
  const access = await assertCreatorAccess(scope, data.creatorId, agencySlug);
  if (access) return access;

  if (data.action === "note") {
    const body = (data.body || "").trim();
    if (!body) return NextResponse.json({ error: "Escribe una nota" }, { status: 400 });
    const row = await prisma.creatorNote.create({
      data: {
        creatorId: data.creatorId,
        authorId: typeof token.id === "string" ? token.id : null,
        authorName: String(token.name ?? "Manager"),
        body,
      },
    });
    return NextResponse.json({ ok: true, row });
  }

  if (data.action === "goal") {
    const row = await prisma.creatorGoal.upsert({
      where: {
        creatorId_period: { creatorId: data.creatorId, period },
      },
      create: {
        agencySlug,
        creatorId: data.creatorId,
        period,
        targetDiamonds: Math.max(0, Math.floor(data.targetDiamonds ?? 0)),
        targetHours: Math.max(0, data.targetHours ?? 0),
      },
      update: {
        targetDiamonds: Math.max(0, Math.floor(data.targetDiamonds ?? 0)),
        targetHours: Math.max(0, data.targetHours ?? 0),
      },
    });
    return NextResponse.json({ ok: true, row });
  }

  if (data.action === "schedule") {
    if (!data.startAt) {
      return NextResponse.json({ error: "Falta fecha" }, { status: 400 });
    }
    const row = await prisma.liveSchedule.create({
      data: {
        creatorId: data.creatorId,
        startAt: new Date(data.startAt),
        durationMin: Math.max(15, Math.floor(data.durationMin ?? 120)),
        notes: data.notes?.trim() || null,
      },
    });
    return NextResponse.json({ ok: true, row });
  }

  if (data.action === "portal") {
    await prisma.creatorPortalToken.deleteMany({
      where: { creatorId: data.creatorId },
    });
    const row = await prisma.creatorPortalToken.create({
      data: { agencySlug, creatorId: data.creatorId },
    });
    return NextResponse.json({ ok: true, token: row.token });
  }

  if (data.action === "task") {
    const title = (data.title || "").trim();
    if (!title) return NextResponse.json({ error: "Falta título" }, { status: 400 });
    const row = await prisma.task.create({
      data: {
        agencySlug,
        title,
        creatorId: data.creatorId,
        assigneeId: typeof token.id === "string" ? token.id : null,
        priority: "alta",
        status: "pendiente",
        period,
      },
    });
    return NextResponse.json({ ok: true, row });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
