import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** @usuario, enlace de TikTok o "tiktok:usuario" → usuario en minúsculas (o null si no parece válido). */
function cleanHandle(raw: string): string | null {
  const v = raw
    .trim()
    .replace(/^tiktok:/i, "")
    .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "")
    .split(/[/?#\s]/)[0]
    .replace(/^@/, "")
    .toLowerCase();
  return /^[a-z0-9._]{2,40}$/.test(v) ? v : null;
}

/** Todos los managers y el admin ven la lista; solo un admin real (no en "ver como") publica, borra o cambia lo ya marcado. */
const isRealAdmin = (a: { isAdmin: boolean; scope: { admin: boolean } }) => a.isAdmin && a.scope.admin;

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug } = auth;

  const sp = req.nextUrl.searchParams;
  const year = sp.get("year") && sp.get("year") !== "all" ? Number(sp.get("year")) : null;
  const month = sp.get("month") && sp.get("month") !== "all" ? Number(sp.get("month")) : null;

  const [rows, users, yearRows] = await Promise.all([
    prisma.prospect.findMany({
      where: { agencySlug, ...(year && Number.isFinite(year) ? { year } : {}), ...(month && month >= 1 && month <= 12 ? { month } : {}) },
      orderBy: [{ publishedAt: "desc" }, { username: "asc" }],
      take: 3000,
    }),
    prisma.user.findMany({ where: { agencySlug }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    prisma.prospect.findMany({ where: { agencySlug }, select: { year: true }, distinct: ["year"] }),
  ]);

  return NextResponse.json(
    {
      isAdmin: isRealAdmin(auth),
      me: auth.token.id ?? null,
      rows: rows.map((r) => ({
        id: r.id,
        username: r.username,
        year: r.year,
        month: r.month,
        publishedAt: r.publishedAt.toISOString(),
        claimedById: r.claimedById,
        claimedByName: r.claimedByName,
        claimedAt: r.claimedAt?.toISOString() ?? null,
      })),
      users,
      years: yearRows.map((y) => y.year).sort((a, b) => b - a),
    },
    { headers: NO_STORE }
  );
}

const addSchema = z.object({
  usernames: z.string().min(1).max(60_000),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

/** Publicar prospectos (admin): una lista de usuarios, uno por renglón o separados por coma. */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  if (!isRealAdmin(auth)) return NextResponse.json({ error: "Solo un admin puede publicar prospectos" }, { status: 403, headers: NO_STORE });
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Escribe al menos un usuario" }, { status: 400, headers: NO_STORE });
  const { agencySlug } = auth;
  const { usernames, year, month } = parsed.data;

  const seen = new Set<string>();
  const invalid: string[] = [];
  for (const piece of usernames.split(/[\n,;\t ]+/)) {
    if (!piece.trim()) continue;
    const h = cleanHandle(piece);
    if (h) seen.add(h);
    else invalid.push(piece.trim().slice(0, 40));
  }
  const handles = [...seen];
  if (!handles.length) return NextResponse.json({ error: "No encontré usuarios válidos en lo que pegaste" }, { status: 400, headers: NO_STORE });
  if (handles.length > 500) return NextResponse.json({ error: "Máximo 500 usuarios por vez" }, { status: 400, headers: NO_STORE });

  // Fecha de publicación: hoy si es el mes en curso; si no, el día 1 del mes elegido
  const now = new Date();
  const publishedAt = now.getFullYear() === year && now.getMonth() + 1 === month ? now : new Date(Date.UTC(year, month - 1, 1, 12));
  const res = await prisma.prospect.createMany({
    data: handles.map((username) => ({ agencySlug, username, year, month, publishedAt, createdById: (auth.token.id as string | undefined) ?? null })),
    skipDuplicates: true,
  });
  return NextResponse.json({ ok: true, added: res.count, repeated: handles.length - res.count, invalid: invalid.slice(0, 10) }, { headers: NO_STORE });
}

const patchSchema = z.object({ id: z.string().min(1), userId: z.string().min(1).nullable() });

/**
 * Marcar quién va a contactar al prospecto.
 * Un manager solo puede hacerlo si todavía no tiene a nadie; una vez marcado, solo el admin lo cambia o lo quita.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400, headers: NO_STORE });
  const { agencySlug } = auth;
  const { id, userId } = parsed.data;
  const admin = isRealAdmin(auth);

  if (userId === null && !admin) {
    return NextResponse.json({ error: "Solo un admin puede quitar a la persona que lo contacta" }, { status: 403, headers: NO_STORE });
  }
  let name: string | null = null;
  if (userId) {
    const u = await prisma.user.findFirst({ where: { id: userId, agencySlug }, select: { name: true } });
    if (!u) return NextResponse.json({ error: "Persona no encontrada" }, { status: 404, headers: NO_STORE });
    name = u.name;
  }
  const me = (auth.token.id as string | undefined) ?? null;
  const data = { claimedById: userId, claimedByName: name, claimedAt: userId ? new Date() : null, markedById: me };

  // La condición "todavía sin asignar" se revisa dentro de la misma consulta, así dos managers a la vez no se pisan
  const res = await prisma.prospect.updateMany({ where: { id, agencySlug, ...(admin ? {} : { claimedById: null }) }, data });
  if (res.count === 0) {
    const row = await prisma.prospect.findFirst({ where: { id, agencySlug }, select: { claimedByName: true } });
    if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: NO_STORE });
    return NextResponse.json({ error: `Ya lo tiene ${row.claimedByName ?? "otra persona"}. Solo el admin puede cambiarlo.` }, { status: 409, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  if (!isRealAdmin(auth)) return NextResponse.json({ error: "Solo un admin puede borrar prospectos" }, { status: 403, headers: NO_STORE });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400, headers: NO_STORE });
  const res = await prisma.prospect.deleteMany({ where: { id, agencySlug: auth.agencySlug } });
  if (res.count === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
