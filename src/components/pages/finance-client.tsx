"use client";

import { useMemo, useState } from "react";
import {
  Wallet,
  CircleDollarSign,
  BadgePercent,
  Gift,
  Check,
  Undo2,
} from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { KpiCard } from "@/components/kpi-card";
import { SettlementForm } from "@/components/settlement-form";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, Panel, Field, inputClass } from "@/components/ui";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";
import { useCreatorsRoster } from "@/lib/use-creators-roster";
import { MESES_NOMBRE, periodKey } from "@/lib/bonos";

type BonoRow = {
  id: string;
  nombre: string;
  diamantes: number;
  horas: number;
  dias: number;
  bono: number;
  gananciaAgencia: number;
  pagado: boolean;
};

function BonosTable({
  rows,
  loading,
  emptyText,
  mode,
  busyId,
  onAction,
}: {
  rows: BonoRow[];
  loading: boolean;
  emptyText: string;
  mode?: "pay" | "revert";
  busyId?: string | null;
  onAction?: (row: BonoRow) => void;
}) {
  const cols = mode ? 7 : 6;
  return (
    <table className="w-full table-fixed text-left text-[11px] leading-tight">
      <thead className="border-b border-border-soft text-[10px] uppercase tracking-wide text-text-muted">
        <tr>
          <th className="w-[22%] px-2 py-2 font-medium">Usuario</th>
          <th className="w-[14%] px-1.5 py-2 font-medium">Diam.</th>
          <th className="w-[8%] px-1.5 py-2 font-medium">Días</th>
          <th className="w-[8%] px-1.5 py-2 font-medium">Horas</th>
          <th className="w-[12%] px-1.5 py-2 font-medium">Bono</th>
          <th className="w-[14%] px-1.5 py-2 font-medium">Ganancia</th>
          {mode && (
            <th className="w-[22%] px-1.5 py-2 text-right font-medium">
              Acción
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <td
              colSpan={cols}
              className="px-2 py-6 text-center text-text-muted"
            >
              Cargando…
            </td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td
              colSpan={cols}
              className="px-2 py-6 text-center text-text-muted"
            >
              {emptyText}
            </td>
          </tr>
        ) : (
          rows.map((b) => (
            <tr key={b.id} className="border-b border-border-soft/60">
              <td className="truncate px-2 py-1.5 font-medium" title={b.nombre}>
                {b.nombre}
              </td>
              <td className="px-1.5 py-1.5 tabular-nums">
                {formatNumber(b.diamantes)}
              </td>
              <td className="px-1.5 py-1.5 tabular-nums">
                {formatNumber(b.dias)}
              </td>
              <td className="px-1.5 py-1.5 tabular-nums">{b.horas}</td>
              <td className="px-1.5 py-1.5 font-medium tabular-nums text-success">
                {formatCurrency(b.bono)}
              </td>
              <td className="px-1.5 py-1.5 font-medium tabular-nums text-accent">
                {formatCurrency(b.gananciaAgencia)}
              </td>
              {mode === "pay" && (
                <td className="px-1.5 py-1.5 text-right">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busyId === b.id}
                    className={cn(
                      "h-6 gap-0.5 border-[#25D366]/40 bg-[#25D366]/10 px-1.5 text-[10px] text-[#25D366]",
                      "hover:bg-[#25D366]/20"
                    )}
                    onClick={() => onAction?.(b)}
                  >
                    <Check className="h-3 w-3" />
                    {busyId === b.id ? "…" : "Pagar"}
                  </Button>
                </td>
              )}
              {mode === "revert" && (
                <td className="px-1.5 py-1.5 text-right">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busyId === b.id}
                    className="h-6 gap-0.5 px-1.5 text-[10px]"
                    onClick={() => onAction?.(b)}
                  >
                    <Undo2 className="h-3 w-3" />
                    {busyId === b.id ? "…" : "Revertir"}
                  </Button>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export default function FinanceClient() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payError, setPayError] = useState("");

  const pk = periodKey(anio, mes);
  const years = useMemo(() => {
    const y0 = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => y0 - 4 + i);
  }, []);

  const { data, error, mutate } = usePanelData(PANEL.ops) as {
    data?: {
      creators: {
        id: string;
        name: string;
        tiktokUser?: string | null;
        diamonds?: number;
      }[];
      finance: {
        settlements: {
          id: string;
          month: string;
          creatorId?: string;
          creatorName: string;
          diamonds: number;
          hours?: number;
          days?: number;
          estimatedPay: number;
          agencyAmount: number;
          agencyPercent: number;
          creatorAmount: number;
          status: string;
          notes?: string | null;
        }[];
      };
    };
    error?: Error;
    mutate: () => void;
  };

  const {
    data: bonosData,
    isLoading: bonosLoading,
    mutate: mutateBonos,
  } = usePanelData(`${PANEL.bonos}?period=${pk}`) as {
    data?: { rows: BonoRow[] };
    isLoading: boolean;
    mutate: () => void;
  };

  const { creators: rosterCreators } = useCreatorsRoster();

  const formCreators = useMemo(() => {
    if (rosterCreators.length) {
      return rosterCreators.map((c) => ({
        id: c.id,
        name: c.name,
        tiktokUser: c.tiktokUser,
        diamonds: c.diamonds ?? 0,
      }));
    }
    return data?.creators ?? [];
  }, [rosterCreators, data?.creators]);

  const bonos = useMemo(() => {
    const rows = bonosData?.rows ?? [];
    return rows.map((r) => ({
      id: r.id,
      nombre: String(r.nombre ?? ""),
      diamantes: Number(r.diamantes ?? 0),
      horas: Number(r.horas ?? 0),
      dias: Number(r.dias ?? 0),
      bono: Number(r.bono ?? 0) || 0,
      gananciaAgencia: Number(r.gananciaAgencia ?? 0) || 0,
      pagado: Boolean(r.pagado),
    }));
  }, [bonosData]);

  const periodSettlements = useMemo(() => {
    const all = data?.finance.settlements ?? [];
    return all.filter((s) => s.month === pk);
  }, [data, pk]);

  const displayBonos = useMemo(() => {
    const byNick = new Map<string, number>();
    for (const s of periodSettlements) {
      const key = s.creatorName.replace(/^@/, "").trim().toLowerCase();
      if (key) byNick.set(key, s.agencyAmount);
      if (s.creatorId) {
        const c = formCreators.find((x) => x.id === s.creatorId);
        if (c) {
          const nick = (c.tiktokUser || c.name)
            .replace(/^@/, "")
            .trim()
            .toLowerCase();
          if (nick) byNick.set(nick, s.agencyAmount);
        }
      }
    }
    return bonos.map((b) => {
      const nick = b.nombre.replace(/^@/, "").trim().toLowerCase();
      const gananciaAgencia =
        b.gananciaAgencia > 0 ? b.gananciaAgencia : byNick.get(nick) ?? 0;
      return { ...b, gananciaAgencia };
    });
  }, [bonos, periodSettlements, formCreators]);

  const sinPagar = useMemo(
    () => displayBonos.filter((b) => !b.pagado),
    [displayBonos]
  );
  const pagados = useMemo(
    () => displayBonos.filter((b) => b.pagado),
    [displayBonos]
  );

  const agencyTotal = useMemo(
    () => displayBonos.reduce((a, r) => a + r.gananciaAgencia, 0),
    [displayBonos]
  );
  const totalSinPagar = sinPagar.reduce((a, r) => a + r.bono, 0);
  const totalPagados = pagados.reduce((a, r) => a + r.bono, 0);
  const totalBonos = totalSinPagar + totalPagados;

  async function markPaid(row: BonoRow) {
    if (!confirm(`¿Marcar como pagado el bono de ${row.nombre}?`)) return;
    setPayingId(row.id);
    setPayError("");
    try {
      const res = await fetch(PANEL.bonos, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, pagado: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error || "No se pudo marcar como pagado"
        );
      }
      mutateBonos();
      invalidatePanel(PANEL.bonos);
    } catch (err) {
      setPayError(
        err instanceof Error ? err.message : "No se pudo marcar como pagado"
      );
    } finally {
      setPayingId(null);
    }
  }

  async function markUnpaid(row: BonoRow) {
    if (!confirm(`¿Revertir el pago de ${row.nombre}? Volverá a sin pagar.`))
      return;
    setPayingId(row.id);
    setPayError("");
    try {
      const res = await fetch(PANEL.bonos, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, pagado: false }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error || "No se pudo revertir el pago"
        );
      }
      mutateBonos();
      invalidatePanel(PANEL.bonos);
    } catch (err) {
      setPayError(
        err instanceof Error ? err.message : "No se pudo revertir el pago"
      );
    } finally {
      setPayingId(null);
    }
  }

  function onSettlementSaved() {
    mutate();
    mutateBonos();
    invalidatePanel(PANEL.bonos);
  }

  if (error) {
    return (
      <div>
        <TopBar
          title="Finanzas"
          subtitle="Comisiones, pagos y liquidaciones del roster"
        />
        <PanelLoadError onRetry={() => mutate()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <TopBar
          title="Finanzas"
          subtitle="Comisiones, pagos y liquidaciones del roster"
        />
        <div className="glass-panel h-64 animate-pulse rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title="Finanzas"
        subtitle={`${MESES_NOMBRE[mes]} ${anio} · Liquidaciones y bonos del periodo`}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Ganancia agencia"
          value={formatCurrency(agencyTotal)}
          hint={pk}
          icon={BadgePercent}
        />
        <KpiCard
          label="Bonos sin pagar"
          value={formatCurrency(totalSinPagar)}
          hint={`${sinPagar.length} registro${sinPagar.length === 1 ? "" : "s"}`}
          icon={CircleDollarSign}
          tone="warning"
        />
        <KpiCard
          label="Bonos pagados"
          value={formatCurrency(totalPagados)}
          hint={`${pagados.length} registro${pagados.length === 1 ? "" : "s"}`}
          icon={Gift}
          tone="success"
        />
        <KpiCard
          label="Total bonos del mes"
          value={formatCurrency(totalBonos)}
          hint="Sin pagar + pagados"
          icon={Wallet}
          tone="cyan"
        />
      </div>

      <Panel className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Periodo">
            <div className="flex gap-2">
              <select
                className={`${inputClass} w-40`}
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
              >
                {MESES_NOMBRE.slice(1).map((nombre, i) => (
                  <option key={nombre} value={i + 1}>
                    {nombre}
                  </option>
                ))}
              </select>
              <select
                className={`${inputClass} w-28`}
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <p className="pb-2 text-sm text-text-muted">
            Bonos de la pestaña <strong>Bonos</strong> y los de liquidación
            entran en <strong>sin pagar</strong> hasta que pulses Pagar.
          </p>
        </div>
      </Panel>

      <div className="mb-6">
        <SettlementForm
          creators={formCreators}
          defaultMonth={pk}
          existing={data.finance.settlements}
          onSaved={onSettlementSaved}
        />
      </div>

      {payError && (
        <Panel className="mb-4 border-danger/40">
          <p className="text-sm text-danger">{payError}</p>
        </Panel>
      )}

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Panel className="overflow-hidden p-0">
          <div className="border-b border-border-soft px-3 py-3">
            <h2 className="font-[family-name:var(--font-syne)] text-base font-semibold">
              Bonos sin pagar · {MESES_NOMBRE[mes]} {anio}
            </h2>
            <p className="text-[11px] text-text-muted">
              Pestaña Bonos + liquidaciones · total{" "}
              {formatCurrency(totalSinPagar)}
            </p>
          </div>
          <BonosTable
            rows={sinPagar}
            loading={bonosLoading}
            emptyText="No hay bonos pendientes en este periodo."
            mode="pay"
            busyId={payingId}
            onAction={(row) => void markPaid(row)}
          />
        </Panel>

        <Panel className="overflow-hidden p-0">
          <div className="border-b border-border-soft px-3 py-3">
            <h2 className="font-[family-name:var(--font-syne)] text-base font-semibold">
              Bonos pagados · {MESES_NOMBRE[mes]} {anio}
            </h2>
            <p className="text-[11px] text-text-muted">
              Ya liquidados · total {formatCurrency(totalPagados)}
            </p>
          </div>
          <BonosTable
            rows={pagados}
            loading={bonosLoading}
            emptyText="Aún no hay bonos marcados como pagados."
            mode="revert"
            busyId={payingId}
            onAction={(row) => void markUnpaid(row)}
          />
        </Panel>
      </div>
    </div>
  );
}
