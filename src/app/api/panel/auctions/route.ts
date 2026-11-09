import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = 86_400_000;

const bad = (m: string, status = 400) => NextResponse.json({ error: m }, { status, headers: NO_STORE });

/** Solo un admin real (no en "ver como") lee y edita las subastas. */
async function gate(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return { error: auth.error };
  if (!auth.isAdmin || !auth.scope.admin) return { error: bad("Solo un admin puede administrar las subastas", 403) };
  return { agencySlug: auth.agencySlug };
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;
  const editions = await prisma.auctionEdition.findMany({
    where: { agencySlug: g.agencySlug },
    orderBy: { date: "asc" },
  });
  return NextResponse.json(
    { editions: editions.map((e) => ({ id: e.id, number: e.number, date: e.date, time: e.time, host: e.host, status: e.status, dateConfirmed: e.dateConfirmed, notes: e.notes })) },
    { headers: NO_STORE }
  );
}

const fields = {
  date: z.string().regex(DATE),
  time: z.string().regex(TIME),
  host: z.string().trim().min(1).max(80),
  status: z.enum(["programada", "realizada", "cancelada"]),
  dateConfirmed: z.boolean(),
  notes: z.string().trim().max(1000).nullable(),
};

/** Crea una edición, o genera las siguientes `count` ediciones cada `everyDays` días desde `startDate`. */
export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;
  const parsed = z
    .object({
      startDate: fields.date,
      time: fields.time.default("20:00"),
      host: fields.host.default("Majo"),
      count: z.number().int().min(1).max(12).default(1),
      everyDays: z.number().int().min(1).max(60).default(14),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Revisa la fecha, la hora y la cantidad");
  const d = parsed.data;

  const last = await prisma.auctionEdition.findFirst({ where: { agencySlug: g.agencySlug }, orderBy: { number: "desc" }, select: { number: true } });
  const existing = new Set((await prisma.auctionEdition.findMany({ where: { agencySlug: g.agencySlug }, select: { date: true, status: true } })).filter((e) => e.status !== "cancelada").map((e) => e.date));
  let n = last?.number ?? 0;
  const rows = [];
  for (let i = 0; i < d.count; i++) {
    const date = addDays(d.startDate, i * d.everyDays);
    if (existing.has(date)) continue; // no duplica una fecha que ya tiene edición
    rows.push({ agencySlug: g.agencySlug, number: ++n, date, time: d.time, host: d.host });
  }
  if (!rows.length) return bad("Esas fechas ya tienen una edición");
  await prisma.auctionEdition.createMany({ data: rows });
  return NextResponse.json({ ok: true, created: rows.length }, { headers: NO_STORE });
}

/** Modifica fecha/hora/anfitriona/estado/confirmación/notas (reprogramar = cambiar la fecha; cancelar = estado). */
export async function PATCH(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;
  const parsed = z.object({ id: z.string().min(1) }).and(z.object(fields).partial()).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Datos inválidos");
  const { id, ...rest } = parsed.data;
  const found = await prisma.auctionEdition.findFirst({ where: { id, agencySlug: g.agencySlug }, select: { id: true, date: true } });
  if (!found) return bad("No encontrada", 404);
  // Cambiar la fecha deja de estar autorizada hasta que la dirección la confirme otra vez.
  const data = { ...rest, notes: rest.notes === undefined ? undefined : rest.notes || null, ...(rest.date && rest.date !== found.date && rest.dateConfirmed === undefined ? { dateConfirmed: false } : {}) };
  await prisma.auctionEdition.update({ where: { id }, data });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/** Solo se pueden borrar ediciones canceladas; el resto se conserva en el historial. */
export async function DELETE(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return bad("Falta id");
  const found = await prisma.auctionEdition.findFirst({ where: { id, agencySlug: g.agencySlug }, select: { status: true } });
  if (!found) return bad("No encontrada", 404);
  if (found.status !== "cancelada") return bad("Cancela la edición antes de borrarla; las demás se conservan en el historial");
  await prisma.auctionEdition.delete({ where: { id } });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
