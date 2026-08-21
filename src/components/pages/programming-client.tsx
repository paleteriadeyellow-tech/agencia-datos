"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Eraser } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, Field, Panel, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MESES_NOMBRE } from "@/lib/bonos";
import { PANEL, persistPanelCache, usePanelData } from "@/lib/swr";
import {
  SHIFT_HOURS,
  SHIFT_LABELS,
  WEEK_DAYS,
  addDays,
  currentWeekStart,
  formatWeekRange,
  hourLabel,
  managerColor,
  parseYmd,
  slotKey,
  weeksInMonth,
  ymd,
} from "@/lib/weekly-schedule";

type Manager = { id: string; name: string; role: string };
type Slot = {
  id: string;
  day: number;
  hour: number;
  managerId: string | null;
  managerName: string;
  label: string;
};
type Payload = {
  weekStart: string;
  managers: Manager[];
  slots: Slot[];
};

type Brush =
  | { kind: "manager"; id: string; name: string }
  | { kind: "free" }
  | { kind: "erase" }
  | null;

function shortName(name: string) {
  const t = name.trim();
  if (!t) return "";
  if (t.toUpperCase() === "FREE") return "FREE";
  const first = t.split(/\s+/)[0] ?? t;
  return first.length <= 10 ? first.toUpperCase() : first.slice(0, 8).toUpperCase();
}

function nowParts() {
  const n = new Date();
  return { year: n.getFullYear(), month: n.getMonth() + 1 };
}

