import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { LEVELS, awardsFor, levelFor, nextLevelHint, payoutMode, type BonusKind, type Level, type MonthMetrics } from "@/lib/level-bonuses";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Solo un admin real (no en modo "ver como"): son pagos de la agencia. */
async function adminGate(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return { error: auth.error };
  if (!auth.isAdmin || !auth.scope.admin) {
    return { error: NextResponse.json({ error: "Solo un admin" }, { status: 403, headers: NO_STORE }) };
  }
  return { agencySlug: auth.agencySlug };
}

/** Todo lo necesario para calcular un mes: métricas del mes, historial para el nivel y datos del creador. */
async function loadMonth(agencySlug: string, period: string) {
  const all = await prisma.diamondControl.findMany({
    where: { agencySlug, period: { lte: period } },
    select: { period: true, username: true, diamonds: true, hours: true, days: true, creatorId: true },
  });
  const history = new Map<string, MonthMetrics[]>();
  for (const r of all) {
    const k = r.username.toLowerCase();
    history.set(k, [...(history.get(k) ?? []), { period: r.period, diamonds: r.diamonds, days: r.days, hours: r.hours }]);
  }
  const target = all.filter((r) => r.period === period);
  const creatorIds = [...new Set(target.map((r) => r.creatorId).filter((x): x is string => !!x))];
  const creators = creatorIds.length
    ? await prisma.creator.findMany({ where: { id: { in: creatorIds }, agencySlug }, select: { id: true, name: true, joinDate: true } })
    : [];
  const byId = new Map(creators.map((c) => [c.id, c]));
  // Niveles fijados a mano: aplican desde su mes en adelante
  const overrides = new Map((await prisma.bonusLevelOverride.findMany({ where: { agencySlug } })).map((o) => [o.username.toLowerCase(), o]));

  return target
    .map((r) => {
      const c = r.creatorId ? byId.get(r.creatorId) : undefined;
      const metrics = { diamonds: r.diamonds, days: r.days, hours: r.hours };
      const levelAuto = levelFor(history.get(r.username.toLowerCase()) ?? [], period, c?.joinDate ?? null);
      const ov = overrides.get(r.username.toLowerCase());
      const manual = !!ov && ov.fromPeriod <= period && (LEVELS as string[]).includes(ov.level);
      const level = manual ? (ov!.level as Level) : levelAuto;
      return { username: r.username, creatorId: r.creatorId, creatorName: c?.name ?? null, join: c?.joinDate ?? null, metrics, level, levelAuto, manual, manualFrom: manual ? ov!.fromPeriod : null };
    })
    .sort((a, b) => b.metrics.diamonds - a.metrics.diamonds);
}

