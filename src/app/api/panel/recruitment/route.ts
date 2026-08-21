import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  STEP_KEYS,
  dateParts,
  matchManagerId,
} from "@/lib/recruitment";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDate(value: Date | null | undefined) {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function asSteps(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!STEP_KEYS.includes(k)) continue;
    const s = v == null ? "" : String(v);
    if (s) out[k] = s;
  }
  return out;
}

function serialize(row: {
  id: string;
  recruiter: string;
  managerId: string | null;
  requestDate: Date | null;
  year: number | null;
  month: number | null;
  creatorName: string;
  situation: string;
  phone: string;
  comment: string;
  comment2: string;
  recontact: string;
  integrationDate: Date | null;
  steps: Prisma.JsonValue;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    recruiter: row.recruiter,
    managerId: row.managerId,
    requestDate: isoDate(row.requestDate),
    year: row.year,
    month: row.month,
    creatorName: row.creatorName,
    situation: row.situation,
    phone: row.phone,
    comment: row.comment,
    comment2: row.comment2,
    recontact: row.recontact,
    integrationDate: isoDate(row.integrationDate),
    steps: asSteps(row.steps),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function managerWhere(
  agencySlug: string,
  isAdminUser: boolean,
  userId: string | undefined
): Promise<Prisma.RecruitmentLeadWhereInput> {
  const base: Prisma.RecruitmentLeadWhereInput = { agencySlug };
  if (isAdminUser || !userId) return base;
  const me = await prisma.user.findFirst({
    where: { id: userId, agencySlug },
    select: { name: true },
  });
  const names = [me?.name, me?.name?.split(/\s+/)[0]]
    .map((n) => n?.trim())
    .filter((n): n is string => Boolean(n));
  return {
    agencySlug,
    OR: [
      { managerId: userId },
      ...names.map((name) => ({
        recruiter: { equals: name, mode: "insensitive" as const },
      })),
    ],
  };
}

function canTouch(
  row: { managerId: string | null; recruiter: string },
  isAdminUser: boolean,
  userId: string | undefined,
  userName: string | undefined
) {
  if (isAdminUser) return true;
  if (!userId) return false;
  if (row.managerId === userId) return true;
  const rec = row.recruiter.trim().toLowerCase();
  const n = (userName ?? "").trim().toLowerCase();
  const first = n.split(/\s+/)[0] ?? "";
  return Boolean(rec && (rec === n || rec === first));
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, isAdmin: admin, token } = auth;
  const userId = (token.id ?? token.sub) as string | undefined;

  const yearRaw = req.nextUrl.searchParams.get("year");
  const monthRaw = req.nextUrl.searchParams.get("month");
  const year = yearRaw && yearRaw !== "all" ? Number(yearRaw) : null;
  const month = monthRaw && monthRaw !== "all" ? Number(monthRaw) : null;

  const scope = await managerWhere(agencySlug, admin, userId);
  const where: Prisma.RecruitmentLeadWhereInput = {
    ...scope,
    ...(year && Number.isFinite(year) ? { year } : {}),
    ...(month && Number.isFinite(month) && month >= 1 && month <= 12
      ? { month }
      : {}),
  };

  const [rows, users, yearRows] = await Promise.all([
    prisma.recruitmentLead.findMany({
      where,
      orderBy: [{ requestDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.user.findMany({
      where: { agencySlug },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.recruitmentLead.findMany({
      where: scope,
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
    isAdmin: admin,
    rows: rows.map(serialize),
    managers: users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    years,
  });
}

const rowSchema = z.object({
  recruiter: z.string().optional(),
  requestDate: z.string().nullable().optional(),
  creatorName: z.string().optional(),
  situation: z.string().optional(),
  phone: z.string().optional(),
  comment: z.string().optional(),
  comment2: z.string().optional(),
  recontact: z.string().optional(),
  integrationDate: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  steps: z.record(z.string()).optional(),
});

const postSchema = z.object({
  action: z.enum(["create", "upsert", "import"]),
  id: z.string().optional(),
  rows: z.array(rowSchema).max(2000).optional(),
  ...rowSchema.shape,
});

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, isAdmin: admin, token } = auth;
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

  const users = await prisma.user.findMany({
    where: { agencySlug },
    select: { id: true, name: true },
  });

  function resolveManager(recruiter: string, explicit?: string | null) {
    if (!admin) return userId ?? null;
    if (explicit) return explicit;
    return matchManagerId(recruiter, users);
  }

  if (data.action === "create") {
    const recruiter = admin
      ? (data.recruiter ?? "").trim()
      : (data.recruiter ?? userName).trim() || userName;
    const creatorName = (data.creatorName ?? "").trim() || "Nuevo creador";
    const requestDate = toDate(data.requestDate ?? null);
    const parts = dateParts(isoDate(requestDate));
    const row = await prisma.recruitmentLead.create({
      data: {
        agencySlug,
        recruiter,
        managerId: resolveManager(recruiter, data.managerId),
        requestDate,
        year: parts.year,
        month: parts.month,
        creatorName,
        situation: data.situation ?? "pendiente",
        phone: data.phone ?? "",
        comment: data.comment ?? "",
        comment2: data.comment2 ?? "",
        recontact: data.recontact ?? "",
        integrationDate: toDate(data.integrationDate ?? null),
        steps: {},
        createdById: userId,
      },
    });
    return NextResponse.json({ ok: true, row: serialize(row) });
  }

  if (data.action === "upsert") {
    if (!data.id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }
    const existing = await prisma.recruitmentLead.findFirst({
      where: { id: data.id, agencySlug },
    });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (!canTouch(existing, admin, userId, userName)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const recruiter = data.recruiter ?? existing.recruiter;
    const requestDate =
      data.requestDate !== undefined
        ? toDate(data.requestDate)
        : existing.requestDate;
    const parts = dateParts(isoDate(requestDate));
    const mergedSteps = {
      ...asSteps(existing.steps),
      ...asSteps(data.steps),
    };
    const row = await prisma.recruitmentLead.update({
      where: { id: existing.id },
      data: {
        recruiter,
        managerId: admin
          ? data.managerId !== undefined
            ? data.managerId
            : resolveManager(recruiter, existing.managerId)
          : existing.managerId ?? userId,
        requestDate,
        year: parts.year,
        month: parts.month,
        creatorName: data.creatorName ?? existing.creatorName,
        situation: data.situation ?? existing.situation,
        phone: data.phone ?? existing.phone,
        comment: data.comment ?? existing.comment,
        comment2: data.comment2 ?? existing.comment2,
        recontact: data.recontact ?? existing.recontact,
        integrationDate:
          data.integrationDate !== undefined
            ? toDate(data.integrationDate)
            : existing.integrationDate,
        steps: mergedSteps,
      },
    });
    return NextResponse.json({ ok: true, row: serialize(row) });
  }

  const incoming = data.rows ?? [];
  if (!incoming.length) {
    return NextResponse.json({ error: "Sin filas para importar" }, { status: 400 });
  }

  let upserted = 0;
  let skipped = 0;
  for (const item of incoming) {
    const creatorName = (item.creatorName ?? "").trim().replace(/^@/, "");
    if (!creatorName) {
      skipped += 1;
      continue;
    }
    let recruiter = (item.recruiter ?? "").trim();
    if (!admin && !recruiter) recruiter = userName;
    const managerId = resolveManager(recruiter, item.managerId);
    if (!admin) {
      const ok = canTouch(
        { managerId, recruiter },
        false,
        userId,
        userName
      );
      if (!ok) {
        skipped += 1;
        continue;
      }
    }
    const requestDate = toDate(item.requestDate ?? null);
    const parts = dateParts(item.requestDate ?? isoDate(requestDate));
    const existing = await prisma.recruitmentLead.findFirst({
      where: {
        agencySlug,
        creatorName: { equals: creatorName, mode: "insensitive" },
        recruiter: { equals: recruiter, mode: "insensitive" },
      },
    });
    const payload = {
      recruiter,
      managerId,
      requestDate,
      year: parts.year,
      month: parts.month,
      creatorName,
      situation: item.situation ?? "",
      phone: item.phone ?? "",
      comment: item.comment ?? "",
      comment2: item.comment2 ?? "",
      recontact: item.recontact ?? "",
      integrationDate: toDate(item.integrationDate ?? null),
      steps: asSteps(item.steps),
    };
    if (existing) {
      if (!canTouch(existing, admin, userId, userName)) {
        skipped += 1;
        continue;
      }
      await prisma.recruitmentLead.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      await prisma.recruitmentLead.create({
        data: { agencySlug, createdById: userId, ...payload },
      });
    }
    upserted += 1;
  }

  return NextResponse.json({ ok: true, upserted, skipped });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, isAdmin: admin, token } = auth;
  const userId = (token.id ?? token.sub) as string | undefined;
  const userName = (token.name as string | undefined) ?? "";
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const existing = await prisma.recruitmentLead.findFirst({
    where: { id, agencySlug },
  });
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (!canTouch(existing, admin, userId, userName)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.recruitmentLead.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
