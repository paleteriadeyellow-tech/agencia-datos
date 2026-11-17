import { prisma } from "@/lib/prisma";
import { AGENCIES, type AgencySlug } from "@/lib/agencies";
import { GOAL_TABLES, progressFor } from "@/lib/goal-levels";
import { whatsappUrl } from "@/lib/phone";
import { dayStart, generateTasksForAgency, todayKey } from "@/lib/task-generator";

/**
 * Robot diario: revisa cada agencia sola, sin que nadie entre al panel.
 * - Crea las tareas fijas del día.
 * - Detecta creadores en riesgo, cerca de subir de nivel y sin actividad.
 * - Prepara el mensaje de WhatsApp de cada creador (link listo para enviar).
 * - Le deja a cada manager una tarea "Robot: contactar creadores" con su lista.
 * - Avisa si los datos de Backstage están viejos, contratos por vencer y tareas atrasadas.
 */

/** Días sin subir datos de Backstage antes de avisar. */
const STALE_DATA_DAYS = 2;
/** Antes de este día del mes no se marca a nadie "sin actividad" (el mes apenas empieza). */
const MIN_DAY_FOR_INACTIVE = 4;
/** Avance (0–1) a partir del cual alguien está "cerca" de su siguiente nivel. */
const NEAR_LEVEL_RATIO = 0.85;
/** Contratos que vencen en estos días o menos. */
const CONTRACT_WARN_DAYS = 15;
/** Prefijo de las tareas que crea el robot (sirve para no duplicarlas). */
export const ROBOT_TASK_PREFIX = "🤖 Robot:";

export type RobotKind = "riesgo" | "cerca" | "sin_actividad";

export type RobotCreator = {
  creatorId: string;
  name: string;
  managerId: string | null;
  managerName: string | null;
  kind: RobotKind;
  diamonds: number;
  hours: number;
  days: number;
  level: number;
  reason: string;
  message: string;
  waLink: string | null;
};

export type RobotReport = {
  agencySlug: string;
  agencyName: string;
  today: string;
  period: string;
  dayOfMonth: number;
  daysInMonth: number;
  daysLeft: number;
  lastImportAt: string | null;
  dataAgeDays: number | null;
  dataStale: boolean;
  activeCreators: number;
  totalDiamonds: number;
  agencyGoal: number;
  projectedDiamonds: number;
  creators: RobotCreator[];
  contractsExpiring: { creator: string; title: string; endDate: string; daysLeft: number }[];
  overdueByManager: { managerId: string | null; managerName: string; count: number }[];
  tasksCreated: number;
  managerTasksCreated: number;
};

const clean = (v: string) => v.replace(/^@/, "").trim().toLowerCase();
const fmt = (n: number) => Math.round(n).toLocaleString("es-MX");
const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;

function monthInfo(today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // Días que quedan contando hoy (hoy todavía puede hacer LIVE).
  const daysLeft = daysInMonth - d + 1;
  return { period: today.slice(0, 7), dayOfMonth: d, daysInMonth, daysLeft };
}

function messageFor(kind: RobotKind, name: string, s: { diamonds: number; hours: number; days: number }, extra: string) {
  const n = firstName(name);
  if (kind === "sin_actividad") {
    return `Hola ${n} 👋 No te hemos visto en LIVE este mes. ¿Todo bien? Agenda hoy aunque sea 1 hora para arrancar el mes, aquí estamos para ayudarte 💪`;
  }
  if (kind === "cerca") {
    return `¡Hola ${n}! 🔥 Vas muy bien: ${fmt(s.diamonds)} diamantes, ${s.days} días y ${s.hours.toFixed(1)}h este mes. ${extra} ¡Ya casi subes de nivel, no aflojes! 💎`;
  }
  return `Hola ${n} 👋 Este mes llevas ${s.days} días y ${s.hours.toFixed(1)}h en LIVE. ${extra} Todavía estás a tiempo, ¿te apoyamos a organizar tus horarios? 💪`;
}

function missingText(m: { diamonds: number; days: number; hours: number }) {
  const parts: string[] = [];
  if (m.days > 0) parts.push(`${m.days} día${m.days === 1 ? "" : "s"}`);
  if (m.hours > 0) parts.push(`${m.hours.toFixed(1)}h`);
  if (m.diamonds > 0) parts.push(`${fmt(m.diamonds)} diamantes`);
  return parts.join(", ");
}

