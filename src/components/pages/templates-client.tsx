"use client";

import { useState } from "react";
import { Plus, Trash2, Download, Repeat } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, Field, Panel, inputClass } from "@/components/ui";
import { usePanelData, invalidatePanel } from "@/lib/swr";
import { POSITIONS, POSITION_LABEL, RECURRENCES, WEEKDAY_LABEL, type Position } from "@/lib/positions";
import { cn } from "@/lib/utils";

const API = "/api/panel/task-templates";

type Template = {
  id: string;
  position: string;
  title: string;
  description: string | null;
  priority: string;
  recurrence: string;
  weekdays: string;
  dayOfMonth: number | null;
  dueTime: string | null;
  evidenceHint: string | null;
  active: boolean;
};

type Payload = { templates: Template[]; peopleByPosition: Record<string, number> };

function when(t: Template) {
  if (t.recurrence === "mensual") return `Cada mes, el día ${t.dayOfMonth}`;
  const days = t.weekdays.split(",").map(Number);
  const label = days.length === 7 ? "Todos los días" : days.length === 5 && days.join("") === "12345" ? "Lunes a viernes" : days.map((d) => WEEKDAY_LABEL[d]).join(", ");
  return `${t.recurrence === "semanal" ? "Cada semana" : "Diaria"} · ${label}`;
}

