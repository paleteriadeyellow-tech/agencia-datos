import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireApiAuth } from "@/lib/api-auth";
import { creatorWhere } from "@/lib/creator-scope";
import { prisma } from "@/lib/prisma";
import { currentMonth, periodMeta, prevPeriod } from "@/lib/utils";

export const dynamic = "force-dynamic";

function parsePeriod(raw: string | null) {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return currentMonth();
  return raw;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, scope } = auth;
  const scopeFilter = creatorWhere(scope, agencySlug);
  const period = parsePeriod(req.nextUrl.searchParams.get("period"));
  const previous = prevPeriod(period);
  const meta = periodMeta(period);

  const [creators, diamondNow, diamondPrev, goal, managers] = await Promise.all([
    prisma.creator.findMany({
      where: scopeFilter,
      select: {
        id: true,
        name: true,
        niche: true,
        country: true,
        status: true,
        tiktokUser: true,
        manager: { select: { name: true } },
      },
    }),
    prisma.diamondControl.findMany({
      where: { agencySlug, period },
      select: { username: true, diamonds: true, hours: true, days: true, creatorId: true },
    }),
    prisma.diamondControl.findMany({
      where: { agencySlug, period: previous },
      select: { diamonds: true },
    }),
    prisma.monthlyDiamondGoal.findUnique({
      where: { agencySlug_period: { agencySlug, period } },
    }),
    prisma.user.findMany({
      where: { agencySlug, role: "manager" },
      select: { name: true, id: true },
    }),
  ]);

  const byId = new Map(creators.map((c) => [c.id, c]));
  const rows = diamondNow.map((r) => {
    const c = r.creatorId ? byId.get(r.creatorId) : null;
    return {
      Usuario: r.username,
      Creador: c?.name ?? r.username,
      Manager: c?.manager?.name ?? "",
      Nicho: c?.niche ?? "",
      País: c?.country ?? "",
      Diamantes: r.diamonds,
      Horas: r.hours,
      Días: r.days,
    };
  });

  const total = diamondNow.reduce((a, r) => a + r.diamonds, 0);
  const prevTotal = diamondPrev.reduce((a, r) => a + r.diamonds, 0);
  const projected = Math.round((total / meta.dayElapsed) * meta.daysInMonth);

  const resumen = [
    { Concepto: "Periodo", Valor: period },
    { Concepto: "Diamantes", Valor: total },
    { Concepto: "Mes anterior", Valor: prevTotal },
    { Concepto: "Meta", Valor: goal?.target ?? 0 },
    { Concepto: "Proyección cierre", Valor: projected },
    { Concepto: "Creadores en vista", Valor: creators.length },
    { Concepto: "Managers", Valor: managers.length },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Creadores");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="reporte-${period}.xlsx"`,
    },
  });
}
