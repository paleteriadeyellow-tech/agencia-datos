import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  STEP_KEYS,
  dateParts,
  defaultSheetColumns,
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

/** Color de fila válido (#RRGGBB) o nada. */
function validColor(v: string | undefined | null) {
  return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
}

/** Valores de las columnas personalizadas: llaves simples y texto corto. */
function asExtra(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(k)) continue;
    const s = v == null ? "" : String(v).slice(0, 500);
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
  extra: Prisma.JsonValue;
  rowColor: string | null;
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
    extra: asExtra(row.extra),
    rowColor: row.rowColor,
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
      orderBy: [{ requestDate: "asc" }, { createdAt: "asc" }],
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

  // Primera vez: se crean las columnas de la hoja (las de siempre + las de la hoja de cálculo de la agencia)
  let columns = await prisma.recruitmentColumn.findMany({ where: { agencySlug }, orderBy: { sortOrder: "asc" } });
  if (columns.length === 0) {
    await prisma.recruitmentColumn.createMany({
      data: defaultSheetColumns().map((c, i) => ({ agencySlug, key: c.key, label: c.label, type: c.type, options: c.options ?? null, sortOrder: i, hidden: c.hidden, builtin: c.builtin })),
      skipDuplicates: true,
    });
    columns = await prisma.recruitmentColumn.findMany({ where: { agencySlug }, orderBy: { sortOrder: "asc" } });
  }

  // Reglas del seguimiento (se crean con los valores de siempre la primera vez)
  const settingsRow = await prisma.recruitmentSettings.upsert({ where: { agencySlug }, update: {}, create: { agencySlug } });

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
    settings: {
      expiryMode: settingsRow.expiryMode,
      validityDays: settingsRow.validityDays,
      soonDays: settingsRow.soonDays,
      requiredKeys: settingsRow.requiredKeys.split(",").filter(Boolean),
    },
    columns: columns.map((c) => ({ id: c.id, key: c.key, label: c.label, type: c.type, options: c.options, sortOrder: c.sortOrder, hidden: c.hidden, builtin: c.builtin, color: c.color })),
  });
}

const cellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]).transform(
  (v) => (v == null ? "" : String(v))
);

const rowSchema = z.object({
  recruiter: cellSchema.optional(),
  requestDate: cellSchema.nullable().optional(),
  creatorName: cellSchema.optional(),
  situation: cellSchema.optional(),
  phone: cellSchema.optional(),
  comment: cellSchema.optional(),
  comment2: cellSchema.optional(),
  recontact: cellSchema.optional(),
  integrationDate: cellSchema.nullable().optional(),
  managerId: z.string().nullable().optional(),
  steps: z.record(z.string(), cellSchema).optional(),
  extra: z.record(z.string(), cellSchema).optional(),
  rowColor: cellSchema.optional(),
});

const postSchema = z.object({
  action: z.enum(["create", "upsert", "import"]),
  id: z.string().optional(),
  rows: z.array(rowSchema).max(2000).optional(),
  replace: z.boolean().optional(),
  ...rowSchema.shape,
});

