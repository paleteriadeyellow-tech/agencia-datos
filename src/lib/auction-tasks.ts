import { prisma } from "@/lib/prisma";

const DAY = 86_400_000;

type Step = { key: string; offset: number; title: string; priority?: "baja" | "media" | "alta" };

/**
 * Flujo de trabajo de cada edición (offset = días respecto a la fecha del evento).
 * Son los pasos del prompt de la dirección; no incluye reglas económicas ni pujas.
 */
export const AUCTION_STEPS: Step[] = [
  { key: "m7-reclutamiento", offset: -7, title: "Iniciar el reclutamiento de creadores", priority: "alta" },
  { key: "m7-registro", offset: -7, title: "Abrir o activar el registro de inscripciones", priority: "alta" },
  { key: "m7-buscar", offset: -7, title: "Buscar creadores" },
  { key: "m7-contactar", offset: -7, title: "Contactar a posibles participantes" },
  { key: "m7-disponibilidad", offset: -7, title: "Confirmar la disponibilidad de los participantes" },
  { key: "m7-grupo", offset: -7, title: "Incorporar a los participantes al grupo de WhatsApp (manualmente)" },

  { key: "m5-instrucciones", offset: -5, title: "Enviar instrucciones de participación" },
  { key: "m5-dinamica", offset: -5, title: "Explicar la dinámica" },
  { key: "m5-reglas", offset: -5, title: "Compartir las reglas aprobadas por la dirección" },
  { key: "m5-presentacion", offset: -5, title: "Solicitar la presentación personal" },
  { key: "m5-nombre", offset: -5, title: "Verificar que los participantes puedan cambiar su nombre" },
  { key: "m5-camara", offset: -5, title: "Confirmar cámara o imagen representativa" },

  { key: "m3-presentaciones", offset: -3, title: "Revisar las presentaciones" },
  { key: "m3-conexion", offset: -3, title: "Confirmar conexión y disponibilidad" },
  { key: "m3-orden", offset: -3, title: "Organizar el orden de participación" },
  { key: "m3-materiales", offset: -3, title: "Preparar los materiales gráficos" },
  { key: "m3-promocion", offset: -3, title: "Publicar la promoción del evento" },

  { key: "m1-confirmacion", offset: -1, title: "Enviar la confirmación final", priority: "alta" },
  { key: "m1-asistencia", offset: -1, title: "Revisar la lista de asistencia" },
  { key: "m1-nombres", offset: -1, title: "Confirmar nombres e imágenes" },
  { key: "m1-guion", offset: -1, title: "Preparar el guion de la anfitriona" },
  { key: "m1-recordatorio", offset: -1, title: "Enviar el recordatorio al grupo" },

  { key: "d0-lista", offset: 0, title: "Día del evento: revisar la lista de participantes", priority: "alta" },
  { key: "d0-produccion", offset: 0, title: "Día del evento: checklist de producción", priority: "alta" },

  { key: "p1-evaluacion", offset: 1, title: "Solicitar la evaluación de la edición" },
  { key: "p1-resultados", offset: 1, title: "Registrar los resultados" },
  { key: "p1-observaciones", offset: 1, title: "Guardar las observaciones" },
  { key: "p1-siguiente", offset: 1, title: "Preparar la próxima edición" },
];

export const OFFSET_LABEL: Record<number, string> = {
  [-7]: "7 días antes", [-5]: "5 días antes", [-3]: "3 días antes", [-1]: "1 día antes", 0: "Día del evento", 1: "1 día después",
};

export function addDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY).toISOString().slice(0, 10);
}

type Edition = { id: string; number: number; date: string; time: string; host: string };

const dueOf = (date: string, offset: number) => addDays(date, offset);

/** Crea los pasos que falten de la edición. Idempotente: (edición, paso) es único. Devuelve cuántos creó. */
export async function ensureEditionTasks(agencySlug: string, e: Edition, assigneeId: string | null) {
  const desc = `Edición #${e.number} de la Subasta de Creadores · ${e.date} ${e.time} · Anfitriona: ${e.host}`;
  const res = await prisma.task.createMany({
    data: AUCTION_STEPS.map((s) => {
      const due = dueOf(e.date, s.offset);
      return {
        agencySlug, title: `Subasta #${e.number}: ${s.title}`, description: desc, assigneeId,
        priority: s.priority ?? "media", status: "pendiente", period: due.slice(0, 7),
        dueDate: new Date(`${due}T00:00:00.000Z`), auctionEditionId: e.id, auctionKey: s.key,
      };
    }),
    skipDuplicates: true,
  });
  return res.count;
}

/** Recalcula los vencimientos de lo que aún no se ha hecho (al reprogramar). Lo hecho no se toca. */
export async function rescheduleEditionTasks(agencySlug: string, e: Edition) {
  const open = await prisma.task.findMany({
    where: { agencySlug, auctionEditionId: e.id, status: { not: "hecha" } },
    select: { id: true, auctionKey: true },
  });
  const offsets = new Map(AUCTION_STEPS.map((s) => [s.key, s.offset]));
  await Promise.all(open.flatMap((t) => {
    const off = t.auctionKey ? offsets.get(t.auctionKey) : undefined;
    if (off === undefined) return [];
    const due = dueOf(e.date, off);
    return [prisma.task.update({ where: { id: t.id }, data: { dueDate: new Date(`${due}T00:00:00.000Z`), period: due.slice(0, 7) } })];
  }));
}

/** Al cancelar: se quitan los pasos sin hacer y sin evidencia; lo hecho se conserva. */
export async function removePendingEditionTasks(agencySlug: string, editionId: string) {
  await prisma.task.deleteMany({ where: { agencySlug, auctionEditionId: editionId, status: { not: "hecha" }, evidenceAt: null } });
}
