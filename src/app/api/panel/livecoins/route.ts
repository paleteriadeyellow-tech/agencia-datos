import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { assertCreatorAccess, creatorWhere } from "@/lib/creator-scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUSES = ["pendiente", "habilitada", "contactado", "no_quiere"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, scope } = auth;

  const creators = await prisma.creator.findMany({
    where: { status: { not: "baja" }, ...creatorWhere(scope, agencySlug) },
    select: {
      id: true,
      name: true,
      tiktokUser: true,
      phone: true,
      country: true,
      niche: true,
      status: true,
      diamonds: true,
      livecoinsStatus: true,
      livecoinsComment: true,
    },
  });

  const counts = {
    pendiente: 0,
    habilitada: 0,
    contactado: 0,
    no_quiere: 0,
  };
  for (const c of creators) {
    const s = (c.livecoinsStatus || "pendiente") as keyof typeof counts;
    if (s in counts) counts[s] += 1;
    else counts.pendiente += 1;
  }

  const rows = creators
    .map((c) => ({
      ...c,
      diamonds: c.diamonds ?? 0,
      livecoinsStatus: (c.livecoinsStatus ||
        "pendiente") as (typeof STATUSES)[number],
      livecoinsComment: c.livecoinsComment ?? "",
      hasApp: (c.livecoinsStatus || "pendiente") === "habilitada",
    }))
    .sort((a, b) => {
      if (b.diamonds !== a.diamonds) return b.diamonds - a.diamonds;
      return a.name.localeCompare(b.name);
    });

  return NextResponse.json({
    creators: rows,
    counts,
    total: creators.length,
  });
}

const patchSchema = z
  .object({
    id: z.string().min(1),
    livecoinsStatus: z.enum(STATUSES).optional(),
    livecoinsComment: z.string().nullable().optional(),
  })
  .refine(
    (v) => v.livecoinsStatus !== undefined || v.livecoinsComment !== undefined,
    { message: "Nada que actualizar" }
  );

export async function PATCH(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, scope } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const existing = await prisma.creator.findFirst({
    where: { id: parsed.data.id, agencySlug },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const accessErr = await assertCreatorAccess(scope, existing.id, agencySlug);
  if (accessErr) return accessErr;

  const data: { livecoinsStatus?: string; livecoinsComment?: string | null } =
    {};
  if (parsed.data.livecoinsStatus !== undefined) {
    data.livecoinsStatus = parsed.data.livecoinsStatus;
  }
  if (parsed.data.livecoinsComment !== undefined) {
    const c = parsed.data.livecoinsComment?.trim() || null;
    data.livecoinsComment = c;
  }

  const row = await prisma.creator.update({
    where: { id: existing.id },
    data,
    select: {
      id: true,
      livecoinsStatus: true,
      livecoinsComment: true,
    },
  });

  return NextResponse.json({ ok: true, row });
}
