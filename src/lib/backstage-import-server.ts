import { prisma } from "@/lib/prisma";
import type { AgencySlug } from "@/lib/agencies";
import type { BackstageRow } from "@/lib/backstage-import";
import { buildRobotReport, runRobot } from "@/lib/robot";

/**
 * Importa el Excel de Backstage a Control de diamantes (igual que el botón de importar
 * de esa pantalla, como admin) y calcula qué cambió contra la carga anterior.
 */

const clean = (v: string) => v.replace(/^@/, "").trim().toLowerCase();

export type ImportSummary = {
  period: string;
  filename: string | null;
  upserted: number;
  created: number;
  updated: number;
  diamondsBefore: number;
  diamondsAfter: number;
  topGainers: { username: string; gained: number; diamonds: number }[];
  startedLive: string[];
  newUsernames: number;
  notInRoster: number;
  riskBefore: { riesgo: number; sin_actividad: number; cerca: number };
  riskAfter: { riesgo: number; sin_actividad: number; cerca: number };
  leftRisk: string[];
  robot: { managerTasksCreated: number; tasksCreated: number } | null;
};

function countKinds(r: Awaited<ReturnType<typeof buildRobotReport>>) {
  const c = { riesgo: 0, sin_actividad: 0, cerca: 0 };
  for (const x of r.creators) c[x.kind]++;
  return c;
}

export async function importDiamondRows(
  agencySlug: AgencySlug,
  period: string,
  rows: BackstageRow[],
  meta: { userId: string | null; userName: string; filename: string | null; runRobotAfter?: boolean }
): Promise<ImportSummary> {
  const [creators, existing, reportBefore] = await Promise.all([
    prisma.creator.findMany({ where: { agencySlug }, select: { id: true, name: true, tiktokUser: true } }),
    prisma.diamondControl.findMany({ where: { agencySlug, period }, select: { id: true, username: true, diamonds: true, days: true } }),
    buildRobotReport(agencySlug),
  ]);

  const byUser = new Map<string, string>();
  for (const c of creators) {
    if (c.tiktokUser) byUser.set(c.tiktokUser.toLowerCase(), c.id);
    byUser.set(c.name.toLowerCase(), c.id);
  }
  const existingByUser = new Map(existing.map((e) => [e.username.toLowerCase(), e]));

  // Última fila por usuario (igual que el import de la pantalla)
  const merged = new Map<string, { username: string; diamonds: number; hours: number; days: number; creatorId?: string }>();
  for (const r of rows) {
    const username = clean(r.username);
    if (!username) continue;
    merged.set(username, {
      username,
      diamonds: Math.round(r.diamantes),
      hours: r.horas,
      days: Math.max(0, Math.round(r.dias)),
      creatorId: byUser.get(username),
    });
  }

  const toCreate = [];
  const toUpdate = [];
  for (const row of merged.values()) {
    const prev = existingByUser.get(row.username);
    if (prev) toUpdate.push({ ...row, id: prev.id });
    else toCreate.push({ agencySlug, period, ...row });
  }

  for (let i = 0; i < toCreate.length; i += 100) {
    await prisma.diamondControl.createMany({ data: toCreate.slice(i, i + 100) });
  }
  for (let i = 0; i < toUpdate.length; i += 25) {
    await prisma.$transaction(
      toUpdate.slice(i, i + 25).map((u) =>
        prisma.diamondControl.update({
          where: { id: u.id },
          data: { diamonds: u.diamonds, hours: u.hours, days: u.days, creatorId: u.creatorId ?? undefined },
        })
      )
    );
  }
  const creatorUpdates = [...merged.values()].filter((r) => r.creatorId && r.diamonds > 0);
  for (let i = 0; i < creatorUpdates.length; i += 25) {
    await prisma.$transaction(
      creatorUpdates.slice(i, i + 25).map((u) => prisma.creator.update({ where: { id: u.creatorId! }, data: { diamonds: u.diamonds } }))
    );
  }

  await prisma.diamondImportLog.create({
    data: {
      agencySlug,
      period,
      userId: meta.userId,
      userName: meta.userName,
      filename: meta.filename ? meta.filename.slice(0, 180) : "Asistente",
      upserted: toCreate.length + toUpdate.length,
      skipped: rows.length - merged.size,
    },
  });

  // Qué cambió
  const diamondsBefore = existing.reduce((a, e) => a + e.diamonds, 0);
  let diamondsAfter = diamondsBefore;
  const gainers: { username: string; gained: number; diamonds: number }[] = [];
  const startedLive: string[] = [];
  for (const row of merged.values()) {
    const prev = existingByUser.get(row.username);
    diamondsAfter += row.diamonds - (prev?.diamonds ?? 0);
    const gained = row.diamonds - (prev?.diamonds ?? 0);
    if (gained > 0) gainers.push({ username: row.username, gained, diamonds: row.diamonds });
    if ((prev?.days ?? 0) === 0 && row.days > 0) startedLive.push(row.username);
  }
  gainers.sort((a, b) => b.gained - a.gained);

  const robot = meta.runRobotAfter ? await runRobot(agencySlug) : null;
  const reportAfter = robot ?? (await buildRobotReport(agencySlug));
  const afterRisk = new Set(reportAfter.creators.filter((c) => c.kind === "riesgo" || c.kind === "sin_actividad").map((c) => c.creatorId));
  const leftRisk = reportBefore.creators
    .filter((c) => (c.kind === "riesgo" || c.kind === "sin_actividad") && !afterRisk.has(c.creatorId))
    .map((c) => c.name);

  return {
    period,
    filename: meta.filename,
    upserted: toCreate.length + toUpdate.length,
    created: toCreate.length,
    updated: toUpdate.length,
    diamondsBefore,
    diamondsAfter,
    topGainers: gainers.slice(0, 10),
    startedLive: startedLive.slice(0, 30),
    newUsernames: toCreate.length,
    notInRoster: [...merged.values()].filter((r) => !r.creatorId).length,
    riskBefore: countKinds(reportBefore),
    riskAfter: countKinds(reportAfter),
    leftRisk: leftRisk.slice(0, 30),
    robot: robot ? { managerTasksCreated: robot.managerTasksCreated, tasksCreated: robot.tasksCreated } : null,
  };
}
