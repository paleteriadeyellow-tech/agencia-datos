import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isCallEmpty, isCallSlot } from "@/lib/one-on-one";

export const dynamic = "force-dynamic";

function serialize(row: {
  id: string;
  date: string;
  slot: string;
  creatorName: string;
  top: string;
  reason: string;
  needF: string;
  needO: string;
  needD: string;
  needA: string;
  managerName: string;
}) {
  return {
    id: row.id,
    date: row.date,
    slot: row.slot,
    creatorName: row.creatorName,
    top: row.top,
    reason: row.reason,
    needF: row.needF,
    needO: row.needO,
    needD: row.needD,
    needA: row.needA,
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
    prisma.oneOnOneCall.findMany({
      where: { agencySlug, year, month },
      orderBy: [{ date: "asc" }, { slot: "asc" }],
    }),
    prisma.oneOnOneCall.findMany({
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
    slots: rows.map(serialize),
    years,
  });
}

const postSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.string(),
  creatorName: z.string().optional(),
  top: z.string().optional(),
  reason: z.string().optional(),
  needF: z.string().optional(),
  needO: z.string().optional(),
  needD: z.string().optional(),
  needA: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, token } = auth;
  const userId = (token.id ?? token.sub) as string | undefined;
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
  if (!isCallSlot(data.slot)) {
    return NextResponse.json({ error: "Horario inválido" }, { status: 400 });
  }

  const [y, m] = data.date.split("-").map(Number);
  const payload = {
    creatorName: (data.creatorName ?? "").trim(),
    top: (data.top ?? "").trim(),
    reason: (data.reason ?? "").trim(),
    needF: (data.needF ?? "").trim(),
    needO: (data.needO ?? "").trim(),
    needD: (data.needD ?? "").trim(),
    needA: (data.needA ?? "").trim(),
  };

  if (isCallEmpty(payload)) {
    await prisma.oneOnOneCall.deleteMany({
      where: { agencySlug, date: data.date, slot: data.slot },
    });
    return NextResponse.json({ ok: true, slot: null });
  }

  const row = await prisma.oneOnOneCall.upsert({
    where: {
      agencySlug_date_slot: {
        agencySlug,
        date: data.date,
        slot: data.slot,
      },
    },
    create: {
      agencySlug,
      date: data.date,
      year: y!,
      month: m!,
      slot: data.slot,
      ...payload,
      managerId: userId ?? null,
      managerName: userName,
    },
    update: payload,
  });

  return NextResponse.json({ ok: true, slot: serialize(row) });
}
