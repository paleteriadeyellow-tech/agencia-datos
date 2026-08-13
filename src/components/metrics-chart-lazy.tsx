"use client";

import dynamic from "next/dynamic";

const Chart = dynamic(
  () => import("@/components/metrics-chart").then((m) => m.MetricsChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center text-sm text-text-muted">
        Cargando gráfico…
      </div>
    ),
  }
);

export function MetricsChartLazy({
  data,
}: {
  data: { label: string; diamonds: number; hours: number }[];
}) {
  return <Chart data={data} />;
}
