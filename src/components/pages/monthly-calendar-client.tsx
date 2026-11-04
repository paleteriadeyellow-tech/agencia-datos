"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X, Flag } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, Field, Panel, inputClass } from "@/components/ui";
import { MESES_NOMBRE } from "@/lib/bonos";
import { cn } from "@/lib/utils";

const API = "/api/panel/monthly-calendar";
const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

type Ev = { id: string; date: string; time: string | null; title: string; notes: string | null; color: string };
type Payload = { month: string; canEdit: boolean; note: string; events: Ev[] };

const COLORS: Record<string, { label: string; chip: string; dot: string }> = {
  azul: { label: "Azul", chip: "border-sky-400/40 bg-sky-500/20 text-sky-100", dot: "bg-sky-400" },
  verde: { label: "Verde", chip: "border-emerald-400/40 bg-emerald-500/20 text-emerald-100", dot: "bg-emerald-400" },
  rojo: { label: "Rojo", chip: "border-rose-400/40 bg-rose-500/20 text-rose-100", dot: "bg-rose-400" },
  amarillo: { label: "Amarillo", chip: "border-amber-400/40 bg-amber-500/20 text-amber-100", dot: "bg-amber-400" },
  morado: { label: "Morado", chip: "border-violet-400/40 bg-violet-500/20 text-violet-100", dot: "bg-violet-400" },
};

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
}

