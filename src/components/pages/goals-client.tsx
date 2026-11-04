"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, Trophy, RefreshCw } from "lucide-react";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Field, Panel, inputClass } from "@/components/ui";
import { MESES_NOMBRE, periodKey } from "@/lib/bonos";
import { GOAL_TABLES, fmtHours, progressFor, type GoalLevel, type GoalTableId, type Progress, type Stats } from "@/lib/goal-levels";
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

type Sort = "cerca" | "diamantes" | "nivel_d" | "nivel_h" | "nombre";

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

/** Un bloque de metas (una tabla): insignia de nivel, tres barras y cuánto falta. */
function GoalBlock({ title, levels, stats, p }: { title: string; levels: GoalLevel[]; stats: Stats; p: Progress }) {
  const t = p.next ?? levels[levels.length - 1];
  const maxLevel = levels[levels.length - 1].level;
  const parts = [
    p.missing.diamonds > 0 ? `${formatNumber(p.missing.diamonds)} diamantes` : null,
    p.missing.days > 0 ? `${p.missing.days} ${p.missing.days === 1 ? "día" : "días"}` : null,
    p.missing.hours > 0 ? fmtHours(p.missing.hours) : null,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3.5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
              p.level > 0 ? "border-success/40 bg-success/10 text-success" : "border-border text-text-muted"
            )}
          >
            <Trophy className="h-3 w-3" />
            {p.level > 0 ? `Nivel ${p.level}` : "Sin nivel"}
          </span>
          <span className="text-[10px] text-text-muted">{p.next ? `Siguiente: Nivel ${p.next.level}` : `Nivel máximo (${maxLevel})`}</span>
        </div>
      </div>

      <div className="space-y-3">
        <Bar label="Diamantes" have={stats.diamonds} want={t.diamonds} ratio={p.ratio.diamonds} missing={p.missing.diamonds} format={formatNumber} />
        <Bar label="Días LIVE" have={stats.days} want={t.days} ratio={p.ratio.days} missing={p.missing.days} format={(n) => String(Math.round(n))} unit=" d" />
        <Bar label="Horas LIVE" have={stats.hours} want={t.hours} ratio={p.ratio.hours} missing={p.missing.hours} format={fmtHours} />
      </div>

      <p className={cn("mt-3 rounded-md px-2.5 py-1.5 text-[11px]", p.next ? "bg-white/5 text-text-muted" : "bg-success/10 text-success")}>
        {!p.next
          ? "¡Llegó al nivel máximo!"
          : parts.length === 0
            ? `Ya cumple todo para el Nivel ${p.next.level}.`
            : `Para el Nivel ${p.next.level} faltan: ${parts.join(" · ")}.`}
      </p>
    </div>
  );
}

/**
 * Barra deslizable de niveles: se arrastra de "Todos" → "Sin nivel" → Nivel 1 … N, y filtra a los creadores
 * que están exactamente en ese nivel. value: -1 = todos, 0 = sin nivel, 1..N = ese nivel.
 */
