import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { currentMonth, monthRange } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;

  const month = currentMonth();
  const { start, end } = monthRange(month);
  const prev = new Date(start);
  prev.setMonth(prev.getMonth() - 1);
  const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const prevRange = monthRange(prevMonth);

  const [creators, metrics, chartRows, agg, prevAgg] = await Promise.all([
    prisma.creator.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.metric.findMany({
      where: { date: { gte: start, lte: end } },
      include: { creator: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 30,
    }),
    prisma.metric.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true, diamonds: true, hoursLive: true },
      orderBy: { date: "asc" },
    }),
    prisma.metric.aggregate({
      where: { date: { gte: start, lte: end } },
      _sum: { diamonds: true, hoursLive: true, battles: true, peakViewers: true },
    }),
    prisma.metric.aggregate({
      where: { date: { gte: prevRange.start, lte: prevRange.end } },
      _sum: { diamonds: true, hoursLive: true },
    }),
  ]);

  const byDay = new Map<string, { diamonds: number; hours: number }>();
  for (const m of chartRows) {
    const key = m.date.toISOString().slice(0, 10);
    const cur = byDay.get(key) ?? { diamonds: 0, hours: 0 };
    cur.diamonds += m.diamonds;
    cur.hours += m.hoursLive;
    byDay.set(key, cur);
  }

  return NextResponse.json({
    month,
    creators,
    kpis: {
      diamonds: agg._sum.diamonds ?? 0,
      hours: Math.round(agg._sum.hoursLive ?? 0),
      battles: agg._sum.battles ?? 0,
      peakViewers: agg._sum.peakViewers ?? 0,
      prevDiamonds: prevAgg._sum.diamonds ?? 0,
      prevHours: Math.round(prevAgg._sum.hoursLive ?? 0),
    },
    chart: [...byDay.entries()].map(([label, v]) => ({
      label: label.slice(5),
      diamonds: v.diamonds,
      hours: Math.round(v.hours * 10) / 10,
    })),
    metrics: metrics.map((m) => ({
      id: m.id,
      date: m.date,
      diamonds: m.diamonds,
      hoursLive: m.hoursLive,
      peakViewers: m.peakViewers,
      creatorName: m.creator.name,
    })),
  });
}
