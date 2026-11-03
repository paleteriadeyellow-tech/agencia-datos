"use client";

import { useState } from "react";
import { CheckCircle2, CircleDot, Calendar, User, Undo2, Sparkles } from "lucide-react";
import { useSession } from "next-auth/react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Field, inputClass, Panel } from "@/components/ui";
import { isAdmin } from "@/lib/permissions";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";
import { cn, formatDate } from "@/lib/utils";

type Row = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  creator: string | null;
};

type Payload = {
  today: string;
  user: { id: string; name: string } | null;
  users: { id: string; name: string }[];
  open: Row[];
  doneToday: Row[];
};

const PRIORITY_STYLE: Record<string, string> = {
  alta: "border-danger/35 bg-danger/10 text-danger",
  media: "border-warning/35 bg-warning/10 text-warning",
  baja: "border-white/10 bg-white/5 text-text-muted",
};

const MIDIA = "/api/panel/mi-dia";

export default function MiDiaClient() {
  const { data: session } = useSession();
  const admin = isAdmin(session?.user?.role);
  const [viewUser, setViewUser] = useState("");
  const url = viewUser ? `${MIDIA}?user=${viewUser}` : MIDIA;
  const { data, error, mutate } = usePanelData(url) as {
    data?: Payload;
    error?: Error;
    mutate: (data?: unknown, opts?: { revalidate?: boolean }) => Promise<unknown>;
  };
  const [busy, setBusy] = useState<string | null>(null);
  const [fail, setFail] = useState("");

  async function setStatus(id: string, status: string) {
    setBusy(id);
    setFail("");
    try {
      const res = await fetch(PANEL.tasks, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error();
      await mutate();
      invalidatePanel(PANEL.tasks, PANEL.dashboard);
    } catch {
      setFail("No se pudo actualizar la tarea. Intenta de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  const titleName = data?.user?.name?.split(" ")[0];
  const subtitle = viewUser && titleName ? `Lo que tiene asignado ${titleName}` : "Lo que te toca hacer hoy";

  if (error) {
    return (
      <div>
        <TopBar title="Mi día" subtitle={subtitle} />
        <PanelLoadError onRetry={() => mutate()} />
      </div>
    );
  }

  const today = data?.today ?? "";
  const overdue = data?.open.filter((t) => t.dueDate && t.dueDate < today) ?? [];
  const dueToday = data?.open.filter((t) => t.dueDate === today) ?? [];
  const upcoming = data?.open.filter((t) => t.dueDate && t.dueDate > today) ?? [];
  const undated = data?.open.filter((t) => !t.dueDate) ?? [];
  const done = data?.doneToday ?? [];
  const pendingNow = overdue.length + dueToday.length + undated.length;
  const totalToday = pendingNow + done.length;
  const pct = totalToday ? Math.round((done.length / totalToday) * 100) : 0;

  function Card({ t, kind }: { t: Row; kind: "overdue" | "today" | "other" | "done" }) {
    const isDone = t.status === "hecha";
    return (
      <li
        className={cn(
          "rounded-xl border bg-bg-elevated/80 p-3.5 transition",
          kind === "overdue" ? "border-danger/40" : "border-white/10",
          isDone && "opacity-70"
        )}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            disabled={busy === t.id}
            onClick={() => setStatus(t.id, isDone ? "pendiente" : "hecha")}
            title={isDone ? "Reabrir" : "Marcar como hecha"}
            aria-label={isDone ? "Reabrir tarea" : "Marcar como hecha"}
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
              isDone
                ? "border-success bg-success/20 text-success"
                : "border-white/25 text-transparent hover:border-success hover:text-success"
            )}
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className={cn("text-sm font-semibold leading-snug", isDone && "line-through")}>{t.title}</p>
              <span
                className={cn(
                  "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE.media
                )}
              >
                {t.priority}
              </span>
            </div>
            {t.description && <p className="mt-1 text-xs leading-relaxed text-text-muted">{t.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
              {t.creator && (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3 opacity-70" />
                  {t.creator}
                </span>
              )}
              {t.dueDate && (
                <span className={cn("inline-flex items-center gap-1", kind === "overdue" && "font-medium text-danger")}>
                  <Calendar className="h-3 w-3 opacity-70" />
                  {formatDate(`${t.dueDate}T12:00:00`)}
                  {kind === "overdue" ? " · atrasada" : ""}
                </span>
              )}
              {t.status === "en_progreso" && (
                <span className="inline-flex items-center gap-1 text-cyan">
                  <CircleDot className="h-3 w-3" />
                  En progreso
                </span>
              )}
            </div>
            {!isDone && (
              <div className="mt-3 flex gap-2">
                {t.status !== "en_progreso" && (
                  <button
                    type="button"
                    disabled={busy === t.id}
                    onClick={() => setStatus(t.id, "en_progreso")}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-text-muted transition hover:border-white/20 hover:text-text disabled:opacity-50"
                  >
                    Empezar
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy === t.id}
                  onClick={() => setStatus(t.id, "hecha")}
                  className="rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success transition hover:bg-success/20 disabled:opacity-50"
                >
                  Marcar hecha
                </button>
              </div>
            )}
            {isDone && (
              <button
                type="button"
                disabled={busy === t.id}
                onClick={() => setStatus(t.id, "pendiente")}
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text"
              >
                <Undo2 className="h-3 w-3" /> Reabrir
              </button>
            )}
          </div>
        </div>
      </li>
    );
  }

  function Section({ title, rows, kind, hint }: { title: string; rows: Row[]; kind: "overdue" | "today" | "other"; hint?: string }) {
    if (rows.length === 0) return null;
    return (
      <section className="space-y-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className={cn("text-sm font-semibold uppercase tracking-wide", kind === "overdue" ? "text-danger" : "text-text-muted")}>
            {title}
          </h2>
          <span className="text-xs text-text-muted">{rows.length}</span>
          {hint && <span className="text-xs text-text-muted/70">· {hint}</span>}
        </div>
        <ul className="space-y-2.5">
          {rows.map((t) => (
            <Card key={t.id} t={t} kind={kind} />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div>
      <TopBar title="Mi día" subtitle={subtitle} />

      {admin && (data?.users.length ?? 0) > 0 && (
        <div className="mb-4 max-w-xs">
          <Field label="Ver el día de">
            <select className={inputClass} value={viewUser} onChange={(e) => setViewUser(e.target.value)}>
              <option value="">Yo</option>
              {data!.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {!data ? (
        <div className="glass-panel h-64 animate-pulse rounded-2xl" />
      ) : (
        <div className="mx-auto max-w-3xl space-y-6">
          <Panel className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">Avance de hoy</p>
                <p className="font-[family-name:var(--font-syne)] text-3xl font-bold">
                  {done.length}
                  <span className="text-lg text-text-muted"> de {totalToday}</span>
                </p>
              </div>
              <p className="text-sm text-text-muted">{pendingNow === 0 ? "Todo al día" : `${pendingNow} por hacer`}</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
            </div>
          </Panel>

          {fail && <p className="text-sm text-danger">{fail}</p>}

          {data.open.length === 0 && done.length === 0 && (
            <Panel className="py-10 text-center">
              <Sparkles className="mx-auto mb-2 h-6 w-6 text-accent" />
              <p className="font-semibold">No tienes tareas asignadas</p>
              <p className="mt-1 text-sm text-text-muted">Cuando te asignen una aparecerá aquí.</p>
            </Panel>
          )}

          <Section title="Atrasadas" rows={overdue} kind="overdue" />
          <Section title="Para hoy" rows={dueToday} kind="today" />
          <Section title="Sin fecha" rows={undated} kind="other" hint="hazlas cuando puedas" />
          <Section title="Próximas" rows={upcoming} kind="other" />

          {done.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-success">Hechas hoy</h2>
              <ul className="space-y-2.5">
                {done.map((t) => (
                  <Card key={t.id} t={t} kind="done" />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
