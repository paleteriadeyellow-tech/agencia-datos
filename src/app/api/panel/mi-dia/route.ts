import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TZ = "America/Mexico_City";

/** Fecha de hoy (YYYY-MM-DD) en la zona de la agencia. */
function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * "Mi día": las tareas asignadas a una persona, de cualquier periodo, solo de su agencia.
 * Abiertas (pendiente / en progreso) + las que cerró hoy. El admin puede ver el día de otra persona con ?user=<id>
 * (si está en modo "ver como", `scope` ya es el de esa persona).
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, scope } = auth;

  const requested = req.nextUrl.searchParams.get("user");
  const userId = scope.admin && requested ? requested : scope.userId;
  if (!userId) return NextResponse.json({ error: "Sin usuario" }, { status: 400 });

  const today = todayKey();
  // Inicio del día de hoy en la zona de la agencia (UTC-6, suficiente para "cerradas hoy")
  const startOfToday = new Date(`${today}T00:00:00-06:00`);

  const [user, open, doneToday, users] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, agencySlug }, select: { id: true, name: true } }),
    prisma.task.findMany({
      where: { agencySlug, assigneeId: userId, status: { in: ["pendiente", "en_progreso"] } },
      include: { creator: { select: { name: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.task.findMany({
      where: { agencySlug, assigneeId: userId, status: "hecha", updatedAt: { gte: startOfToday } },
      include: { creator: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    scope.admin
      ? prisma.user.findMany({ where: { agencySlug }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  const row = (t: (typeof open)[number]) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    creator: t.creator?.name ?? null,
  });

  return NextResponse.json({
    today,
    user,
    users,
    open: open.map(row),
    doneToday: doneToday.map(row),
  });
}
