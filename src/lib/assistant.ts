import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { AGENCIES, type AgencySlug } from "@/lib/agencies";
import { buildRobotReport, runRobot } from "@/lib/robot";
import { todayKey } from "@/lib/task-generator";
import { whatsappUrl } from "@/lib/phone";

/**
 * Asistente de órdenes para el admin: "haz esto" y lo hace dentro del panel.
 * Cada herramienta trabaja SOLO con la agencia de la sesión.
 */

export const ASSISTANT_MODEL = "claude-opus-5-5";

/** Lo que el asistente hizo, para mostrarlo en pantalla (tareas creadas, links de WhatsApp, etc.). */
export type AssistantAction =
  | { type: "task"; title: string; assignee: string | null }
  | { type: "note"; creator: string }
  | { type: "update"; text: string }
  | { type: "whatsapp"; name: string; link: string; message: string };

const clean = (v: string) => v.replace(/^@/, "").trim().toLowerCase();
const fmt = (n: number) => Math.round(n).toLocaleString("es-MX");

function fillTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

export function buildAssistantTools(agencySlug: AgencySlug, actor: { id: string; name: string }, actions: AssistantAction[]) {
  const period = () => todayKey().slice(0, 7);

  async function findCreator(name: string) {
    const q = clean(name);
    const all = await prisma.creator.findMany({
      where: {
        agencySlug,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { tiktokUser: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, tiktokUser: true, phone: true, country: true, status: true, managerId: true, manager: { select: { name: true } } },
      take: 10,
    });
    const exact = all.filter((c) => clean(c.name) === q || (c.tiktokUser && clean(c.tiktokUser) === q));
    if (exact.length === 1) return { creator: exact[0] };
    if (all.length === 1) return { creator: all[0] };
    if (!all.length) return { error: `No encontré ningún creador que se llame "${name}".` };
    return { error: `Hay varios creadores que coinciden con "${name}": ${all.map((c) => c.name).join(", ")}. Dime cuál.` };
  }

  async function findUser(name: string) {
    const q = name.trim().toLowerCase();
    const users = await prisma.user.findMany({ where: { agencySlug }, select: { id: true, name: true, role: true, position: true } });
    const exact = users.filter((u) => u.name.toLowerCase() === q);
    const partial = users.filter((u) => u.name.toLowerCase().includes(q));
    const list = exact.length ? exact : partial;
    if (list.length === 1) return { user: list[0] };
    if (!list.length) return { error: `No hay nadie del equipo llamado "${name}". Equipo: ${users.map((u) => u.name).join(", ")}.` };
    return { error: `Varias personas coinciden con "${name}": ${list.map((u) => u.name).join(", ")}. Dime cuál.` };
  }

  async function statsFor(creatorIds: string[]) {
    const rows = await prisma.diamondControl.findMany({ where: { agencySlug, period: period() } });
    const creators = await prisma.creator.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true, tiktokUser: true } });
    const byId = new Map(rows.filter((r) => r.creatorId).map((r) => [r.creatorId!, r]));
    const byNick = new Map(rows.map((r) => [clean(r.username), r]));
    const out = new Map<string, { diamonds: number; hours: number; days: number }>();
    for (const c of creators) {
      const r = byId.get(c.id) ?? (c.tiktokUser ? byNick.get(clean(c.tiktokUser)) : undefined) ?? byNick.get(clean(c.name));
      out.set(c.id, { diamonds: r?.diamonds ?? 0, hours: r?.hours ?? 0, days: r?.days ?? 0 });
    }
    return out;
  }

  const resumenDelDia = betaZodTool({
    name: "resumen_del_dia",
    description:
      "Reporte de hoy de la agencia: diamantes del mes contra la meta, proyección, cuántos creadores están en riesgo / sin LIVE / cerca de subir de nivel, contratos por vencer y tareas atrasadas por persona. Úsalo para preguntas generales de cómo va la agencia.",
    inputSchema: z.object({}),
    run: async () => {
      const r = await buildRobotReport(agencySlug);
      const count = (k: string) => r.creators.filter((c) => c.kind === k).length;
      return JSON.stringify({
        fecha: r.today,
        dia_del_mes: `${r.dayOfMonth}/${r.daysInMonth}`,
        diamantes_mes: r.totalDiamonds,
        meta_mes: r.agencyGoal,
        proyeccion: r.projectedDiamonds,
        creadores_activos: r.activeCreators,
        en_riesgo: count("riesgo"),
        sin_live: count("sin_actividad"),
        cerca_de_nivel: count("cerca"),
        datos_backstage_con_dias_de_antiguedad: r.dataAgeDays,
        contratos_por_vencer: r.contractsExpiring,
        tareas_atrasadas: r.overdueByManager,
      });
    },
  });

  const buscarCreadores = betaZodTool({
    name: "buscar_creadores",
    description:
      "Busca creadores de la agencia con sus números del mes (diamantes, horas, días). Filtra por categoría del robot (riesgo, sin_actividad, cerca), por manager o por texto en el nombre. Devuelve hasta `limite` resultados ordenados por diamantes.",
    inputSchema: z.object({
      categoria: z.enum(["riesgo", "sin_actividad", "cerca", "todos"]).default("todos"),
      manager: z.string().optional().describe("Nombre del manager para ver solo sus creadores"),
      texto: z.string().optional().describe("Parte del nombre o usuario de TikTok"),
      limite: z.number().int().min(1).max(500).default(50),
    }),
    run: async ({ categoria, manager, texto, limite }) => {
      let managerId: string | undefined;
      if (manager) {
        const m = await findUser(manager);
        if ("error" in m) return m.error!;
        managerId = m.user!.id;
      }
      if (categoria !== "todos") {
        const r = await buildRobotReport(agencySlug);
        const list = r.creators
          .filter((c) => c.kind === categoria)
          .filter((c) => !managerId || c.managerId === managerId)
          .filter((c) => !texto || clean(c.name).includes(clean(texto)))
          .slice(0, limite)
          .map((c) => ({ nombre: c.name, manager: c.managerName, diamantes: c.diamonds, horas: c.hours, dias: c.days, nivel: c.level, motivo: c.reason, tiene_telefono: Boolean(c.waLink) }));
        return JSON.stringify({ total: list.length, creadores: list });
      }
      const creators = await prisma.creator.findMany({
        where: {
          agencySlug,
          status: "activo",
          ...(managerId ? { managerId } : {}),
          ...(texto ? { OR: [{ name: { contains: texto, mode: "insensitive" } }, { tiktokUser: { contains: texto, mode: "insensitive" } }] } : {}),
        },
        select: { id: true, name: true, phone: true, manager: { select: { name: true } } },
      });
      const stats = await statsFor(creators.map((c) => c.id));
      const list = creators
        .map((c) => ({ nombre: c.name, manager: c.manager?.name ?? null, ...stats.get(c.id)!, tiene_telefono: Boolean(c.phone) }))
        .sort((a, b) => b.diamonds - a.diamonds)
        .slice(0, limite);
      return JSON.stringify({ total_encontrados: creators.length, mostrando: list.length, creadores: list });
    },
  });

  const verCreador = betaZodTool({
    name: "ver_creador",
    description: "Ficha completa de un creador: datos, manager, números del mes, últimas notas y tareas abiertas.",
    inputSchema: z.object({ creador: z.string().describe("Nombre o usuario de TikTok") }),
    run: async ({ creador }) => {
      const f = await findCreator(creador);
      if ("error" in f) return f.error!;
      const c = f.creator!;
      const [full, stats, notes, tasks] = await Promise.all([
        prisma.creator.findUnique({ where: { id: c.id }, select: { niche: true, joinDate: true, country: true, groupName: true, notes: true, livecoinsStatus: true } }),
        statsFor([c.id]),
        prisma.creatorNote.findMany({ where: { creatorId: c.id }, orderBy: { createdAt: "desc" }, take: 5 }),
        prisma.task.findMany({ where: { creatorId: c.id, status: { not: "hecha" } }, select: { title: true, status: true, dueDate: true }, take: 10 }),
      ]);
      return JSON.stringify({
        nombre: c.name,
        tiktok: c.tiktokUser,
        estado: c.status,
        manager: c.manager?.name ?? null,
        tiene_telefono: Boolean(c.phone),
        ...full,
        mes_actual: stats.get(c.id),
        notas_recientes: notes.map((n) => ({ fecha: n.createdAt.toISOString().slice(0, 10), autor: n.authorName, nota: n.body })),
        tareas_abiertas: tasks,
      });
    },
  });

  const listarEquipo = betaZodTool({
    name: "listar_equipo",
    description: "Lista al equipo de la agencia (managers, admins) con cuántos creadores tiene cada uno y sus tareas pendientes / atrasadas.",
    inputSchema: z.object({}),
    run: async () => {
      const today = new Date(`${todayKey()}T00:00:00.000Z`);
      const users = await prisma.user.findMany({
        where: { agencySlug },
        select: {
          name: true,
          role: true,
          position: true,
          _count: { select: { creators: { where: { status: "activo" } } } },
          tasks: { where: { status: { not: "hecha" } }, select: { dueDate: true } },
        },
      });
      return JSON.stringify(
        users.map((u) => ({
          nombre: u.name,
          rol: u.role,
          puesto: u.position,
          creadores_activos: u._count.creators,
          tareas_pendientes: u.tasks.length,
          tareas_atrasadas: u.tasks.filter((t) => t.dueDate && t.dueDate < today).length,
        }))
      );
    },
  });

  const verTareas = betaZodTool({
    name: "ver_tareas",
    description: "Lista tareas sin terminar de la agencia, opcionalmente de una persona y/o solo las atrasadas. Devuelve el id de cada tarea.",
    inputSchema: z.object({
      persona: z.string().optional(),
      solo_atrasadas: z.boolean().default(false),
      limite: z.number().int().min(1).max(200).default(40),
    }),
    run: async ({ persona, solo_atrasadas, limite }) => {
      let assigneeId: string | undefined;
      if (persona) {
        const u = await findUser(persona);
        if ("error" in u) return u.error!;
        assigneeId = u.user!.id;
      }
      const today = new Date(`${todayKey()}T00:00:00.000Z`);
      const where = { agencySlug, status: { not: "hecha" }, ...(assigneeId ? { assigneeId } : {}), ...(solo_atrasadas ? { dueDate: { lt: today } } : {}) };
      const [total, tasks] = await Promise.all([
        prisma.task.count({ where }),
        prisma.task.findMany({
          where,
          orderBy: { dueDate: "asc" },
          take: limite,
          select: { id: true, title: true, priority: true, status: true, dueDate: true, assignee: { select: { name: true } }, creator: { select: { name: true } } },
        }),
      ]);
      return JSON.stringify({
        total,
        tareas: tasks.map((t) => ({ id: t.id, titulo: t.title, prioridad: t.priority, estado: t.status, fecha: t.dueDate?.toISOString().slice(0, 10) ?? null, asignada_a: t.assignee?.name ?? null, creador: t.creator?.name ?? null })),
      });
    },
  });

  const crearTarea = betaZodTool({
    name: "crear_tarea",
    description: "Crea una tarea en el panel y se la asigna a alguien del equipo. Puede ir ligada a un creador.",
    inputSchema: z.object({
      titulo: z.string().min(3),
      descripcion: z.string().optional(),
      asignar_a: z.string().optional().describe("Nombre de la persona del equipo. Si se omite, queda sin asignar."),
      creador: z.string().optional().describe("Creador relacionado con la tarea"),
      prioridad: z.enum(["baja", "media", "alta"]).default("media"),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Fecha límite YYYY-MM-DD; por defecto hoy"),
    }),
    run: async (i) => {
      let assignee: { id: string; name: string } | null = null;
      if (i.asignar_a) {
        const u = await findUser(i.asignar_a);
        if ("error" in u) return u.error!;
        assignee = u.user!;
      }
      let creatorId: string | null = null;
      if (i.creador) {
        const f = await findCreator(i.creador);
        if ("error" in f) return f.error!;
        creatorId = f.creator!.id;
      }
      const day = i.fecha ?? todayKey();
      const t = await prisma.task.create({
        data: {
          agencySlug,
          title: i.titulo,
          description: [i.descripcion, `Creada por el asistente a pedido de ${actor.name}.`].filter(Boolean).join("\n\n"),
          assigneeId: assignee?.id ?? null,
          creatorId,
          priority: i.prioridad,
          status: "pendiente",
          period: day.slice(0, 7),
          dueDate: new Date(`${day}T00:00:00.000Z`),
        },
      });
      actions.push({ type: "task", title: i.titulo, assignee: assignee?.name ?? null });
      return `Tarea creada (id ${t.id}) para ${assignee?.name ?? "nadie (sin asignar)"} con fecha ${day}.`;
    },
  });

  const completarTarea = betaZodTool({
    name: "marcar_tarea_hecha",
    description: "Marca una tarea como hecha usando su id (sácalo de ver_tareas).",
    inputSchema: z.object({ id: z.string() }),
    run: async ({ id }) => {
      const t = await prisma.task.findFirst({ where: { id, agencySlug }, select: { title: true } });
      if (!t) return "No encontré esa tarea en esta agencia.";
      await prisma.task.update({ where: { id }, data: { status: "hecha" } });
      actions.push({ type: "update", text: `Tarea marcada como hecha: ${t.title}` });
      return `Listo, "${t.title}" quedó como hecha.`;
    },
  });

  const agregarNota = betaZodTool({
    name: "agregar_nota",
    description: "Agrega una nota a la ficha de un creador (seguimiento, acuerdos, observaciones).",
    inputSchema: z.object({ creador: z.string(), nota: z.string().min(2) }),
    run: async ({ creador, nota }) => {
      const f = await findCreator(creador);
      if ("error" in f) return f.error!;
      await prisma.creatorNote.create({ data: { creatorId: f.creator!.id, authorId: actor.id, authorName: actor.name, body: nota } });
      actions.push({ type: "note", creator: f.creator!.name });
      return `Nota agregada a ${f.creator!.name}.`;
    },
  });

  const asignarManager = betaZodTool({
    name: "asignar_manager",
    description: "Cambia el manager responsable de un creador.",
    inputSchema: z.object({ creador: z.string(), manager: z.string() }),
    run: async ({ creador, manager }) => {
      const f = await findCreator(creador);
      if ("error" in f) return f.error!;
      const u = await findUser(manager);
      if ("error" in u) return u.error!;
      await prisma.creator.update({ where: { id: f.creator!.id }, data: { managerId: u.user!.id } });
      actions.push({ type: "update", text: `${f.creator!.name} ahora es de ${u.user!.name}` });
      return `${f.creator!.name} quedó asignado a ${u.user!.name} (antes: ${f.creator!.manager?.name ?? "nadie"}).`;
    },
  });

  const cambiarEstado = betaZodTool({
    name: "cambiar_estado_creador",
    description: "Cambia el estado de un creador: activo, pausado o baja. Pide confirmación al usuario antes de dar de baja.",
    inputSchema: z.object({ creador: z.string(), estado: z.enum(["activo", "pausado", "baja"]) }),
    run: async ({ creador, estado }) => {
      const f = await findCreator(creador);
      if ("error" in f) return f.error!;
      await prisma.creator.update({ where: { id: f.creator!.id }, data: { status: estado } });
      actions.push({ type: "update", text: `${f.creator!.name}: ${f.creator!.status} → ${estado}` });
      return `${f.creator!.name} pasó de "${f.creator!.status}" a "${estado}".`;
    },
  });

  const prepararWhatsapp = betaZodTool({
    name: "preparar_whatsapp",
    description:
      "Prepara mensajes de WhatsApp personalizados con link listo para enviar (el usuario solo da clic). Elige a quién: una lista de nombres o una categoría del robot (riesgo, sin_actividad, cerca), opcionalmente solo de un manager. El texto puede usar {nombre}, {diamantes}, {horas}, {dias}. Escribe mensajes cálidos y cortos, en español latino.",
    inputSchema: z.object({
      creadores: z.array(z.string()).optional().describe("Nombres de creadores"),
      categoria: z.enum(["riesgo", "sin_actividad", "cerca"]).optional(),
      manager: z.string().optional(),
      mensaje: z.string().min(5).describe("Texto del mensaje con variables opcionales {nombre} {diamantes} {horas} {dias}"),
    }),
    run: async ({ creadores, categoria, manager, mensaje }) => {
      let targets: { id: string; name: string; phone: string; country: string | null; managerId: string | null }[] = [];
      const missing: string[] = [];
      if (creadores?.length) {
        for (const n of creadores) {
          const f = await findCreator(n);
          if ("error" in f) missing.push(f.error!);
          else targets.push({ id: f.creator!.id, name: f.creator!.name, phone: f.creator!.phone, country: f.creator!.country, managerId: f.creator!.managerId });
        }
      } else if (categoria) {
        const r = await buildRobotReport(agencySlug);
        const ids = r.creators.filter((c) => c.kind === categoria).map((c) => c.creatorId);
        targets = await prisma.creator.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, phone: true, country: true, managerId: true } });
      } else {
        return "Dime a quién: una lista de creadores o una categoría (riesgo, sin_actividad, cerca).";
      }
      if (manager) {
        const u = await findUser(manager);
        if ("error" in u) return u.error!;
        targets = targets.filter((t) => t.managerId === u.user!.id);
      }
      const stats = await statsFor(targets.map((t) => t.id));
      let ok = 0;
      const noPhone: string[] = [];
      for (const t of targets) {
        const s = stats.get(t.id) ?? { diamonds: 0, hours: 0, days: 0 };
        const text = fillTemplate(mensaje, {
          nombre: t.name.split(/\s+/)[0],
          diamantes: fmt(s.diamonds),
          horas: s.hours.toFixed(1),
          dias: String(s.days),
        });
        const base = t.phone ? whatsappUrl(t.phone, t.country) : null;
        if (!base) {
          noPhone.push(t.name);
          continue;
        }
        actions.push({ type: "whatsapp", name: t.name, link: `${base}?text=${encodeURIComponent(text)}`, message: text });
        ok++;
      }
      return `Preparé ${ok} mensajes con link listo (aparecen en pantalla con botón para enviar).` +
        (noPhone.length ? ` Sin teléfono: ${noPhone.join(", ")}.` : "") +
        (missing.length ? ` Problemas: ${missing.join(" ")}` : "");
    },
  });

  const correrRobot = betaZodTool({
    name: "correr_robot",
    description: "Corre el robot diario ahora: crea las tareas fijas del día y las tareas de contacto para cada manager con sus creadores en riesgo.",
    inputSchema: z.object({}),
    run: async () => {
      const r = await runRobot(agencySlug);
      actions.push({ type: "update", text: `Robot: ${r.managerTasksCreated} tareas de contacto y ${r.tasksCreated} tareas fijas` });
      return `Robot corrido: ${r.managerTasksCreated} tareas de contacto nuevas y ${r.tasksCreated} tareas fijas del día (si ya existían hoy no se duplican).`;
    },
  });

  return [
    resumenDelDia,
    buscarCreadores,
    verCreador,
    listarEquipo,
    verTareas,
    crearTarea,
    completarTarea,
    agregarNota,
    asignarManager,
    cambiarEstado,
    prepararWhatsapp,
    correrRobot,
  ];
}

