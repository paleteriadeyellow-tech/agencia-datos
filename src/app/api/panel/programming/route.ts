import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { SHIFT_HOURS, addDays, ymd } from "@/lib/weekly-schedule";

export const dynamic = "force-dynamic";

function parseWeek(raw: string | null) {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  return ymd(now);
}

function prevMonday(weekStart: string) {
  const [y, m, d] = weekStart.split("-").map(Number);
  return ymd(addDays(new Date(y!, (m ?? 1) - 1, d ?? 1), -7));
}

function jsonSlot(s: {
  id: string;
  day: number;
  hour: number;
  managerId: string | null;
  managerName: string;
  label: string;
}) {
  return {
    id: s.id,
    day: s.day,
    hour: s.hour,
    managerId: s.managerId,
    managerName: s.managerName,
    label: s.label,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug } = auth;
  const weekStart = parseWeek(req.nextUrl.searchParams.get("week"));

  const [slots, users] = await Promise.all([
    prisma.managerShift.findMany({
      where: { agencySlug, weekStart },
    }),
    prisma.user.findMany({
      where: { agencySlug, role: { in: ["admin", "manager"] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({
    weekStart,
    managers: users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    slots: slots.map(jsonSlot),
  });
}

const postSchema = z.object({
  action: z.enum(["upsert", "copyPrev", "fillSunday"]).optional(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day: z.number().int().min(0).max(6).optional(),
  hour: z.number().int().optional(),
  managerId: z.string().nullable().optional(),
  managerName: z.string().optional(),
  label: z.string().optional(),
  clear: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug } = auth;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const data = parsed.data;
  const action = data.action ?? "upsert";

  if (action === "copyPrev") {
    const fromWeek = prevMonday(data.weekStart);
    const source = await prisma.managerShift.findMany({
      where: { agencySlug, weekStart: fromWeek },
    });
    if (!source.length) {
      const slots = await prisma.managerShift.findMany({
        where: { agencySlug, weekStart: data.weekStart },
      });
      return NextResponse.json({
        ok: true,
        slots: slots.map(jsonSlot),
        emptySource: true,
      });
    }
    await prisma.managerShift.deleteMany({
      where: { agencySlug, weekStart: data.weekStart },
    });
    if (source.length) {
      await prisma.managerShift.createMany({
        data: source.map((s) => ({
          agencySlug,
          weekStart: data.weekStart,
          day: s.day,
          hour: s.hour,
          managerId: s.managerId,
          managerName: s.managerName,
          label: s.label,
        })),
      });
    }
    const slots = await prisma.managerShift.findMany({
      where: { agencySlug, weekStart: data.weekStart },
    });
    return NextResponse.json({ ok: true, slots: slots.map(jsonSlot) });
  }

  if (action === "fillSunday") {
    await prisma.$transaction(
      SHIFT_HOURS.map((hour) =>
        prisma.managerShift.upsert({
          where: {
            agencySlug_weekStart_day_hour: {
              agencySlug,
              weekStart: data.weekStart,
              day: 6,
              hour,
            },
          },
          create: {
            agencySlug,
            weekStart: data.weekStart,
            day: 6,
            hour,
            managerId: null,
            managerName: "FREE",
            label: "FREE",
          },
          update: {
            managerId: null,
            managerName: "FREE",
            label: "FREE",
          },
        })
      )
    );
    const slots = await prisma.managerShift.findMany({
      where: { agencySlug, weekStart: data.weekStart },
    });
    return NextResponse.json({ ok: true, slots: slots.map(jsonSlot) });
  }

  if (data.day == null || data.hour == null) {
    return NextResponse.json({ error: "Celda inválida" }, { status: 400 });
  }
  if (!SHIFT_HOURS.includes(data.hour as (typeof SHIFT_HOURS)[number])) {
    return NextResponse.json({ error: "Hora inválida" }, { status: 400 });
  }

  if (data.clear) {
    await prisma.managerShift.deleteMany({
      where: {
        agencySlug,
        weekStart: data.weekStart,
        day: data.day,
        hour: data.hour,
      },
    });
    return NextResponse.json({ ok: true, slot: null });
  }

  const managerName = (data.managerName ?? "").trim();
  const label = (data.label ?? "").trim();
  if (!managerName && !label) {
    await prisma.managerShift.deleteMany({
      where: {
        agencySlug,
        weekStart: data.weekStart,
        day: data.day,
        hour: data.hour,
      },
    });
    return NextResponse.json({ ok: true, slot: null });
  }

  const row = await prisma.managerShift.upsert({
    where: {
      agencySlug_weekStart_day_hour: {
        agencySlug,
        weekStart: data.weekStart,
        day: data.day,
        hour: data.hour,
      },
    },
    create: {
      agencySlug,
      weekStart: data.weekStart,
      day: data.day,
      hour: data.hour,
      managerId: data.managerId || null,
      managerName,
      label,
    },
    update: {
      managerId: data.managerId || null,
      managerName,
      label,
    },
  });

  return NextResponse.json({ ok: true, slot: jsonSlot(row) });
}