/** Arma el reporte del día (solo lee, no cambia nada). */
export async function buildRobotReport(agencySlug: AgencySlug, now = new Date()): Promise<RobotReport> {
  const today = todayKey(now);
  const { period, dayOfMonth, daysInMonth, daysLeft } = monthInfo(today);
  const todayStart = dayStart(today);

  const [creators, rows, lastImport, goal, contracts, overdue] = await Promise.all([
    prisma.creator.findMany({
      where: { agencySlug, status: "activo" },
      select: {
        id: true,
        name: true,
        phone: true,
        country: true,
        tiktokUser: true,
        managerId: true,
        manager: { select: { name: true } },
      },
    }),
    prisma.diamondControl.findMany({ where: { agencySlug, period } }),
    prisma.diamondImportLog.findFirst({ where: { agencySlug }, orderBy: { createdAt: "desc" } }),
    prisma.monthlyDiamondGoal.findUnique({ where: { agencySlug_period: { agencySlug, period } } }),
    prisma.contract.findMany({
      where: {
        agencySlug,
        status: "activo",
        endDate: { gte: todayStart, lte: new Date(todayStart.getTime() + CONTRACT_WARN_DAYS * 86400_000) },
      },
      include: { creator: { select: { name: true } } },
      orderBy: { endDate: "asc" },
    }),
    prisma.task.findMany({
      where: { agencySlug, status: { not: "hecha" }, dueDate: { lt: new Date(`${today}T00:00:00.000Z`) } },
      select: { assigneeId: true, assignee: { select: { name: true } } },
    }),
  ]);

  // Une las filas de Backstage con cada creador (por id o por usuario de TikTok / nombre).
  const byCreator = new Map<string, (typeof rows)[number]>();
  const byNick = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (r.creatorId) byCreator.set(r.creatorId, r);
    byNick.set(clean(r.username), r);
  }

  const levels = GOAL_TABLES.bonos.levels;
  const monthFraction = dayOfMonth / daysInMonth;
  const out: RobotCreator[] = [];

  for (const c of creators) {
    const row =
      byCreator.get(c.id) ??
      (c.tiktokUser ? byNick.get(clean(c.tiktokUser)) : undefined) ??
      byNick.get(clean(c.name));
    const s = { diamonds: row?.diamonds ?? 0, hours: row?.hours ?? 0, days: row?.days ?? 0 };
    const p = progressFor(levels, s);

    let kind: RobotKind | null = null;
    let reason = "";
    let extra = "";

    if (s.days === 0 && s.hours === 0) {
      if (dayOfMonth >= MIN_DAY_FOR_INACTIVE) {
        kind = "sin_actividad";
        reason = "Sin LIVE registrado este mes";
      }
    } else if (p.next) {
      const missing = missingText(p.missing);
      if (p.level === 0) {
        // Todavía no califica a ningún bono: ¿le alcanza el mes?
        const behind = Math.min(p.ratio.days, p.ratio.hours) < monthFraction * 0.8;
        if (p.missing.days > daysLeft) {
          kind = "riesgo";
          reason = `Ya no le alcanzan los días (le faltan ${p.missing.days}, quedan ${daysLeft})`;
          extra = `Te faltan ${missing} para el Nivel 1.`;
        } else if (behind) {
          kind = "riesgo";
          reason = `Va atrasado: le faltan ${missing} para el Nivel 1`;
          extra = `Te faltan ${missing} para el Nivel 1 y quedan ${daysLeft} días.`;
        }
      }
      if (!kind && p.overall >= NEAR_LEVEL_RATIO) {
        kind = "cerca";
        reason = `A punto del Nivel ${p.next.level}: le faltan ${missing}`;
        extra = `Te faltan ${missing} para el Nivel ${p.next.level}.`;
      }
    }

    if (!kind) continue;
    const message = messageFor(kind, c.name, s, extra);
    const base = c.phone ? whatsappUrl(c.phone, c.country) : null;
    out.push({
      creatorId: c.id,
      name: c.name,
      managerId: c.managerId,
      managerName: c.manager?.name ?? null,
      kind,
      diamonds: s.diamonds,
      hours: s.hours,
      days: s.days,
      level: p.level,
      reason,
      message,
      waLink: base ? `${base}?text=${encodeURIComponent(message)}` : null,
    });
  }

  const order: Record<RobotKind, number> = { riesgo: 0, sin_actividad: 1, cerca: 2 };
  out.sort((a, b) => order[a.kind] - order[b.kind] || b.diamonds - a.diamonds);

  const totalDiamonds = rows.reduce((a, r) => a + r.diamonds, 0);
  const lastImportAt = lastImport?.createdAt ?? null;
  const dataAgeDays = lastImportAt ? Math.floor((now.getTime() - lastImportAt.getTime()) / 86400_000) : null;

  const overdueMap = new Map<string, { managerId: string | null; managerName: string; count: number }>();
  for (const t of overdue) {
    const key = t.assigneeId ?? "none";
    const cur = overdueMap.get(key) ?? { managerId: t.assigneeId, managerName: t.assignee?.name ?? "Sin asignar", count: 0 };
    cur.count++;
    overdueMap.set(key, cur);
  }

  return {
    agencySlug,
    agencyName: AGENCIES[agencySlug].shortName,
    today,
    period,
    dayOfMonth,
    daysInMonth,
    daysLeft,
    lastImportAt: lastImportAt?.toISOString() ?? null,
    dataAgeDays,
    dataStale: dataAgeDays == null || dataAgeDays >= STALE_DATA_DAYS,
    activeCreators: creators.length,
    totalDiamonds,
    agencyGoal: goal?.target ?? 0,
    // Los datos de Backstage suelen llegar hasta ayer.
    projectedDiamonds: Math.round((totalDiamonds / Math.max(1, dayOfMonth - 1)) * daysInMonth),
    creators: out,
    contractsExpiring: contracts.map((k) => ({
      creator: k.creator.name,
      title: k.title,
      endDate: k.endDate!.toISOString().slice(0, 10),
      daysLeft: Math.ceil((k.endDate!.getTime() - todayStart.getTime()) / 86400_000),
    })),
    overdueByManager: [...overdueMap.values()].sort((a, b) => b.count - a.count),
    tasksCreated: 0,
    managerTasksCreated: 0,
  };
}

