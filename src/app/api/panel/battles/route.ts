import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isBattleColumn } from "@/lib/battles";

export const dynamic = "force-dynamic";

function serialize(row: {
  id: string;
  year: number;
  month: number;
  columnKey: string;
  creatorName: string;
  note: string;
  color: string;
  done: boolean;
  sortOrder: number;
  managerName: string;
}) {
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    columnKey: row.columnKey,
    creatorName: row.creatorName,
    note: row.note,
    color: row.color,
    done: row.done,
    sortOrder: row.sortOrder,
    managerName: row.managerName,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug } = auth;

  const now = new Date();
  const year = Number(req.nextUrl.searchParams.get("year")) || now.getFullYear();
  const month = Number(req.nextUrl.searchParams.get("month")) || now.getMonth() + 1;

  const [rows, yearRows] = await Promise.all([
    prisma.battleGraduation.findMany({
      where: { agencySlug, year, month },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.battleGraduation.findMany({
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
  year: z.number().int().optional(),
  month: z.number().int().min(1).max(12).optional(),
  columnKey: z.string().optional(),
  creatorName: z.string().optional(),
  note: z.string().optional(),
  color: z.string().optional(),
  done: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, token } = auth;
  const userName = (token.name as string | undefined) ?? "";

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
    const creatorName = (data.creatorName ?? "").trim();
    if (!creatorName) {
      return NextResponse.json({ error: "Falta el creador" }, { status: 400 });
    }
    if (!data.columnKey || !isBattleColumn(data.columnKey)) {
      return NextResponse.json({ error: "Columna inválida" }, { status: 400 });
    }
    const now = new Date();
    const year = data.year ?? now.getFullYear();
    const month = data.month ?? now.getMonth() + 1;
    const last = await prisma.battleGraduation.findFirst({
      where: { agencySlug, year, month, columnKey: data.columnKey },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const row = await prisma.battleGraduation.create({
      data: {
        agencySlug,
        year,
        month,
        columnKey: data.columnKey,
        creatorName,
        note: (data.note ?? "").trim(),
        color: data.color || "none",
        done: Boolean(data.done),
        sortOrder: (last?.sortOrder ?? 0) + 1,
        managerName: userName,
      },
    });
    return NextResponse.json({ ok: true, row: serialize(row) });
  }

  if (!data.id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }
  const existing = await prisma.battleGraduation.findFirst({
    where: { id: data.id, agencySlug },
  });
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (data.columnKey && !isBattleColumn(data.columnKey)) {
    return NextResponse.json({ error: "Columna inválida" }, { status: 400 });
  }

  const row = await prisma.battleGraduation.update({
    where: { id: existing.id },
    data: {
      creatorName: data.creatorName?.trim() || existing.creatorName,
      note: data.note != null ? data.note.trim() : existing.note,
      color: data.color ?? existing.color,
      done: data.done ?? existing.done,
      columnKey: data.columnKey ?? existing.columnKey,
      sortOrder: data.sortOrder ?? existing.sortOrder,
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
  await prisma.battleGraduation.deleteMany({ where: { id, agencySlug } });
  return NextResponse.json({ ok: true });
}
