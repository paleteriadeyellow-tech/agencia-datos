import { prisma } from "@/lib/prisma";

const TZ = "America/Mexico_City";

/** Fecha de hoy (YYYY-MM-DD) en la zona de la agencia. */
export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
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
