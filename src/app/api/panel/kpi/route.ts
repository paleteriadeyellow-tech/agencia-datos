import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const { agencySlug } = auth;

  const period = parsePeriod(req.nextUrl.searchParams.get("period"));
  const rows = await prisma.kpiRecord.findMany({
    where: { agencySlug, period },
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
  const { agencySlug } = auth;

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

    try {
      const period = parsed.data.period;
      const existing = await prisma.kpiRecord.findMany({
        where: { agencySlug, period },
        select: { id: true, nombre: true, whatsapp: true },
      });
      const byName = new Map(
        existing.map((e) => [e.nombre.toLowerCase(), e])
      );

      const merged = new Map<
        string,
        {
          nombre: string;
          whatsapp: string;
          diamantes: number;
          horas: number;
          dias: number;
        }
      >();
      for (const row of parsed.data.rows) {
        const nombre = cleanNick(row.nombre);
        if (!nombre) continue;
        merged.set(nombre.toLowerCase(), {
          nombre,
          whatsapp: (row.whatsapp || "").replace(/\D/g, ""),
          diamantes: row.diamantes ?? 0,
          horas: row.horas ?? 0,
          dias: row.dias ?? 0,
        });
      }

      const toCreate: {
        agencySlug: string;
        period: string;
        nombre: string;
        whatsapp: string;
        diamantes: number;
        horas: number;
        dias: number;
      }[] = [];
      const toUpdate: {
        id: string;
        whatsapp: string;
        diamantes: number;
        horas: number;
        dias: number;
        prevWa: string;
      }[] = [];

      for (const row of merged.values()) {
        const ex = byName.get(row.nombre.toLowerCase());
        if (ex) {
          toUpdate.push({
            id: ex.id,
            whatsapp: row.whatsapp,
            diamantes: row.diamantes,
            horas: row.horas,
            dias: row.dias,
            prevWa: ex.whatsapp,
          });
        } else {
          toCreate.push({
            agencySlug,
            period,
            nombre: row.nombre,
            whatsapp: row.whatsapp,
            diamantes: row.diamantes,
            horas: row.horas,
            dias: row.dias,
          });
        }
      }

      for (let i = 0; i < toCreate.length; i += 100) {
        await prisma.kpiRecord.createMany({
          data: toCreate.slice(i, i + 100),
        });
      }
      for (let i = 0; i < toUpdate.length; i += 25) {
        const chunk = toUpdate.slice(i, i + 25);
        await prisma.$transaction(
          chunk.map((u) =>
            prisma.kpiRecord.update({
              where: { id: u.id },
              data: {
                diamantes: u.diamantes,
                horas: u.horas,
                dias: u.dias,
                whatsapp: u.whatsapp || u.prevWa,
              },
            })
          )
        );
      }

      return NextResponse.json({
        ok: true,
        imported: toCreate.length,
        updated: toUpdate.length,
      });
    } catch (e) {
      console.error("kpi/import", e);
      return NextResponse.json(
        { error: "Error al importar KPI. Intenta de nuevo." },
        { status: 500 }
      );
    }
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
    const existing = await prisma.kpiRecord.findFirst({
      where: { id: parsed.data.id, agencySlug },
    });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    const row = await prisma.kpiRecord.update({
      where: { id: existing.id },
      data: payload,
    });
    return NextResponse.json({ ok: true, row });
  }

  const row = await prisma.kpiRecord.create({
    data: { agencySlug, period: parsed.data.period, ...payload },
  });
  return NextResponse.json({ ok: true, row, created: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug } = auth;

  const id = req.nextUrl.searchParams.get("id");
  const period = req.nextUrl.searchParams.get("period");
  const clearPeriod = req.nextUrl.searchParams.get("clearPeriod") === "1";

  if (clearPeriod && period && /^\d{4}-\d{2}$/.test(period)) {
    const res = await prisma.kpiRecord.deleteMany({
      where: { agencySlug, period },
    });
    return NextResponse.json({ ok: true, deleted: res.count });
  }

  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }

  const existing = await prisma.kpiRecord.findFirst({
    where: { id, agencySlug },
  });
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  await prisma.kpiRecord.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
