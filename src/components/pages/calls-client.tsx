"use client";

import { useCallback, useMemo, useRef, useState, Fragment } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MESES_NOMBRE } from "@/lib/bonos";
import { PANEL, persistPanelCache, usePanelData } from "@/lib/swr";
import { mutate as cacheMutate } from "swr";
import { useCreatorsRoster } from "@/lib/use-creators-roster";
import {
  CALL_SLOTS,
  callKey,
  daysOfWeek,
  isCallEmpty,
  slotLabel,
} from "@/lib/one-on-one";
import {
  addDays,
  currentWeekStart,
  formatWeekRange,
  parseYmd,
  weeksInMonth,
  ymd,
} from "@/lib/weekly-schedule";

type SlotRow = {
  id?: string;
  date: string;
  slot: string;
  creatorName: string;
  top: string;
  reason: string;
  needF: string;
  needO: string;
  needD: string;
  needA: string;
};

type Payload = {
  year: number;
  month: number;
  slots: SlotRow[];
  years: number[];
};

const emptySlot = (date: string, slot: string): SlotRow => ({
  date,
  slot,
  creatorName: "",
  top: "",
  reason: "",
  needF: "",
  needO: "",
  needD: "",
  needA: "",
});

const cellClass =
  "w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none placeholder:text-text-muted/40 focus:border-accent focus:bg-bg";

const NEED_FIELDS = [
  { key: "needF", tag: "F", title: "Fortalezas" },
  { key: "needO", tag: "O", title: "Oportunidades" },
  { key: "needD", tag: "D", title: "Debilidades" },
  { key: "needA", tag: "A", title: "Amenazas" },
] as const;

