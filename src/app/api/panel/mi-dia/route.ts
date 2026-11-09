import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { dayStart, generateTasksForAgency, todayKey } from "@/lib/task-generator";

export const dynamic = "force-dynamic";


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

  // Las tareas fijas de hoy según el puesto de cada persona (idempotente)
  await generateTasksForAgency(agencySlug).catch(() => 0);

  const today = todayKey();
  // El día de trabajo empieza a las 6:00 a.m.: lo cerrado desde esa hora cuenta como "hecho hoy"
  const startOfToday = dayStart(today);
  const tpl = { select: { dueTime: true, recurrence: true, sortOrder: true } } as const;

  const [user, openAll, doneToday, users] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, agencySlug }, select: { id: true, name: true } }),
    prisma.task.findMany({
      where: { agencySlug, assigneeId: userId, status: { in: ["pendiente", "en_progreso"] } },
      include: { creator: { select: { name: true } }, template: tpl },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.task.findMany({
      where: { agencySlug, assigneeId: userId, status: "hecha", updatedAt: { gte: startOfToday } },
      include: { creator: { select: { name: true } }, template: tpl },
      orderBy: { updatedAt: "desc" },
    }),
    scope.admin
      ? prisma.user.findMany({ where: { agencySlug }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  // Las tareas diarias de días anteriores que no se hicieron ya no estorban: cada mañana empieza limpia.
  // (Semanales y mensuales sí se siguen mostrando como atrasadas hasta hacerlas.)
  const open = openAll
    .filter((t) => !(t.template?.recurrence === "diaria" && t.genKey && t.genKey < today))
    // Los pasos de una subasta aparecen en "Mi día" cuando llega su fecha (no todos de golpe al crear la edición).
    .filter((t) => !(t.auctionEditionId && t.dueDate && t.dueDate.toISOString().slice(0, 10) > today))
    .sort((x, y) => {
      const dx = x.dueDate ? x.dueDate.getTime() : Infinity;
      const dy = y.dueDate ? y.dueDate.getTime() : Infinity;
      if (dx !== dy) return dx - dy;
      return (x.template?.dueTime ?? "99:99").localeCompare(y.template?.dueTime ?? "99:99") || x.createdAt.getTime() - y.createdAt.getTime();
    });

  const row = (t: (typeof openAll)[number]) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    time: t.template?.dueTime ?? null,
    fixed: !!t.templateId,
    evidenceAt: t.evidenceAt,
    reviewedAt: t.reviewedAt,
    reviewNote: t.reviewNote,
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
