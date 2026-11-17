import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireApiAuth } from "@/lib/api-auth";
import { type AgencySlug } from "@/lib/agencies";
import { prisma } from "@/lib/prisma";
import { importDiamondRows } from "@/lib/backstage-import-server";
import { todayKey } from "@/lib/task-generator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  filename: z.string().max(200),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  rows: z
    .array(
      z.object({
        username: z.string().min(1).max(100),
        diamantes: z.number().min(0),
        horas: z.number().min(0),
        dias: z.number().min(0),
      })
    )
    .min(1)
    .max(10000),
});

/** "Subir Excel y actualizar todo": importa el Excel de Backstage, corre el robot y devuelve qué cambió. */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  if (!auth.isAdmin) return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "No pude leer los datos del Excel." }, { status: 400 });

  const userId = String(auth.token.id);
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });

  try {
    const summary = await importDiamondRows(
      auth.agencySlug as AgencySlug,
      parsed.data.period ?? todayKey().slice(0, 7),
      parsed.data.rows,
      { userId, userName: me?.name ?? "Admin", filename: parsed.data.filename, runRobotAfter: true }
    );
    return NextResponse.json({ summary });
  } catch (e) {
    console.error("robot/import", e);
    return NextResponse.json({ error: "Error al importar. Intenta de nuevo." }, { status: 500 });
  }
}
