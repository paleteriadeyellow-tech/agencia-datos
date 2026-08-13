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

function cleanUser(v: string) {
  return v.replace(/^@/, "").trim().toLowerCase();
}

function parseNum(v: unknown) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug } = auth;

  const period = parsePeriod(req.nextUrl.searchParams.get("period"));
  const rows = await prisma.diamondControl.findMany({
    where: { agencySlug, period },
    include: {
      creator: { select: { id: true, name: true, tiktokUser: true } },
    },
    orderBy: [{ diamonds: "desc" }, { username: "asc" }],
  });

  const totalDiamonds = rows.reduce((a, r) => a + r.diamonds, 0);

  return NextResponse.json({
    period,
    totalDiamonds,
    totalUsers: rows.length,
    rows: rows.map((r) => ({
      id: r.id,
      period: r.period,
      username: r.username,
      diamonds: r.diamonds,
      hours: r.hours,
      days: r.days,
      notes: r.notes,
      creatorId: r.creatorId,
      creatorName: r.creator?.name ?? null,
      updatedAt: r.updatedAt,
    })),
  });
}

const upsertSchema = z.object({
  id: z.string().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  username: z.string().min(1),
  diamonds: z.number().int().min(0).optional(),
  hours: z.number().min(0).optional(),
  days: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
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

  // Import masivo
  if (
    body &&
    typeof body === "object" &&
    Array.isArray((body as { rows?: unknown }).rows)
  ) {
    const period = parsePeriod(
      String((body as { period?: string }).period || "")
    );
    const rows = (body as { rows: Record<string, unknown>[] }).rows;
    let upserted = 0;
    let skipped = 0;

    const creators = await prisma.creator.findMany({
      where: { agencySlug },
      select: { id: true, name: true, tiktokUser: true },
    });
    const byUser = new Map<string, string>();
    for (const c of creators) {
      if (c.tiktokUser) byUser.set(c.tiktokUser.toLowerCase(), c.id);
      byUser.set(c.name.toLowerCase(), c.id);
    }

    for (const raw of rows) {
      const username = cleanUser(
        String(
          raw.username ??
            raw.usuario ??
            raw.tiktok ??
            raw.nombre ??
            raw.name ??
            ""
        )
      );
      if (!username) {
        skipped += 1;
        continue;
      }
      const diamonds = Math.round(
        parseNum(raw.diamonds ?? raw.diamantes ?? raw.diamond)
      );
      const hours = parseNum(raw.hours ?? raw.horas);
      const days = Math.max(0, Math.round(parseNum(raw.days ?? raw.dias)));
      const creatorId = byUser.get(username);

      await prisma.diamondControl.upsert({
        where: {
          agencySlug_period_username: { agencySlug, period, username },
        },
        create: {
          agencySlug,
          period,
          username,
          diamonds,
          hours,
          days,
          creatorId,
        },
        update: {
          diamonds,
          hours,
          days,
          creatorId: creatorId ?? undefined,
        },
      });

      if (creatorId && diamonds > 0) {
        await prisma.creator.update({
          where: { id: creatorId },
          data: { diamonds },
        });
      }
      upserted += 1;
    }

    return NextResponse.json({ ok: true, upserted, skipped, period });
  }

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const username = cleanUser(parsed.data.username);
  if (!username) {
    return NextResponse.json({ error: "Usuario obligatorio" }, { status: 400 });
  }

  const creators = await prisma.creator.findMany({
    where: { agencySlug },
    select: { id: true, name: true, tiktokUser: true },
  });
  const creator = creators.find(
    (c) =>
      c.tiktokUser?.toLowerCase() === username ||
      c.name.toLowerCase() === username
  );

  const data = {
    period: parsed.data.period,
    username,
    diamonds: parsed.data.diamonds,
    hours: parsed.data.hours,
    days: parsed.data.days,
    notes: parsed.data.notes === undefined ? undefined : parsed.data.notes,
    creatorId: creator?.id ?? undefined,
  };

  let row;
  if (parsed.data.id) {
    const existing = await prisma.diamondControl.findFirst({
      where: { id: parsed.data.id, agencySlug },
    });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    row = await prisma.diamondControl.update({
      where: { id: existing.id },
      data,
    });
  } else {
    row = await prisma.diamondControl.upsert({
      where: {
        agencySlug_period_username: {
          agencySlug,
          period: parsed.data.period,
          username,
        },
      },
      create: {
        agencySlug,
        period: parsed.data.period,
        username,
        diamonds: parsed.data.diamonds ?? 0,
        hours: parsed.data.hours ?? 0,
        days: parsed.data.days ?? 0,
        notes: parsed.data.notes ?? null,
        creatorId: creator?.id,
      },
      update: data,
    });
  }

  if (creator && (parsed.data.diamonds ?? 0) > 0) {
    await prisma.creator.update({
      where: { id: creator.id },
      data: { diamonds: parsed.data.diamonds },
    });
  }

  return NextResponse.json({ ok: true, row });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug } = auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }
  const existing = await prisma.diamondControl.findFirst({
    where: { id, agencySlug },
  });
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  await prisma.diamondControl.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