/** Le deja a cada manager (o sin asignar) una sola tarea del día con sus creadores a contactar. */
async function createManagerTasks(report: RobotReport) {
  const groups = new Map<string | null, RobotCreator[]>();
  for (const c of report.creators) {
    if (c.kind === "cerca" && !c.waLink) continue;
    const list = groups.get(c.managerId) ?? [];
    list.push(c);
    groups.set(c.managerId, list);
  }

  const label: Record<RobotKind, string> = { riesgo: "⚠️ En riesgo", sin_actividad: "😴 Sin LIVE", cerca: "🔥 Cerca de nivel" };
  let created = 0;
  for (const [managerId, list] of groups) {
    const title = `${ROBOT_TASK_PREFIX} contactar ${list.length} creador${list.length === 1 ? "" : "es"} (${report.today})`;
    const exists = await prisma.task.findFirst({
      where: {
        agencySlug: report.agencySlug,
        assigneeId: managerId,
        genKey: report.today,
        title: { startsWith: ROBOT_TASK_PREFIX },
      },
      select: { id: true },
    });
    if (exists) continue;

    const description = list
      .map((c) => `${label[c.kind]} · ${c.name} — ${c.reason}${c.waLink ? `\n${c.waLink}` : "\n(sin teléfono registrado)"}`)
      .join("\n\n");
    await prisma.task.create({
      data: {
        agencySlug: report.agencySlug,
        title,
        description,
        assigneeId: managerId,
        priority: list.some((c) => c.kind === "riesgo") ? "alta" : "media",
        status: "pendiente",
        period: report.period,
        dueDate: new Date(`${report.today}T00:00:00.000Z`),
        genKey: report.today,
      },
    });
    created++;
  }
  return created;
}

/** Corre el robot completo para una agencia: tareas fijas + reporte + tareas para managers. */
export async function runRobot(agencySlug: AgencySlug, opts: { dryRun?: boolean } = {}) {
  const tasksCreated = opts.dryRun ? 0 : await generateTasksForAgency(agencySlug, true).catch(() => 0);
  const report = await buildRobotReport(agencySlug);
  report.tasksCreated = tasksCreated;
  if (!opts.dryRun) report.managerTasksCreated = await createManagerTasks(report);
  return report;
}

/** Resumen corto para mandar al celular del dueño. */
export function formatRobotSummary(report: RobotReport, panelUrl?: string) {
  const count = (k: RobotKind) => report.creators.filter((c) => c.kind === k).length;
  const lines = [
    `🤖 *${report.agencyName}* — ${report.today} (día ${report.dayOfMonth}/${report.daysInMonth})`,
  ];
  if (report.dataStale) {
    lines.push(
      report.dataAgeDays == null
        ? "❗ No hay datos de Backstage cargados todavía."
        : `❗ Los datos de Backstage tienen ${report.dataAgeDays} días. Sube el Excel nuevo en Control de diamantes.`
    );
  }
  const goal = report.agencyGoal
    ? ` / meta ${fmt(report.agencyGoal)} (proyección ${fmt(report.projectedDiamonds)}${report.projectedDiamonds >= report.agencyGoal ? " ✅" : " ⚠️"})`
    : "";
  lines.push(`💎 ${fmt(report.totalDiamonds)} diamantes${goal}`);
  lines.push(`👥 ${report.activeCreators} creadores activos`);
  lines.push(`⚠️ En riesgo: ${count("riesgo")}  ·  😴 Sin LIVE: ${count("sin_actividad")}  ·  🔥 Cerca de nivel: ${count("cerca")}`);

  const top = report.creators.filter((c) => c.kind === "riesgo").slice(0, 5);
  if (top.length) {
    lines.push("", "Prioridad hoy:");
    for (const c of top) lines.push(`• ${c.name}${c.managerName ? ` (${c.managerName})` : ""}: ${c.reason}`);
  }
  if (report.contractsExpiring.length) {
    lines.push("", `📄 Contratos por vencer: ${report.contractsExpiring.map((k) => `${k.creator} (${k.daysLeft}d)`).join(", ")}`);
  }
  const late = report.overdueByManager.filter((m) => m.count > 0);
  if (late.length) {
    lines.push("", `⏰ Tareas atrasadas: ${late.map((m) => `${m.managerName} ${m.count}`).join(", ")}`);
  }
  lines.push("", `✅ ${report.managerTasksCreated} tareas de contacto creadas para los managers · ${report.tasksCreated} tareas fijas del día`);
  if (panelUrl) lines.push(`👉 ${panelUrl}/a/${report.agencySlug}/robot`);
  return lines.join("\n");
}
