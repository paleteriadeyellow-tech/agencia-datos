import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import {
  assertCreatorAccess,
  creatorWhere,
  taskWhere,
} from "@/lib/creator-scope";
import { prisma } from "@/lib/prisma";
import { generateTasksForAgency } from "@/lib/task-generator";
import { currentMonth } from "@/lib/utils";

export const dynamic = "force-dynamic";

function parsePeriod(raw: string | null) {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return currentMonth();
  return raw;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, scope, isAdmin: isAdminUser } = auth;
  const scopeFilter = creatorWhere(scope, agencySlug);

  const period = parsePeriod(req.nextUrl.searchParams.get("period"));

  await generateTasksForAgency(agencySlug).catch(() => 0);

  if (isAdminUser) {
    await prisma.task.updateMany({
      where: { agencySlug, period: "" },
      data: { period },
    });
  }

  const [creators, tasks, users] = await Promise.all([
    prisma.creator.findMany({
      where: scopeFilter,
      select: { id: true, name: true, managerId: true },
      orderBy: { name: "asc" },
    }),
    prisma.task.findMany({
      where: taskWhere(scope, agencySlug, { period }),
      include: {
        creator: { select: { name: true, managerId: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
    // Solo el admin necesita la lista de personas para asignar
    isAdminUser && scope.admin
      ? prisma.user.findMany({
          where: { agencySlug },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  return NextResponse.json({
    period,
    creators,
    users,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      period: t.period,
      dueDate: t.dueDate,
      creator: t.creator
        ? { name: t.creator.name, managerId: t.creator.managerId }
        : null,
      managerId: t.creator?.managerId ?? null,
      creatorId: t.creatorId,
      assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
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

  const existing = await prisma.task.findFirst({
    where: { id: parsed.data.id, agencySlug },
  });
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  // Admin, la persona asignada, o quien lleva al creador de la tarea
  if (!scope.admin && existing.assigneeId !== scope.userId) {
    if (!existing.creatorId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const accessErr = await assertCreatorAccess(
      scope,
      existing.creatorId,
      agencySlug
    );
    if (accessErr) return accessErr;
  }

  await prisma.task.update({
    where: { id: existing.id },
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
  assigneeId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, token, scope } = auth;

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

  let creatorId: string | null = parsed.data.creatorId || null;
  if (creatorId) {
    const accessErr = await assertCreatorAccess(scope, creatorId, agencySlug);
    if (accessErr) return accessErr;
    const creator = await prisma.creator.findFirst({
      where: { id: creatorId, agencySlug },
      select: { id: true },
    });
    if (!creator) {
      return NextResponse.json({ error: "Creador no encontrado" }, { status: 404 });
    }
    creatorId = creator.id;
  }

  const me =
    (typeof token.id === "string" && token.id) ||
    (typeof token.sub === "string" && token.sub) ||
    null;
  // Solo un admin puede asignar a otra persona (de su misma agencia)
  let assigneeId = me;
  const wanted = parsed.data.assigneeId || null;
  if (wanted && wanted !== me) {
    if (!scope.admin) {
      return NextResponse.json({ error: "Solo un admin puede asignar a otra persona" }, { status: 403 });
    }
    const person = await prisma.user.findFirst({
      where: { id: wanted, agencySlug },
      select: { id: true },
    });
    if (!person) {
      return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
    }
    assigneeId = person.id;
  }

  const task = await prisma.task.create({
    data: {
      agencySlug,
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      creatorId,
      assigneeId,
      priority: parsed.data.priority || "media",
      status: parsed.data.status || "pendiente",
      period: parsed.data.period,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });

  return NextResponse.json({ ok: true, id: task.id });
}
