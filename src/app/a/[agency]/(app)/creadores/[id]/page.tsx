import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { isAgencySlug, agencyPath } from "@/lib/agencies";
import { applyViewAs, getScope } from "@/lib/creator-scope";
import { parseViewAsId, VIEW_AS_COOKIE } from "@/lib/view-as";
import { TopBar } from "@/components/top-bar";
import { CreatorForm } from "@/components/creator-form";
import { CreatorOps } from "@/components/creator-ops";
import { StatusBadge } from "@/components/status-badge";
import { Panel } from "@/components/ui";
import { currentMonth, formatDate, formatNumber } from "@/lib/utils";

export default async function CreatorDetailPage({
  params,
}: {
  params: Promise<{ agency: string; id: string }>;
}) {
  const { agency, id } = await params;
  if (!isAgencySlug(agency)) notFound();

  const session = await getServerSession(authOptions);
  if (session?.user?.agencySlug && session.user.agencySlug !== agency) {
    notFound();
  }

  const canEdit = isAdmin(session?.user?.role);
  const creator = await prisma.creator.findFirst({
    where: { id, agencySlug: agency },
    include: {
      manager: true,
      metrics: { orderBy: { date: "desc" }, take: 10 },
      tasks: { orderBy: { createdAt: "desc" }, take: 5 },
      contracts: { orderBy: { createdAt: "desc" }, take: 3 },
      settlements: { orderBy: { month: "desc" }, take: 3 },
    },
  });

  if (!creator) notFound();

  if (session?.user?.id) {
    const cookieStore = await cookies();
    const viewed = await applyViewAs(
      getScope({ id: session.user.id, role: session.user.role }),
      agency,
      parseViewAsId(cookieStore.get(VIEW_AS_COOKIE)?.value)
    );
    if (!viewed.scope.admin && creator.managerId !== viewed.scope.userId) {
      notFound();
    }
  }

  const period = currentMonth();
  const [managers, notes, goal, portal] = await Promise.all([
    canEdit
      ? prisma.user.findMany({
          where: { agencySlug: agency },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    prisma.creatorNote.findMany({
      where: { creatorId: id },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.creatorGoal.findUnique({
      where: { creatorId_period: { creatorId: id, period } },
    }),
    prisma.creatorPortalToken.findUnique({
      where: { creatorId: id },
    }),
  ]);

  const monthDiamonds = creator.metrics.reduce((a, m) => a + m.diamonds, 0);

  return (
    <div>
      <TopBar
        title={creator.name}
        subtitle={`@${creator.tiktokUser ?? "sin-usuario"} · ${creator.niche}`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel>
          <p className="text-xs text-text-muted">Estado</p>
          <div className="mt-2">
            <StatusBadge status={creator.status} />
          </div>
        </Panel>
        <Panel>
          <p className="text-xs text-text-muted">Teléfono</p>
          <p className="mt-2 font-medium">{creator.phone}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-text-muted">Incorporación</p>
          <p className="mt-2 font-medium">{formatDate(creator.joinDate)}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-text-muted">Diamantes (últimos registros)</p>
          <p className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-bold">
            {formatNumber(monthDiamonds)}
          </p>
        </Panel>
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-3 font-[family-name:var(--font-syne)] text-lg font-semibold">
            Últimas métricas
          </h2>
          <ul className="space-y-2 text-sm">
            {creator.metrics.length === 0 && (
              <li className="text-text-muted">Sin métricas aún.</li>
            )}
            {creator.metrics.map((m) => (
              <li
                key={m.id}
                className="flex justify-between rounded-lg border border-border-soft bg-bg px-3 py-2"
              >
                <span>{formatDate(m.date)}</span>
                <span>
                  {formatNumber(m.diamonds)} ◆ · {m.hoursLive}h
                </span>
              </li>
            ))}
          </ul>
          <Link
            href={agencyPath(agency, "/metricas")}
            className="mt-3 inline-block text-sm text-accent"
          >
            Registrar métrica →
          </Link>
        </Panel>
        <Panel>
          <h2 className="mb-3 font-[family-name:var(--font-syne)] text-lg font-semibold">
            Tareas recientes
          </h2>
          <ul className="space-y-2 text-sm">
            {creator.tasks.length === 0 && (
              <li className="text-text-muted">Sin tareas.</li>
            )}
            {creator.tasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-border-soft bg-bg px-3 py-2"
              >
                <span>{t.title}</span>
                <StatusBadge status={t.status} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <CreatorOps
        creatorId={creator.id}
        agency={agency}
        period={period}
        initialNotes={notes.map((n) => ({
          id: n.id,
          body: n.body,
          authorName: n.authorName,
          createdAt: n.createdAt.toISOString(),
        }))}
        initialGoal={{
          targetDiamonds: goal?.targetDiamonds ?? 0,
          targetHours: goal?.targetHours ?? 0,
        }}
        initialToken={portal?.token ?? null}
      />

      {canEdit && (
        <>
          <h2 className="mb-4 font-[family-name:var(--font-syne)] text-xl font-semibold">
            Editar ficha
          </h2>
          <CreatorForm
            managers={managers}
            initial={{
              id: creator.id,
              name: creator.name,
              phone: creator.phone,
              niche: creator.niche,
              joinDate: creator.joinDate.toISOString().slice(0, 10),
              tiktokUser: creator.tiktokUser,
              country: creator.country,
              status: creator.status,
              groupName: creator.groupName,
              notes: creator.notes,
              managerId: creator.managerId,
            }}
          />
        </>
      )}
    </div>
  );
}
