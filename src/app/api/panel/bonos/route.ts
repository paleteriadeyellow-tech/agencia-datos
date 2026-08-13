import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parsePeriod(raw: string | null) {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  return raw;
}

function cleanNick(v: string) {
  return v.replace(/^@/, "").trim();
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;

  const period = parsePeriod(req.nextUrl.searchParams.get("period"));
  const rows = await prisma.bonoRecord.findMany({
    where: { period },
    orderBy: [{ diamantes: "desc" }, { nombre: "asc" }],
  });

  const totalBono = rows.reduce((a, r) => a + r.bono, 0);
  const totalSinPagar = rows
    .filter((r) => !r.pagado)
    .reduce((a, r) => a + r.bono, 0);
  const totalPagados = rows
    .filter((r) => r.pagado)
    .reduce((a, r) => a + r.bono, 0);

  return NextResponse.json({
    period,
    totalBono,
    totalSinPagar,
    totalPagados,
    rows: rows.map((r) => ({
      id: r.id,
      period: r.period,
      nombre: r.nombre,
      diamantes: r.diamantes,
      horas: r.horas,
      dias: r.dias,
      bono: r.bono,
      gananciaAgencia: r.gananciaAgencia,
      pagado: r.pagado,
      pagadoAt: r.pagadoAt,
      updatedAt: r.updatedAt,
    })),
  });
}

const upsertSchema = z.object({
  id: z.string().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  nombre: z.string().min(1),
  diamantes: z.number().int().min(0).optional(),
  horas: z.number().min(0).optional(),
  dias: z.number().int().min(0).optional(),
  bono: z.number().min(0).optional(),
  gananciaAgencia: z.number().min(0).optional(),
  pagado: z.boolean().optional(),
});

const importSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  rows: z
    .array(
      z.object({
        nombre: z.string().min(1),
        diamantes: z.number().int().min(0).optional(),
        horas: z.number().min(0).optional(),
        dias: z.number().int().min(0).optional(),
        bono: z.number().min(0),
      })
    )
    .min(1)
    .max(2000),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Importación masiva
  if (
    body &&
    typeof body === "object" &&
    "rows" in body &&
    Array.isArray((body as { rows: unknown }).rows)
  ) {
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos de import inválidos" }, { status: 400 });
    }
    let created = 0;
    for (const row of parsed.data.rows) {
      await prisma.bonoRecord.create({
        data: {
          period: parsed.data.period,
          nombre: cleanNick(row.nombre),
          diamantes: row.diamantes ?? 0,
          horas: row.horas ?? 0,
          dias: row.dias ?? 0,
          bono: row.bono,
          pagado: false,
        },
      });
      created += 1;
    }
    return NextResponse.json({ ok: true, created });
  }

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const data = parsed.data;
  const nombre = cleanNick(data.nombre);

  if (data.id) {
    const updated = await prisma.bonoRecord.update({
      where: { id: data.id },
      data: {
        nombre,
        diamantes: data.diamantes,
        horas: data.horas,
        dias: data.dias,
        bono: data.bono,
        gananciaAgencia: data.gananciaAgencia,
        pagado: data.pagado,
        pagadoAt:
          data.pagado === true
            ? new Date()
            : data.pagado === false
              ? null
              : undefined,
      },
    });
    return NextResponse.json({ ok: true, row: updated });
  }

  // Upsert por periodo + nombre (liquidación)
  const existing = await prisma.bonoRecord.findFirst({
    where: {
      period: data.period,
      nombre: { equals: nombre },
    },
  });

  if (existing) {
    const updated = await prisma.bonoRecord.update({
      where: { id: existing.id },
      data: {
        diamantes: data.diamantes ?? existing.diamantes,
        horas: data.horas ?? existing.horas,
        dias: data.dias ?? existing.dias,
        bono: data.bono ?? existing.bono,
        gananciaAgencia:
          data.gananciaAgencia !== undefined
            ? data.gananciaAgencia
            : existing.gananciaAgencia,
        // no resetear pagado al actualizar liquidación
      },
    });
    return NextResponse.json({ ok: true, row: updated, updated: true });
  }

  const created = await prisma.bonoRecord.create({
    data: {
      period: data.period,
      nombre,
      diamantes: data.diamantes ?? 0,
      horas: data.horas ?? 0,
      dias: data.dias ?? 0,
      bono: data.bono ?? 0,
      gananciaAgencia: data.gananciaAgencia ?? 0,
      pagado: false,
    },
  });
  return NextResponse.json({ ok: true, row: created, created: true });
}

const patchSchema = z.object({
  id: z.string().min(1),
  pagado: z.boolean().optional(),
  nombre: z.string().optional(),
  diamantes: z.number().int().min(0).optional(),
  horas: z.number().min(0).optional(),
  dias: z.number().int().min(0).optional(),
  bono: z.number().min(0).optional(),
  gananciaAgencia: z.number().min(0).optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { id, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (rest.nombre) data.nombre = cleanNick(rest.nombre);
  if (rest.pagado === true) data.pagadoAt = new Date();
  if (rest.pagado === false) data.pagadoAt = null;

  const updated = await prisma.bonoRecord.update({
    where: { id },
    data,
  });
  return NextResponse.json({ ok: true, row: updated });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  const period = req.nextUrl.searchParams.get("period");
  const clearPeriod = req.nextUrl.searchParams.get("clearPeriod") === "1";

  if (clearPeriod && period && /^\d{4}-\d{2}$/.test(period)) {
    const res = await prisma.bonoRecord.deleteMany({ where: { period } });
    return NextResponse.json({ ok: true, deleted: res.count });
  }

  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }

  await prisma.bonoRecord.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
