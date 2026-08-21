"use client";

import { useMemo } from "react";
import { Gem, Clock3, Swords, Eye } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { KpiCard } from "@/components/kpi-card";
import { MetricForm } from "@/components/metric-form";
import { MetricsChartLazy } from "@/components/metrics-chart-lazy";
import { PanelLoadError } from "@/components/panel-load-error";
import { Panel } from "@/components/ui";
import { formatDate, formatNumber } from "@/lib/utils";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";
import { useCreatorsRoster } from "@/lib/use-creators-roster";
import { useViewAs } from "@/components/view-as";

export default function MetricsClient() {
  const { creators: roster } = useCreatorsRoster();
  const { viewAsId } = useViewAs();
  const { data, error, mutate } = usePanelData(PANEL.metrics) as {
    data?: {
      month: string;
      creators: { id: string; name: string }[];
      kpis: {
        diamonds: number;
        hours: number;
        battles: number;
        peakViewers: number;
        prevDiamonds: number;
        prevHours: number;
      };
      chart: { label: string; diamonds: number; hours: number }[];
      metrics: {
        id: string;
        date: string;
        diamonds: number;
        hoursLive: number;
        peakViewers: number;
        creatorName: string;
      }[];
    };
    error?: Error;
    mutate: () => void;
  };

  const formCreators =
    roster.length > 0
      ? roster.map((c) => ({ id: c.id, name: c.name }))
      : data?.creators ?? [];

  const metrics = useMemo(() => {
    const list = data?.metrics ?? [];
    if (!viewAsId) return list;
    const names = new Set(roster.map((c) => c.name));
    return list.filter((m) => names.has(m.creatorName));
  }, [data?.metrics, viewAsId, roster]);

  const delta = data
    ? data.kpis.diamonds - data.kpis.prevDiamonds
    : 0;

  if (error) {
    return (
      <div>
        <TopBar title="Data" subtitle="Rendimiento del roster" />
        <PanelLoadError onRetry={() => mutate()} />
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title="Data"
        subtitle={`Rendimiento del roster · ${data?.month ?? "…"}`}
      />
      {!data ? (
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-panel h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Diamantes mes"
          value={formatNumber(data.kpis.diamonds)}
          hint={`${delta >= 0 ? "+" : ""}${formatNumber(delta)} vs mes anterior`}
          icon={Gem}
        />
        <KpiCard
          label="Horas LIVE"
          value={formatNumber(data.kpis.hours)}
          hint={`Mes anterior: ${data.kpis.prevHours}h`}
          icon={Clock3}
          tone="cyan"
        />
        <KpiCard label="Combates" value={formatNumber(data.kpis.battles)} icon={Swords} tone="warning" />
        <KpiCard
          label="Peak viewers (suma)"
          value={formatNumber(data.kpis.peakViewers)}
          icon={Eye}
          tone="success"
        />
      </div>

      <div className="mb-6">
        <MetricForm
          creators={formCreators}
          onSaved={() => {
            mutate();
            invalidatePanel(PANEL.dashboard);
          }}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-semibold">
            Diamantes y horas por día
          </h2>
          {data.chart.length === 0 ? (
            <p className="py-16 text-center text-sm text-text-muted">
              Registra métricas para ver el gráfico.
            </p>
          ) : (
            <MetricsChartLazy data={data.chart} />
          )}
        </Panel>

        <Panel className="overflow-x-auto p-0">
          <div className="border-b border-border-soft px-5 py-4">
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
              Historial reciente
            </h2>
          </div>
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase text-text-muted">
              <tr className="border-b border-border-soft">
                <th className="px-5 py-3 font-medium">Fecha</th>
                <th className="px-5 py-3 font-medium">Creador</th>
                <th className="px-5 py-3 font-medium">Diamantes</th>
                <th className="px-5 py-3 font-medium">Horas</th>
                <th className="px-5 py-3 font-medium">Peak</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id} className="border-b border-border-soft/60">
                  <td className="px-5 py-3 text-text-muted">{formatDate(m.date)}</td>
                  <td className="px-5 py-3">{m.creatorName}</td>
                  <td className="px-5 py-3 font-medium">{formatNumber(m.diamonds)}</td>
                  <td className="px-5 py-3">{m.hoursLive}h</td>
                  <td className="px-5 py-3 text-text-muted">{formatNumber(m.peakViewers)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
        </>
      )}
    </div>
  );
}