export default function MonthlyCalendarClient() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const monthKey = `${year}-${pad(month)}`;
  const thisYear = now.getFullYear();
  const years = useMemo(() => Array.from({ length: 9 }, (_, i) => thisYear - 3 + i), [thisYear]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}?month=${monthKey}`, { cache: "no-store", headers: { "x-skip-view-as": "1" } });
      if (!res.ok) throw new Error();
      setData((await res.json()) as Payload);
      setError(false);
    } catch {
      setError(true);
    }
  }, [monthKey]);

  useEffect(() => {
    setData(null);
    setDay(null);
    void load();
  }, [load]);

  function shift(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  async function call(method: string, body?: unknown, query = "") {
    setMsg("");
    const res = await fetch(`${API}${query}`, {
      method,
      headers: { "Content-Type": "application/json", "x-skip-view-as": "1" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(json.error ?? "No se pudo guardar.");
      return false;
    }
    await load();
    return true;
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0 = domingo
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const todayKey = keyOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const deadlineDay = daysInMonth - 4; // "4 días antes de que acabe el mes se debe tener listo"
  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of data?.events ?? []) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [data]);

  if (error) {
    return (
      <div>
        <TopBar title="Calendario mensual" subtitle="El plan del mes del equipo" />
        <PanelLoadError onRetry={() => void load()} />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Calendario mensual" subtitle="El plan del mes del equipo: entregas, subastas, juntas…" />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="rounded-lg border border-border p-2.5 text-text-muted transition hover:border-white/25 hover:text-text"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
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
        <button
          type="button"
          onClick={() => shift(1)}
          className="rounded-lg border border-border p-2.5 text-text-muted transition hover:border-white/25 hover:text-text"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setYear(now.getFullYear());
            setMonth(now.getMonth() + 1);
          }}
          className="rounded-lg border border-border px-3 py-2.5 text-sm text-text-muted transition hover:border-white/25 hover:text-text"
        >
          Hoy
        </button>
      </div>

      <MonthNote
        key={monthKey}
        note={data?.note ?? ""}
        canEdit={!!data?.canEdit}
        onSave={(note) => call("PUT", { month: monthKey, note })}
        monthLabel={`${MESES_NOMBRE[month]} ${year}`}
        deadlineDay={deadlineDay}
      />

      {msg && <p className="mb-3 text-sm text-danger">{msg}</p>}

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-7 gap-1.5">
            {DAYS.map((d) => (
              <div key={d} className="rounded-lg bg-emerald-700/40 py-2 text-center text-xs font-semibold uppercase tracking-wide text-emerald-100">
                {d}
              </div>
            ))}
          </div>

          <div className="mt-1.5 space-y-1.5">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1.5">
                {week.map((d, ci) => {
                  if (d === null) return <div key={ci} className="min-h-[7.5rem] rounded-lg bg-white/[0.02]" />;
                  const k = keyOf(year, month, d);
                  const evs = byDay.get(k) ?? [];
                  const isToday = k === todayKey;
                  return (
                    <button
                      key={ci}
                      type="button"
                      onClick={() => setDay(k)}
                      className={cn(
                        "flex min-h-[7.5rem] flex-col rounded-lg border p-1.5 text-left transition",
                        isToday ? "border-accent bg-accent/10" : "border-white/10 bg-bg-elevated/60 hover:border-white/25",
                        day === k && "ring-2 ring-cyan/60"
                      )}
                    >
                      <span className="flex items-center justify-between">
                        <span className={cn("text-sm font-bold", isToday ? "text-accent" : "text-text")}>{d}</span>
                        {d === deadlineDay && (
                          <span title="4 días antes de que acabe el mes se debe tener todo listo" className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-200">
                            <Flag className="h-2.5 w-2.5" /> Listo
                          </span>
                        )}
                      </span>
                      <span className="mt-1 flex flex-1 flex-col gap-1">
                        {evs.slice(0, 3).map((e) => (
                          <span key={e.id} className={cn("rounded border px-1 py-0.5 text-[10px] leading-tight", (COLORS[e.color] ?? COLORS.azul).chip)}>
                            {e.time && <b className="mr-1">{fmtTime(e.time)}</b>}
                            {e.title}
                          </span>
                        ))}
                        {evs.length > 3 && <span className="text-[10px] text-text-muted">+{evs.length - 3} más</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {!data && <div className="glass-panel mt-3 h-10 animate-pulse rounded-xl" />}

      {day && data && (
        <DayEditor
          key={day}
          day={day}
          events={byDay.get(day) ?? []}
          canEdit={data.canEdit}
          onClose={() => setDay(null)}
          onCreate={(ev) => call("POST", { date: day, ...ev })}
          onUpdate={(id, ev) => call("PATCH", { id, ...ev })}
          onDelete={(id) => call("DELETE", undefined, `?id=${id}`)}
        />
      )}
    </div>
  );
}

function MonthNote({
  note,
  canEdit,
  onSave,
  monthLabel,
  deadlineDay,
}: {
  note: string;
  canEdit: boolean;
  onSave: (note: string) => Promise<boolean>;
  monthLabel: string;
  deadlineDay: number;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note);
  const [saving, setSaving] = useState(false);

  useEffect(() => setText(note), [note]);

  return (
    <Panel className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Tarea mensual · {monthLabel}</p>
        {canEdit && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text">
            <Pencil className="h-3 w-3" /> {note ? "Editar" : "Agregar"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            className={inputClass}
            placeholder="Ej. Programar las publicaciones del mes"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                const ok = await onSave(text);
                setSaving(false);
                if (ok) setEditing(false);
              }}
            >
              {saving ? "Guardando…" : "Guardar"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setText(note);
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <p className={cn("text-sm", note ? "text-text" : "text-text-muted")}>{note || "Sin tarea mensual definida."}</p>
      )}
      <p className="text-xs text-text-muted">
        <Flag className="mr-1 inline h-3 w-3 text-amber-300" />
        Debe estar todo listo el día {deadlineDay}: 4 días antes de que acabe el mes.
      </p>
    </Panel>
  );
}

function DayEditor({
  day,
  events,
  canEdit,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  day: string;
  events: Ev[];
  canEdit: boolean;
  onClose: () => void;
  onCreate: (ev: { title: string; time: string | null; notes: string | null; color: string }) => Promise<boolean>;
  onUpdate: (id: string, ev: { title: string; time: string | null; notes: string | null; color: string }) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [color, setColor] = useState("azul");
  const [saving, setSaving] = useState(false);

  const [y, m, d] = day.split("-").map(Number);
  const label = `${DAYS[new Date(y, m - 1, d).getDay()]} ${d} de ${MESES_NOMBRE[m]} de ${y}`;

  function reset() {
    setEditId(null);
    setTitle("");
    setTime("");
    setNotes("");
    setColor("azul");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = { title, time: time || null, notes: notes || null, color };
    const ok = editId ? await onUpdate(editId, body) : await onCreate(body);
    setSaving(false);
    if (ok) reset();
  }

  return (
    <Panel className="mt-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold capitalize">{label}</h2>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg border border-border p-1.5 text-text-muted hover:text-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {events.length === 0 && <p className="text-sm text-text-muted">No hay nada programado este día.</p>}
      <ul className="space-y-2">
        {events.map((e) => (
          <li key={e.id} className={cn("flex items-start justify-between gap-3 rounded-lg border px-3 py-2", (COLORS[e.color] ?? COLORS.azul).chip)}>
            <div className="min-w-0 text-sm">
              <p className="font-semibold">
                {e.time && <span className="mr-2">{fmtTime(e.time)}</span>}
                {e.title}
              </p>
              {e.notes && <p className="mt-0.5 text-xs opacity-80">{e.notes}</p>}
            </div>
            {canEdit && (
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  title="Editar"
                  onClick={() => {
                    setEditId(e.id);
                    setTitle(e.title);
                    setTime(e.time ?? "");
                    setNotes(e.notes ?? "");
                    setColor(e.color);
                  }}
                  className="rounded-md border border-white/20 p-1.5 hover:bg-white/10"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Eliminar"
                  onClick={() => {
                    if (confirm(`¿Eliminar “${e.title}”?`)) void onDelete(e.id);
                  }}
                  className="rounded-md border border-white/20 p-1.5 hover:bg-white/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <form onSubmit={submit} className="grid gap-3 border-t border-border-soft pt-3 md:grid-cols-2">
          <p className="text-sm font-semibold md:col-span-2">{editId ? "Editar evento" : "Agregar al día"}</p>
          <Field label="Qué">
            <input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className={inputClass} placeholder="Subasta, entrega de videos, junta…" />
          </Field>
          <Field label="Hora (opcional)">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Nota (opcional)">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} className={inputClass} />
          </Field>
          <div>
            <p className="mb-1.5 text-xs text-text-muted">Color</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(COLORS).map(([k, c]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setColor(k)}
                  className={cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition", color === k ? "border-white/60 text-text" : "border-border text-text-muted")}
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full", c.dot)} /> {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" disabled={saving}>
              <Plus className="h-4 w-4" /> {saving ? "Guardando…" : editId ? "Guardar cambios" : "Agregar"}
            </Button>
            {editId && (
              <Button type="button" variant="ghost" onClick={reset}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
      )}
    </Panel>
  );
}
