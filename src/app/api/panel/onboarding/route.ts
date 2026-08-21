import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { CHECK_KEYS, asChecks } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

function serialize(row: {
  id: string;
  creatorName: string;
  phone: string;
  situation: string;
  integrationMonth: string;
  year: number | null;
  month: number | null;
  managerId: string | null;
  managerName: string;
  checks: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    creatorName: row.creatorName,
    phone: row.phone,
    situation: row.situation,
    integrationMonth: row.integrationMonth,
    year: row.year,
    month: row.month,
    managerId: row.managerId,
    managerName: row.managerName,
    checks: asChecks(row.checks),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug } = auth;

  const yearRaw = req.nextUrl.searchParams.get("year");
  const monthRaw = req.nextUrl.searchParams.get("month");
  const year = yearRaw && yearRaw !== "all" ? Number(yearRaw) : null;
  const month = monthRaw && monthRaw !== "all" ? Number(monthRaw) : null;

  const where: Prisma.OnboardingUserWhereInput = {
    agencySlug,
    ...(year && Number.isFinite(year) ? { year } : {}),
    ...(month && Number.isFinite(month) && month >= 1 && month <= 12
      ? { month }
      : {}),
  };

  const [rows, yearRows] = await Promise.all([
    prisma.onboardingUser.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.onboardingUser.findMany({
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
    rows: rows.map(serialize),
    years,
  });
}

const postSchema = z.object({
  action: z.enum(["create", "upsert", "toggle"]),
  id: z.string().optional(),
  creatorName: z.string().optional(),
  phone: z.string().optional(),
  situation: z.string().optional(),
  integrationMonth: z.string().optional(),
  year: z.number().int().optional(),
  month: z.number().int().min(1).max(12).optional(),
  key: z.string().optional(),
  done: z.boolean().optional(),
  checks: z.record(z.string(), z.boolean()).optional(),
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

  if (data.action === "create") {
    const creatorName = (data.creatorName ?? "").trim();
    if (!creatorName) {
      return NextResponse.json({ error: "Falta el creador" }, { status: 400 });
    }
    const now = new Date();
    const year = data.year ?? now.getFullYear();
    const month = data.month ?? now.getMonth() + 1;
    const row = await prisma.onboardingUser.create({
      data: {
        agencySlug,
        creatorName,
        phone: (data.phone ?? "").trim(),
        situation: (data.situation ?? "capacitación").trim() || "capacitación",
        integrationMonth: (data.integrationMonth ?? "").trim(),
        year,
        month,
        managerId: userId ?? null,
        managerName: userName,
        checks: {},
        createdById: userId,
      },
    });
    return NextResponse.json({ ok: true, row: serialize(row) });
  }

  if (!data.id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }

  const existing = await prisma.onboardingUser.findFirst({
    where: { id: data.id, agencySlug },
  });
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  if (data.action === "toggle") {
    if (!data.key || !CHECK_KEYS.includes(data.key)) {
      return NextResponse.json({ error: "Paso inválido" }, { status: 400 });
    }
    const checks = asChecks(existing.checks);
    if (data.done) checks[data.key] = true;
    else delete checks[data.key];
    const row = await prisma.onboardingUser.update({
      where: { id: existing.id },
      data: { checks },
    });
    return NextResponse.json({ ok: true, row: serialize(row) });
  }

  const checks = data.checks ? asChecks(data.checks) : asChecks(existing.checks);
  const row = await prisma.onboardingUser.update({
    where: { id: existing.id },
    data: {
      creatorName: data.creatorName?.trim() || existing.creatorName,
      phone: data.phone != null ? data.phone.trim() : existing.phone,
      situation: data.situation != null ? data.situation.trim() : existing.situation,
      integrationMonth:
        data.integrationMonth != null
          ? data.integrationMonth.trim()
          : existing.integrationMonth,
      checks,
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
  await prisma.onboardingUser.deleteMany({
    where: { id, agencySlug },
  });
  return NextResponse.json({ ok: true });
}