export async function GET(req: NextRequest) {
  const g = await adminGate(req);
  if (g.error) return g.error;
  const period = req.nextUrl.searchParams.get("period") ?? "";
  if (!PERIOD.test(period)) return NextResponse.json({ error: "Mes inválido" }, { status: 400, headers: NO_STORE });

  const [rows, awards, welcomes, pending] = await Promise.all([
    loadMonth(g.agencySlug, period),
    prisma.bonusAward.findMany({ where: { agencySlug: g.agencySlug, period } }),
    prisma.bonusWelcome.findMany({ where: { agencySlug: g.agencySlug } }),
    prisma.bonusAward.findMany({
      where: { agencySlug: g.agencySlug, period: { lt: period }, status: { not: "pagado" } },
      orderBy: [{ period: "desc" }, { username: "asc" }],
    }),
  ]);

  const awardMap = new Map(awards.map((a) => [`${a.username.toLowerCase()}|${a.kind}`, a]));
  const welcomeMap = new Map(welcomes.map((w) => [w.username.toLowerCase(), w]));

  const items = rows.map((r) => {
    const computed = awardsFor(r.level, r.metrics);
    return {
      username: r.username,
      creatorId: r.creatorId,
      creatorName: r.creatorName,
      level: r.level,
      levelAuto: r.levelAuto,
      manual: r.manual,
      manualFrom: r.manualFrom,
      metrics: r.metrics,
      payout: payoutMode(r.level),
      hint: nextLevelHint(r.level, r.metrics, r.join, period),
      welcome: welcomeMap.get(r.username.toLowerCase())?.reward ?? null,
      bonuses: [
        ...computed.map((c) => {
          const a = awardMap.get(`${r.username.toLowerCase()}|${c.kind}`);
          // Si ya está guardado, se muestra lo guardado (puede estar editado a mano)
          const shown = a ? { ...c, tier: a.tier, coins: a.coins, usd: a.usd, advisory: a.advisory } : c;
          return { ...shown, outdated: false, award: a ? { id: a.id, status: a.status, scheduledFor: a.scheduledFor, method: a.method, paidAt: a.paidAt, note: a.note, saved: true } : null };
        }),
        // Premios ya programados o pagados que con el nivel actual ya no corresponden: se muestran para no perderlos de vista
        ...awards
          .filter((a) => a.username.toLowerCase() === r.username.toLowerCase() && !computed.some((c) => c.kind === a.kind))
          .map((a) => ({
            kind: a.kind as BonusKind,
            tier: a.tier,
            coins: a.coins,
            usd: a.usd,
            advisory: a.advisory,
            outdated: true,
            award: { id: a.id, status: a.status, scheduledFor: a.scheduledFor, method: a.method, paidAt: a.paidAt, note: a.note, saved: true as const },
          })),
      ],
    };
  });

  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, 0])) as Record<Level, number>;
  for (const i of items) byLevel[i.level]++;
  const sum = (list: { coins: number; usd: number | null }[]) => ({
    coins: list.reduce((a, x) => a + x.coins, 0),
    usd: list.reduce((a, x) => a + (x.usd ?? 0), 0),
  });
  const all = items.flatMap((i) => i.bonuses);

  return NextResponse.json(
    {
      period,
      items,
      byLevel,
      totals: {
        toPay: sum(all),
        saved: awards.length,
        paid: sum(awards.filter((a) => a.status === "pagado")),
        pendingBefore: sum(pending),
      },
      pending: pending.map((a) => ({ id: a.id, period: a.period, username: a.username, kind: a.kind, tier: a.tier, level: a.level, coins: a.coins, usd: a.usd, status: a.status })),
    },
    { headers: NO_STORE }
  );
}

const MANUAL_NOTE = "Adeudo manual";
const EDITED_NOTE = "Editado a mano";
/** Premios capturados o editados a mano: "Calcular el mes" no los sobrescribe ni los borra. */
const isManual = (a: { note: string | null }) => !!a.note && (a.note.startsWith(MANUAL_NOTE) || a.note.startsWith(EDITED_NOTE));

