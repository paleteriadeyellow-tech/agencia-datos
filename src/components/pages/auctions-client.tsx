"use client";

import { useState } from "react";
import { CalendarPlus, CheckCircle2, XCircle } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, EmptyState, Field, Panel, inputClass } from "@/components/ui";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";

type Edition = { id: string; number: number; date: string; time: string; host: string; status: string; dateConfirmed: boolean; notes: string | null };

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
    if (j) setMsg(`Se crearon ${j.created} edición(es). Las fechas quedan “por confirmar” hasta que las apruebes.`);
  }

  if (error && !data) return <PanelLoadError message={error.message} onRetry={() => mutate()} />;
  const all = data?.editions ?? [];
  const today = todayYmd();
  const upcoming = all.filter((e) => e.status === "programada" && e.date >= today);
  const past = all.filter((e) => !(e.status === "programada" && e.date >= today)).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-5">
      <TopBar title="Sistema de subastas" subtitle="Calendario maestro · Subasta de Creadores de El Árbol" />

      <Panel className="text-sm text-text-muted">
        Sección 1 de 13: calendario de ediciones. Los participantes inscritos, el estado de preparación y los recordatorios llegarán en las siguientes secciones; por eso aún no se muestran.
      </Panel>

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
                <p className="text-xs text-text-muted">Anfitriona: {e.host}</p>
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
                <Button variant="secondary" disabled={busy} onClick={() => { setEditing(e.id); setEditDate(e.date); setEditTime(e.time); }}>Reprogramar</Button>
                <Button variant="secondary" disabled={busy} onClick={() => call("PATCH", { id: e.id, status: "realizada" })}>Marcar realizada</Button>
                <Button variant="danger" disabled={busy} onClick={() => { if (confirm(`¿Cancelar la edición #${e.number}?`)) call("PATCH", { id: e.id, status: "cancelada" }); }}><XCircle className="h-4 w-4" /> Cancelar</Button>
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
    </div>
  );
}
