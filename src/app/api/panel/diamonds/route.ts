import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import {
  assertCreatorAccess,
  assertCreatorNickAccess,
  creatorWhere,
  diamondWhere,
  readScope,
} from "@/lib/creator-scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parsePeriod(raw: string | null) {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  return raw;
}

function cleanUser(v: string) {
  return v.replace(/^@/, "").trim().toLowerCase();
}

function parseNum(v: unknown) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, scope } = auth;
  // Metas de creadores (scope=metas) sigue el permiso de "ver todos"; Control de diamantes sigue mostrando solo lo propio
  const forMetas = req.nextUrl.searchParams.get("scope") === "metas";
  const whereScope = await diamondWhere(forMetas ? readScope(scope) : scope, agencySlug);

  const period = parsePeriod(req.nextUrl.searchParams.get("period"));
  const rows = await prisma.diamondControl.findMany({
    where: { period, ...whereScope },
    include: {
      creator: { select: { id: true, name: true, tiktokUser: true, managerId: true } },
    },
    orderBy: [{ diamonds: "desc" }, { username: "asc" }],
  });

  const totalDiamonds = rows.reduce((a, r) => a + r.diamonds, 0);

  return NextResponse.json({
    period,
    totalDiamonds,
    totalUsers: rows.length,
    rows: rows.map((r) => ({
      id: r.id,
      period: r.period,
      username: r.username,
      diamonds: r.diamonds,
      hours: r.hours,
      days: r.days,
      notes: r.notes,
      creatorId: r.creatorId,
      creatorName: r.creator?.name ?? null,
      managerId: r.creator?.managerId ?? null,
      updatedAt: r.updatedAt,
    })),
  });
}