/** Calcula y guarda los premios del mes: crea los nuevos y actualiza los que aún no se pagan (todo el mes, o solo un usuario). */
async function calculatePeriod(agencySlug: string, period: string, onlyUser?: string) {
  const rows = (await loadMonth(agencySlug, period)).filter((r) => !onlyUser || r.username.toLowerCase() === onlyUser);
  const existing = await prisma.bonusAward.findMany({ where: { agencySlug, period, ...(onlyUser ? { username: onlyUser } : {}) } });
  const existingMap = new Map(existing.map((a) => [`${a.username.toLowerCase()}|${a.kind}`, a]));

  const ops: ReturnType<typeof prisma.bonusAward.create>[] = [];
  const keep = new Set<string>();
  let created = 0;
  let updated = 0;
  let locked = 0;
  for (const r of rows) {
    for (const c of awardsFor(r.level, r.metrics)) {
      const key = `${r.username.toLowerCase()}|${c.kind}`;
      keep.add(key);
      const data = { creatorId: r.creatorId, tier: c.tier, level: r.level, coins: c.coins, usd: c.usd, advisory: c.advisory };
      const ex = existingMap.get(key);
      if (!ex) {
        created++;
        ops.push(prisma.bonusAward.create({ data: { agencySlug: agencySlug, period, username: r.username.toLowerCase(), kind: c.kind, ...data } }));
      } else if (ex.status === "pagado" || isManual(ex)) {
        locked++; // lo ya pagado no se modifica aunque cambien las métricas
      } else {
        updated++;
        ops.push(prisma.bonusAward.update({ where: { id: ex.id }, data }) as never);
      }
    }
  }
  // Premios "calculados" que ya no corresponden (por ejemplo tras una nueva importación)
  const stale = existing.filter((a) => a.status === "calculado" && !isManual(a) && !keep.has(`${a.username.toLowerCase()}|${a.kind}`));
  for (let i = 0; i < ops.length; i += 50) await prisma.$transaction(ops.slice(i, i + 50));
  if (stale.length) await prisma.bonusAward.deleteMany({ where: { id: { in: stale.map((a) => a.id) } } });

  return { created, updated, locked, removed: stale.length };
}

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("calculate"), period: z.string().regex(PERIOD) }),
  z.object({ action: z.literal("level"), period: z.string().regex(PERIOD), username: z.string().min(1).max(80), level: z.enum(["E", "D", "C", "B", "A"]).nullable() }),
  z.object({
    action: z.literal("manual"),
    username: z.string().trim().min(1).max(80),
    level: z.enum(["E", "D", "C", "B", "A"]),
    joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    months: z
      .array(z.object({ period: z.string().regex(PERIOD), diamonds: z.number().int().min(0), days: z.number().int().min(0).max(31), hours: z.number().min(0).max(744) }))
      .min(1)
      .max(24),
  }),
  z.object({ action: z.literal("welcome"), username: z.string().min(1).max(80), reward: z.enum(["osito", "cofres"]).nullable() }),
]);

