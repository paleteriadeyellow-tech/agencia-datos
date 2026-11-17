import { NextRequest, NextResponse } from "next/server";
import { AGENCIES, type AgencySlug } from "@/lib/agencies";
import { formatRobotSummary, runRobot } from "@/lib/robot";
import { sendTelegram } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Robot diario. Lo llama Vercel Cron (ver vercel.json) con el header
 * `Authorization: Bearer $CRON_SECRET`.
 * Para probar a mano: /api/cron/robot?dry=1 (no crea tareas ni manda avisos).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  const panelUrl = (process.env.PANEL_PUBLIC_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  const results = [];

  for (const slug of Object.keys(AGENCIES) as AgencySlug[]) {
    try {
      const report = await runRobot(slug, { dryRun });
      const summary = formatRobotSummary(report, panelUrl);
      const notify = dryRun ? { sent: false, reason: "prueba (dry)" } : await sendTelegram(summary);
      results.push({
        agency: slug,
        ok: true,
        creatorsFlagged: report.creators.length,
        tasksCreated: report.tasksCreated,
        managerTasksCreated: report.managerTasksCreated,
        notify,
        summary,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!dryRun) await sendTelegram(`🤖❌ El robot falló en ${slug}: ${message}`).catch(() => null);
      results.push({ agency: slug, ok: false, error: message });
    }
  }

  return NextResponse.json({ dryRun, results });
}
