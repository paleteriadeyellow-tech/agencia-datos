import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { type AgencySlug } from "@/lib/agencies";
import { buildRobotReport, formatRobotSummary, runRobot } from "@/lib/robot";
import { sendTelegram, telegramConfigured } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Reporte del robot de hoy (solo admin). */
export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  if (!auth.isAdmin) return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  const report = await buildRobotReport(auth.agencySlug as AgencySlug);
  return NextResponse.json({ report, telegram: telegramConfigured() });
}

/** Correr el robot ahora mismo (botón del panel). */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  if (!auth.isAdmin) return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  const report = await runRobot(auth.agencySlug as AgencySlug);
  const panelUrl = req.nextUrl.origin;
  const notify = await sendTelegram(formatRobotSummary(report, panelUrl));
  return NextResponse.json({ report, notify, telegram: telegramConfigured() });
}