export default function TemplatesClient() {
  const { data, error, mutate } = usePanelData(API) as {
    data?: Payload;
    error?: Error;
    mutate: () => Promise<unknown>;
  };
  const [position, setPosition] = useState<Position>("administracion");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("media");
  const [recurrence, setRecurrence] = useState("diaria");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [dueTime, setDueTime] = useState("");
  const [evidenceHint, setEvidenceHint] = useState("");

  async function call(method: string, body?: unknown, query = "") {
    setErr("");
    setMsg("");
    const res = await fetch(`${API}${query}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json.error ?? "No se pudo guardar.");
      return null;
    }
    await mutate();
    invalidatePanel("/api/panel/mi-dia", "/api/panel/tasks");
    return json;
  }

  async function seed() {
    setBusy(true);
    const r = await call("POST", { action: "seed" });
    setBusy(false);
    if (r) setMsg(r.created ? `Se cargaron ${r.created} tareas de Administración.` : "Las tareas iniciales ya estaban cargadas.");
  }

  /** Pausar o activar todas las tareas de este puesto de una vez. */
  async function setAll(activate: boolean) {
    const name = POSITION_LABEL[position];
    const msg = activate
      ? `¿Activar todas las tareas fijas de ${name}? Volverán a llegar a Tareas diarias.`
      : `¿Pausar todas las tareas fijas de ${name}?

También se quitarán de Tareas diarias las que ya se generaron y siguen sin hacerse (las hechas se conservan). Podrás activarlas otra vez.`;
    if (!confirm(msg)) return;
    setBusy(true);
    const r = await call("POST", { action: activate ? "activate_all" : "pause_all", position, clean: !activate });
    setBusy(false);
    if (r) setMsg(activate ? `Se activaron ${r.changed} tareas de ${name}.` : `Se pausaron ${r.changed} tareas de ${name}${r.removed ? ` y se quitaron ${r.removed} pendientes de Tareas diarias` : ""}.`);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await call("POST", {
      position,
      title,
      description: description || null,
      priority,
      recurrence,
      weekdays: recurrence === "mensual" ? [1] : weekdays.length ? weekdays : [1],
      dayOfMonth: recurrence === "mensual" ? dayOfMonth : null,
      dueTime: dueTime || null,
      evidenceHint: evidenceHint || null,
    });
    setBusy(false);
    if (r) {
      setTitle("");
      setDescription("");
      setDueTime("");
      setEvidenceHint("");
      setOpen(false);
      setMsg("Tarea creada. Ya le llega a las personas con ese puesto.");
    }
  }

  if (error) {
    return (
      <div>
        <TopBar title="Tareas fijas" subtitle="Lo que se repite solo según el puesto" />
        <PanelLoadError onRetry={() => void mutate()} />
      </div>
    );
  }

  const templates = (data?.templates ?? []).filter((t) => t.position === position);
  const people = data?.peopleByPosition[position] ?? 0;
  const activeCount = templates.filter((t) => t.active).length;

  return (
    <div>
      <TopBar title="Tareas fijas" subtitle="Lo que se repite solo y llega a “Tareas diarias” según el puesto" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {POSITIONS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPosition(p)}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm transition",
              position === p ? "border-accent bg-accent-soft text-white" : "border-border text-text-muted hover:border-white/25 hover:text-text"
            )}
          >
            {POSITION_LABEL[p]}
            <span className="ml-2 text-xs opacity-70">{data?.peopleByPosition[p] ?? 0} 👤</span>
          </button>
        ))}
      </div>

      {(msg || err) && <p className={cn("mb-3 text-sm", err ? "text-danger" : "text-success")}>{err || msg}</p>}

      <Panel className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-muted">
            {people === 0
              ? `Nadie tiene el puesto ${POSITION_LABEL[position]} todavía: asígnalo en Managers.`
              : `Estas tareas le llegan cada día a ${people} ${people === 1 ? "persona" : "personas"} con el puesto ${POSITION_LABEL[position]}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {position === "administracion" && (
              <Button variant="secondary" disabled={busy} onClick={() => void seed()}>
                <Download className="h-4 w-4" /> Cargar tareas iniciales
              </Button>
            )}
            {templates.length > 0 &&
              (activeCount > 0 ? (
                <Button variant="secondary" disabled={busy} onClick={() => void setAll(false)}>
                  Pausar todas ({activeCount})
                </Button>
              ) : (
                <Button variant="secondary" disabled={busy} onClick={() => void setAll(true)}>
                  Activar todas ({templates.length})
                </Button>
              ))}
            <Button onClick={() => setOpen((v) => !v)}>
              <Plus className="h-4 w-4" /> Nueva tarea fija
            </Button>
          </div>
        </div>

        {open && (
          <form onSubmit={create} className="mt-4 grid gap-3 border-t border-border-soft pt-4 md:grid-cols-2">
            <Field label="Título">
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} autoFocus />
            </Field>
            <Field label="Prioridad">
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass}>
                <option value="baja">baja</option>
                <option value="media">media</option>
                <option value="alta">alta</option>
              </select>
            </Field>
            <Field label="Se repite">
              <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={inputClass}>
                {RECURRENCES.map((r) => (
                  <option key={r} value={r}>
                    {r === "diaria" ? "Diaria (los días que elijas)" : r === "semanal" ? "Semanal" : "Mensual"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Horario sugerido (opcional)">
              <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={inputClass} />
            </Field>
            {recurrence !== "mensual" ? (
              <div className="md:col-span-2">
                <p className="mb-1.5 text-xs text-text-muted">Días</p>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-xs transition",
                        weekdays.includes(d) ? "border-accent bg-accent-soft text-white" : "border-border text-text-muted"
                      )}
                    >
                      {WEEKDAY_LABEL[d]}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <Field label="Día del mes">
                <input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} className={inputClass} />
              </Field>
            )}
            <div className="md:col-span-2">
              <Field label="Descripción (qué debe hacer)">
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Evidencia que debe dejar (opcional)">
                <input value={evidenceHint} onChange={(e) => setEvidenceHint(e.target.value)} className={inputClass} placeholder="Captura, reporte, enlace…" />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Guardando…" : "Crear tarea fija"}
              </Button>
            </div>
          </form>
        )}
      </Panel>

      {!data ? (
        <div className="glass-panel h-48 animate-pulse rounded-2xl" />
      ) : templates.length === 0 ? (
        <Panel className="py-10 text-center text-sm text-text-muted">
          Aún no hay tareas fijas para {POSITION_LABEL[position]}.
          {position === "administracion" ? " Puedes cargar las del manual real con el botón de arriba." : " Crea la primera con “Nueva tarea fija”."}
        </Panel>
      ) : (
        <ul className="space-y-2.5">
          {templates.map((t) => (
            <li key={t.id} className={cn("rounded-xl border border-white/10 bg-bg-elevated/80 p-3.5", !t.active && "opacity-55")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t.title}</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-cyan">
                    <Repeat className="h-3 w-3" />
                    {when(t)}
                    {t.dueTime ? ` · ${t.dueTime}` : ""}
                  </p>
                  {t.description && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-text-muted">{t.description}</p>}
                  {t.evidenceHint && <p className="mt-1 text-[11px] text-text-muted">Evidencia: {t.evidenceHint}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void call("PATCH", { id: t.id, active: !t.active })}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted transition hover:border-white/25 hover:text-text"
                  >
                    {t.active ? "Pausar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    title="Eliminar"
                    onClick={() => {
                      if (confirm(`¿Eliminar “${t.title}”? Las tareas ya creadas se conservan.`)) void call("DELETE", undefined, `?id=${t.id}`);
                    }}
                    className="rounded-lg border border-border p-2 text-text-muted hover:border-danger hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
