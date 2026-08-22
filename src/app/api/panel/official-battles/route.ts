import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { dateParts, isoDate, todayIso } from "@/lib/official-battles";

export const dynamic = "force-dynamic";

function toDate(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? new Date(`${todayIso()}T12:00:00.000Z`) : d;
}

function serialize(row: {
  id: string;
  date: Date;
  year: number;
  month: number;
  time: string;
  level: string;
  creatorA: string;
  agencyA: string;
  creatorB: string;
  agencyB: string;
  boosters: string;
  sortOrder: number;
}) {
  return {
    id: row.id,
    date: isoDate(row.date),
    year: row.year,
    month: row.month,
    time: row.time,
    level: row.level,
    creatorA: row.creatorA,
    agencyA: row.agencyA,
    creatorB: row.creatorB,
    agencyB: row.agencyB,
    boosters: row.boosters,
    sortOrder: row.sortOrder,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug } = auth;

  const now = new Date();
  const yearRaw = req.nextUrl.searchParams.get("year");
  const monthRaw = req.nextUrl.searchParams.get("month");
  const year =
    yearRaw === "all"
      ? null
      : yearRaw && Number.isFinite(Number(yearRaw))
        ? Number(yearRaw)
        : now.getFullYear();
  const month =
    monthRaw === "all"
      ? null
      : monthRaw && Number.isFinite(Number(monthRaw))
        ? Number(monthRaw)
        : now.getMonth() + 1;

  const where = {
    agencySlug,
    ...(year && Number.isFinite(year) ? { year } : {}),
    ...(month && Number.isFinite(month) && month >= 1 && month <= 12
      ? { month }
      : {}),
  };

  const [rows, yearRows] = await Promise.all([
    prisma.officialBattle.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.officialBattle.findMany({
      where: { agencySlug },
      select: { year: true },
      distinct: ["year"],
    }),
  ]);

  const years = [
    ...new Set(
      yearRows
        .map((r) => r.year)
        .filter((y): y is number => typeof y === "number")
    ),
  ].sort((a, b) => b - a);

  return NextResponse.json({
    year,
    month,
    rows: rows.map(serialize),
    years,
  });
}

const postSchema = z.object({
  action: z.enum(["create", "upsert"]),
  id: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  year: z.number().int().optional(),
  month: z.number().int().min(1).max(12).optional(),
  level: z.string().optional(),
  creatorA: z.string().optional(),
  agencyA: z.string().optional(),
  creatorB: z.string().optional(),
  agencyB: z.string().optional(),
  boosters: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, token } = auth;
  const userId = (token.id ?? token.sub) as string | undefined;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const data = parsed.data;

  if (data.action === "create") {
    const dateIso = data.date?.slice(0, 10) || todayIso();
    const parts = dateParts(dateIso);
    const year = data.year ?? parts.year;
    const month = data.month ?? parts.month;
    const last = await prisma.officialBattle.findFirst({
      where: { agencySlug, year, month },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const row = await prisma.officialBattle.create({
      data: {
        agencySlug,
        date: toDate(dateIso),
        year,
        month,
        time: (data.time ?? "").trim(),
        level: (data.level ?? "Inicial").trim() || "Inicial",
        creatorA: (data.creatorA ?? "").trim(),
        agencyA: (data.agencyA ?? "").trim(),
        creatorB: (data.creatorB ?? "").trim(),
        agencyB: (data.agencyB ?? "").trim(),
        boosters: (data.boosters ?? "NO").trim() || "NO",
        sortOrder: (last?.sortOrder ?? 0) + 1,
        createdById: userId ?? null,
      },
    });
    return NextResponse.json({ ok: true, row: serialize(row) });
  }

  if (!data.id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }
  const existing = await prisma.officialBattle.findFirst({
    where: { id: data.id, agencySlug },
  });
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const dateIso = data.date?.slice(0, 10) || isoDate(existing.date);
  const parts = dateParts(dateIso);

  const row = await prisma.officialBattle.update({
    where: { id: existing.id },
    data: {
      date: data.date != null ? toDate(dateIso) : existing.date,
      year: data.date != null ? parts.year : existing.year,
      month: data.date != null ? parts.month : existing.month,
      time: data.time != null ? data.time.trim() : existing.time,
      level: data.level != null ? data.level.trim() || existing.level : existing.level,
      creatorA: data.creatorA != null ? data.creatorA.trim() : existing.creatorA,
      agencyA: data.agencyA != null ? data.agencyA.trim() : existing.agencyA,
      creatorB: data.creatorB != null ? data.creatorB.trim() : existing.creatorB,
      agencyB: data.agencyB != null ? data.agencyB.trim() : existing.agencyB,
      boosters:
        data.boosters != null
          ? data.boosters.trim() || existing.boosters
          : existing.boosters,
    },
  });
  return NextResponse.json({ ok: true, row: serialize(row) });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug } = auth;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }
  await prisma.officialBattle.deleteMany({ where: { id, agencySlug } });
  return NextResponse.json({ ok: true });
}
