import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAgencySlug } from "@/lib/agencies";
import { currentMonth, formatNumber } from "@/lib/utils";

export default async function CreatorPortalPage({
  params,
}: {
  params: Promise<{ agency: string; token: string }>;
}) {
  const { agency, token } = await params;
  if (!isAgencySlug(agency) || !token) notFound();

  const row = await prisma.creatorPortalToken.findFirst({
    where: { token, agencySlug: agency },
    include: {
      creator: {
        select: {
          name: true,
          tiktokUser: true,
          niche: true,
          status: true,
        },
      },
    },
  });
  if (!row) notFound();

  const period = currentMonth();
  const [goal, diamond] = await Promise.all([
    prisma.creatorGoal.findUnique({
      where: {
        creatorId_period: { creatorId: row.creatorId, period },
      },
    }),
    prisma.diamondControl.findMany({
      where: {
        agencySlug: agency,
        period,
        OR: [
          { creatorId: row.creatorId },
          {
            username: (row.creator.tiktokUser || row.creator.name)
              .replace(/^@/, "")
              .toLowerCase(),
          },
        ],
      },
    }),
  ]);

  const diamonds = diamond.reduce((a, r) => a + r.diamonds, 0);
  const hours = diamond.reduce((a, r) => a + r.hours, 0);
  const days = diamond.reduce((a, r) => a + r.days, 0);
  const target = goal?.targetDiamonds ?? 0;
  const pct = target > 0 ? Math.min(100, (diamonds / target) * 100) : 0;

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-cyan">Tu avance</p>
      <h1 className="mt-2 font-[family-name:var(--font-syne)] text-3xl font-bold">
        {row.creator.name}
      </h1>
      <p className="text-sm text-text-muted">
        @{row.creator.tiktokUser ?? "tiktok"} · {row.creator.niche} · {period}
      </p>

      <section className="mt-8 rounded-2xl border border-border-soft bg-bg-panel p-5">
        <p className="text-xs uppercase tracking-wide text-text-muted">Diamantes del mes</p>
        <p className="mt-2 font-[family-name:var(--font-syne)] text-4xl font-bold tabular-nums">
          {formatNumber(diamonds)}
        </p>
        {target > 0 && (
          <>
            <p className="mt-1 text-sm text-text-muted">
              Meta {formatNumber(target)} · {pct.toFixed(1)}%
            </p>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-bg-hover">
              <div
                className="h-full rounded-full bg-cyan"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-border-soft bg-bg px-3 py-2">
            <p className="text-text-muted">Horas</p>
            <p className="text-lg font-semibold">{hours.toFixed(1)}</p>
          </div>
          <div className="rounded-xl border border-border-soft bg-bg px-3 py-2">
            <p className="text-text-muted">Días válidos</p>
            <p className="text-lg font-semibold">{days}</p>
          </div>
        </div>
      </section>
      <p className="mt-8 text-center text-xs text-text-muted">
        Panel de agencia · solo tú puedes ver este link
      </p>
    </main>
  );
}