export function assistantSystemPrompt(agencySlug: AgencySlug, actorName: string) {
  return `Eres el asistente de operaciones de la agencia de TikTok LIVE "${AGENCIES[agencySlug].name}" (LATAM). Hablas con ${actorName}, el dueño/admin. Hoy es ${todayKey()} (hora de México).

Tu trabajo: cuando el admin te da una orden ("haz esto"), la ejecutas con tus herramientas dentro del panel, y luego le confirmas en pocas líneas qué hiciste. Si te pregunta algo, consulta los datos antes de responder; no inventes números.

Cómo trabajar:
- Actúa directamente en órdenes claras (crear tareas, notas, preparar mensajes, asignar manager, correr el robot). No pidas permiso para eso.
- Pide confirmación ANTES de: dar de baja o pausar creadores, o cambiar algo de más de 20 creadores a la vez. Di exactamente qué vas a cambiar.
- Si un nombre es ambiguo, pregunta cuál.
- Los mensajes de WhatsApp NO se envían solos: tú los preparas y el admin da clic para enviarlos. Díselo así.
- Contexto de metas: el Nivel 1 de bonos pide 40,000 diamantes, 20 horas y 10 días válidos en el mes. Los datos vienen del último Excel de Backstage subido.
- Responde en español latino, corto y claro, con listas cuando ayuden. Nada de jerga técnica.`;
}

export const anthropic = () => new Anthropic();