export async function POST(req: NextRequest) {
  try {
    return await postRecruitment(req);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "No se pudo guardar el reclutamiento";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function postRecruitment(req: NextRequest) {
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
    // Si el nombre viene vacío a propósito (fila nueva de la hoja) se queda vacío; si no viene, se usa el de siempre
    const creatorName = data.creatorName === undefined ? "Nuevo creador" : data.creatorName.trim();
    const requestDate = toDate(data.requestDate ?? null);
    const parts = dateParts(isoDate(requestDate));
    let recruiter = (data.recruiter ?? "").trim();
    let managerId = data.managerId ?? null;
    if (!admin) {
      recruiter = recruiter || userName;
      managerId = userId ?? null;
    } else if (!recruiter && managerId) {
      recruiter = users.find((u) => u.id === managerId)?.name ?? "";
    } else if (!managerId) {
      managerId = resolveManager(recruiter, null);
    }
    const row = await prisma.recruitmentLead.create({
      data: {
        agencySlug,
        recruiter,
        managerId,
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
        steps: asSteps(data.steps),
        extra: asExtra(data.extra),
        rowColor: validColor(data.rowColor),
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
    const mergedSteps = asSteps({ ...asSteps(existing.steps), ...(data.steps ?? {}) });
    // Los valores vacíos de las columnas personalizadas se quitan (asExtra los descarta)
    const mergedExtra = asExtra({ ...asExtra(existing.extra), ...(data.extra ?? {}) });
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
        extra: mergedExtra,
        rowColor: data.rowColor !== undefined ? validColor(data.rowColor) : existing.rowColor,
      },
    });
    return NextResponse.json({ ok: true, row: serialize(row) });
  }

  const incoming = data.rows ?? [];
  if (!incoming.length) {
    return NextResponse.json({ error: "Sin filas para importar" }, { status: 400 });
  }
  if (!admin) {
    return NextResponse.json(
      { error: "Solo un admin puede importar Excel." },
      { status: 403 }
    );
  }

  // replace: la hoja queda exactamente como el archivo (se borra lo que había y se carga lo nuevo)
  const replaceAll = data.replace === true;
  const existing = replaceAll
    ? []
    : await prisma.recruitmentLead.findMany({
        where: { agencySlug },
        select: { id: true, creatorName: true, recruiter: true, managerId: true },
      });
  const byKey = new Map(
    existing.map((row) => [
      `${row.creatorName.trim().toLowerCase()}|${row.recruiter.trim().toLowerCase()}`,
      row,
    ])
  );

  const toCreate: Prisma.RecruitmentLeadCreateManyInput[] = [];
  const toUpdate: { id: string; data: Prisma.RecruitmentLeadUpdateInput }[] = [];
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
      const ok = canTouch({ managerId, recruiter }, false, userId, userName);
      if (!ok) {
        skipped += 1;
        continue;
      }
    }
    const requestDate = toDate(item.requestDate || null);
    const parts = dateParts(item.requestDate || isoDate(requestDate));
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
      integrationDate: toDate(item.integrationDate || null),
      steps: asSteps(item.steps) as Prisma.InputJsonValue,
      extra: asExtra(item.extra) as Prisma.InputJsonValue,
    };
    const key = `${creatorName.toLowerCase()}|${recruiter.toLowerCase()}`;
    const found = byKey.get(key);
    if (found) {
      if (!canTouch(found, admin, userId, userName)) {
        skipped += 1;
        continue;
      }
      if (found.id.startsWith("new-")) {
        // Misma persona repetida dentro del archivo: aún no existe en la base, así que se junta con la fila que se va a crear
        const idx = Number(found.id.slice(4)) - 1;
        const prev = toCreate[idx];
        if (prev) {
          const pick = (a: string | null | undefined, b: string) => (b ? b : a ?? "");
          toCreate[idx] = {
            ...prev,
            ...payload,
            situation: pick(prev.situation, payload.situation),
            phone: pick(prev.phone, payload.phone),
            comment: pick(prev.comment, payload.comment),
            comment2: pick(prev.comment2, payload.comment2),
            recontact: pick(prev.recontact, payload.recontact),
            requestDate: payload.requestDate ?? prev.requestDate ?? null,
            integrationDate: payload.integrationDate ?? prev.integrationDate ?? null,
            steps: { ...(prev.steps as Record<string, string>), ...(payload.steps as Record<string, string>) },
            extra: { ...(prev.extra as Record<string, string>), ...(payload.extra as Record<string, string>) },
          };
        }
        continue;
      }
      toUpdate.push({ id: found.id, data: payload });
    } else {
      toCreate.push({ agencySlug, createdById: userId, ...payload });
      byKey.set(key, {
        id: `new-${toCreate.length}`,
        creatorName,
        recruiter,
        managerId,
      });
    }
  }

  if (replaceAll) {
    // Borrar y cargar en una sola transacción: si algo falla, no se pierde lo que había
    await prisma.$transaction(
      [
        prisma.recruitmentLead.deleteMany({ where: { agencySlug } }),
        ...Array.from({ length: Math.ceil(toCreate.length / 80) }, (_, k) =>
          prisma.recruitmentLead.createMany({ data: toCreate.slice(k * 80, k * 80 + 80) })
        ),
      ],
    );
  } else {
    for (let i = 0; i < toCreate.length; i += 80) {
      await prisma.recruitmentLead.createMany({
        data: toCreate.slice(i, i + 80),
      });
    }
  }
  for (let i = 0; i < toUpdate.length; i += 20) {
    const chunk = toUpdate.slice(i, i + 20);
    await prisma.$transaction(
      chunk.map((item) =>
        prisma.recruitmentLead.update({
          where: { id: item.id },
          data: item.data,
        })
      )
    );
  }

  return NextResponse.json({
    ok: true,
    upserted: toCreate.length + toUpdate.length,
    skipped,
  });
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