export async function POST(req: NextRequest) {
  const g = await adminGate(req);
  if (g.error) return g.error;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400, headers: NO_STORE });
  const body = parsed.data;

  if (body.action === "level") {
    const username = body.username.toLowerCase();
    if (body.level === null) {
      await prisma.bonusLevelOverride.deleteMany({ where: { agencySlug: g.agencySlug, username } });
    } else {
      await prisma.bonusLevelOverride.upsert({
        where: { agencySlug_username: { agencySlug: g.agencySlug, username } },
        update: { level: body.level, fromPeriod: body.period },
        create: { agencySlug: g.agencySlug, username, level: body.level, fromPeriod: body.period },
      });
    }
    // Con otro nivel cambian los bonos que le tocan: se recalculan solo los de esa persona
    const r = await calculatePeriod(g.agencySlug, body.period, username);
    return NextResponse.json({ ok: true, ...r }, { headers: NO_STORE });
  }

  if (body.action === "manual") {
    const username = body.username.replace(/^@/, "").toLowerCase();
    const periods = body.months.map((m) => m.period);
    if (new Set(periods).size !== periods.length) return NextResponse.json({ error: "Hay meses repetidos" }, { status: 400, headers: NO_STORE });

    // Vincula al creador (si existe) y actualiza su fecha de ingreso
    const dc = await prisma.diamondControl.findFirst({ where: { agencySlug: g.agencySlug, username: { equals: username, mode: "insensitive" }, creatorId: { not: null } }, select: { creatorId: true } });
    const creatorId = dc?.creatorId ?? null;
    let joinUpdated = false;
    if (body.joinDate && creatorId) {
      await prisma.creator.updateMany({ where: { id: creatorId, agencySlug: g.agencySlug }, data: { joinDate: new Date(`${body.joinDate}T00:00:00.000Z`) } });
      joinUpdated = true;
    }

    // La liga queda fijada desde el primer mes adeudado
    const first = [...periods].sort()[0];
    await prisma.bonusLevelOverride.upsert({
      where: { agencySlug_username: { agencySlug: g.agencySlug, username } },
      update: { level: body.level, fromPeriod: first },
      create: { agencySlug: g.agencySlug, username, level: body.level, fromPeriod: first },
    });

    let created = 0;
    let updated = 0;
    let locked = 0;
    let none = 0;
    for (const m of body.months) {
      const computed = awardsFor(body.level, { diamonds: m.diamonds, days: m.days, hours: m.hours });
      if (!computed.length) {
        none++;
        continue;
      }
      const note = `${MANUAL_NOTE}: ${m.diamonds} diamantes, ${m.days} días, ${m.hours} h`;
      for (const c of computed) {
        const data = { creatorId, tier: c.tier, level: body.level, coins: c.coins, usd: c.usd, advisory: c.advisory };
        const ex = await prisma.bonusAward.findUnique({ where: { agencySlug_period_username_kind: { agencySlug: g.agencySlug, period: m.period, username, kind: c.kind } } });
        if (!ex) {
          await prisma.bonusAward.create({ data: { agencySlug: g.agencySlug, period: m.period, username, kind: c.kind, note, ...data } });
          created++;
        } else if (ex.status === "pagado") {
          locked++;
        } else {
          await prisma.bonusAward.update({ where: { id: ex.id }, data: { ...data, note } });
          updated++;
        }
      }
    }
    return NextResponse.json({ ok: true, created, updated, locked, none, joinUpdated, creatorLinked: !!creatorId }, { headers: NO_STORE });
  }

  if (body.action === "welcome") {
    const username = body.username.toLowerCase();
    if (body.reward === null) {
      await prisma.bonusWelcome.deleteMany({ where: { agencySlug: g.agencySlug, username } });
    } else {
      await prisma.bonusWelcome.upsert({
        where: { agencySlug_username: { agencySlug: g.agencySlug, username } },
        update: { reward: body.reward },
        create: { agencySlug: g.agencySlug, username, reward: body.reward },
      });
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  const { period } = body;
  const r = await calculatePeriod(g.agencySlug, period);
  return NextResponse.json({ ok: true, ...r }, { headers: NO_STORE });
}

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["calculado", "programado", "pagado", "acumulado"]).optional(),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  method: z.enum(["batalla", "live_normal", "tiktok_shop", "transferencia"]).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  // Edición de la categoría y el monto (no aplica a premios ya pagados)
  tier: z.string().trim().min(1).max(40).optional(),
  coins: z.number().int().min(0).max(10_000_000).optional(),
  usd: z.number().min(0).max(1_000_000).nullable().optional(),
  advisory: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const g = await adminGate(req);
  if (g.error) return g.error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400, headers: NO_STORE });
  const { id, ...rest } = parsed.data;
  const found = await prisma.bonusAward.findFirst({ where: { id, agencySlug: g.agencySlug }, select: { id: true, status: true, note: true } });
  if (!found) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: NO_STORE });

  const editsAmount = rest.tier !== undefined || rest.coins !== undefined || rest.usd !== undefined || rest.advisory !== undefined;
  if (editsAmount && found.status === "pagado" && rest.status === undefined) {
    return NextResponse.json({ error: "Este bono ya está pagado: cámbialo primero a otro estado para editar el monto." }, { status: 409, headers: NO_STORE });
  }
  // Lo editado a mano se marca para que "Calcular el mes" no lo pise
  if (editsAmount || (rest.note !== undefined && isManual(found))) {
    const text = (rest.note !== undefined ? rest.note : found.note) ?? "";
    rest.note = isManual({ note: text }) ? text : `${EDITED_NOTE}${text ? `: ${text}` : ""}`;
  }
  await prisma.bonusAward.update({
    where: { id },
    data: {
      ...rest,
      // Al marcarlo pagado se guarda cuándo; si se regresa a otro estado, se limpia
      ...(rest.status ? { paidAt: rest.status === "pagado" ? new Date() : null } : {}),
    },
  });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/** Elimina un bono guardado (no los ya pagados). */
export async function DELETE(req: NextRequest) {
  const g = await adminGate(req);
  if (g.error) return g.error;
  const parsed = z.object({ id: z.string().min(1) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400, headers: NO_STORE });
  const found = await prisma.bonusAward.findFirst({ where: { id: parsed.data.id, agencySlug: g.agencySlug }, select: { id: true, status: true } });
  if (!found) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: NO_STORE });
  if (found.status === "pagado") return NextResponse.json({ error: "Un bono pagado no se puede eliminar: cámbialo primero a otro estado." }, { status: 409, headers: NO_STORE });
  await prisma.bonusAward.delete({ where: { id: found.id } });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