const upsertSchema = z.object({
  id: z.string().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  username: z.string().min(1),
  diamonds: z.number().int().min(0).optional(),
  hours: z.number().min(0).optional(),
  days: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, scope, isAdmin } = auth;
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Solo el admin puede importar o editar diamantes" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Import masivo
  if (
    body &&
    typeof body === "object" &&
    Array.isArray((body as { rows?: unknown }).rows)
  ) {
    const period = parsePeriod(
      String((body as { period?: string }).period || "")
    );
    const rows = (body as { rows: Record<string, unknown>[] }).rows;

    try {
      const creators = await prisma.creator.findMany({
        where: creatorWhere(scope, agencySlug),
        select: { id: true, name: true, tiktokUser: true },
      });
      const byUser = new Map<string, string>();
      for (const c of creators) {
        if (c.tiktokUser) byUser.set(c.tiktokUser.toLowerCase(), c.id);
        byUser.set(c.name.toLowerCase(), c.id);
      }

      const existing = await prisma.diamondControl.findMany({
        where: { agencySlug, period },
        select: { id: true, username: true },
      });
      const existingByUser = new Map(
        existing.map((e) => [e.username.toLowerCase(), e.id])
      );

      type RowIn = {
        username: string;
        diamonds: number;
        hours: number;
        days: number;
        creatorId: string | undefined;
      };
      const merged = new Map<string, RowIn>();
      let skipped = 0;

      for (const raw of rows) {
        const username = cleanUser(
          String(
            raw.username ??
              raw.usuario ??
              raw.tiktok ??
              raw.nombre ??
              raw.name ??
              ""
          )
        );
        if (!username) {
          skipped += 1;
          continue;
        }
        if (!scope.admin && !byUser.get(username)) {
          skipped += 1;
          continue;
        }
        const diamonds = Math.round(
          parseNum(raw.diamonds ?? raw.diamantes ?? raw.diamond)
        );
        const hours = parseNum(raw.hours ?? raw.horas);
        const days = Math.max(0, Math.round(parseNum(raw.days ?? raw.dias)));
        merged.set(username, {
          username,
          diamonds,
          hours,
          days,
          creatorId: byUser.get(username),
        });
      }

      const toCreate: {
        agencySlug: string;
        period: string;
        username: string;
        diamonds: number;
        hours: number;
        days: number;
        creatorId?: string;
      }[] = [];
      const toUpdate: (RowIn & { id: string })[] = [];

      for (const row of merged.values()) {
        const id = existingByUser.get(row.username);
        if (id) toUpdate.push({ ...row, id });
        else {
          toCreate.push({
            agencySlug,
            period,
            username: row.username,
            diamonds: row.diamonds,
            hours: row.hours,
            days: row.days,
            creatorId: row.creatorId,
          });
        }
      }

      for (let i = 0; i < toCreate.length; i += 100) {
        await prisma.diamondControl.createMany({
          data: toCreate.slice(i, i + 100),
        });
      }

      for (let i = 0; i < toUpdate.length; i += 25) {
        const chunk = toUpdate.slice(i, i + 25);
        await prisma.$transaction(
          chunk.map((u) =>
            prisma.diamondControl.update({
              where: { id: u.id },
              data: {
                diamonds: u.diamonds,
                hours: u.hours,
                days: u.days,
                creatorId: u.creatorId ?? undefined,
              },
            })
          )
        );
      }

      const creatorUpdates = [...merged.values()].filter(
        (r) => r.creatorId && r.diamonds > 0
      );
      for (let i = 0; i < creatorUpdates.length; i += 25) {
        const chunk = creatorUpdates.slice(i, i + 25);
        await prisma.$transaction(
          chunk.map((u) =>
            prisma.creator.update({
              where: { id: u.creatorId! },
              data: { diamonds: u.diamonds },
            })
          )
        );
      }

      const filename =
        typeof (body as { filename?: unknown }).filename === "string"
          ? String((body as { filename: string }).filename).slice(0, 180)
          : null;
      await prisma.diamondImportLog.create({
        data: {
          agencySlug,
          period,
          userId: typeof auth.token?.id === "string" ? auth.token.id : null,
          userName: String(auth.token?.name ?? "Usuario"),
          filename,
          upserted: toCreate.length + toUpdate.length,
          skipped,
        },
      });

      return NextResponse.json({
        ok: true,
        upserted: toCreate.length + toUpdate.length,
        skipped,
        period,
      });
    } catch (e) {
      console.error("diamonds/import", e);
      const msg = e instanceof Error ? e.message : "";
      if (/P1001|Can't reach|timed out/i.test(msg)) {
        return NextResponse.json(
          { error: "No se pudo conectar a la base (pooler/URL)." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Error al importar diamantes. Intenta de nuevo." },
        { status: 500 }
      );
    }
  }

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const username = cleanUser(parsed.data.username);
  if (!username) {
    return NextResponse.json({ error: "Usuario obligatorio" }, { status: 400 });
  }

  const nickErr = await assertCreatorNickAccess(scope, username, agencySlug);
  if (nickErr) return nickErr;

  const creators = await prisma.creator.findMany({
    where: creatorWhere(scope, agencySlug),
    select: { id: true, name: true, tiktokUser: true },
  });
  const creator = creators.find(
    (c) =>
      c.tiktokUser?.toLowerCase() === username ||
      c.name.toLowerCase() === username
  );

  const data = {
    period: parsed.data.period,
    username,
    diamonds: parsed.data.diamonds,
    hours: parsed.data.hours,
    days: parsed.data.days,
    notes: parsed.data.notes === undefined ? undefined : parsed.data.notes,
    creatorId: creator?.id ?? undefined,
  };

  let row;
  if (parsed.data.id) {
    const existing = await prisma.diamondControl.findFirst({
      where: { id: parsed.data.id, agencySlug },
    });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (existing.creatorId) {
      const accessErr = await assertCreatorAccess(
        scope,
        existing.creatorId,
        agencySlug
      );
      if (accessErr) return accessErr;
    } else {
      const accessErr = await assertCreatorNickAccess(
        scope,
        existing.username,
        agencySlug
      );
      if (accessErr) return accessErr;
    }
    row = await prisma.diamondControl.update({
      where: { id: existing.id },
      data,
    });
  } else {
    row = await prisma.diamondControl.upsert({
      where: {
        agencySlug_period_username: {
          agencySlug,
          period: parsed.data.period,
          username,
        },
      },
      create: {
        agencySlug,
        period: parsed.data.period,
        username,
        diamonds: parsed.data.diamonds ?? 0,
        hours: parsed.data.hours ?? 0,
        days: parsed.data.days ?? 0,
        notes: parsed.data.notes ?? null,
        creatorId: creator?.id,
      },
      update: data,
    });
  }

  if (creator && (parsed.data.diamonds ?? 0) > 0) {
    await prisma.creator.update({
      where: { id: creator.id },
      data: { diamonds: parsed.data.diamonds },
    });
  }

  return NextResponse.json({ ok: true, row });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, scope, isAdmin } = auth;
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Solo el admin puede eliminar registros" },
      { status: 403 }
    );
  }

  // Borrar TODO lo importado de un mes (filas + historial de importaciones)
  if (req.nextUrl.searchParams.get("all") === "1") {
    const period = req.nextUrl.searchParams.get("period") ?? "";
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
    }
    if (req.nextUrl.searchParams.get("confirm") !== "BORRAR") {
      return NextResponse.json({ error: "Falta la confirmación" }, { status: 400 });
    }
    // Solo un admin real: en modo "ver como" otra persona no se puede borrar en bloque
    if (!scope.admin) {
      return NextResponse.json({ error: "Solo el admin puede borrar lo importado" }, { status: 403 });
    }

    const rows = await prisma.diamondControl.findMany({
      where: { agencySlug, period },
      select: { creatorId: true, diamonds: true },
    });
    const imported = new Map<string, number>();
    for (const r of rows) if (r.creatorId) imported.set(r.creatorId, r.diamonds);
    const creatorIds = [...imported.keys()];

    const [deletedRows] = await prisma.$transaction([
      prisma.diamondControl.deleteMany({ where: { agencySlug, period } }),
      prisma.diamondImportLog.deleteMany({ where: { agencySlug, period } }),
    ]);

    // La importación también copió los diamantes al creador: si todavía tiene ese mismo valor, vuelve al
    // del mes anterior que quede (o a 0 si no hay otro). Si alguien lo cambió a mano, no se toca.
    if (creatorIds.length) {
      const [creators, remaining] = await Promise.all([
        prisma.creator.findMany({ where: { id: { in: creatorIds }, agencySlug }, select: { id: true, diamonds: true } }),
        prisma.diamondControl.findMany({
          where: { agencySlug, creatorId: { in: creatorIds } },
          orderBy: { period: "desc" },
          select: { creatorId: true, diamonds: true },
        }),
      ]);
      const latest = new Map<string, number>();
      for (const r of remaining) if (r.creatorId && !latest.has(r.creatorId)) latest.set(r.creatorId, r.diamonds);
      const stale = creators.filter((c) => imported.get(c.id) === c.diamonds);
      for (let i = 0; i < stale.length; i += 25) {
        await prisma.$transaction(
          stale.slice(i, i + 25).map((c) =>
            prisma.creator.update({ where: { id: c.id }, data: { diamonds: latest.get(c.id) ?? 0 } })
          )
        );
      }
    }
    return NextResponse.json({ ok: true, deleted: deletedRows.count, period });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta id" }, { status: 400 });
  }
  const existing = await prisma.diamondControl.findFirst({
    where: { id, agencySlug },
  });
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (existing.creatorId) {
    const accessErr = await assertCreatorAccess(
      scope,
      existing.creatorId,
      agencySlug
    );
    if (accessErr) return accessErr;
  } else {
    const accessErr = await assertCreatorNickAccess(
      scope,
      existing.username,
      agencySlug
    );
    if (accessErr) return accessErr;
  }
  await prisma.diamondControl.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
