"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { Panel } from "@/components/ui";
import { PANEL, usePanelData } from "@/lib/swr";
import { currentMonth, formatNumber } from "@/lib/utils";
import type { HubData } from "@/components/overview-extras";

function ReportInner() {
  const sp = useSearchParams();
  const period = sp.get("period") || currentMonth();
  const { data } = usePanelData(`${PANEL.hub}?period=${period}`) as {
    data?: HubData;
  };

  return (
    <div>
      <TopBar
        title={`Reporte ${period}`}
        subtitle="Imprime o guarda como PDF desde el navegador (Ctrl+P)"
      />
      <div className="mb-4 print:hidden">
        <button
          type="button"
          className="rounded-lg bg-accent px-4 py-2 text-sm text-white"
          onClick={() => window.print()}
        >
          Imprimir / PDF
        </button>
      </div>
      {!data ? (
        <p className="text-sm text-text-muted">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <Panel>
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
              Resumen
            </h2>
            <p className="mt-2 text-sm">
              Diamantes {formatNumber(data.trend.diamonds)} · vs mes anterior{" "}
              {data.trend.diamondsPct.toFixed(1)}% · proyección{" "}
              {formatNumber(data.projection.projected)}
            </p>
          </Panel>
          <Panel>
            <h2 className="mb-3 font-[family-name:var(--font-syne)] text-lg font-semibold">
              Top 3
            </h2>
            <ol className="space-y-1 text-sm">
              {data.podium.map((p, i) => (
                <li key={p.id}>
                  {i + 1}. {p.name} — {formatNumber(p.diamonds)}
                </li>
              ))}
            </ol>
          </Panel>
          <Panel>
            <h2 className="mb-3 font-[family-name:var(--font-syne)] text-lg font-semibold">
              Managers
            </h2>
            <ul className="space-y-1 text-sm">
              {data.managers.map((m) => (
                <li key={m.id}>
                  {m.name}: {formatNumber(m.diamonds)} ◆ · {m.active} activos
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <h2 className="mb-3 font-[family-name:var(--font-syne)] text-lg font-semibold">
              Alertas
            </h2>
            <ul className="space-y-1 text-sm">
              {data.alerts.slice(0, 25).map((a) => (
                <li key={a.id}>
                  {a.name} — {a.label}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<p className="text-sm text-text-muted">Cargando…</p>}>
      <ReportInner />
    </Suspense>
  );
}
