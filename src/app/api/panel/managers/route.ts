import { NextRequest, NextResponse } from "next/server";
import { forgetAccess, requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, token } = auth;
  if (token.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const managers = await prisma.user.findMany({
    where: { agencySlug },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      position: true,
      canViewAll: true,
      createdAt: true,
      _count: { select: { creators: { where: { agencySlug } } } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    managers: managers.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      position: m.position,
      canViewAll: m.canViewAll,
      createdAt: m.createdAt,
      creatorsCount: m._count.creators,
    })),
  });
}

/** Da o quita el permiso de ver TODOS los creadores de la agencia. Solo un admin real. */
export async function PATCH(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  if (!auth.isAdmin || !auth.scope.admin) {
    return NextResponse.json({ error: "Solo un admin puede cambiar este permiso" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const body = (await req.json().catch(() => null)) as { id?: unknown; canViewAll?: unknown } | null;
  if (!body || typeof body.id !== "string" || typeof body.canViewAll !== "boolean") {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const res = await prisma.user.updateMany({ where: { id: body.id, agencySlug: auth.agencySlug }, data: { canViewAll: body.canViewAll } });
    if (res.count === 0) {
      return NextResponse.json({ error: "Persona no encontrada" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    forgetAccess(body.id, auth.agencySlug);
    return NextResponse.json({ ok: true, canViewAll: body.canViewAll }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // Se devuelve el motivo real (por ejemplo, que falta la columna en la base de datos) para poder corregirlo
    const detail = e instanceof Error ? e.message.split("\n").filter(Boolean).slice(-1)[0] : "";
    return NextResponse.json({ error: `No se pudo guardar el permiso: ${detail || "error del servidor"}` }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
