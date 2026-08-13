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
  const rows = await prisma.kpiRecord.findMany({
    where: { period },
    orderBy: [{ diamantes: "desc" }, { nombre: "asc" }],
  });

  return NextResponse.json({
    period,
    rows: rows.map((r) => ({
      id: r.id,
      period: r.period,
      nombre: r.nombre,
      whatsapp: r.whatsapp,
      diamantes: r.diamantes,
      horas: r.horas,
      dias: r.dias,
      updatedAt: r.updatedAt,
    })),
  });
}

const upsertSchema = z.object({
  id: z.string().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  nombre: z.string().min(1),
  whatsapp: z.string().optional(),
  diamantes: z.number().int().min(0).optional(),
  horas: z.number().min(0).optional(),
  dias: z.number().int().min(0).optional(),
});

const importSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  rows: z
    .array(
      z.object({
        nombre: z.string().min(1),
        whatsapp: z.string().optional(),
        diamantes: z.number().int().min(0).optional(),
        horas: z.number().min(0).optional(),
        dias: z.number().int().min(0).optional(),
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

    let imported = 0;
    let updated = 0;
    for (const row of parsed.data.rows) {
      const nombre = cleanNick(row.nombre);
      const existing = await prisma.kpiRecord.findFirst({
        where: { period: parsed.data.period, nombre },
      });
      const data = {
        whatsapp: (row.whatsapp || "").replace(/\D/g, ""),
        diamantes: row.diamantes ?? 0,
        horas: row.horas ?? 0,
        dias: row.dias ?? 0,
      };
      if (existing) {
        await prisma.kpiRecord.update({
          where: { id: existing.id },
          data: {
            ...data,
            whatsapp: data.whatsapp || existing.whatsapp,
          },
        });
        updated += 1;
      } else {
        await prisma.kpiRecord.create({
          data: {
            period: parsed.data.period,
            nombre,
            ...data,
          },
        });
        imported += 1;
      }
    }
    return NextResponse.json({ ok: true, imported, updated });
  }

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const nombre = cleanNick(parsed.data.nombre);
  const payload = {
    nombre,
    whatsapp: (parsed.data.whatsapp || "").replace(/\D/g, ""),
    diamantes: parsed.data.diamantes ?? 0,
    horas: parsed.data.horas ?? 0,
    dias: parsed.data.dias ?? 0,
  };

  if (parsed.data.id) {
    const row = await prisma.kpiRecord.update({
      where: { id: parsed.data.id },
      data: payload,
    });
    return NextResponse.json({ ok: true, row });
  }

  const row = await prisma.kpiRecord.create({
    data: { period: parsed.data.period, ...payload },
  });
  return NextResponse.json({ ok: true, row, created: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  const period = req.nextUrl.searchParams.get("period");
  const clearPeriod = req.nextUrl.searchParams.get("clearPeriod") === "1";

  if (clearPeriod && period && /^\d{4}-\d{2}$/.test(period)) {
    const res = await prisma.kpiRecord.deleteMany({ where: { period } });
    return NextResponse.json({ ok: true, deleted: res.count });
  }

  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }

  await prisma.kpiRecord.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
