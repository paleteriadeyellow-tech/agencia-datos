"use client";

import { useState } from "react";
import { CalendarPlus, CheckCircle2, Copy, XCircle } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, EmptyState, Field, Panel, inputClass } from "@/components/ui";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";
import { useAgency } from "@/lib/use-agency";
import AuctionParticipantsClient from "@/components/pages/auction-participants-client";

type Edition = { id: string; number: number; date: string; time: string; host: string; status: string; dateConfirmed: boolean; registrationOpen: boolean; notes: string | null; registered: number; confirmed: number; tasksTotal: number; tasksDone: number };
type TaskRow = { id: string; title: string; status: string; dueDate: string | null; key: string | null; assignee: string | null };
type Checklist = { users: { id: string; name: string }[]; tasks: TaskRow[] };

const STATUS: Record<string, string> = {
  programada: "border-cyan/35 bg-cyan/10 text-cyan",
  realizada: "border-success/35 bg-success/10 text-success",
  cancelada: "border-danger/35 bg-danger/10 text-danger",
};

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function longDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

function time12(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "p. m." : "a. m."}`;
}

export default function AuctionsClient() {
  const { data, error, mutate } = usePanelData(PANEL.auctions) as { data?: { editions: Edition[] }; error?: Error; mutate: () => void };
  const [startDate, setStartDate] = useState("2026-11-15");
  const [time, setTime] = useState("20:00");
  const [host, setHost] = useState("Majo");
  const [count, setCount] = useState(6);
  const [everyDays, setEveryDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [tab, setTab] = useState<"calendario" | "participantes">("calendario");
  const [copied, setCopied] = useState("");
  const [listOpen, setListOpen] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState("");
  const { slug } = useAgency();

  const { data: checklist, mutate: reloadChecklist } = usePanelData(listOpen ? `${PANEL.auctions}/tasks?editionId=${listOpen}` : null) as { data?: Checklist; mutate: () => void };

  async function postTasks(editionId: string, assigneeId?: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`${PANEL.auctions}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editionId, assigneeId: assigneeId || undefined }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error ?? "No se pudo guardar"); return; }
      setMsg(`Tareas nuevas: ${j.created}. Reasignadas: ${j.reassigned}.`);
      invalidatePanel(PANEL.auctions);
      mutate();
      reloadChecklist();
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const link = `${window.location.origin}/a/${slug}/subasta/registro`;
    try { await navigator.clipboard.writeText(link); setCopied("Enlace copiado"); } catch { setCopied(link); }
  }

  async function call(method: string, body?: unknown, qs = "") {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(PANEL.auctions + qs, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error ?? "No se pudo guardar"); return false; }
      invalidatePanel(PANEL.auctions);
      mutate();
      return j;
    } finally {
      setBusy(false);
    }
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    const j = await call("POST", { startDate, time, host, count, everyDays });
    if (j) setMsg(`Se crearon ${j.created} edición(es) y ${j.tasks} tareas (asignadas a ti). Las fechas quedan “por confirmar” hasta que las apruebes.`);
  }

  if (error && !data) return <PanelLoadError message={error.message} onRetry={() => mutate()} />;
  const all = data?.editions ?? [];
  const today = todayYmd();
  const upcoming = all.filter((e) => e.status === "programada" && e.date >= today);
  const past = all.filter((e) => !(e.status === "programada" && e.date >= today)).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-5">
      <TopBar title="Sistema de subastas" subtitle="Calendario maestro · Subasta de Creadores de El Árbol" />

      <div className="flex gap-2">
        {(["calendario", "participantes"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2 text-sm capitalize ${tab === t ? "bg-accent text-white" : "border border-border bg-bg-panel text-text-muted hover:bg-bg-hover"}`}>{t}</button>
        ))}
      </div>

      {tab === "participantes" ? <AuctionParticipantsClient editions={all} /> : (<>

      <Panel>
        <form onSubmit={generate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <Field label="Primera fecha"><input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></Field>
          <Field label="Hora"><input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} required /></Field>
          <Field label="Anfitriona"><input className={inputClass} value={host} onChange={(e) => setHost(e.target.value)} required /></Field>
          <Field label="Cada (días)"><input type="number" min={1} max={60} className={inputClass} value={everyDays} onChange={(e) => setEveryDays(Number(e.target.value))} /></Field>
          <Field label="Ediciones"><input type="number" min={1} max={12} className={inputClass} value={count} onChange={(e) => setCount(Number(e.target.value))} /></Field>
          <Button type="submit" disabled={busy}><CalendarPlus className="h-4 w-4" /> Generar</Button>
        </form>
        {msg && <p className="mt-3 text-sm text-text-muted">{msg}</p>}
      </Panel>

      <section className="space-y-3">
        <h2 className="font-semibold">Próximas ediciones</h2>
        {!data ? <p className="text-sm text-text-muted">Cargando…</p> : upcoming.length === 0 ? (
          <EmptyState title="Aún no hay ediciones programadas" description="Genera las primeras con el formulario de arriba." />
        ) : upcoming.map((e) => (
          <Panel key={e.id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-text-muted">Edición #{e.number}</p>
                <p className="font-medium capitalize">{longDate(e.date)} · {time12(e.time)}</p>
                <p className="text-xs text-text-muted">Anfitriona: {e.host} · Inscritos: {e.registered} · Confirmados: {e.confirmed}</p>
                <p className="text-xs text-text-muted">Tareas hechas: {e.tasksDone} de {e.tasksTotal}</p>
              </div>
              <span className={`rounded border px-2 py-0.5 text-[11px] ${e.dateConfirmed ? "border-success/35 bg-success/10 text-success" : "border-warning/35 bg-warning/10 text-warning"}`}>
                {e.dateConfirmed ? "Fecha confirmada" : "Fecha por confirmar"}
              </span>
            </div>
            {editing === e.id ? (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Nueva fecha"><input type="date" className={inputClass} value={editDate} onChange={(x) => setEditDate(x.target.value)} /></Field>
                <Field label="Hora"><input type="time" className={inputClass} value={editTime} onChange={(x) => setEditTime(x.target.value)} /></Field>
                <Button disabled={busy || !editDate || !editTime} onClick={async () => { if (await call("PATCH", { id: e.id, date: editDate, time: editTime })) setEditing(null); }}>Guardar</Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {!e.dateConfirmed && <Button variant="secondary" disabled={busy} onClick={() => call("PATCH", { id: e.id, dateConfirmed: true })}><CheckCircle2 className="h-4 w-4" /> Confirmar fecha</Button>}
                <Button variant="secondary" disabled={busy} onClick={() => call("PATCH", { id: e.id, registrationOpen: !e.registrationOpen })}>{e.registrationOpen ? "Cerrar registro" : "Abrir registro"}</Button>
                {e.registrationOpen && <Button variant="ghost" onClick={copyLink}><Copy className="h-4 w-4" /> Copiar enlace de inscripción</Button>}
                <Button variant="secondary" disabled={busy} onClick={() => setListOpen(listOpen === e.id ? null : e.id)}>{listOpen === e.id ? "Ocultar checklist" : "Ver checklist"}</Button>
                <Button variant="secondary" disabled={busy} onClick={() => { setEditing(e.id); setEditDate(e.date); setEditTime(e.time); }}>Reprogramar</Button>
                <Button variant="secondary" disabled={busy} onClick={() => call("PATCH", { id: e.id, status: "realizada" })}>Marcar realizada</Button>
                <Button variant="danger" disabled={busy} onClick={() => { if (confirm(`¿Cancelar la edición #${e.number}?`)) call("PATCH", { id: e.id, status: "cancelada" }); }}><XCircle className="h-4 w-4" /> Cancelar</Button>
              </div>
            )}
            {listOpen === e.id && (
              <div className="space-y-3 border-t border-border-soft pt-3">
                {!checklist ? <p className="text-sm text-text-muted">Cargando…</p> : (<>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="space-y-1"><span className="text-xs text-text-muted">Responsable de las tareas sin terminar</span>
                      <select className={inputClass} value={assignTo} onChange={(x) => setAssignTo(x.target.value)}>
                        <option value="">Elegir…</option>
                        {checklist.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </label>
                    <Button variant="secondary" disabled={busy || !assignTo} onClick={() => postTasks(e.id, assignTo)}>Asignar</Button>
                    <Button variant="ghost" disabled={busy} onClick={() => postTasks(e.id)}>Generar tareas faltantes</Button>
                  </div>
                  <p className="text-xs text-text-muted">Cada tarea aparece en “Mi día” de su responsable cuando llega su fecha. Se completan allá o en Tareas.</p>
                  {checklist.tasks.length === 0 ? <p className="text-sm text-text-muted">Esta edición aún no tiene tareas. Pulsa “Generar tareas faltantes”.</p> : (
                    <ul className="space-y-1 text-sm">
                      {checklist.tasks.map((t) => (
                        <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border-soft py-1.5 first:border-t-0">
                          <span className={t.status === "hecha" ? "text-text-muted line-through" : ""}>{t.title.replace(/^Subasta #\d+: /, "")}</span>
                          <span className="text-xs text-text-muted">{t.dueDate} · {t.assignee ?? "Sin responsable"} · {t.status === "hecha" ? "Hecha" : "Pendiente"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>)}
              </div>
            )}
          </Panel>
        ))}
      </section>

      <section className="space-y-3">
        <button className="text-sm text-cyan hover:underline" onClick={() => setShowPast((v) => !v)}>
          {showPast ? "Ocultar" : "Ver"} historial ({past.length})
        </button>
        {showPast && past.map((e) => (
          <Panel key={e.id} className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-text-muted">Edición #{e.number}</p>
              <p className="text-sm capitalize">{longDate(e.date)} · {time12(e.time)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded border px-2 py-0.5 text-[11px] ${STATUS[e.status] ?? ""}`}>{e.status === "programada" ? "vencida sin cerrar" : e.status}</span>
              {e.status === "programada" && <Button variant="secondary" disabled={busy} onClick={() => call("PATCH", { id: e.id, status: "realizada" })}>Marcar realizada</Button>}
              {e.status === "cancelada" && <Button variant="danger" disabled={busy} onClick={() => { if (confirm("¿Borrar esta edición cancelada?")) call("DELETE", undefined, `?id=${e.id}`); }}>Borrar</Button>}
            </div>
          </Panel>
        ))}
      </section>
      {copied && <p className="text-xs text-text-muted">{copied}</p>}
      </>)}
    </div>
  );
}
