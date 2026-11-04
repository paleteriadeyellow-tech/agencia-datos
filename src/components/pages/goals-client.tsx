"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, Trophy, RefreshCw } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Field, Panel, inputClass } from "@/components/ui";
import { MESES_NOMBRE, periodKey } from "@/lib/bonos";
import { GOAL_TABLES, fmtHours, progressFor, type GoalTableId, type Stats } from "@/lib/goal-levels";
import { PANEL, usePanelData } from "@/lib/swr";
import { useAgency } from "@/lib/use-agency";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

type Row = {
  id: string;
  username: string;
  creatorName: string | null;
  diamonds: number;
  hours: number;
  days: number;
  updatedAt: string;
};

type Payload = { period: string; rows: Row[] };

type Sort = "cerca" | "diamantes" | "nivel" | "nombre";

function Bar({
  label,
  have,
  want,
  ratio,
  missing,
  format,
  unit,
}: {
  label: string;
  have: number;
  want: number;
  ratio: number;
  missing: number;
  format: (n: number) => string;
  unit?: string;
}) {
  const done = missing <= 0 && ratio >= 1;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-text">{label}</span>
        <span className="text-text-muted">
          <b className="text-text">{format(have)}</b> / {format(want)}
          {unit}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn("h-full rounded-full transition-all", done ? "bg-success" : "bg-cyan")}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <p className={cn("mt-1 text-[11px]", done ? "text-success" : "text-text-muted")}>
        {done ? "✓ Meta cumplida" : `Faltan ${format(missing)}${unit ?? ""}`}
      </p>
    </div>
  );
}