function LevelSlider({
  title,
  levels,
  value,
  counts,
  total,
  onChange,
}: {
  title: string;
  levels: GoalLevel[];
  value: number;
  counts: Map<number, number>;
  total: number;
  onChange: (v: number) => void;
}) {
  const max = levels[levels.length - 1].level;
  const stops = [-1, 0, ...levels.map((l) => l.level)];
  const label = (v: number) => (v === -1 ? "Todos" : v === 0 ? "Sin nivel" : `Nivel ${v}`);
  const countOf = (v: number) => (v === -1 ? total : counts.get(v) ?? 0);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3.5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
        <p className="text-sm">
          <b className={value === -1 ? "text-text" : "text-accent"}>{label(value)}</b>
          <span className="ml-2 text-xs text-text-muted">
            {countOf(value)} {countOf(value) === 1 ? "creador" : "creadores"}
          </span>
        </p>
      </div>

      <input
        type="range"
        min={-1}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`Filtrar por nivel: ${title}`}
        className="w-full cursor-pointer accent-accent"
      />

      <div className="mt-1 flex justify-between">
        {stops.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            title={`${label(v)} · ${countOf(v)}`}
            className={cn(
              "flex min-w-0 flex-col items-center px-0.5 text-[10px] leading-tight transition",
              value === v ? "font-bold text-accent" : "text-text-muted hover:text-text"
            )}
          >
            <span>{v === -1 ? "Todos" : v === 0 ? "—" : v}</span>
            <span className="opacity-60">{countOf(v)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const TABLE_IDS = Object.keys(GOAL_TABLES) as GoalTableId[];

export default function GoalsClient() {
  const { path } = useAgency();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("cerca");
  // -1 = todos, 0 = sin nivel, 1..N = ese nivel (una barra por tabla)
  const [levelB, setLevelB] = useState(-1);
  const [levelE, setLevelE] = useState(-1);
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

  const base = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (data?.rows ?? [])
      .filter((r) => !term || r.username.toLowerCase().includes(term) || (r.creatorName ?? "").toLowerCase().includes(term))
      .map((r) => {
        const stats: Stats = { diamonds: r.diamonds, days: r.days, hours: r.hours };
        const progress = { bonos: progressFor(GOAL_TABLES.bonos.levels, stats), empleados: progressFor(GOAL_TABLES.empleados.levels, stats) };
        // Qué tan cerca está de sus siguientes metas (promedio de las dos tablas; en el máximo cuenta como completo)
        const close = (progress.bonos.overall + progress.empleados.overall) / 2;
        return { row: r, stats, progress, close };
      });
    list.sort((a, b) => {
      if (sort === "nombre") return (a.row.creatorName ?? a.row.username).localeCompare(b.row.creatorName ?? b.row.username);
      if (sort === "diamantes") return b.row.diamonds - a.row.diamonds;
      if (sort === "nivel_d") return b.progress.bonos.level - a.progress.bonos.level || b.row.diamonds - a.row.diamonds;
      if (sort === "nivel_h") return b.progress.empleados.level - a.progress.empleados.level || b.row.hours - a.row.hours;
      return b.close - a.close || b.row.diamonds - a.row.diamonds;
    });
    return list;
  }, [data, q, sort]);

  // Cada barra cuenta con el filtro de la otra aplicado, para que los números cuadren con lo que se ve
  const countsB = useMemo(() => {
    const c = new Map<number, number>();
    for (const i of base) if (levelE === -1 || i.progress.empleados.level === levelE) c.set(i.progress.bonos.level, (c.get(i.progress.bonos.level) ?? 0) + 1);
    return c;
  }, [base, levelE]);
  const countsE = useMemo(() => {
    const c = new Map<number, number>();
    for (const i of base) if (levelB === -1 || i.progress.bonos.level === levelB) c.set(i.progress.empleados.level, (c.get(i.progress.empleados.level) ?? 0) + 1);
    return c;
  }, [base, levelB]);

  const items = useMemo(
    () => base.filter((i) => (levelB === -1 || i.progress.bonos.level === levelB) && (levelE === -1 || i.progress.empleados.level === levelE)),
    [base, levelB, levelE]
  );
  const totalForB = base.filter((i) => levelE === -1 || i.progress.empleados.level === levelE).length;
  const totalForE = base.filter((i) => levelB === -1 || i.progress.bonos.level === levelB).length;

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
        <Field label="Ordenar por">
          <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="cerca">Más cerca de sus metas</option>
            <option value="diamantes">Más diamantes</option>
            <option value="nivel_d">Nivel más alto en diamantes</option>
            <option value="nivel_h">Nivel más alto en días y horas</option>
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
            Desliza cada barra para ver solo a los creadores de ese nivel. Se calcula con lo importado en{" "}
            <Link href={path("/control-diamantes")} className="text-cyan underline-offset-2 hover:underline">
              Control de diamantes
            </Link>
            {lastUpdate ? ` · última actualización ${formatDateTime(lastUpdate)}` : ""}.
          </p>
          <div className="flex gap-2">
            {(levelB !== -1 || levelE !== -1) && (
              <button
                type="button"
                onClick={() => {
                  setLevelB(-1);
                  setLevelE(-1);
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted transition hover:border-white/25 hover:text-text"
              >
                Ver todos
              </button>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted transition hover:border-white/25 hover:text-text disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Actualizar
            </button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <LevelSlider title={`${GOAL_TABLES.bonos.label} · Nivel 1 al 10`} levels={GOAL_TABLES.bonos.levels} value={levelB} counts={countsB} total={totalForB} onChange={setLevelB} />
          <LevelSlider title={`${GOAL_TABLES.empleados.label} · Nivel 1 al 5`} levels={GOAL_TABLES.empleados.levels} value={levelE} counts={countsE} total={totalForE} onChange={setLevelE} />
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
        <Panel className="py-10 text-center text-sm text-text-muted">
          {levelB !== -1 || levelE !== -1 ? "Nadie cumple esa combinación de niveles este mes." : "Ningún creador coincide con la búsqueda."}
        </Panel>
      ) : (
        <ul className="space-y-4">
          {items.map(({ row, stats, progress }) => (
            <li key={row.id} className="rounded-xl border border-white/10 bg-bg-elevated/80 p-4">
              <div className="mb-3 flex items-center gap-3">
                <TikTokAvatar username={row.username} name={row.creatorName ?? row.username} size={44} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{row.creatorName ?? `@${row.username}`}</p>
                  <p className="truncate text-xs text-text-muted">@{row.username}</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {TABLE_IDS.map((id) => (
                  <GoalBlock key={id} title={GOAL_TABLES[id].label} levels={GOAL_TABLES[id].levels} stats={stats} p={progress[id]} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
