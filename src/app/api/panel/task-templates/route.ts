import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { POSITIONS, RECURRENCES } from "@/lib/positions";
import { ADMIN_PRESETS } from "@/lib/task-presets";
import { generateTasksForAgency } from "@/lib/task-generator";

export const dynamic = "force-dynamic";

/** Plantillas de tareas fijas por puesto. Solo un admin real (no en modo "ver como"). */
async function gate(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return { error: auth.error };
  if (!auth.isAdmin || !auth.scope.admin) {
    return { error: NextResponse.json({ error: "Solo un admin" }, { status: 403 }) };
  }
  return { agencySlug: auth.agencySlug };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;
  const [templates, people] = await Promise.all([
    prisma.taskTemplate.findMany({
      where: { agencySlug: g.agencySlug },
      orderBy: [{ position: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    }),
    prisma.user.groupBy({
      by: ["position"],
      where: { agencySlug: g.agencySlug, position: { not: null } },
      _count: true,
    }),
  ]);
  return NextResponse.json({
    templates,
    peopleByPosition: Object.fromEntries(people.map((p) => [p.position as string, p._count])),
  });
}

const fields = {
  position: z.enum(POSITIONS),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  priority: z.enum(["baja", "media", "alta"]),
  recurrence: z.enum(RECURRENCES),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  evidenceHint: z.string().trim().max(300).nullable().optional(),
};

const createSchema = z.object(fields);
const patchSchema = z.object({ id: z.string().min(1), active: z.boolean().optional() }).and(z.object(fields).partial());

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;
  const body = await req.json().catch(() => null);

  // Pausar o activar TODAS las tareas fijas de un puesto. Al pausar se pueden quitar también las ya generadas que siguen sin hacerse.
  if (body?.action === "pause_all" || body?.action === "activate_all") {
    const position = String(body.position ?? "");
    if (!(POSITIONS as readonly string[]).includes(position)) {
      return NextResponse.json({ error: "Puesto inválido" }, { status: 400 });
    }
    const activate = body.action === "activate_all";
    const changed = await prisma.taskTemplate.updateMany({ where: { agencySlug: g.agencySlug, position }, data: { active: activate } });
    let removed = 0;
    if (!activate && body.clean === true) {
      // Solo pendientes o en progreso; las hechas (con su evidencia) se conservan
      const del = await prisma.task.deleteMany({
        where: { agencySlug: g.agencySlug, status: { not: "hecha" }, template: { is: { position } } },
      });
      removed = del.count;
    }
    if (activate) await generateTasksForAgency(g.agencySlug, true).catch(() => 0);
    return NextResponse.json({ ok: true, changed: changed.count, removed });
  }

  // Cargar las tareas iniciales (las del manual real de Administración); no pisa las que ya existen.
  if (body?.action === "seed") {
    let created = 0;
    for (const p of ADMIN_PRESETS) {
      const exists = await prisma.taskTemplate.findUnique({
        where: { agencySlug_position_title: { agencySlug: g.agencySlug, position: p.position, title: p.title } },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.taskTemplate.create({
        data: { agencySlug: g.agencySlug, ...p, weekdays: p.weekdays, isPreset: true },
      });
      created++;
    }
    await generateTasksForAgency(g.agencySlug, true).catch(() => 0);
    return NextResponse.json({ ok: true, created });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const d = parsed.data;
  if (d.recurrence === "mensual" && !d.dayOfMonth) {
    return NextResponse.json({ error: "Indica el día del mes" }, { status: 400 });
  }
  try {
    const t = await prisma.taskTemplate.create({
      data: {
        agencySlug: g.agencySlug,
        position: d.position,
        title: d.title,
        description: d.description || null,
        priority: d.priority,
        recurrence: d.recurrence,
        weekdays: [...new Set(d.weekdays)].sort().join(","),
        dayOfMonth: d.recurrence === "mensual" ? d.dayOfMonth ?? null : null,
        dueTime: d.dueTime || null,
        evidenceHint: d.evidenceHint || null,
      },
    });
    await generateTasksForAgency(g.agencySlug, true).catch(() => 0);
    return NextResponse.json({ ok: true, id: t.id });
  } catch {
    return NextResponse.json({ error: "Ya existe una tarea con ese título para ese puesto" }, { status: 409 });
  }
}

export async function PATCH(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { id, weekdays, ...rest } = parsed.data;
  const found = await prisma.taskTemplate.findFirst({ where: { id, agencySlug: g.agencySlug }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  await prisma.taskTemplate.update({
    where: { id },
    data: { ...rest, ...(weekdays ? { weekdays: [...new Set(weekdays)].sort().join(",") } : {}) },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const found = await prisma.taskTemplate.findFirst({ where: { id, agencySlug: g.agencySlug }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  // Las tareas ya generadas se conservan (templateId queda vacío)
  await prisma.taskTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