export default function GoalsClient() {
  const { path } = useAgency();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [table, setTable] = useState<GoalTableId>("bonos");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("cerca");
  const [refreshing, setRefreshing] = useState(false);

  const period = periodKey(year, month);
  const thisYear = now.getFullYear();
  const years = useMemo(() => Array.from({ length: 7 }, (_, i) => thisYear - 4 + i), [thisYear]);
  const url = `${PANEL.diamonds}?period=${period}`;

  const { data, error, mutate } = usePanelData(url) as {
    data?: Payload;
    error?: Error;
    mutate: (data?: unknown, opts?: { revalidate?: boolean }) => Promise<unknown>;
  };

  /** Trae lo último importado en Control de diamantes sin usar la caché del navegador (las rutas del panel se guardan 60 s). */
  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch(url, { cache: "no-store", headers: { "x-skip-view-as": "1" } });
      if (res.ok) await mutate(await res.json(), { revalidate: false });
    } catch {
      /* se queda lo que ya se ve */
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const levels = GOAL_TABLES[table].levels;
  const maxLevel = levels[levels.length - 1].level;

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (data?.rows ?? [])
      .filter((r) => !term || r.username.toLowerCase().includes(term) || (r.creatorName ?? "").toLowerCase().includes(term))
      .map((r) => {
        const stats: Stats = { diamonds: r.diamonds, days: r.days, hours: r.hours };
        return { row: r, stats, p: progressFor(levels, stats) };
      });
    list.sort((a, b) => {
      if (sort === "nombre") return (a.row.creatorName ?? a.row.username).localeCompare(b.row.creatorName ?? b.row.username);
      if (sort === "diamantes") return b.row.diamonds - a.row.diamonds;
      if (sort === "nivel") return b.p.level - a.p.level || b.row.diamonds - a.row.diamonds;
      // "cerca": los que están más cerca de su siguiente meta primero (los que ya están en el máximo, al final)
      const ra = a.p.next ? a.p.overall : -1;
      const rb = b.p.next ? b.p.overall : -1;
      return rb - ra || b.row.diamonds - a.row.diamonds;
    });
    return list;
  }, [data, levels, q, sort]);

  const byLevel = useMemo(() => {
    const c = new Map<number, number>();
    for (const i of items) c.set(i.p.level, (c.get(i.p.level) ?? 0) + 1);
    return c;
  }, [items]);

  const lastUpdate = useMemo(() => {
    const t = (data?.rows ?? []).map((r) => new Date(r.updatedAt).getTime());
    return t.length ? new Date(Math.max(...t)).toISOString() : null;
  }, [data]);

  if (error) {
    return (
      <div>
        <TopBar title="Metas de creadores" subtitle="Cuánto les falta para su siguiente nivel" />
        <PanelLoadError onRetry={() => void mutate()} />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Metas de creadores" subtitle={`${MESES_NOMBRE[month]} ${year} · avance en diamantes, días y horas`} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Mes">
          <select className={inputClass} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MESES_NOMBRE.slice(1).map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Año">
          <select className={inputClass} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tabla de metas">
          <select className={inputClass} value={table} onChange={(e) => setTable(e.target.value as GoalTableId)}>
            {(Object.keys(GOAL_TABLES) as GoalTableId[]).map((k) => (
              <option key={k} value={k}>
                {GOAL_TABLES[k].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ordenar por">
          <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="cerca">Más cerca de su meta</option>
            <option value="diamantes">Más diamantes</option>
            <option value="nivel">Nivel más alto</option>
            <option value="nombre">Nombre</option>
          </select>
        </Field>
        <div className="min-w-[12rem] flex-1">
          <Field label="Buscar creador">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} className={cn(inputClass, "pl-9")} placeholder="Nombre o @usuario" />
            </div>
          </Field>
        </div>
      </div>

      <Panel className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-text-muted">
            {GOAL_TABLES[table].hint} Se calcula con lo importado en{" "}
            <Link href={path("/control-diamantes")} className="text-cyan underline-offset-2 hover:underline">
              Control de diamantes
            </Link>
            {lastUpdate ? ` · última actualización ${formatDateTime(lastUpdate)}` : ""}.
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted transition hover:border-white/25 hover:text-text disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Actualizar
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[0, ...levels.map((l) => l.level)].map((lv) => (
            <span
              key={lv}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px]",
                (byLevel.get(lv) ?? 0) > 0 ? "border-accent/40 bg-accent-soft text-white" : "border-border text-text-muted"
              )}
            >
              {lv === 0 ? "Sin nivel" : `Nivel ${lv}`} · {byLevel.get(lv) ?? 0}
            </span>
          ))}
        </div>
      </Panel>

      {!data ? (
        <div className="glass-panel h-64 animate-pulse rounded-2xl" />
      ) : data.rows.length === 0 ? (
        <Panel className="py-10 text-center text-sm text-text-muted">
          No hay datos de {MESES_NOMBRE[month]} {year}. Importa el archivo en{" "}
          <Link href={path("/control-diamantes")} className="text-cyan hover:underline">
            Control de diamantes
          </Link>{" "}
          y aparecerán aquí.
        </Panel>
      ) : items.length === 0 ? (
        <Panel className="py-10 text-center text-sm text-text-muted">Ningún creador coincide con la búsqueda.</Panel>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {items.map(({ row, p }) => {
            const t = p.next ?? levels[levels.length - 1];
            const parts = [
              p.missing.diamonds > 0 ? `${formatNumber(p.missing.diamonds)} diamantes` : null,
              p.missing.days > 0 ? `${p.missing.days} ${p.missing.days === 1 ? "día" : "días"}` : null,
              p.missing.hours > 0 ? fmtHours(p.missing.hours) : null,
            ].filter(Boolean);
            return (
              <li key={row.id} className="rounded-xl border border-white/10 bg-bg-elevated/80 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{row.creatorName ?? `@${row.username}`}</p>
                    <p className="truncate text-xs text-text-muted">@{row.username}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                        p.level > 0 ? "border-success/40 bg-success/10 text-success" : "border-border text-text-muted"
                      )}
                    >
                      <Trophy className="h-3 w-3" />
                      {p.level > 0 ? `Nivel ${p.level}` : "Sin nivel"}
                    </span>
                    <span className="text-[11px] text-text-muted">{p.next ? `Siguiente: Nivel ${p.next.level}` : `Nivel máximo (${maxLevel})`}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Bar label="Diamantes" have={row.diamonds} want={t.diamonds} ratio={p.ratio.diamonds} missing={p.missing.diamonds} format={formatNumber} />
                  <Bar label="Días LIVE" have={row.days} want={t.days} ratio={p.ratio.days} missing={p.missing.days} format={(n) => String(Math.round(n))} unit=" d" />
                  <Bar label="Horas LIVE" have={row.hours} want={t.hours} ratio={p.ratio.hours} missing={p.missing.hours} format={fmtHours} />
                </div>

                <p className={cn("mt-3 rounded-lg px-3 py-2 text-xs", p.next ? "bg-white/5 text-text-muted" : "bg-success/10 text-success")}>
                  {!p.next
                    ? "¡Llegó al nivel máximo!"
                    : parts.length === 0
                      ? `Ya cumple todo para el Nivel ${p.next.level}.`
                      : `Para el Nivel ${p.next.level} le faltan: ${parts.join(" · ")}.`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