export default function ProgrammingClient() {
  const initial = nowParts();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [weekStart, setWeekStart] = useState(() => currentWeekStart());
  const [brush, setBrush] = useState<Brush>(null);
  const [label, setLabel] = useState("");
  const [hint, setHint] = useState("");

  const years = useMemo(() => {
    const y0 = nowParts().year;
    return [y0 - 1, y0, y0 + 1];
  }, []);

  const monthWeeks = useMemo(() => weeksInMonth(year, month), [year, month]);
  const runningWeek = currentWeekStart();
  const current = nowParts();
  const viewingCurrentMonth = year === current.year && month === current.month;

  const url = `${PANEL.programming}?week=${weekStart}`;
  const { data, error, mutate } = usePanelData(url, {
    refreshInterval: 8_000,
    revalidateIfStale: true,
    dedupingInterval: 4_000,
    revalidateOnFocus: true,
  });
  const payload = data as Payload | undefined;
  const managers = payload?.managers ?? [];
  const slots = payload?.slots ?? [];

  const map = useMemo(() => {
    const m = new Map<string, Slot>();
    for (const s of slots) m.set(slotKey(s.day, s.hour), s);
    return m;
  }, [slots]);

  const write = useCallback(
    (updater: (slots: Slot[]) => Slot[]) => {
      void mutate(
        (current: Payload | undefined) => {
          const base: Payload = current ?? {
            weekStart,
            managers,
            slots: [],
          };
          const next = { ...base, weekStart, slots: updater(base.slots) };
          persistPanelCache(url, next);
          return next;
        },
        { revalidate: false }
      );
    },
    [mutate, weekStart, managers, url]
  );

  const saveCell = useCallback(
    async (day: number, hour: number, next: Omit<Slot, "id"> | null) => {
      write((list) => {
        const rest = list.filter((s) => !(s.day === day && s.hour === hour));
        if (!next) return rest;
        return [
          ...rest,
          {
            id: `tmp-${day}-${hour}`,
            ...next,
          },
        ];
      });
      try {
        const res = await fetch(PANEL.programming, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            next
              ? {
                  weekStart,
                  day,
                  hour,
                  managerId: next.managerId,
                  managerName: next.managerName,
                  label: next.label,
                }
              : { weekStart, day, hour, clear: true }
          ),
        });
        const json = (await res.json()) as { slot?: Slot | null };
        if (json.slot) {
          write((list) =>
            list.map((s) =>
              s.day === day && s.hour === hour ? { ...s, ...json.slot } : s
            )
          );
        }
      } catch {
        setHint("No se pudo guardar. Reintenta.");
        void mutate();
      }
    },
    [weekStart, write, mutate]
  );

  function paint(day: number, hour: number) {
    const current = map.get(slotKey(day, hour));
    if (!brush) return;
    if (brush.kind === "erase") {
      if (current) void saveCell(day, hour, null);
      return;
    }
    if (brush.kind === "free") {
      void saveCell(day, hour, {
        day,
        hour,
        managerId: null,
        managerName: "FREE",
        label: "FREE",
      });
      return;
    }
    const same =
      current &&
      current.managerId === brush.id &&
      (current.label || "") === label;
    if (same) {
      void saveCell(day, hour, null);
      return;
    }
    void saveCell(day, hour, {
      day,
      hour,
      managerId: brush.id,
      managerName: brush.name,
      label,
    });
  }

  async function copyPrev() {
    setHint("Copiando semana anterior…");
    try {
      const res = await fetch(PANEL.programming, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "copyPrev", weekStart }),
      });
      const json = (await res.json()) as {
        slots?: Slot[];
        emptySource?: boolean;
      };
      if (json.emptySource) {
        setHint("La semana anterior está vacía.");
        return;
      }
      write(() => json.slots ?? []);
      setHint("Semana copiada.");
    } catch {
      setHint("No se pudo copiar.");
      void mutate();
    }
  }

  async function fillSunday() {
    write((list) => {
      const rest = list.filter((s) => s.day !== 6);
      return [
        ...rest,
        ...SHIFT_HOURS.map((hour) => ({
          id: `tmp-sun-${hour}`,
          day: 6,
          hour,
          managerId: null,
          managerName: "FREE",
          label: "FREE",
        })),
      ];
    });
    try {
      const res = await fetch(PANEL.programming, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fillSunday", weekStart }),
      });
      const json = (await res.json()) as { slots?: Slot[] };
      if (json.slots) write(() => json.slots ?? []);
    } catch {
      void mutate();
    }
  }

  function applyPeriod(nextYear: number, nextMonth: number) {
    const weeks = weeksInMonth(nextYear, nextMonth);
    const now = nowParts();
    const running = currentWeekStart();
    const inCurrent = nextYear === now.year && nextMonth === now.month;
    const pick =
      inCurrent && weeks.some((w) => w.weekStart === running)
        ? running
        : (weeks[0]?.weekStart ?? running);
    setYear(nextYear);
    setMonth(nextMonth);
    setWeekStart(pick);
    setHint("");
  }

  function goRunningWeek() {
    const now = nowParts();
    setYear(now.year);
    setMonth(now.month);
    setWeekStart(currentWeekStart());
    setHint("");
  }

  function shiftWeek(delta: number) {
    const next = ymd(addDays(parseYmd(weekStart), delta * 7));
    const stays = weeksInMonth(year, month).some((w) => w.weekStart === next);
    if (stays) {
      setWeekStart(next);
      setHint("");
      return;
    }
    const mid = addDays(parseYmd(next), 3);
    setYear(mid.getFullYear());
    setMonth(mid.getMonth() + 1);
    setWeekStart(next);
    setHint("");
  }

  const today = ymd(new Date());
  const weekDates = useMemo(() => {
    const start = parseYmd(weekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [weekStart]);

  return (
    <div>
      <TopBar
        title="Programación semanal"
        subtitle={`${MESES_NOMBRE[month]} ${year} · ${
          viewingCurrentMonth && weekStart === runningWeek
            ? "semana en curso"
            : formatWeekRange(weekStart)
        }`}
      />

      {error ? (
        <PanelLoadError onRetry={() => void mutate()} />
      ) : (
        <>
          <Panel className="mb-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Año">
                <select
                  className={inputClass}
                  value={year}
                  onChange={(e) => applyPeriod(Number(e.target.value), month)}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y === current.year ? `${y} · actual` : y}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Mes">
                <select
                  className={inputClass}
                  value={month}
                  onChange={(e) => applyPeriod(year, Number(e.target.value))}
                >
                  {MESES_NOMBRE.slice(1).map((name, i) => (
                    <option key={name} value={i + 1}>
                      {i + 1 === current.month && year === current.year
                        ? `${name} · mes actual`
                        : name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Semana">
                <select
                  className={inputClass}
                  value={weekStart}
                  onChange={(e) => {
                    setWeekStart(e.target.value);
                    setHint("");
                  }}
                >
                  {monthWeeks.map((w) => (
                    <option key={w.weekStart} value={w.weekStart}>
                      {w.weekStart === runningWeek
                        ? `${w.label} · en curso`
                        : w.label}
                    </option>
                  ))}
                  {!monthWeeks.some((w) => w.weekStart === weekStart) && (
                    <option value={weekStart}>
                      {formatWeekRange(weekStart)}
                    </option>
                  )}
                </select>
              </Field>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2 py-2.5"
                  onClick={() => shiftWeek(-1)}
                  aria-label="Semana anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={goRunningWeek}
                >
                  Semana en curso
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2 py-2.5"
                  onClick={() => shiftWeek(1)}
                  aria-label="Semana siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void copyPrev()}>
                Copiar semana anterior
              </Button>
              <Button type="button" variant="secondary" onClick={() => void fillSunday()}>
                Domingo FREE
              </Button>
            </div>

            <p className="mt-4 text-xs text-text-muted">
              Elige un manager y toca las celdas. Tocar de nuevo la misma persona la quita.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {managers.map((m) => {
                const active = brush?.kind === "manager" && brush.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setBrush(active ? null : { kind: "manager", id: m.id, name: m.name })
                    }
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
                      managerColor(m.name),
                      active && "ring-2 ring-white/70"
                    )}
                  >
                    {shortName(m.name)}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  setBrush(brush?.kind === "free" ? null : { kind: "free" })
                }
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
                  managerColor("FREE"),
                  brush?.kind === "free" && "ring-2 ring-white/70"
                )}
              >
                FREE
              </button>
              <button
                type="button"
                onClick={() =>
                  setBrush(brush?.kind === "erase" ? null : { kind: "erase" })
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted hover:bg-bg-hover",
                  brush?.kind === "erase" && "ring-2 ring-white/70 bg-bg-hover text-text"
                )}
              >
                <Eraser className="h-3.5 w-3.5" />
                Borrar
              </button>
              <select
                className="ml-auto rounded-lg border border-border bg-bg px-3 py-1.5 text-xs outline-none focus:border-accent"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              >
                <option value="">Sin evento</option>
                {SHIFT_LABELS.filter((l) => l !== "FREE").map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {hint && <p className="mt-2 text-xs text-cyan">{hint}</p>}
          </Panel>

          <div className="overflow-x-auto rounded-xl border border-border-soft">
            <table className="w-full min-w-[860px] border-collapse text-center text-xs">
              <thead>
                <tr className="bg-bg-elevated">
                  <th className="sticky left-0 z-10 border-b border-r border-border-soft bg-bg-elevated px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    Horas
                  </th>
                  {WEEK_DAYS.map((day, i) => {
                    const dt = weekDates[i]!;
                    const key = ymd(dt);
                    return (
                      <th
                        key={day}
                        className={cn(
                          "border-b border-border-soft px-1 py-2",
                          key === today && "bg-cyan/10"
                        )}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                          {day}
                        </p>
                        <p className="font-[family-name:var(--font-syne)] text-sm font-bold">
                          {dt.getDate()}
                        </p>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {SHIFT_HOURS.map((hour) => (
                  <tr key={hour}>
                    <th className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-border-soft bg-bg-panel px-2 py-1.5 text-[11px] font-medium text-text-muted">
                      {hourLabel(hour)}
                    </th>
                    {WEEK_DAYS.map((_, day) => {
                      const slot = map.get(slotKey(day, hour));
                      const name = slot?.managerName ?? "";
                      const isSunday = day === 6;
                      return (
                        <td
                          key={`${day}-${hour}`}
                          className="border-b border-l border-border-soft p-0.5"
                        >
                          <button
                            type="button"
                            onClick={() => paint(day, hour)}
                            className={cn(
                              "flex h-[46px] w-full flex-col items-center justify-center rounded-md border px-1 transition",
                              slot
                                ? managerColor(name)
                                : isSunday
                                  ? "border-transparent bg-amber-300/5 text-text-muted hover:bg-amber-300/15"
                                  : "border-transparent bg-transparent text-text-muted hover:bg-bg-hover"
                            )}
                          >
                            {slot ? (
                              <>
                                <span className="leading-tight font-bold tracking-wide">
                                  {shortName(name)}
                                </span>
                                {slot.label && slot.label !== "FREE" && (
                                  <span className="mt-0.5 max-w-full truncate text-[9px] uppercase opacity-80">
                                    ({slot.label})
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] opacity-30">+</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
