"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, Field, Panel, inputClass } from "@/components/ui";
import { Modal } from "@/components/modal";
import { cn } from "@/lib/utils";
import { MESES_NOMBRE } from "@/lib/bonos";
import { PANEL, persistPanelCache, usePanelData } from "@/lib/swr";
import { mutate as cacheMutate } from "swr";
import { dateParts, todayIso } from "@/lib/video-suggestions";
import {
  BATTLE_LEVELS,
  BOOSTER_OPTIONS,
  LEVEL_LEGEND,
  battleLevel,
} from "@/lib/official-battles";

type Row = {
  id: string;
  date: string;
  year: number;
  month: number;
  time: string;
  level: string;
  creatorA: string;
  agencyA: string;
  creatorB: string;
  agencyB: string;
  boosters: string;
  sortOrder: number;
};

type Payload = {
  rows: Row[];
  years: number[];
};

const cellClass = cn(inputClass, "h-8 min-w-0 px-2 py-0 text-xs bg-bg/70");

function PillMenu({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; label: string; className: string }[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value) ?? options[0]!;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className={cn(
          "inline-flex min-w-[4.75rem] items-center justify-center rounded-full px-3 py-1 text-xs font-semibold",
          current.className
        )}
        onClick={() => setOpen((v) => !v)}
      >
        {current.label}
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 min-w-[8rem] rounded-xl border border-border-soft bg-bg-panel p-2 shadow-xl">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={cn(
                "mb-1 flex w-full items-center justify-center rounded-full px-3 py-1 text-xs font-semibold last:mb-0",
                opt.className
              )}
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OfficialBattlesClient() {
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonthNum = String(now.getMonth() + 1);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonthNum);
  const [q, setQ] = useState("");
  const [hint, setHint] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    date: todayIso(),
    time: "",
    level: "Inicial",
    creatorA: "",
    agencyA: "",
    creatorB: "",
    agencyB: "",
    boosters: "NO",
  });
  const timers = useRef<Record<string, number>>({});

  const url = `${PANEL.officialBattles}?year=${year}&month=${month}`;
  const { data, error, mutate } = usePanelData(url);
  const payload = data as Payload | undefined;
  const rowsAll = payload?.rows ?? [];

  const years = useMemo(() => {
    const y0 = Number(currentYear);
    const fromApi = payload?.years ?? [];
    return [...new Set([y0, y0 - 1, y0 + 1, ...fromApi])].sort((a, b) => b - a);
  }, [payload?.years, currentYear]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = query
      ? rowsAll.filter((r) =>
          [r.creatorA, r.agencyA, r.creatorB, r.agencyB, r.level, r.time]
            .join(" ")
            .toLowerCase()
            .includes(query)
        )
      : rowsAll;
    const order = new Map<string, number>(BATTLE_LEVELS.map((l, i) => [l.id, i]));
    return [...list].sort((a, b) => {
      const la = order.get(a.level) ?? 99;
      const lb = order.get(b.level) ?? 99;
      if (la !== lb) return la - lb;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
  }, [rowsAll, q]);

  const grouped = useMemo(() => {
    return BATTLE_LEVELS.map((level) => ({
      level,
      rows: rows.filter((r) => r.level === level.id),
    })).filter((g) => g.rows.length > 0);
  }, [rows]);

  const writeList = useCallback(
    (targetYear: string, targetMonth: string, updater: (rows: Row[]) => Row[]) => {
      const key = `${PANEL.officialBattles}?year=${targetYear}&month=${targetMonth}`;
      void cacheMutate(
        key,
        (current: Payload | undefined) => {
          const base: Payload = current ?? {
            rows: [],
            years: payload?.years ?? [],
          };
          const next = { ...base, rows: updater(base.rows) };
          persistPanelCache(key, next);
          return next;
        },
        { revalidate: false }
      );
    },
    [payload?.years]
  );

  const patchRow = useCallback(
    (id: string, patch: Partial<Row>) => {
      writeList(year, month, (list) =>
        list.map((r) => (r.id === id ? { ...r, ...patch } : r))
      );
    },
    [writeList, year, month]
  );

  const saveFields = useCallback(
    (row: Row, patch: Partial<Row>) => {
      const next = { ...row, ...patch };
      if (patch.date) {
        const parts = dateParts(patch.date);
        next.year = parts.year;
        next.month = parts.month;
      }
      const stillHere =
        (year === "all" || next.year === Number(year)) &&
        (month === "all" || next.month === Number(month));
      if (stillHere) patchRow(row.id, next);
      else {
        writeList(year, month, (list) => list.filter((r) => r.id !== row.id));
        writeList(String(next.year), String(next.month), (list) => [next, ...list]);
      }
      const key = `f-${row.id}`;
      if (timers.current[key]) window.clearTimeout(timers.current[key]);
      timers.current[key] = window.setTimeout(() => {
        if (row.id.startsWith("tmp-")) return;
        void fetch(PANEL.officialBattles, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "upsert", ...next }),
        }).catch(() => {
          setHint("No se pudo guardar.");
          void mutate();
        });
      }, 400);
    },
    [patchRow, writeList, year, month, mutate]
  );

  const viewingCurrent = year === currentYear && month === currentMonthNum;
  const periodLabel =
    year !== "all" && month !== "all"
      ? `${MESES_NOMBRE[Number(month)]} ${year}`
      : year !== "all"
        ? `Archivo ${year}`
        : "Archivo";

  function openCreate() {
    setDraft({
      date: todayIso(),
      time: "",
      level: "Inicial",
      creatorA: "",
      agencyA: "",
      creatorB: "",
      agencyB: "",
      boosters: "NO",
    });
    setHint("");
    setOpenAdd(true);
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const creatorA = draft.creatorA.trim();
    if (!creatorA) {
      setHint("Escribe el creador A.");
      return;
    }
    const date = draft.date || todayIso();
    const parts = dateParts(date);
    const targetYear = String(parts.year);
    const targetMonth = String(parts.month);
    const tempId = `tmp-${Date.now()}`;
    const optimistic: Row = {
      id: tempId,
      date,
      year: parts.year,
      month: parts.month,
      time: draft.time,
      level: draft.level,
      creatorA,
      agencyA: draft.agencyA.trim(),
      creatorB: draft.creatorB.trim(),
      agencyB: draft.agencyB.trim(),
      boosters: draft.boosters,
      sortOrder: rowsAll.length + 1,
    };

    writeList(targetYear, targetMonth, (list) => [...list, optimistic]);
    setYear(targetYear);
    setMonth(targetMonth);
    setOpenAdd(false);
    setAdding(true);

    try {
      const res = await fetch(PANEL.officialBattles, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          date: optimistic.date,
          year: optimistic.year,
          month: optimistic.month,
          time: optimistic.time,
          level: optimistic.level,
          creatorA: optimistic.creatorA,
          agencyA: optimistic.agencyA,
          creatorB: optimistic.creatorB,
          agencyB: optimistic.agencyB,
          boosters: optimistic.boosters,
        }),
      });
      const json = (await res.json()) as { error?: string; row?: Row };
      if (!res.ok || !json.row) {
        writeList(targetYear, targetMonth, (list) =>
          list.filter((r) => r.id !== tempId)
        );
        setHint(json.error || "No se pudo agregar");
        return;
      }
      writeList(targetYear, targetMonth, (list) =>
        list.map((r) => (r.id === tempId ? { ...optimistic, ...json.row } : r))
      );
    } catch {
      writeList(targetYear, targetMonth, (list) =>
        list.filter((r) => r.id !== tempId)
      );
      setHint("No se pudo agregar");
    } finally {
      setAdding(false);
    }
  }

  function removeRow(id: string) {
    writeList(year, month, (list) => list.filter((r) => r.id !== id));
    if (!id.startsWith("tmp-")) {
      void fetch(`${PANEL.officialBattles}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }).catch(() => {
        setHint("No se pudo eliminar");
        void mutate();
      });
    }
  }

  function renderRow(row: Row) {
    const level = battleLevel(row.level);
    return (
      <tr key={row.id} className={cn("border-b border-white/5", level.row)}>
        <td className="px-2 py-1.5">
          <PillMenu
            value={row.level}
            options={BATTLE_LEVELS.map((l) => ({
              id: l.id,
              label: l.label,
              className: l.pill,
            }))}
            onChange={(id) => saveFields(row, { level: id })}
          />
        </td>
        <td className="px-2 py-1.5">
          <input
            className={cn(cellClass, "min-w-[8rem]")}
            placeholder="Creador A"
            value={row.creatorA}
            onChange={(e) => saveFields(row, { creatorA: e.target.value })}
          />
        </td>
        <td className="px-2 py-1.5">
          <input
            className={cn(cellClass, "min-w-[7rem]")}
            placeholder="Agencia"
            value={row.agencyA}
            onChange={(e) => saveFields(row, { agencyA: e.target.value })}
          />
        </td>
        <td className="px-2 py-1.5">
          <input
            type="time"
            className={cn(cellClass, "min-w-[7.5rem]")}
            value={row.time}
            onChange={(e) => saveFields(row, { time: e.target.value })}
          />
        </td>
        <td className="px-2 py-1.5">
          <input
            type="date"
            className={cn(cellClass, "min-w-[9rem]")}
            value={row.date}
            onChange={(e) => saveFields(row, { date: e.target.value })}
          />
        </td>
        <td className="px-2 py-1.5">
          <input
            className={cn(cellClass, "min-w-[8rem]")}
            placeholder="Creador B"
            value={row.creatorB}
            onChange={(e) => saveFields(row, { creatorB: e.target.value })}
          />
        </td>
        <td className="px-2 py-1.5">
          <input
            className={cn(cellClass, "min-w-[7rem]")}
            placeholder="Agencia"
            value={row.agencyB}
            onChange={(e) => saveFields(row, { agencyB: e.target.value })}
          />
        </td>
        <td className="px-2 py-1.5">
          <PillMenu
            value={row.boosters}
            options={BOOSTER_OPTIONS.map((b) => ({
              id: b.id,
              label: b.label,
              className: b.className,
            }))}
            onChange={(id) => saveFields(row, { boosters: id })}
          />
        </td>
        <td className="px-2 py-1.5">
          <button
            type="button"
            title="Eliminar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-danger/15 hover:text-danger"
            onClick={() => removeRow(row.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>
    );
  }

  return (
    <div>
      <TopBar
        title="Batallas oficiales"
        subtitle={
          viewingCurrent
            ? `${periodLabel} · horario Ciudad de México`
            : `${periodLabel} · archivo`
        }
      />

      {error ? (
        <PanelLoadError onRetry={() => void mutate()} />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Año">
              <select
                className={inputClass}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value={currentYear}>{currentYear} · actual</option>
                <option value="all">Todos</option>
                {years.map((y) =>
                  String(y) === currentYear ? null : (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  )
                )}
              </select>
            </Field>
            <Field label="Mes">
              <select
                className={inputClass}
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              >
                <option value={currentMonthNum}>
                  {MESES_NOMBRE[Number(currentMonthNum)]} · mes actual
                </option>
                <option value="all">Archivo · todos los meses</option>
                {MESES_NOMBRE.slice(1).map((name, i) =>
                  String(i + 1) === currentMonthNum ? null : (
                    <option key={name} value={i + 1}>
                      {name} · archivo
                    </option>
                  )
                )}
              </select>
            </Field>
            <Field label="Buscar">
              <input
                className={inputClass}
                placeholder="Creador, agencia o rango…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button type="button" className="w-full" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Agregar
              </Button>
            </div>
          </div>

          <p className="mb-3 text-xs text-text-muted">
            {rows.length} batallas
            {viewingCurrent
              ? ` · ${MESES_NOMBRE[Number(currentMonthNum)]} ${currentYear}`
              : " · archivo"}
            {" · "}
            {viewingCurrent ? (
              <button
                type="button"
                className="text-cyan hover:underline"
                onClick={() => {
                  setYear(currentYear);
                  setMonth("all");
                }}
              >
                Ver archivo
              </button>
            ) : (
              <button
                type="button"
                className="text-cyan hover:underline"
                onClick={() => {
                  setYear(currentYear);
                  setMonth(currentMonthNum);
                }}
              >
                Volver al mes actual
              </button>
            )}
          </p>
          {hint && <p className="mb-3 text-xs text-cyan">{hint}</p>}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem] xl:items-start">
            <Panel className="overflow-hidden p-0">
              {!payload ? (
                <div className="h-40 animate-pulse rounded-lg bg-bg-hover/40" />
              ) : rows.length === 0 ? (
                <>
                  <div className="border-b border-cyan/25 bg-cyan/15 px-4 py-2 text-center text-[11px] font-semibold text-cyan">
                    Zona horaria GMT-6 (Horario de la Ciudad de México, no se
                    aceptará ningún otro horario como válido)
                  </div>
                  <div className="px-6 py-14 text-center">
                    <p className="font-[family-name:var(--font-syne)] text-lg font-semibold">
                      Aún no hay batallas
                    </p>
                    <p className="mt-1 text-sm text-text-muted">
                      Pulsa Agregar y llena la ficha. Aquí se listan las que
                      registres.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="border-b border-cyan/25 bg-cyan/15 px-4 py-2 text-center text-[11px] font-semibold text-cyan">
                    Zona horaria GMT-6 (Horario de la Ciudad de México, no se
                    aceptará ningún otro horario como válido)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-left text-sm">
                      <thead>
                        <tr className="bg-cyan/20 text-[10px] uppercase tracking-wide text-cyan">
                          <th className="px-3 py-2.5 font-semibold">Nivel</th>
                          <th className="px-3 py-2.5 font-semibold">Creador A</th>
                          <th className="px-3 py-2.5 font-semibold">Agencia</th>
                          <th className="px-3 py-2.5 font-semibold">Hora</th>
                          <th className="px-3 py-2.5 font-semibold">Fecha</th>
                          <th className="px-3 py-2.5 font-semibold">Creador B</th>
                          <th className="px-3 py-2.5 font-semibold">Agencia</th>
                          <th className="px-3 py-2.5 font-semibold">Potenciadores</th>
                          <th className="px-3 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {grouped.map((g) => (
                          <Fragment key={g.level.id}>
                            <tr>
                              <td
                                colSpan={9}
                                className={cn(
                                  "border-y px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em]",
                                  g.level.bar,
                                  g.level.pill.split(" ").slice(-1)[0]
                                )}
                              >
                                {g.level.label} · {g.rows.length}
                              </td>
                            </tr>
                            {g.rows.map(renderRow)}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Panel>
            <LevelLegend />
          </div>

          <Modal
            open={openAdd}
            onClose={() => setOpenAdd(false)}
            title="Nueva batalla oficial"
            subtitle="Horario Ciudad de México (GMT-6)."
          >
            <form onSubmit={(e) => void submitAdd(e)} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    Nivel
                  </p>
                  <div className="mt-1.5">
                    <PillMenu
                      value={draft.level}
                      options={BATTLE_LEVELS.map((l) => ({
                        id: l.id,
                        label: l.label,
                        className: l.pill,
                      }))}
                      onChange={(id) => setDraft((d) => ({ ...d, level: id }))}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    Potenciadores
                  </p>
                  <div className="mt-1.5">
                    <PillMenu
                      value={draft.boosters}
                      options={BOOSTER_OPTIONS.map((b) => ({
                        id: b.id,
                        label: b.label,
                        className: b.className,
                      }))}
                      onChange={(id) => setDraft((d) => ({ ...d, boosters: id }))}
                    />
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    Fecha
                  </span>
                  <input
                    type="date"
                    required
                    className={cn(inputClass, "h-10 py-0")}
                    value={draft.date}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, date: e.target.value }))
                    }
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    Hora
                  </span>
                  <input
                    type="time"
                    className={cn(inputClass, "h-10 py-0")}
                    value={draft.time}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, time: e.target.value }))
                    }
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    Creador A
                  </span>
                  <input
                    required
                    className={cn(inputClass, "h-10 py-0")}
                    placeholder="@creador"
                    value={draft.creatorA}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, creatorA: e.target.value }))
                    }
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    Agencia A
                  </span>
                  <input
                    className={cn(inputClass, "h-10 py-0")}
                    placeholder="Agencia"
                    value={draft.agencyA}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, agencyA: e.target.value }))
                    }
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    Creador B
                  </span>
                  <input
                    className={cn(inputClass, "h-10 py-0")}
                    placeholder="@rival"
                    value={draft.creatorB}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, creatorB: e.target.value }))
                    }
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    Agencia B
                  </span>
                  <input
                    className={cn(inputClass, "h-10 py-0")}
                    placeholder="Agencia"
                    value={draft.agencyB}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, agencyB: e.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpenAdd(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={adding}>
                  {adding ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </form>
          </Modal>
        </>
      )}
    </div>
  );
}

function LevelLegend() {
  return (
    <aside className="h-fit overflow-hidden rounded-xl border border-border-soft bg-bg-panel xl:sticky xl:top-6">
      <div className="border-b border-border-soft bg-bg-hover/50 px-4 py-3">
        <p className="text-[10px] font-bold uppercase leading-snug tracking-[0.12em] text-text-muted">
          Nivel de creador
        </p>
        <p className="mt-1 text-[11px] text-text-muted">
          Diamantes obtenidos último mes
        </p>
      </div>
      <ul className="divide-y divide-border-soft/70">
        {LEVEL_LEGEND.map((item) => {
          const tone =
            BATTLE_LEVELS.find(
              (l) => l.label.toLowerCase() === item.label.toLowerCase()
            ) ??
            (item.label === "MEDIUM"
              ? BATTLE_LEVELS.find((l) => l.id === "Medio")
              : undefined);
          return (
            <li
              key={item.label}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase",
                  tone?.pill ?? "bg-bg-hover text-text-muted"
                )}
              >
                {item.label}
              </span>
              <span className="text-xs tabular-nums text-text-muted">
                {item.range}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-border-soft px-4 py-3 text-[11px] leading-relaxed text-text-muted">
        Creadores que no hayan llegado al nivel inicial serán evaluados durante
        el mismo mes.
      </p>
    </aside>
  );
}
