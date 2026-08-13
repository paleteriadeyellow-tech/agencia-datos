import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { currentMonth } from "@/lib/utils";

export const dynamic = "force-dynamic";

function parsePeriod(raw: string | null) {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return currentMonth();
  return raw;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;

  const period = parsePeriod(req.nextUrl.searchParams.get("period"));

  // Backfill: tareas sin periodo → periodo solicitado
  await prisma.task.updateMany({
    where: { period: "" },
    data: { period },
  });

  const [creators, tasks] = await Promise.all([
    prisma.creator.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.task.findMany({
      where: { period },
      include: { creator: { select: { name: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
  ]);

  return NextResponse.json({
    period,
    creators,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      period: t.period,
      dueDate: t.dueDate,
      creator: t.creator ? { name: t.creator.name } : null,
    })),
  });
}

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["pendiente", "en_progreso", "hecha"]),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;

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

  await prisma.task.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status },
  });

  return NextResponse.json({ ok: true });
}

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  creatorId: z.string().nullable().optional(),
  priority: z.enum(["baja", "media", "alta"]).optional(),
  status: z.enum(["pendiente", "en_progreso", "hecha"]).optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  dueDate: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      creatorId: parsed.data.creatorId || null,
      assigneeId: (auth.token?.sub as string | undefined) || null,
      priority: parsed.data.priority || "media",
      status: parsed.data.status || "pendiente",
      period: parsed.data.period,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });

  return NextResponse.json({ ok: true, id: task.id });
}
