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
  formatNumber,
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

  const [
    creators,
    diamondNow,
    diamondPrev,
    goals,
    _kpiRows,
    _contracts,
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
      include: {
        creator: {
          select: { id: true, name: true, tiktokUser: true, managerId: true },
        },
      },
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

  function statsForCreator(c: { id: string; name: string; tiktokUser: string | null }) {
    return (
      nowByCreator.get(c.id) ??
      (c.tiktokUser
        ? nowByCreator.get(`nick:${cleanNick(c.tiktokUser)}`)
        : undefined) ??
      nowByCreator.get(`nick:${cleanNick(c.name)}`) ??
      empty()
    );
  }

  function prevForCreator(c: { id: string; name: string; tiktokUser: string | null }) {
    return (
      prevByCreator.get(c.id) ??
      (c.tiktokUser
        ? prevByCreator.get(`nick:${cleanNick(c.tiktokUser)}`)
        : undefined) ??
      prevByCreator.get(`nick:${cleanNick(c.name)}`) ??
      empty()
    );
  }

  function hasImportRow(c: { id: string; name: string; tiktokUser: string | null }) {
    if (nowByCreator.has(c.id)) return true;
    if (c.tiktokUser && nowByCreator.has(`nick:${cleanNick(c.tiktokUser)}`)) {
      return true;
    }
    return nowByCreator.has(`nick:${cleanNick(c.name)}`);
  }
  const creatorCards = creators
    .filter((c) => c.status === "activo")
    .map((c) => {
      const stats = statsForCreator(c);
      const prev = prevForCreator(c);
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
        managerId: c.managerId,
        managerName: c.manager?.name ?? null,
        livecoinsStatus: c.livecoinsStatus,
        diamonds: stats.diamonds,
        hours: stats.hours,
        days: stats.days,
        prevDiamonds: prev.diamonds,
        prevHours: prev.hours,
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
    diamonds: number;
    days: number;
    hours: number;
    managerId: string | null;
  }[] = [];

  const hasDiamondImport = diamondNow.length > 0;
  const importedDiamonds = [...nowByCreator.values()]
    .map((s) => s.diamonds)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  const lowDiamondCut =
    importedDiamonds.length >= 4
      ? importedDiamonds[Math.floor(importedDiamonds.length * 0.25)]!
      : 15000;
  const lowDaysCut = Math.max(3, Math.floor(meta.dayElapsed * 0.45));

  function pushAlert(
    c: (typeof creators)[0],
    type: string,
    label: string,
    severity: "warning" | "danger" | "cyan"
  ) {
    const stats = statsForCreator(c);
    alerts.push({
      id: `${type}-${c.id}`,
      creatorId: c.id,
      name: c.name,
      phone: c.phone,
      country: c.country,
      type,
      label,
      severity,
      diamonds: stats.diamonds,
      days: stats.days,
      hours: stats.hours,
      managerId: c.managerId,
    });
  }

  for (const c of creators) {
    if (c.status !== "activo") continue;
    const stats = statsForCreator(c);
    const prev = prevForCreator(c);
    const inFile = hasImportRow(c);
    const goal = goalByCreator.get(c.id);

    if (!hasDiamondImport || !inFile) continue;

    if (stats.days <= 0) {
      pushAlert(
        c,
        "nodays",
        `0 días transmitidos · ${formatNumber(stats.diamonds)} ◆`,
        "danger"
      );
      continue;
    }

    const fewDays = stats.days < lowDaysCut;
    const lowDiamonds = stats.diamonds <= lowDiamondCut;
    if (fewDays && lowDiamonds) {
      pushAlert(
        c,
        "low",
        `Va bajo: ${formatNumber(stats.diamonds)} ◆ · ${stats.days}d de ~${meta.dayElapsed} · ${stats.hours.toFixed(0)}h`,
        "warning"
      );
    } else if (fewDays) {
      pushAlert(
        c,
        "lowdays",
        `Pocos días LIVE (${stats.days} de ~${meta.dayElapsed}) · ${formatNumber(stats.diamonds)} ◆`,
        "warning"
      );
    } else if (lowDiamonds) {
      pushAlert(
        c,
        "low",
        `Va bajo: ${formatNumber(stats.diamonds)} ◆ · ${stats.days}d · ${stats.hours.toFixed(0)}h`,
        "warning"
      );
    }

    if (goal && goal.targetDiamonds > 0 && stats.diamonds < goal.targetDiamonds * 0.4) {
      const pct = Math.round((stats.diamonds / goal.targetDiamonds) * 100);
      pushAlert(
        c,
        "goal",
        `Lejos de su meta (${pct}% · ${formatNumber(stats.diamonds)} / ${formatNumber(goal.targetDiamonds)})`,
        "warning"
      );
    }

    if (prev.diamonds >= 20000 && stats.diamonds < prev.diamonds * 0.7) {
      pushAlert(
        c,
        "drop",
        `Cayó ${Math.round(((prev.diamonds - stats.diamonds) / prev.diamonds) * 100)}% vs mes anterior`,
        "danger"
      );
    }
  }

  const severityRank = { danger: 0, warning: 1, cyan: 2 };
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const atRiskIds = new Set(
    alerts
      .filter((a) => a.type === "nodays" || a.type === "lowdays" || a.type === "low")
      .map((a) => a.creatorId)
  );
  const atRisk = creatorCards.filter((c) => atRiskIds.has(c.id)).slice(0, 5);
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
    alerts,
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
      managerId: s.creator.managerId,
    })),
    roster: creatorCards.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      niche: c.niche,
      country: c.country,
      tiktokUser: c.tiktokUser,
      managerId: c.managerId,
      diamonds: c.diamonds,
      hours: c.hours,
      days: c.days,
      prevDiamonds: c.prevDiamonds,
      prevHours: c.prevHours,
      targetDiamonds: c.targetDiamonds,
      targetHours: c.targetHours,
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
