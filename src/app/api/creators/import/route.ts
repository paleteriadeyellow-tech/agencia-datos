import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { currentMonth, monthRange } from "@/lib/utils";

export const dynamic = "force-dynamic";

const rowSchema = z.object({
  nombre: z.string().trim().optional().nullable(),
  telefono: z.string().trim().optional().nullable(),
  nicho: z.string().trim().optional().nullable(),
  fecha_incorporacion: z.string().trim().optional().nullable(),
  tiktok: z.string().trim().optional().nullable(),
  pais: z.string().trim().optional().nullable(),
  estado: z.string().trim().optional().nullable(),
  grupo: z.string().trim().optional().nullable(),
  notas: z.string().trim().optional().nullable(),
  diamantes: z.union([z.number(), z.string()]).optional().nullable(),
});

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(2000),
});

function parseJoinDate(value?: string | null) {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function normalizeStatus(value?: string | null) {
  const s = (value || "activo").toLowerCase().trim();
  if (["activo", "pausado", "baja"].includes(s)) return s;
  return "activo";
}

function cleanUser(value?: string | null) {
  return (value || "").replace(/^@/, "").trim();
}

function parseDiamonds(value: unknown) {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  const s = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/,/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function cleanGroup(value?: string | null) {
  const g = (value || "").trim();
  if (!g) return null;
  const low = g.toLowerCase();
  if (
    low.includes("no está en ningún grupo") ||
    low.includes("no esta en ningun grupo") ||
    low === "—" ||
    low === "-"
  ) {
    return null;
  }
  return g;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  if (auth.token?.role !== "admin") {
    return NextResponse.json(
      { error: "Solo un admin puede importar creadores." },
      { status: 403 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "No se encontraron filas para importar." },
      { status: 400 }
    );
  }

  const month = currentMonth();
  const { start, end } = monthRange(month);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let withDiamonds = 0;

  for (const row of parsed.data.rows) {
    const tiktok = cleanUser(row.tiktok) || null;
    const name =
      (row.nombre || "").trim() ||
      tiktok ||
      cleanUser(row.telefono) ||
      "";
    if (!name && !tiktok) {
      skipped += 1;
      continue;
    }

    const displayName = name || tiktok || "Sin nombre";
    const phone =
      (row.telefono || "").trim() ||
      (tiktok ? `tiktok:${tiktok}` : `pendiente:${displayName.toLowerCase()}`);
    const niche = (row.nicho || "").trim() || "Pendiente";
    const diamonds = parseDiamonds(row.diamantes);
    if (diamonds > 0) withDiamonds += 1;

    const data = {
      name: displayName,
      phone,
      niche,
      joinDate: parseJoinDate(row.fecha_incorporacion),
      tiktokUser: tiktok || (displayName.includes(" ") ? null : displayName),
      country: (row.pais || "").trim() || "MX",
      status: normalizeStatus(row.estado),
      groupName: cleanGroup(row.grupo),
      notes: (row.notas || "").trim() || null,
      diamonds,
    };

    const existing =
      (tiktok
        ? await prisma.creator.findFirst({
            where: { tiktokUser: tiktok },
            select: { id: true },
          })
        : null) ||
      (await prisma.creator.findFirst({
        where: { phone },
        select: { id: true },
      }));

    let creatorId: string;

    if (existing) {
      await prisma.creator.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          tiktokUser: data.tiktokUser ?? undefined,
          niche: niche === "Pendiente" ? undefined : niche,
          phone: (row.telefono || "").trim() ? phone : undefined,
          country: data.country,
          status: data.status,
          groupName: data.groupName,
          notes: data.notes ?? undefined,
          joinDate: row.fecha_incorporacion ? data.joinDate : undefined,
          // Siempre actualizar diamantes si vienen en el Excel
          diamonds: diamonds > 0 ? diamonds : undefined,
        },
      });
      creatorId = existing.id;
      updated += 1;
    } else {
      const createdRow = await prisma.creator.create({ data });
      creatorId = createdRow.id;
      created += 1;
    }

    // También deja registro en Data (métricas del mes) si hay diamantes
    if (diamonds > 0) {
      const existingMetric = await prisma.metric.findFirst({
        where: {
          creatorId,
          date: { gte: start, lte: end },
        },
        orderBy: { date: "desc" },
      });
      if (existingMetric) {
        await prisma.metric.update({
          where: { id: existingMetric.id },
          data: { diamonds },
        });
      } else {
        await prisma.metric.create({
          data: {
            creatorId,
            date: start,
            diamonds,
            hoursLive: 0,
            peakViewers: 0,
            battles: 0,
            notes: `Import XLSX ${month}`,
          },
        });
      }
    }
  }

  if (created === 0 && updated === 0) {
    return NextResponse.json(
      {
        error:
          "No se pudo importar ninguna fila. Pon al menos un usuario o nombre por fila.",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    created,
    updated,
    skipped,
    withDiamonds,
  });
}
