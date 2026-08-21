"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  Gem,
  Clock3,
  UserPlus,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { DiamondGoalCard, type DiamondGoal } from "@/components/diamond-goal-card";
import { OverviewExtras, type HubData } from "@/components/overview-extras";
import { Button, LinkButton, Panel, inputClass } from "@/components/ui";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { formatDate, formatNumber } from "@/lib/utils";
import { MESES_NOMBRE, periodKey } from "@/lib/bonos";
import { PANEL, usePanelData } from "@/lib/swr";
import { useQuickCreate } from "@/components/quick-create";
import { PanelLoadError } from "@/components/panel-load-error";
import { useAgency } from "@/lib/use-agency";
import { useViewAs } from "@/components/view-as";
import { scopeDashboardData, scopeHubData } from "@/lib/scope-view";

type Dash = {
  month: string;
  kpis: {
    totalCreators: number;
    activeCreators: number;
    newCreators: number;
    diamonds: number;
    hours: number;
    diamondUsers: number;
  };
  kpisByManager?: Record<
    string,
    Dash["kpis"]
  >;
  diamondGoal: DiamondGoal;
  topCreators: {
    rank: number;
    id: string;
    creatorId: string | null;
    username: string;
    name: string;
    niche: string;
    diamonds: number;
    hours: number;
    managerId?: string | null;
  }[];
  pendingTasks: {
    id: string;
    title: string;
    status: string;
    dueDate: string | null;
    creatorName: string;
    managerId?: string | null;
    creatorId?: string | null;
  }[];
  inactiveCreators: { id: string; name: string; managerId?: string | null }[];
};

export default function DashboardClient() {
  const { openCreateCreator } = useQuickCreate();
  const { path } = useAgency();
  const { viewAsId } = useViewAs();
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const period = periodKey(anio, mes);

  const years = useMemo(() => {
    const y0 = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => y0 - 4 + i);
  }, []);

  const { data, error, mutate } = usePanelData(
    `${PANEL.dashboard}?period=${period}`
  ) as {
    data?: Dash;
    error?: Error;
    mutate: () => void;
  };

  const { data: hub } = usePanelData(`${PANEL.hub}?period=${period}`) as {
    data?: HubData;
  };

  const view = data ? scopeDashboardData(data, viewAsId) : undefined;
  const hubView = hub ? scopeHubData(hub, viewAsId) : undefined;

  return (
    <div>
      <TopBar
        title="Overview"
        subtitle={`${MESES_NOMBRE[mes]} ${anio} · Datos desde Control de diamantes`}
      />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={openCreateCreator}>
            <Plus className="h-4 w-4" /> Nuevo creador
          </Button>
          <LinkButton href={path("/metricas")} variant="secondary">
            App livecoins
          </LinkButton>
          <LinkButton href={path("/tareas")} variant="secondary">
            Nueva tarea
          </LinkButton>
        </div>
        <div className="flex items-center gap-2">
          <select
            className={inputClass}
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            aria-label="Mes"
          >
            {MESES_NOMBRE.slice(1).map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            aria-label="Año"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <PanelLoadError onRetry={() => mutate()} />
      ) : !view ? (
        <div className="space-y-4">
          <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass-panel h-28 rounded-2xl" />
            ))}
          </div>
          <div className="glass-panel h-36 animate-pulse rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Creadores en roster"
              value={formatNumber(view.kpis.totalCreators)}
              hint={`${view.kpis.activeCreators} activos`}
              icon={Users}
            />
            <KpiCard
              label="Diamantes del mes"
              value={formatNumber(view.kpis.diamonds)}
              hint={`${MESES_NOMBRE[mes]} ${anio} · ${formatNumber(view.kpis.diamondUsers)} usuarios`}
              icon={Gem}
              tone="cyan"
            />
            <KpiCard
              label="Horas LIVE del mes"
              value={formatNumber(view.kpis.hours)}
              hint="Desde Control de diamantes"
              icon={Clock3}
              tone="success"
            />
            <KpiCard
              label="Nuevos este mes"
              value={formatNumber(view.kpis.newCreators)}
              hint="Incorporaciones"
              icon={UserPlus}
              tone="warning"
            />
          </div>

          {view.diamondGoal && (
            <DiamondGoalCard
              key={period}
              goal={view.diamondGoal}
              period={period}
              periodLabel={`${MESES_NOMBRE[mes]} ${anio}`}
              onSaved={() => mutate()}
            />
          )}

          {hubView && <OverviewExtras hub={hubView} period={period} />}

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Panel className="xl:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
                  Top performers del mes
                </h2>
                <Link
                  href={path("/control-diamantes")}
                  className="text-sm text-accent hover:underline"
                >
                  Ver control
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-text-muted">
                    <tr className="border-b border-border-soft">
                      <th className="pb-3 font-medium">Creador</th>
                      <th className="pb-3 font-medium">Nicho</th>
                      <th className="pb-3 font-medium">Diamantes</th>
                      <th className="pb-3 font-medium">Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.topCreators.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="py-8 text-center text-text-muted"
                        >
                          Sin datos en Control de diamantes para este mes.
                        </td>
                      </tr>
                    )}
                    {view.topCreators.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border-soft/60 last:border-0"
                      >
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <span className="w-5 shrink-0 text-text-muted">
                              #{row.rank}
                            </span>
                            <TikTokAvatar
                              username={row.username}
                              name={row.name}
                              size={36}
                            />
                            {row.creatorId ? (
                              <Link
                                href={path(`/creadores/${row.creatorId}`)}
                                className="font-medium hover:text-accent"
                              >
                                {row.name}
                              </Link>
                            ) : (
                              <span className="font-medium">{row.name}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-text-muted">{row.niche}</td>
                        <td className="py-3 font-medium">
                          {formatNumber(row.diamonds)}
                        </td>
                        <td className="py-3 text-text-muted">
                          {row.hours.toFixed(1)}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel>
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
                  Alertas
                </h2>
              </div>
              <ul className="space-y-3">
                {view.inactiveCreators.length === 0 && (
                  <li className="text-sm text-text-muted">
                    Sin alertas de inactividad.
                  </li>
                )}
                {view.inactiveCreators.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl border border-border-soft bg-bg px-3 py-2.5"
                  >
                    <Link href={path(`/creadores/${c.id}`)} className="block">
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-warning">
                        Sin LIVE reciente (14+ días)
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="mt-6">
            <Panel>
              <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-semibold">
                Cola de tareas
              </h2>
              <ul className="space-y-3">
                {view.pendingTasks.length === 0 && (
                  <li className="text-sm text-text-muted">
                    No hay tareas pendientes.
                  </li>
                )}
                {view.pendingTasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border-soft bg-bg px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-text-muted">
                        {t.creatorName}
                        {t.dueDate ? ` · vence ${formatDate(t.dueDate)}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
