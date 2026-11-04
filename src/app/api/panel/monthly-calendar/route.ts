import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Todos los roles ven el calendario del mes; solo un admin real (no en "ver como") lo edita. */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug } = auth;

  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!MONTH.test(month)) return NextResponse.json({ error: "Mes inválido" }, { status: 400, headers: NO_STORE });

  const [events, note] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { agencySlug, date: { startsWith: `${month}-` } },
      orderBy: [{ date: "asc" }, { time: "asc" }, { createdAt: "asc" }],
    }),
    prisma.calendarMonthNote.findUnique({ where: { agencySlug_month: { agencySlug, month } } }),
  ]);

  return NextResponse.json(
    {
      month,
      canEdit: auth.isAdmin && auth.scope.admin,
      note: note?.note ?? "",
      events: events.map((e) => ({ id: e.id, date: e.date, time: e.time, title: e.title, notes: e.notes, color: e.color })),
    },
    { headers: NO_STORE }
  );
}

async function adminGate(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return { error: auth.error };
  if (!auth.isAdmin || !auth.scope.admin) {
    return { error: NextResponse.json({ error: "Solo un admin puede editar el calendario" }, { status: 403, headers: NO_STORE }) };
  }
  return { agencySlug: auth.agencySlug };
}

const eventFields = {
  date: z.string().regex(DATE),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(1000).nullable().optional(),
  color: z.enum(["azul", "verde", "rojo", "amarillo", "morado"]).default("azul"),
};

export async function POST(req: NextRequest) {
  const g = await adminGate(req);
  if (g.error) return g.error;
  const parsed = z.object(eventFields).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revisa la fecha, la hora y el título" }, { status: 400, headers: NO_STORE });
  const d = parsed.data;
  const e = await prisma.calendarEvent.create({
    data: { agencySlug: g.agencySlug, date: d.date, time: d.time || null, title: d.title, notes: d.notes || null, color: d.color },
  });
  return NextResponse.json({ ok: true, id: e.id }, { headers: NO_STORE });
}

export async function PATCH(req: NextRequest) {
  const g = await adminGate(req);
  if (g.error) return g.error;
  const parsed = z.object({ id: z.string().min(1) }).and(z.object(eventFields).partial()).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400, headers: NO_STORE });
  const { id, ...rest } = parsed.data;
  const found = await prisma.calendarEvent.findFirst({ where: { id, agencySlug: g.agencySlug }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: NO_STORE });
  await prisma.calendarEvent.update({
    where: { id },
    data: { ...rest, time: rest.time === undefined ? undefined : rest.time || null, notes: rest.notes === undefined ? undefined : rest.notes || null },
  });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest) {
  const g = await adminGate(req);
  if (g.error) return g.error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400, headers: NO_STORE });
  const found = await prisma.calendarEvent.findFirst({ where: { id, agencySlug: g.agencySlug }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: NO_STORE });
  await prisma.calendarEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/** Nota del mes (la tarea mensual y lo que debe estar listo). Vacía = se borra. */
export async function PUT(req: NextRequest) {
  const g = await adminGate(req);
  if (g.error) return g.error;
  const parsed = z.object({ month: z.string().regex(MONTH), note: z.string().trim().max(1000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400, headers: NO_STORE });
  const { month, note } = parsed.data;
  const key = { agencySlug_month: { agencySlug: g.agencySlug, month } };
  if (!note) {
    await prisma.calendarMonthNote.deleteMany({ where: { agencySlug: g.agencySlug, month } });
  } else {
    await prisma.calendarMonthNote.upsert({ where: key, update: { note }, create: { agencySlug: g.agencySlug, month, note } });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
