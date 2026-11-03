import { prisma } from "@/lib/prisma";
import { ADMIN_PRESETS } from "@/lib/task-presets";

const TZ = "America/Mexico_City";

/** El "día de trabajo" empieza a las 6:00 a.m. (hora de la agencia): antes de esa hora todavía cuenta como el día anterior. */
export const DAY_START_HOUR = 6;

/** Fecha del día de trabajo actual (YYYY-MM-DD) en la zona de la agencia. */
export function todayKey(now = new Date()) {
  const shifted = new Date(now.getTime() - DAY_START_HOUR * 3600_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(shifted);
}

/** Instante exacto en que empezó el día de trabajo de `key` (6:00 a.m. México, UTC-6). */
export function dayStart(key: string) {
  return new Date(`${key}T${String(DAY_START_HOUR).padStart(2, "0")}:00:00-06:00`);
}

/** Máximo una pasada por agencia cada 60 s por instancia (la unicidad en la BD evita duplicados aunque haya varias). */
const lastRun = new Map<string, number>();

/**
 * Crea las tareas de HOY que corresponden a cada persona según su puesto y las plantillas activas.
 * Es idempotente: (plantilla, persona, fecha) es único, así que correrlo varias veces no duplica nada.
 */
export async function generateTasksForAgency(agencySlug: string, force = false) {
  const now = Date.now();
  if (!force && now - (lastRun.get(agencySlug) ?? 0) < 60_000) return 0;
  lastRun.set(agencySlug, now);

  const today = todayKey();
  const noon = new Date(`${today}T12:00:00Z`);
  const isoWeekday = noon.getUTCDay() || 7; // 1 = lunes … 7 = domingo
  const dayOfMonth = Number(today.slice(8, 10));
  const period = today.slice(0, 7);

  // Primera vez en esta agencia: se cargan solas las tareas reales del manual de Administración.
  if ((await prisma.taskTemplate.count({ where: { agencySlug } })) === 0) {
    await prisma.taskTemplate.createMany({
      data: ADMIN_PRESETS.map((p) => ({ agencySlug, ...p, isPreset: true })),
      skipDuplicates: true,
    });
  }

  const [templates, users] = await Promise.all([
    prisma.taskTemplate.findMany({ where: { agencySlug, active: true } }),
    prisma.user.findMany({ where: { agencySlug, position: { not: null } }, select: { id: true, position: true } }),
  ]);
  if (!templates.length || !users.length) return 0;

  const due = templates.filter((t) => {
    if (t.recurrence === "mensual") return t.dayOfMonth === dayOfMonth;
    const days = t.weekdays.split(",").map(Number);
    return days.includes(isoWeekday);
  });

  const data = users.flatMap((u) =>
    due
      .filter((t) => t.position === u.position)
      .map((t) => ({
        agencySlug,
        title: t.title,
        description: [t.description, t.evidenceHint ? `Evidencia: ${t.evidenceHint}` : null, t.dueTime ? `Horario sugerido: ${t.dueTime}` : null]
          .filter(Boolean)
          .join("\n\n") || null,
        assigneeId: u.id,
        priority: t.priority,
        status: "pendiente",
        period,
        dueDate: new Date(`${today}T00:00:00.000Z`),
        templateId: t.id,
        genKey: today,
      }))
  );
  if (!data.length) return 0;
  const res = await prisma.task.createMany({ data, skipDuplicates: true });
  return res.count;
}
