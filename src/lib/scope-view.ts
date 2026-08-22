import { pctChange } from "@/lib/utils";

export function nickKey(value: string) {
  return value.replace(/^@/, "").trim().toLowerCase();
}

export function filterByManagerId<T extends { managerId?: string | null }>(
  items: T[],
  viewAsId: string | null | undefined
) {
  if (!viewAsId) return items;
  return items.filter((item) => item.managerId === viewAsId);
}

export type HubRosterRow = {
  id: string;
  name: string;
  phone: string;
  niche: string | null;
  country: string | null;
  tiktokUser: string | null;
  managerId: string | null;
  diamonds: number;
  hours: number;
  days: number;
  prevDiamonds: number;
  prevHours: number;
  targetDiamonds: number;
  targetHours: number;
};

export type ScopedHub = {
  trend: {
    diamonds: number;
    hours: number;
    prevDiamonds: number;
    prevHours: number;
    diamondsPct: number;
    hoursPct: number;
  };
  projection: {
    dayElapsed: number;
    daysInMonth: number;
    daysLeft: number;
    dailyPace: number;
    projected: number;
    target: number;
    needPerDay: number;
  };
  podium: {
    id: string;
    name: string;
    tiktokUser: string | null;
    diamonds: number;
    hours: number;
    days: number;
  }[];
  checkin: {
    atRisk: { id: string; name: string; diamonds: number; days: number }[];
    top: { id: string; name: string; diamonds: number }[];
  };
  alerts: {
    id: string;
    creatorId: string;
    name: string;
    phone: string;
    country: string | null;
    type: string;
    label: string;
    severity: "warning" | "danger" | "cyan";
    diamonds?: number;
    days?: number;
    hours?: number;
    managerId?: string | null;
  }[];
  managers: {
    id: string;
    name: string;
    diamonds: number;
    hours: number;
    active: number;
  }[];
  niches: { name: string; diamonds: number }[];
  countries: { name: string; diamonds: number }[];
  goals: {
    id: string;
    name: string;
    diamonds: number;
    hours: number;
    targetDiamonds: number;
    targetHours: number;
    tiktokUser: string | null;
    managerId?: string | null;
  }[];
  calendar: {
    id: string;
    startAt: string;
    durationMin: number;
    creatorName: string;
    status: string;
    creatorId?: string;
    managerId?: string | null;
  }[];
  roster?: HubRosterRow[];
};

export function scopeHubData<T extends ScopedHub>(
  hub: T,
  viewAsId: string | null | undefined
): T {
  if (!viewAsId) return hub;
  if (!hub.roster?.length) {
    return {
      ...hub,
      alerts: hub.alerts.filter((a) => a.managerId === viewAsId),
      calendar: hub.calendar.filter((s) => s.managerId === viewAsId),
      goals: hub.goals.filter((g) => g.managerId === viewAsId),
    };
  }

  const roster = (hub.roster ?? []).filter((c) => c.managerId === viewAsId);
  const ids = new Set(roster.map((c) => c.id));

  const diamonds = roster.reduce((sum, c) => sum + c.diamonds, 0);
  const hours = roster.reduce((sum, c) => sum + c.hours, 0);
  const prevDiamonds = roster.reduce((sum, c) => sum + c.prevDiamonds, 0);
  const prevHours = roster.reduce((sum, c) => sum + c.prevHours, 0);

  const { dayElapsed, daysInMonth, daysLeft, target } = hub.projection;
  const dailyPace = dayElapsed > 0 ? diamonds / dayElapsed : 0;
  const projected = Math.round(dailyPace * daysInMonth);
  const needPerDay =
    target > diamonds && daysLeft > 0
      ? Math.ceil((target - diamonds) / daysLeft)
      : 0;

  const sorted = [...roster].sort((a, b) => b.diamonds - a.diamonds);
  const podium = sorted
    .filter((c) => c.diamonds > 0)
    .slice(0, 3)
    .map((c) => ({
      id: c.id,
      name: c.name,
      tiktokUser: c.tiktokUser,
      diamonds: c.diamonds,
      hours: c.hours,
      days: c.days,
    }));

  const alerts = hub.alerts.filter(
    (a) => a.managerId === viewAsId || ids.has(a.creatorId)
  );
  const atRiskIds = new Set(
    alerts
      .filter((a) => a.type === "nodays" || a.type === "lowdays" || a.type === "low")
      .map((a) => a.creatorId)
  );
  const atRisk = roster
    .filter((c) => atRiskIds.has(c.id))
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.name,
      diamonds: c.diamonds,
      days: c.days,
    }));

  const nicheMap = new Map<string, number>();
  const countryMap = new Map<string, number>();
  for (const c of roster) {
    nicheMap.set(c.niche || "Otros", (nicheMap.get(c.niche || "Otros") ?? 0) + c.diamonds);
    const country = (c.country || "MX").toUpperCase();
    countryMap.set(country, (countryMap.get(country) ?? 0) + c.diamonds);
  }

  return {
    ...hub,
    trend: {
      diamonds,
      hours,
      prevDiamonds,
      prevHours,
      diamondsPct: pctChange(diamonds, prevDiamonds),
      hoursPct: pctChange(hours, prevHours),
    },
    projection: {
      ...hub.projection,
      dailyPace: Math.round(dailyPace),
      projected,
      needPerDay,
    },
    podium,
    checkin: { atRisk, top: podium },
    alerts,
    niches: [...nicheMap.entries()]
      .map(([name, value]) => ({ name, diamonds: value }))
      .sort((a, b) => b.diamonds - a.diamonds),
    countries: [...countryMap.entries()]
      .map(([name, value]) => ({ name, diamonds: value }))
      .sort((a, b) => b.diamonds - a.diamonds),
    goals: roster
      .filter((c) => c.targetDiamonds > 0 || c.targetHours > 0)
      .slice(0, 12)
      .map((c) => ({
        id: c.id,
        name: c.name,
        diamonds: c.diamonds,
        hours: c.hours,
        targetDiamonds: c.targetDiamonds,
        targetHours: c.targetHours,
        tiktokUser: c.tiktokUser,
        managerId: c.managerId,
      })),
    calendar: hub.calendar.filter(
      (s) => s.managerId === viewAsId || (s.creatorId ? ids.has(s.creatorId) : false)
    ),
    roster,
  };
}

