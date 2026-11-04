"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleDot, Calendar, Camera, Clock, User, Sparkles, AlertTriangle } from "lucide-react";
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
  time: string | null;
  fixed: boolean;
  evidenceAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
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

/** Reduce la foto en el navegador (máx. 1600 px, JPEG): sube rápido y cabe en el límite del servidor. */
async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  if (!blob) throw new Error("No se pudo preparar la foto.");
  return new File([blob], "evidencia.jpg", { type: "image/jpeg" });
}

function EvidenceForm({ task, onDone, onCancel }: { task: Row; onDone: () => Promise<void>; onCancel: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  function pick(f: File | null) {
    setError("");
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return f ? URL.createObjectURL(f) : null;
    });
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Elige la foto de tu evidencia.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const small = await compressImage(file);
      const fd = new FormData();
      fd.set("taskId", task.id);
      fd.set("note", note);
      fd.set("file", small);
      const res = await fetch("/api/panel/evidence", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo enviar. Intenta de nuevo.");
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar. Intenta de nuevo.");
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="mt-3 space-y-3 rounded-xl border border-accent/30 bg-accent/5 p-3.5">
      <p className="text-sm font-semibold">Evidencia</p>
      <p className="text-xs text-text-muted">Sube una foto o captura de lo que hiciste. Al enviarla, la tarea queda como hecha.</p>

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Vista previa de tu evidencia" className="max-h-56 w-auto rounded-lg border border-white/10" />
      ) : null}
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-text-muted transition hover:border-white/30 hover:text-text"
      >
        <Camera className="h-4 w-4" />
        {file ? "Cambiar foto" : "Subir foto"}
      </button>

      <Field label="Mensaje (opcional)">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          className={inputClass}
          placeholder="Describe lo que hiciste"
        />
      </Field>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={sending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {sending ? "Enviando…" : "Enviar evidencia"}
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={onCancel}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-text-muted transition hover:text-text disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

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
  const [formFor, setFormFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fail, setFail] = useState("");

  /** Recarga sin usar la caché del navegador (las rutas del panel se guardan 60 s): el cambio se ve al instante. */
  async function refresh() {
    try {
      const res = await fetch(url, { cache: "no-store", headers: { "x-skip-view-as": "1" } });
      if (res.ok) {
        await mutate(await res.json(), { revalidate: false });
      } else {
        await mutate();
      }
    } catch {
      await mutate();
    }
    invalidatePanel(PANEL.tasks, PANEL.dashboard, "/api/panel/evidence");
  }

  async function start(t: Row) {
    setFail("");
    setFormFor(t.id);
    if (t.status === "pendiente") {
      // Se marca "en progreso" y se abre el formulario de evidencia
      setBusy(t.id);
      try {
        const res = await fetch(PANEL.tasks, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: t.id, status: "en_progreso" }),
        });
        if (!res.ok) throw new Error();
        await refresh();
      } catch {
        setFail("No se pudo iniciar la tarea. Intenta de nuevo.");
        setFormFor(null);
      } finally {
        setBusy(null);
      }
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const titleName = data?.user?.name?.split(" ")[0];
  const subtitle = viewUser && titleName ? `Lo que tiene asignado ${titleName}` : "Lo que te toca hoy · se renueva cada día a las 6:00 a.m.";

  if (error) {
    return (
      <div>
        <TopBar title="Mi día" subtitle={subtitle} />
        <PanelLoadError onRetry={() => void mutate()} />
      </div>
    );
  }

  const today = data?.today ?? "";
  const isOverdue = (t: Row) => !!t.dueDate && t.dueDate < today;
  const open = data?.open ?? [];
  const overdue = open.filter(isOverdue);
  // Lo que dirección te asigna a mano (no es tarea fija) va arriba, con o sin fecha límite
  const assigned = open.filter((t) => !t.fixed && !isOverdue(t));
  const fixedOpen = open.filter((t) => t.fixed && !isOverdue(t));
  const dueToday = fixedOpen.filter((t) => t.dueDate === today);
  const upcoming = fixedOpen.filter((t) => t.dueDate && t.dueDate > today);
  const undated = fixedOpen.filter((t) => !t.dueDate);
  const done = data?.doneToday ?? [];
  const pendingNow = overdue.length + assigned.length + dueToday.length + undated.length;
  const totalToday = pendingNow + done.length;
  const pct = totalToday ? Math.round((done.length / totalToday) * 100) : 0;
  const readOnly = !!viewUser; // el admin viendo el día de otra persona solo mira

  function renderCard(t: Row, kind: "overdue" | "today" | "other" | "done") {
    const isDone = t.status === "hecha";
    const returned = !isDone && !!t.reviewNote;
    return (
      <li
        key={t.id}
        className={cn(
          "rounded-xl border bg-bg-elevated/80 p-3.5 transition",
          kind === "overdue" || returned ? "border-danger/40" : "border-white/10",
          isDone && "border-success/30"
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
              isDone ? "border-success bg-success/20 text-success" : "border-white/25 text-transparent"
            )}
            aria-hidden
          >
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className={cn("text-sm font-semibold leading-snug", isDone && "text-text-muted")}>{t.title}</p>
              <span
                className={cn(
                  "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE.media
                )}
              >
                {t.priority}
              </span>
            </div>
            {t.description && <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-text-muted">{t.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
              {t.time && (
                <span className="inline-flex items-center gap-1 font-medium text-text">
                  <Clock className="h-3 w-3 opacity-70" />
                  {t.time}
                </span>
              )}
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

            {returned && (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <b>Devuelta por el admin:</b> {t.reviewNote}
                </span>
              </p>
            )}

            {isDone ? (
              <p className="mt-2 text-xs font-medium text-success">
                ✓ Hecha · evidencia enviada{t.reviewedAt ? " · aprobada por el admin" : " · en revisión"}
              </p>
            ) : readOnly ? null : formFor === t.id ? (
              <EvidenceForm
                task={t}
                onCancel={() => setFormFor(null)}
                onDone={async () => {
                  setFormFor(null);
                  await refresh();
                }}
              />
            ) : (
              <button
                type="button"
                disabled={busy === t.id}
                onClick={() => void start(t)}
                className="mt-3 rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success transition hover:bg-success/20 disabled:opacity-50"
              >
                {t.status === "en_progreso" || returned ? "Subir evidencia" : "Empezar"}
              </button>
            )}
          </div>
        </div>
      </li>
    );
  }

  function renderSection(title: string, rows: Row[], kind: "overdue" | "today" | "other", hint?: string) {
    if (rows.length === 0) return null;
    return (
      <section key={title} className="space-y-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className={cn("text-sm font-semibold uppercase tracking-wide", kind === "overdue" ? "text-danger" : "text-text-muted")}>{title}</h2>
          <span className="text-xs text-text-muted">{rows.length}</span>
          {hint && <span className="text-xs text-text-muted/70">· {hint}</span>}
        </div>
        <ul className="space-y-2.5">
          {rows.map((t) => renderCard(t, kind))}
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

          {data.open.length === 0 && done.length > 0 && (
            <Panel className="py-8 text-center">
              <Sparkles className="mx-auto mb-2 h-6 w-6 text-success" />
              <p className="font-semibold">¡Terminaste todo por hoy!</p>
              <p className="mt-1 text-sm text-text-muted">Mañana a las 6:00 a.m. te llegan tus tareas del día.</p>
            </Panel>
          )}

          {data.open.length === 0 && done.length === 0 && (
            <Panel className="py-10 text-center">
              <Sparkles className="mx-auto mb-2 h-6 w-6 text-accent" />
              <p className="font-semibold">No tienes tareas asignadas</p>
              <p className="mt-1 text-sm text-text-muted">Cuando te asignen una aparecerá aquí.</p>
            </Panel>
          )}

          {renderSection("Atrasadas", overdue, "overdue")}
          {renderSection("Asignadas por dirección", assigned, "today")}
          {renderSection("Para hoy", dueToday, "today")}
          {renderSection("Sin fecha", undated, "other", "hazlas cuando puedas")}
          {renderSection("Próximas", upcoming, "other")}

          {done.length > 0 && (
            <details className="group space-y-2.5">
              <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-success">
                Hechas hoy · {done.length} <span className="ml-1 text-xs font-normal normal-case text-text-muted">(toca para verlas)</span>
              </summary>
              <ul className="mt-2.5 space-y-2.5">
                {done.map((t) => renderCard(t, "done"))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
