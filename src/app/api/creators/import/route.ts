import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const s = String(value).trim().replace(/\s/g, "").replace(/,/g, "");
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

async function runInChunks<T>(
  items: T[],
  size: number,
  fn: (chunk: T[]) => Promise<void>
) {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size));
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, token } = auth;
  if (token.role !== "admin") {
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

  try {
    const existing = await prisma.creator.findMany({
      where: { agencySlug },
      select: { id: true, tiktokUser: true, phone: true },
    });
    const byTiktok = new Map<string, string>();
    const byPhone = new Map<string, string>();
    for (const c of existing) {
      if (c.tiktokUser) byTiktok.set(c.tiktokUser.toLowerCase(), c.id);
      if (c.phone) byPhone.set(c.phone.toLowerCase(), c.id);
    }

    type CreateRow = {
      agencySlug: string;
      name: string;
      phone: string;
      niche: string;
      joinDate: Date;
      tiktokUser: string | null;
      country: string;
      status: string;
      groupName: string | null;
      notes: string | null;
      diamonds: number;
    };
    type UpdateRow = {
      id: string;
      name: string;
      tiktokUser: string | null;
      niche: string;
      phone: string;
      phoneProvided: boolean;
      country: string;
      status: string;
      groupName: string | null;
      notes: string | null;
      joinDate: Date;
      joinProvided: boolean;
      diamonds: number;
    };

    const toCreate: CreateRow[] = [];
    const toUpdate: UpdateRow[] = [];
    let skipped = 0;
    let withDiamonds = 0;
    const seenKeys = new Set<string>();

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

      const dedupeKey = (tiktok || phone).toLowerCase();
      if (seenKeys.has(dedupeKey)) {
        skipped += 1;
        continue;
      }
      seenKeys.add(dedupeKey);

      const existingId =
        (tiktok ? byTiktok.get(tiktok.toLowerCase()) : undefined) ||
        byPhone.get(phone.toLowerCase());

      if (existingId) {
        toUpdate.push({
          id: existingId,
          name: displayName,
          tiktokUser: tiktok || (displayName.includes(" ") ? null : displayName),
          niche,
          phone,
          phoneProvided: Boolean((row.telefono || "").trim()),
          country: (row.pais || "").trim() || "MX",
          status: normalizeStatus(row.estado),
          groupName: cleanGroup(row.grupo),
          notes: (row.notas || "").trim() || null,
          joinDate: parseJoinDate(row.fecha_incorporacion),
          joinProvided: Boolean(row.fecha_incorporacion),
          diamonds,
        });
      } else {
        const tiktokUser =
          tiktok || (displayName.includes(" ") ? null : displayName);
        toCreate.push({
          agencySlug,
          name: displayName,
          phone,
          niche,
          joinDate: parseJoinDate(row.fecha_incorporacion),
          tiktokUser,
          country: (row.pais || "").trim() || "MX",
          status: normalizeStatus(row.estado),
          groupName: cleanGroup(row.grupo),
          notes: (row.notas || "").trim() || null,
          diamonds,
        });
        // evita duplicados en el mismo archivo
        if (tiktokUser) byTiktok.set(tiktokUser.toLowerCase(), "pending");
        byPhone.set(phone.toLowerCase(), "pending");
      }
    }

    if (toCreate.length === 0 && toUpdate.length === 0) {
      return NextResponse.json(
        {
          error:
            "No se pudo importar ninguna fila. Pon al menos un usuario o nombre por fila.",
        },
        { status: 400 }
      );
    }

    if (toCreate.length) {
      await runInChunks(toCreate, 100, async (chunk) => {
        await prisma.creator.createMany({ data: chunk });
      });
    }

    if (toUpdate.length) {
      await runInChunks(toUpdate, 25, async (chunk) => {
        await prisma.$transaction(
          chunk.map((u) =>
            prisma.creator.update({
              where: { id: u.id },
              data: {
                name: u.name,
                tiktokUser: u.tiktokUser ?? undefined,
                niche: u.niche === "Pendiente" ? undefined : u.niche,
                phone: u.phoneProvided ? u.phone : undefined,
                country: u.country,
                status: u.status,
                groupName: u.groupName,
                notes: u.notes ?? undefined,
                joinDate: u.joinProvided ? u.joinDate : undefined,
                diamonds: u.diamonds > 0 ? u.diamonds : undefined,
              },
            })
          )
        );
      });
    }

    return NextResponse.json({
      ok: true,
      created: toCreate.length,
      updated: toUpdate.length,
      skipped,
      withDiamonds,
    });
  } catch (e) {
    console.error("creators/import", e);
    const msg = e instanceof Error ? e.message : "Error";
    if (/P1001|Can't reach|timed out/i.test(msg)) {
      return NextResponse.json(
        { error: "No se pudo conectar a la base. Revisa DATABASE_URL (pooler)." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Error al importar. Intenta con menos filas o revisa el Excel." },
      { status: 500 }
    );
  }
}