export type DashboardKpis = {
  totalCreators: number;
  activeCreators: number;
  newCreators: number;
  diamonds: number;
  hours: number;
  diamondUsers: number;
};

export type ScopedDashboard = {
  kpis: DashboardKpis;
  kpisByManager?: Record<string, DashboardKpis>;
  diamondGoal: {
    target: number;
    myTarget: number;
    agencyTotal: number;
    myTotal: number;
    canEdit: boolean;
    isManagerView?: boolean;
    updatedAt: string | null;
    managers: { id: string; name: string; diamonds: number; target: number }[];
  };
  topCreators: {
    rank: number;
    id: string;
    creatorId: string | null;
    username: string;
    name: string;
    niche: string;
    diamonds: number;
    hours: number;
    managerId?: string | null;
  }[];
  pendingTasks: {
    id: string;
    title: string;
    status: string;
    dueDate: string | null;
    creatorName: string;
    managerId?: string | null;
    creatorId?: string | null;
  }[];
  inactiveCreators: { id: string; name: string; managerId?: string | null }[];
};

export function scopeDashboardData<T extends ScopedDashboard>(
  data: T,
  viewAsId: string | null | undefined
): T {
  if (!viewAsId) {
    return {
      ...data,
      diamondGoal: { ...data.diamondGoal, isManagerView: false },
      topCreators: data.topCreators.slice(0, 5).map((row, i) => ({
        ...row,
        rank: i + 1,
      })),
      pendingTasks: data.pendingTasks.slice(0, 6),
      inactiveCreators: data.inactiveCreators.slice(0, 5),
    };
  }

  const kpis = data.kpisByManager?.[viewAsId] ?? {
    ...data.kpis,
    totalCreators: 0,
    activeCreators: 0,
    newCreators: 0,
    diamonds: 0,
    hours: 0,
    diamondUsers: 0,
  };
  const viewedManager = data.diamondGoal.managers.find((m) => m.id === viewAsId);
  const myTotal = viewedManager?.diamonds ?? kpis.diamonds;

  return {
    ...data,
    kpis,
    diamondGoal: {
      ...data.diamondGoal,
      myTotal,
      myTarget: viewedManager?.target ?? 0,
      isManagerView: true,
    },
    topCreators: data.topCreators
      .filter((row) => row.managerId === viewAsId)
      .slice(0, 5)
      .map((row, i) => ({ ...row, rank: i + 1 })),
    pendingTasks: data.pendingTasks
      .filter((t) => t.managerId === viewAsId || !t.creatorId)
      .slice(0, 6),
    inactiveCreators: data.inactiveCreators
      .filter((c) => c.managerId === viewAsId)
      .slice(0, 5),
  };
}
