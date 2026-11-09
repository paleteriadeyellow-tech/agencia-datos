import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const bad = (m: string, status = 400) => NextResponse.json({ error: m }, { status, headers: NO_STORE });

const REG_STATUSES = [
  "registrado", "pendiente_contacto", "contactado", "aceptado", "pendiente_grupo",
  "en_grupo", "capacitado", "confirmado", "participo", "no_asistio", "cancelo",
] as const;

async function gate(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return { error: auth.error };
  if (!auth.isAdmin || !auth.scope.admin) return { error: bad("Solo un admin puede administrar las subastas", 403) };
  return { agencySlug: auth.agencySlug };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;
  const editionId = req.nextUrl.searchParams.get("editionId");
  const [rows, users] = await Promise.all([
    prisma.auctionRegistration.findMany({
      where: { agencySlug: g.agencySlug, ...(editionId ? { editionId } : {}) },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ where: { agencySlug: g.agencySlug }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return NextResponse.json({ registrations: rows, users }, { headers: NO_STORE });
}

/** Cambia estado, responsable y comentario de una inscripción. */
export async function PATCH(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;
  const parsed = z
    .object({
      id: z.string().min(1),
      status: z.enum(REG_STATUSES).optional(),
      responsibleId: z.string().nullable().optional(),
      comment: z.string().trim().max(1000).nullable().optional(),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Datos inválidos");
  const { id, ...rest } = parsed.data;
  const found = await prisma.auctionRegistration.findFirst({ where: { id, agencySlug: g.agencySlug }, select: { id: true } });
  if (!found) return bad("No encontrada", 404);
  if (rest.responsibleId) {
    const u = await prisma.user.findFirst({ where: { id: rest.responsibleId, agencySlug: g.agencySlug }, select: { id: true } });
    if (!u) return bad("Responsable inválido");
  }
  await prisma.auctionRegistration.update({
    where: { id },
    data: { ...rest, responsibleId: rest.responsibleId === undefined ? undefined : rest.responsibleId || null, comment: rest.comment === undefined ? undefined : rest.comment || null },
  });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
