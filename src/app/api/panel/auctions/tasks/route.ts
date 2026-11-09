import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { AUCTION_STEPS, ensureEditionTasks } from "@/lib/auction-tasks";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const bad = (m: string, status = 400) => NextResponse.json({ error: m }, { status, headers: NO_STORE });

async function gate(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return { error: auth.error };
  if (!auth.isAdmin || !auth.scope.admin) return { error: bad("Solo un admin puede administrar las subastas", 403) };
  return { agencySlug: auth.agencySlug, userId: auth.scope.userId ?? null };
}

/** Checklist de una edición (solo lectura: las tareas se completan en "Mi día" o "Tareas", con sus reglas de evidencia). */
export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;
  const editionId = req.nextUrl.searchParams.get("editionId");
  if (!editionId) return bad("Falta la edición");
  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      where: { agencySlug: g.agencySlug, auctionEditionId: editionId },
      select: { id: true, title: true, status: true, dueDate: true, auctionKey: true, assignee: { select: { id: true, name: true } } },
    }),
    prisma.user.findMany({ where: { agencySlug: g.agencySlug }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const order = new Map(AUCTION_STEPS.map((s, i) => [s.key, i]));
  tasks.sort((a, b) => (order.get(a.auctionKey ?? "") ?? 99) - (order.get(b.auctionKey ?? "") ?? 99));
  return NextResponse.json(
    { users, tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null, key: t.auctionKey, assignee: t.assignee?.name ?? null })) },
    { headers: NO_STORE }
  );
}

/** Genera los pasos que falten y/o asigna un responsable a todos los pasos sin terminar. */
export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;
  const parsed = z
    .object({ editionId: z.string().min(1), assigneeId: z.string().nullable().optional() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Datos inválidos");
  const { editionId, assigneeId } = parsed.data;

  const edition = await prisma.auctionEdition.findFirst({ where: { id: editionId, agencySlug: g.agencySlug } });
  if (!edition) return bad("Edición no encontrada", 404);
  if (edition.status === "cancelada") return bad("La edición está cancelada");
  if (assigneeId) {
    const u = await prisma.user.findFirst({ where: { id: assigneeId, agencySlug: g.agencySlug }, select: { id: true } });
    if (!u) return bad("Responsable inválido");
  }

  const created = await ensureEditionTasks(g.agencySlug, edition, assigneeId ?? g.userId);
  let reassigned = 0;
  if (assigneeId) {
    const r = await prisma.task.updateMany({
      where: { agencySlug: g.agencySlug, auctionEditionId: editionId, status: { not: "hecha" } },
      data: { assigneeId },
    });
    reassigned = r.count;
  }
  return NextResponse.json({ ok: true, created, reassigned }, { headers: NO_STORE });
}
