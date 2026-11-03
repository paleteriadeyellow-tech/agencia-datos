import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { evidenceStorage } from "@/lib/evidence-storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024; // el límite de una petición en Vercel es ~4.5 MB
const NO_STORE = { "Cache-Control": "no-store" };

/** Quien hace la tarea sube su evidencia (foto + nota opcional) y la tarea queda como hecha. */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, scope } = auth;

  const form = await req.formData().catch(() => null);
  const taskId = String(form?.get("taskId") ?? "");
  const note = String(form?.get("note") ?? "").trim().slice(0, 1000) || null;
  const file = form?.get("file");
  if (!taskId || !(file instanceof File)) {
    return NextResponse.json({ error: "Falta la tarea o la foto." }, { status: 400, headers: NO_STORE });
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return NextResponse.json({ error: "La evidencia debe ser una imagen (JPG, PNG o WebP)." }, { status: 400, headers: NO_STORE });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "La foto pesa demasiado (máx. 4 MB)." }, { status: 413, headers: NO_STORE });
  }

  const task = await prisma.task.findFirst({ where: { id: taskId, agencySlug }, select: { id: true, assigneeId: true } });
  if (!task) return NextResponse.json({ error: "Tarea no encontrada." }, { status: 404, headers: NO_STORE });
  // Solo la persona a quien se asignó (en modo "ver como" no se puede subir en nombre de otra)
  if (task.assigneeId !== scope.userId || scope.userId !== auth.token.id) {
    return NextResponse.json({ error: "Esta tarea no es tuya." }, { status: 403, headers: NO_STORE });
  }

  const { storage, error: storageError } = await evidenceStorage();
  if (!storage) {
    return NextResponse.json({ error: `El almacenamiento de fotos no está disponible: ${storageError}.` }, { status: 503, headers: NO_STORE });
  }
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${agencySlug}/${task.id}-${Date.now()}.${ext}`;
  const { error: upErr } = await storage.upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: "No se pudo subir la foto. Intenta de nuevo." }, { status: 502, headers: NO_STORE });
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      status: "hecha",
      evidencePath: path,
      evidenceNote: note,
      evidenceAt: new Date(),
      reviewedAt: null,
      reviewNote: null,
    },
  });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/** Solo un admin real: lista de evidencias para revisar lo que hace cada persona. */
async function adminGate(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return { error: auth.error };
  if (!auth.isAdmin || !auth.scope.admin) {
    return { error: NextResponse.json({ error: "Solo un admin" }, { status: 403, headers: NO_STORE }) };
  }
  return { agencySlug: auth.agencySlug };
}

export async function GET(req: NextRequest) {
  const g = await adminGate(req);
  if (g.error) return g.error;

  const since = new Date(Date.now() - 45 * 24 * 3600 * 1000);
  const tasks = await prisma.task.findMany({
    where: { agencySlug: g.agencySlug, evidenceAt: { gte: since } },
    include: { assignee: { select: { id: true, name: true, position: true } } },
    orderBy: { evidenceAt: "desc" },
    take: 300,
  });

  // Enlaces temporales (1 h) a las fotos privadas
  const { storage } = await evidenceStorage();
  const urls = new Map<string, string>();
  if (storage && tasks.length) {
    const paths = tasks.map((t) => t.evidencePath).filter((p): p is string => !!p);
    const { data } = await storage.createSignedUrls(paths, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }

  return NextResponse.json(
    {
      items: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        person: t.assignee ? { id: t.assignee.id, name: t.assignee.name, position: t.assignee.position } : null,
        note: t.evidenceNote,
        at: t.evidenceAt,
        photo: t.evidencePath ? urls.get(t.evidencePath) ?? null : null,
        status: t.status,
        reviewedAt: t.reviewedAt,
        reviewNote: t.reviewNote,
        dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      })),
    },
    { headers: NO_STORE }
  );
}

const reviewSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["aprobar", "devolver"]),
  note: z.string().trim().max(500).optional(),
});

export async function PATCH(req: NextRequest) {
  const g = await adminGate(req);
  if (g.error) return g.error;
  const parsed = reviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400, headers: NO_STORE });
  const { id, action, note } = parsed.data;

  const task = await prisma.task.findFirst({ where: { id, agencySlug: g.agencySlug }, select: { id: true, evidenceAt: true } });
  if (!task || !task.evidenceAt) return NextResponse.json({ error: "No encontrada" }, { status: 404, headers: NO_STORE });
  if (action === "devolver" && !note) {
    return NextResponse.json({ error: "Escribe el motivo para devolverla." }, { status: 400, headers: NO_STORE });
  }

  await prisma.task.update({
    where: { id },
    data:
      action === "aprobar"
        ? { reviewedAt: new Date(), reviewNote: null }
        : // Devuelta: la persona la vuelve a ver pendiente, con el motivo, y debe enviar otra evidencia
          { status: "pendiente", reviewedAt: null, reviewNote: note },
  });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
