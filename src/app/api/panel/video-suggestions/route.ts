import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { isMissingSchema, prisma } from "@/lib/prisma";
import { dateParts, isoDate, todayIso } from "@/lib/video-suggestions";

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
  contentType: string;
  contentIdea: string;
  objective: string;
  suggestedBy: string;
  videoUrl: string;
  boostRequest: string;
  managerToCreate: string;
  managerToCreateId: string | null;
  replicateMode: string;
  replicateCreators: string;
  videoCreated: string;
  script: string;
}) {
  return {
    id: row.id,
    date: isoDate(row.date),
    year: row.year,
    month: row.month,
    contentType: row.contentType,
    contentIdea: row.contentIdea,
    objective: row.objective,
    suggestedBy: row.suggestedBy,
    videoUrl: row.videoUrl,
    boostRequest: row.boostRequest,
    managerToCreate: row.managerToCreate,
    managerToCreateId: row.managerToCreateId,
    replicateMode: row.replicateMode,
    replicateCreators: row.replicateCreators,
    videoCreated: row.videoCreated,
    script: row.script,
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

  try {
    const [rows, yearRows, managers] = await Promise.all([
      prisma.videoSuggestion.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      prisma.videoSuggestion.findMany({
        where: { agencySlug },
        select: { year: true },
        distinct: ["year"],
      }),
      prisma.user.findMany({
        where: { agencySlug },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
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
      managers: managers.map((m) => ({ id: m.id, name: m.name, role: m.role })),
    });
  } catch (e) {
    if (isMissingSchema(e)) {
      const managers = await prisma.user.findMany({
        where: { agencySlug },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({
        year,
        month,
        rows: [],
        years: [],
        managers: managers.map((m) => ({ id: m.id, name: m.name, role: m.role })),
      });
    }
    console.error("video-suggestions GET", e);
    return NextResponse.json(
      { error: "No se pudieron cargar las sugerencias. Reintenta." },
      { status: 500 }
    );
  }
}

const postSchema = z.object({
  action: z.enum(["create", "upsert"]),
  id: z.string().optional(),
  date: z.string().optional(),
  year: z.number().int().optional(),
  month: z.number().int().min(1).max(12).optional(),
  contentType: z.string().optional(),
  contentIdea: z.string().optional(),
  objective: z.string().optional(),
  suggestedBy: z.string().optional(),
  videoUrl: z.string().optional(),
  boostRequest: z.string().optional(),
  managerToCreate: z.string().optional(),
  managerToCreateId: z.string().nullable().optional(),
  replicateMode: z.string().optional(),
  replicateCreators: z.string().optional(),
  videoCreated: z.string().optional(),
  script: z.string().optional(),
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
    const now = new Date();
    const dateIso = data.date?.slice(0, 10) || todayIso();
    const parts = dateParts(dateIso);
    const year = data.year ?? parts.year;
    const month = data.month ?? parts.month ?? now.getMonth() + 1;
    const row = await prisma.videoSuggestion.create({
      data: {
        agencySlug,
        date: toDate(dateIso),
        year,
        month,
        contentType: (data.contentType ?? "VIDEO").trim() || "VIDEO",
        contentIdea: (data.contentIdea ?? "").trim(),
        objective: (data.objective ?? "").trim(),
        suggestedBy: (data.suggestedBy ?? userName).trim() || userName,
        videoUrl: (data.videoUrl ?? "").trim(),
        boostRequest: (data.boostRequest ?? "NO").trim() || "NO",
        managerToCreate: (data.managerToCreate ?? "").trim(),
        managerToCreateId: data.managerToCreateId || null,
        replicateMode: (data.replicateMode ?? "SOLO MANAGERS").trim() || "SOLO MANAGERS",
        replicateCreators: (data.replicateCreators ?? "").trim(),
        videoCreated: (data.videoCreated ?? "AUN NO").trim() || "AUN NO",
        script: (data.script ?? "").trim(),
        createdById: userId ?? null,
      },
    });
    return NextResponse.json({ ok: true, row: serialize(row) });
  }

  if (!data.id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }
  const existing = await prisma.videoSuggestion.findFirst({
    where: { id: data.id, agencySlug },
  });
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const dateIso = data.date?.slice(0, 10) || isoDate(existing.date);
  const parts = dateParts(dateIso);

  const row = await prisma.videoSuggestion.update({
    where: { id: existing.id },
    data: {
      date: data.date != null ? toDate(dateIso) : existing.date,
      year: data.date != null ? parts.year : existing.year,
      month: data.date != null ? parts.month : existing.month,
      contentType:
        data.contentType != null
          ? data.contentType.trim() || existing.contentType
          : existing.contentType,
      contentIdea:
        data.contentIdea != null ? data.contentIdea.trim() : existing.contentIdea,
      objective:
        data.objective != null ? data.objective.trim() : existing.objective,
      suggestedBy:
        data.suggestedBy != null ? data.suggestedBy.trim() : existing.suggestedBy,
      videoUrl: data.videoUrl != null ? data.videoUrl.trim() : existing.videoUrl,
      boostRequest:
        data.boostRequest != null
          ? data.boostRequest.trim() || existing.boostRequest
          : existing.boostRequest,
      managerToCreate:
        data.managerToCreate != null
          ? data.managerToCreate.trim()
          : existing.managerToCreate,
      managerToCreateId:
        data.managerToCreateId !== undefined
          ? data.managerToCreateId
          : existing.managerToCreateId,
      replicateMode:
        data.replicateMode != null
          ? data.replicateMode.trim() || existing.replicateMode
          : existing.replicateMode,
      replicateCreators:
        data.replicateCreators != null
          ? data.replicateCreators.trim()
          : existing.replicateCreators,
      videoCreated:
        data.videoCreated != null
          ? data.videoCreated.trim() || existing.videoCreated
          : existing.videoCreated,
      script: data.script != null ? data.script : existing.script,
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
  await prisma.videoSuggestion.deleteMany({ where: { id, agencySlug } });
  return NextResponse.json({ ok: true });
}
