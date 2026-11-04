import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const TYPES = ["text", "date", "number", "check", "select"] as const;

/** Las columnas son de toda la agencia: solo un admin real (no en modo "ver como") las cambia. */
async function adminGate(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return { error: auth.error };
  if (!auth.isAdmin || !auth.scope.admin) {
    return { error: NextResponse.json({ error: "Solo un admin puede cambiar las columnas" }, { status: 403, headers: NO_STORE }) };
  }
  return { agencySlug: auth.agencySlug };
}

const cleanOptions = (v: string | null | undefined) =>
  v
    ? v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 30)
        .join(",")
    : null;

/** Llave estable a partir del nombre: letras y números sin acentos + un sufijo corto para que no choque. */
function makeKey(label: string) {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return `c_${base || "col"}_${Math.random().toString(36).slice(2, 6)}`;
}

const createSchema = z.object({
  label: z.string().trim().min(1).max(80),
  type: z.enum(TYPES).default("text"),
  options: z.string().max(600).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const g = await adminGate(req);
  if (g.error) return g.error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Escribe el nombre de la columna" }, { status: 400, headers: NO_STORE });
  const d = parsed.data;
  if (d.type === "select" && !cleanOptions(d.options)) {
    return NextResponse.json({ error: "Escribe las opciones de la lista, separadas por coma" }, { status: 400, headers: NO_STORE });
  }
  const last = await prisma.recruitmentColumn.aggregate({ where: { agencySlug: g.agencySlug }, _max: { sortOrder: true } });
  const col = await prisma.recruitmentColumn.create({
    data: {
      agencySlug: g.agencySlug,
      key: makeKey(d.label),
      label: d.label,
      type: d.type,
      options: d.type === "select" ? cleanOptions(d.options) : null,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
      builtin: false,
    },
  });
  return NextResponse.json({ ok: true, id: col.id, key: col.key }, { headers: NO_STORE });
}

const HEX = /^#[0-9a-fA-F]{6}$/;

const patchSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80).optional(),
  type: z.enum(TYPES).optional(),
  options: z.string().max(600).nullable().optional(),
  hidden: z.boolean().optional(),
  color: z.string().regex(HEX).nullable().optional(),
});

/** Pintar todas las columnas del mismo color (o quitar el color de todas con null). */
const allColorSchema = z.object({ applyAll: z.literal(true), color: z.string().regex(HEX).nullable() });

export async function PATCH(req: NextRequest) {
  const g = await adminGate(req);
  if (g.error) return g.error;
  const body = await req.json().catch(() => null);
  const all = allColorSchema.safeParse(body);
  if (all.success) {
    await prisma.recruitmentColumn.updateMany({ where: { agencySlug: g.agencySlug }, data: { color: all.data.color } });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400, headers: NO_STORE });
  const { id, type, options, ...rest } = parsed.data;
  const col = await prisma.recruitmentColumn.findFirst({ where: { id, agencySlug: g.agencySlug } });
  if (!col) return NextResponse.json({ error: "No encontrada" }, { status: 404, headers: NO_STORE });

  // El tipo solo se cambia en las columnas que agregaste; las de siempre conservan el suyo
  const nextType = !col.builtin && type ? type : col.type;
  const nextOptions = options !== undefined && nextType === "select" ? cleanOptions(options) : nextType === "select" ? col.options : null;
  if (nextType === "select" && !nextOptions) {
    return NextResponse.json({ error: "Escribe las opciones de la lista, separadas por coma" }, { status: 400, headers: NO_STORE });
  }
  await prisma.recruitmentColumn.update({ where: { id }, data: { ...rest, type: nextType, options: nextOptions } });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest) {
  const g = await adminGate(req);
  if (g.error) return g.error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400, headers: NO_STORE });
  const col = await prisma.recruitmentColumn.findFirst({ where: { id, agencySlug: g.agencySlug } });
  if (!col) return NextResponse.json({ error: "No encontrada" }, { status: 404, headers: NO_STORE });
  if (col.builtin) {
    return NextResponse.json({ error: "Las columnas de siempre no se eliminan; puedes ocultarlas" }, { status: 400, headers: NO_STORE });
  }
  await prisma.recruitmentColumn.delete({ where: { id } });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/** Reordenar: recibe los ids en el orden nuevo. */
export async function PUT(req: NextRequest) {
  const g = await adminGate(req);
  if (g.error) return g.error;
  const parsed = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400, headers: NO_STORE });
  const { ids } = parsed.data;
  await prisma.$transaction(
    ids.map((id, i) => prisma.recruitmentColumn.updateMany({ where: { id, agencySlug: g.agencySlug }, data: { sortOrder: i } }))
  );
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
