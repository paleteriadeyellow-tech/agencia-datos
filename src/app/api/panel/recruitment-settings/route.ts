import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const schema = z.object({
  expiryMode: z.enum(["fixed", "column", "off"]).optional(),
  validityDays: z.number().int().min(1).max(90).optional(),
  soonDays: z.number().int().min(0).max(30).optional(),
  messageKey: z.string().regex(/^[a-zA-Z0-9_]{1,40}$/).optional(),
  videoKey: z.string().regex(/^[a-zA-Z0-9_]{1,40}$/).optional(),
});

/** Las reglas son de toda la agencia: solo un admin real (no en modo "ver como") las cambia. */
export async function PATCH(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  if (!auth.isAdmin || !auth.scope.admin) {
    return NextResponse.json({ error: "Solo un admin puede cambiar las reglas" }, { status: 403, headers: NO_STORE });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400, headers: NO_STORE });
  const { agencySlug } = auth;
  const row = await prisma.recruitmentSettings.upsert({
    where: { agencySlug },
    update: parsed.data,
    create: { agencySlug, ...parsed.data },
  });
  return NextResponse.json(
    { ok: true, settings: { expiryMode: row.expiryMode, validityDays: row.validityDays, soonDays: row.soonDays, messageKey: row.messageKey, videoKey: row.videoKey } },
    { headers: NO_STORE }
  );
}