function todayYmd() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export default function CallsClient() {
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonthNum = String(now.getMonth() + 1);
  const runningWeek = currentWeekStart();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonthNum);
  const [weekStart, setWeekStart] = useState(runningWeek);
  const [q, setQ] = useState("");
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, number>>({});
  const today = todayYmd();

  const url = `${PANEL.calls}?week=${weekStart}`;
  const { data, error, mutate } = usePanelData(url);
  const payload = data as Payload | undefined;
  const { creators: roster } = useCreatorsRoster();

  const years = useMemo(() => {
    const y0 = Number(currentYear);
    const fromApi = payload?.years ?? [];
    return [...new Set([y0, y0 - 1, y0 + 1, ...fromApi])].sort((a, b) => b - a);
  }, [payload?.years, currentYear]);

  const monthWeeks = useMemo(
    () => weeksInMonth(Number(year), Number(month)),
    [year, month]
  );
  const days = useMemo(() => daysOfWeek(weekStart), [weekStart]);
  const viewingCurrent = weekStart === runningWeek;
  const periodLabel = formatWeekRange(weekStart);

  const map = useMemo(() => {
    const m = new Map<string, SlotRow>();
    for (const s of payload?.slots ?? []) m.set(callKey(s.date, s.slot), s);
    return m;
  }, [payload?.slots]);

  const writeSlots = useCallback(
    (updater: (slots: SlotRow[]) => SlotRow[]) => {
      void cacheMutate(
        url,
        (current: Payload | undefined) => {
          const base: Payload = current ?? {
            year: Number(year),
            month: Number(month),
            slots: [],
            years: payload?.years ?? [],
          };
          const next = { ...base, slots: updater(base.slots) };
          persistPanelCache(url, next);
          return next;
        },
        { revalidate: false }
      );
    },
    [url, year, month, payload?.years]
  );

  const saveSlot = useCallback(
    (next: SlotRow) => {
      const key = callKey(next.date, next.slot);
      writeSlots((list) => {
        const rest = list.filter((s) => callKey(s.date, s.slot) !== key);
        if (isCallEmpty(next)) return rest;
        return [...rest, next];
      });
      if (timers.current[key]) window.clearTimeout(timers.current[key]);
      timers.current[key] = window.setTimeout(() => {
        void fetch(PANEL.calls, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        })
          .then(async (res) => {
            const json = (await res.json()) as { slot?: SlotRow | null };
            if (json.slot) {
              writeSlots((list) =>
                list.map((s) =>
                  callKey(s.date, s.slot) === key ? { ...s, ...json.slot } : s
                )
              );
            }
          })
          .catch(() => {
            void mutate();
          });
      }, 350);
    },
    [writeSlots, mutate]
  );

  function patch(date: string, slot: string, field: keyof SlotRow, value: string) {
    const prev = map.get(callKey(date, slot)) ?? emptySlot(date, slot);
    saveSlot({ ...prev, [field]: value, date, slot });
  }

  function applyPeriod(nextYear: string, nextMonth: string) {
    const weeks = weeksInMonth(Number(nextYear), Number(nextMonth));
    const inCurrent = nextYear === currentYear && nextMonth === currentMonthNum;
    const pick =
      inCurrent && weeks.some((w) => w.weekStart === runningWeek)
        ? runningWeek
        : (weeks[0]?.weekStart ?? runningWeek);
    setYear(nextYear);
    setMonth(nextMonth);
    setWeekStart(pick);
    setOpenDays({});
  }

  function goRunningWeek() {
    setYear(currentYear);
    setMonth(currentMonthNum);
    setWeekStart(runningWeek);
    setOpenDays({});
  }

  function shiftWeek(delta: number) {
    const next = ymd(addDays(parseYmd(weekStart), delta * 7));
    const stays = monthWeeks.some((w) => w.weekStart === next);
    setWeekStart(next);
    setOpenDays({});
    if (stays) return;
    const mid = addDays(parseYmd(next), 3);
    setYear(String(mid.getFullYear()));
    setMonth(String(mid.getMonth() + 1));
  }

  function isDayOpen(date: string) {
    return Boolean(openDays[date]);
  }

  const query = q.trim().toLowerCase();

  return (
    <div>
      <TopBar
        title="Llamadas 1:1"
        subtitle={
          viewingCurrent
            ? `${periodLabel} · semana en curso`
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
                onChange={(e) => applyPeriod(e.target.value, month)}
              >
                <option value={currentYear}>{currentYear} · actual</option>
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
                onChange={(e) => applyPeriod(year, e.target.value)}
              >
                <option value={currentMonthNum}>
                  {MESES_NOMBRE[Number(currentMonthNum)]} · mes actual
                </option>
                {MESES_NOMBRE.slice(1).map((name, i) =>
                  String(i + 1) === currentMonthNum ? null : (
                    <option key={name} value={i + 1}>
                      {name} · archivo
                    </option>
                  )
                )}
              </select>
            </Field>
            <Field label="Semana">
              <select
                className={inputClass}
                value={weekStart}
                onChange={(e) => {
                  setWeekStart(e.target.value);
                  setOpenDays({});
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
                  <option value={weekStart}>{formatWeekRange(weekStart)}</option>
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

          <p className="mb-3 flex flex-wrap items-center gap-3 text-xs text-text-muted">
            <span>Toca un día para ver los horarios (12:00 AM a 11:30 PM).</span>
            <input
              className={cn(inputClass, "h-8 w-44 py-0 text-xs")}
              placeholder="Buscar creador"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {!viewingCurrent && (
              <button
                type="button"
                className="text-cyan hover:underline"
                onClick={goRunningWeek}
              >
                Volver a esta semana
              </button>
            )}
          </p>

          <datalist id="call-creators">
            {roster.map((c) => (
              <option key={c.id} value={c.tiktokUser || c.name} />
            ))}
          </datalist>

          <div className="overflow-x-auto rounded-xl border border-border-soft">
            <table className="w-full min-w-[920px] border-collapse text-left text-xs">
              <thead>
                <tr className="bg-emerald-700/80 text-[10px] font-semibold uppercase tracking-wide text-white">
                  <th className="px-2 py-2">Día</th>
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Horario (MX)</th>
                  <th className="px-2 py-2">Creador</th>
                  <th className="px-2 py-2">Top</th>
                  <th className="px-2 py-2">Motivo de llamada</th>
                  <th className="px-2 py-2">Necesidades (FODA)</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d, di) => {
                  const open = isDayOpen(d.date);
                  const daySlots = CALL_SLOTS.filter((slot) => {
                    if (!query) return true;
                    const row = map.get(callKey(d.date, slot));
                    return (row?.creatorName ?? "").toLowerCase().includes(query);
                  });
                  if (query && daySlots.length === 0) return null;
                  return (
                    <DayBlock
                      key={d.date}
                      weekday={d.weekday}
                      label={d.label}
                      date={d.date}
                      open={open}
                      isToday={d.date === today}
                      isWeek={false}
                      stripe={di % 2 === 0}
                      slots={query ? daySlots : CALL_SLOTS}
                      map={map}
                      onToggle={() =>
                        setOpenDays((s) => ({ ...s, [d.date]: !open }))
                      }
                      onPatch={patch}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function DayBlock({
  weekday,
  label,
  date,
  open,
  isToday,
  isWeek,
  stripe,
  slots,
  map,
  onToggle,
  onPatch,
}: {
  weekday: string;
  label: string;
  date: string;
  open: boolean;
  isToday: boolean;
  isWeek: boolean;
  stripe: boolean;
  slots: readonly string[];
  map: Map<string, SlotRow>;
  onToggle: () => void;
  onPatch: (date: string, slot: string, field: keyof SlotRow, value: string) => void;
}) {
  const booked = CALL_SLOTS.filter((slot) => {
    const row = map.get(callKey(date, slot));
    return row && !isCallEmpty(row);
  }).length;

  const bg = stripe ? "bg-emerald-950/25" : "bg-emerald-900/10";
  const todayBg = isToday ? "bg-cyan/5" : bg;

  return (
    <>
      <tr className={todayBg}>
        <td colSpan={7} className="border-b border-border-soft p-0">
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center gap-3 px-2 py-1.5 text-left hover:bg-bg-hover/40"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-text-muted transition",
                !open && "-rotate-90"
              )}
            />
            <span className="w-[7.5rem] text-[10px] font-bold uppercase tracking-wide text-emerald-300">
              {weekday}
            </span>
            <span className="font-[family-name:var(--font-syne)] text-sm font-bold">
              {label}
            </span>
            {isToday && (
              <span className="rounded bg-cyan/20 px-1.5 py-0.5 text-[10px] font-semibold text-cyan">
                Hoy
              </span>
            )}
            {isWeek && !isToday && (
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                Semana
              </span>
            )}
            <span className="ml-auto text-[10px] text-text-muted">
              {booked}/{CALL_SLOTS.length} agendadas
            </span>
          </button>
        </td>
      </tr>
      {open &&
        slots.map((slot) => {
          const row = map.get(callKey(date, slot)) ?? emptySlot(date, slot);
          const filled = !isCallEmpty(row);
          return (
            <Fragment key={slot}>
              {slot === "00:00" && (
                <tr className={todayBg}>
                  <td
                    colSpan={7}
                    className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
                  >
                    AM
                  </td>
                </tr>
              )}
              {slot === "12:00" && (
                <tr className={todayBg}>
                  <td
                    colSpan={7}
                    className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
                  >
                    PM
                  </td>
                </tr>
              )}
              <tr
                className={cn(
                  "border-b border-border-soft/60",
                  todayBg,
                  filled && "bg-emerald-500/5"
                )}
              >
              <td className="w-[1px] p-0" />
              <td className="w-[1px] p-0" />
              <td className="whitespace-nowrap px-2 py-1 font-semibold text-text-muted">
                {slotLabel(slot)}
              </td>
              <td className="px-1 py-0.5">
                <input
                  className={cellClass}
                  list="call-creators"
                  placeholder="Creador"
                  value={row.creatorName}
                  onChange={(e) => onPatch(date, slot, "creatorName", e.target.value)}
                />
              </td>
              <td className="w-[7rem] px-1 py-0.5">
                <input
                  className={cellClass}
                  placeholder="Top #—"
                  value={row.top}
                  onChange={(e) => onPatch(date, slot, "top", e.target.value)}
                />
              </td>
              <td className="px-1 py-0.5">
                <input
                  className={cellClass}
                  placeholder="Motivo"
                  value={row.reason}
                  onChange={(e) => onPatch(date, slot, "reason", e.target.value)}
                />
              </td>
              <td className="px-1 py-0.5">
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                  {NEED_FIELDS.map((f) => (
                    <label
                      key={f.key}
                      title={f.title}
                      className="flex items-center gap-1 rounded-md border border-border-soft/60 px-1"
                    >
                      <span className="text-[10px] font-bold text-emerald-300">
                        {f.tag}:
                      </span>
                      <input
                        className="min-w-0 flex-1 bg-transparent py-0.5 text-[11px] outline-none"
                        value={row[f.key]}
                        onChange={(e) => onPatch(date, slot, f.key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </td>
            </tr>
            </Fragment>
          );
        })}
    </>
  );
}
