"use client";

import { useState } from "react";
import {
  Plus,
  Calendar,
  User,
  CircleDot,
  ArrowRight,
  CheckCircle2,
  ListTodo,
} from "lucide-react";
import { createTask } from "@/lib/actions";
import { Button, Field, inputClass, Panel } from "@/components/ui";
import { TASK_PRIORITIES, TASK_STATUSES, formatDate, cn } from "@/lib/utils";

const COLUMN_META: Record<
  string,
  { label: string; accent: string; icon: typeof ListTodo }
> = {
  pendiente: {
    label: "Pendiente",
    accent: "bg-warning",
    icon: ListTodo,
  },
  en_progreso: {
    label: "En progreso",
    accent: "bg-cyan",
    icon: CircleDot,
  },
  hecha: {
    label: "Hecha",
    accent: "bg-success",
    icon: CheckCircle2,
  },
};

const PRIORITY_STYLE: Record<string, string> = {
  alta: "border-danger/35 bg-danger/10 text-danger",
  media: "border-warning/35 bg-warning/10 text-warning",
  baja: "border-white/10 bg-white/5 text-text-muted",
};

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.media
      )}
    >
      {priority}
    </span>
  );
}

export function TaskForm({
  creators,
  period,
  onSaved,
}: {
  creators: { id: string; name: string }[];
  period: string;
  onSaved?: () => void;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("period", period);
    const res = await createTask(fd);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    form.reset();
    setOpen(false);
    onSaved?.();
  }

  return (
    <Panel className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
            <Plus className="h-4 w-4" />
          </span>
          <div>
            <p className="font-[family-name:var(--font-syne)] text-base font-semibold">
              Nueva tarea
            </p>
            <p className="text-xs text-text-muted">
              Asigna follow-ups, onboarding o revisiones
            </p>
          </div>
        </div>
        <span className="text-xs text-text-muted">
          {open ? "Cerrar" : "Abrir"}
        </span>
      </button>

      {open && (
        <form
          onSubmit={onSubmit}
          className="grid gap-3 border-t border-border-soft px-5 py-4 md:grid-cols-2"
        >
          <input type="hidden" name="period" value={period} />
          <Field label="Título">
            <input
              name="title"
              required
              className={inputClass}
              placeholder="Follow-up con creador"
              autoFocus
            />
          </Field>
          <Field label="Creador (opcional)">
            <select name="creatorId" defaultValue="" className={inputClass}>
              <option value="">General / agencia</option>
              {creators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prioridad">
            <select name="priority" defaultValue="media" className={inputClass}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vence">
            <input name="dueDate" type="date" className={inputClass} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Descripción">
              <textarea
                name="description"
                rows={2}
                className={inputClass}
                placeholder="Detalle opcional…"
              />
            </Field>
          </div>
          {error && (
            <p className="text-sm text-danger md:col-span-2">{error}</p>
          )}
          <div className="md:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando…" : "Crear tarea"}
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}

export function TaskBoard({
  tasks,
  onMove,
}: {
  tasks: {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    dueDate: string | null;
    creator: { name: string } | null;
  }[];
  onMove: (id: string, status: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {TASK_STATUSES.map((status) => {
        const meta = COLUMN_META[status] ?? COLUMN_META.pendiente;
        const Icon = meta.icon;
        const columnTasks = tasks.filter((t) => t.status === status);

        return (
          <section
            key={status}
            className="flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]"
          >
            <header className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn("h-8 w-1 rounded-full", meta.accent)}
                  aria-hidden
                />
                <Icon className="h-4 w-4 text-text-muted" />
                <h3 className="text-sm font-semibold tracking-wide">
                  {meta.label}
                </h3>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-text-muted">
                {columnTasks.length}
              </span>
            </header>

            <ul className="flex flex-1 flex-col gap-2.5 p-3">
              {columnTasks.length === 0 && (
                <li className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-xs text-text-muted">
                  Sin tareas aquí
                </li>
              )}

              {columnTasks.map((t) => {
                const overdue =
                  !!t.dueDate &&
                  status !== "hecha" &&
                  new Date(t.dueDate) < new Date(new Date().toDateString());

                return (
                  <li
                    key={t.id}
                    className={cn(
                      "group rounded-xl border border-white/10 bg-bg-elevated/80 p-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition",
                      "hover:border-white/20 hover:bg-bg-elevated"
                    )}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-snug text-text">
                        {t.title}
                      </p>
                      <PriorityBadge priority={t.priority} />
                    </div>

                    {t.description && (
                      <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-text-muted">
                        {t.description}
                      </p>
                    )}

                    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3 opacity-70" />
                        {t.creator?.name ?? "General"}
                      </span>
                      {t.dueDate && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            overdue && "font-medium text-danger"
                          )}
                        >
                          <Calendar className="h-3 w-3 opacity-70" />
                          {formatDate(t.dueDate)}
                          {overdue ? " · vencida" : ""}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {TASK_STATUSES.filter((s) => s !== status).map((s) => {
                        const target = COLUMN_META[s];
                        return (
                          <button
                            key={s}
                            type="button"
                            title={`Mover a ${target?.label ?? s}`}
                            onClick={() => onMove(t.id, s)}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] font-medium text-text-muted transition hover:border-white/20 hover:bg-white/10 hover:text-text"
                          >
                            <ArrowRight className="h-3 w-3" />
                            {target?.label ?? s.replace("_", " ")}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
