"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Undo2, ImageOff } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Field, Panel, inputClass } from "@/components/ui";
import { POSITION_LABEL, isPosition } from "@/lib/positions";
import { cn, formatDateTime } from "@/lib/utils";

type Item = {
  id: string;
  title: string;
  person: { id: string; name: string; position: string | null } | null;
  note: string | null;
  at: string;
  photo: string | null;
  status: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  dueDate: string | null;
};

type View = "por_revisar" | "aprobadas" | "devueltas" | "todas";

function stateOf(i: Item): Exclude<View, "todas"> {
  if (i.status !== "hecha") return "devueltas"; // la devolvió el admin y la persona aún no la reenvía
  return i.reviewedAt ? "aprobadas" : "por_revisar";
}

const STATE_BADGE: Record<string, { label: string; cls: string }> = {
  por_revisar: { label: "Por revisar", cls: "border-warning/40 bg-warning/10 text-warning" },
  aprobadas: { label: "Aprobada", cls: "border-success/40 bg-success/10 text-success" },
  devueltas: { label: "Devuelta", cls: "border-danger/40 bg-danger/10 text-danger" },
};

export default function EvidenceClient() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState<View>("por_revisar");
  const [person, setPerson] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/panel/evidence", { cache: "no-store", headers: { "x-skip-view-as": "1" } });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { items: Item[] };
      setItems(json.items);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(i: Item, action: "aprobar" | "devolver") {
    let note: string | undefined;
    if (action === "devolver") {
      const reason = prompt(`¿Por qué la devuelves? ${i.person?.name ?? ""} lo verá en su tarea.`);
      if (!reason?.trim()) return;
      note = reason.trim();
    }
    setBusy(i.id);
    setMsg("");
    try {
      const res = await fetch("/api/panel/evidence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: i.id, action, note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar.");
      setMsg(action === "aprobar" ? "Evidencia aprobada." : "Devuelta: la persona verá el motivo y deberá enviarla otra vez.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(null);
    }
  }

  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items ?? []) if (i.person) m.set(i.person.id, i.person.name);
    return [...m.entries()];
  }, [items]);

  const counts = useMemo(() => {
    const c = { por_revisar: 0, aprobadas: 0, devueltas: 0 };
    for (const i of items ?? []) c[stateOf(i)]++;
    return c;
  }, [items]);

  const shown = (items ?? []).filter((i) => (view === "todas" || stateOf(i) === view) && (!person || i.person?.id === person));

  if (error) {
    return (
      <div>
        <TopBar title="Evidencias" subtitle="Lo que sube cada persona al terminar sus tareas" />
        <PanelLoadError onRetry={() => void load()} />
      </div>
    );
  }

  const tabs: { id: View; label: string; n?: number }[] = [
    { id: "por_revisar", label: "Por revisar", n: counts.por_revisar },
    { id: "aprobadas", label: "Aprobadas", n: counts.aprobadas },
    { id: "devueltas", label: "Devueltas", n: counts.devueltas },
    { id: "todas", label: "Todas" },
  ];

  return (
    <div>
      <TopBar title="Evidencias" subtitle="Lo que sube cada persona al terminar sus tareas (últimos 45 días)" />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm transition",
                view === t.id ? "border-accent bg-accent-soft text-white" : "border-border text-text-muted hover:border-white/25 hover:text-text"
              )}
            >
              {t.label}
              {t.n !== undefined && <span className="ml-2 text-xs opacity-70">{t.n}</span>}
            </button>
          ))}
        </div>
        {people.length > 0 && (
          <div className="min-w-[12rem]">
            <Field label="Persona">
              <select className={inputClass} value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="">Todas</option>
                {people.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </div>

      {msg && <p className="mb-3 text-sm text-text-muted">{msg}</p>}

      {!items ? (
        <div className="glass-panel h-48 animate-pulse rounded-2xl" />
      ) : shown.length === 0 ? (
        <Panel className="py-10 text-center text-sm text-text-muted">
          {view === "por_revisar" ? "No hay evidencias por revisar." : "No hay evidencias en esta vista."}
        </Panel>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((i) => {
            const st = stateOf(i);
            const badge = STATE_BADGE[st];
            return (
              <li key={i.id} className="overflow-hidden rounded-xl border border-white/10 bg-bg-elevated/80">
                {i.photo ? (
                  <a href={i.photo} target="_blank" rel="noreferrer" title="Abrir la foto completa">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.photo} alt={`Evidencia de ${i.title}`} loading="lazy" className="h-56 w-full bg-black/30 object-cover" />
                  </a>
                ) : (
                  <div className="flex h-32 items-center justify-center gap-2 bg-black/20 text-xs text-text-muted">
                    <ImageOff className="h-4 w-4" /> Sin foto disponible
                  </div>
                )}
                <div className="space-y-2 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-snug">{i.title}</p>
                    <span className={cn("shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", badge.cls)}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    <b className="text-text">{i.person?.name ?? "Sin persona"}</b>
                    {i.person?.position && isPosition(i.person.position) ? ` · ${POSITION_LABEL[i.person.position]}` : ""}
                    {" · "}
                    {formatDateTime(i.at)}
                  </p>
                  {i.note && <p className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs">“{i.note}”</p>}
                  {i.reviewNote && st === "devueltas" && <p className="text-xs text-danger">Motivo de la devolución: {i.reviewNote}</p>}
                  {st === "por_revisar" && (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busy === i.id}
                        onClick={() => void review(i, "aprobar")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-medium text-success transition hover:bg-success/20 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> Aprobar
                      </button>
                      <button
                        type="button"
                        disabled={busy === i.id}
                        onClick={() => void review(i, "devolver")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/20 disabled:opacity-50"
                      >
                        <Undo2 className="h-3.5 w-3.5" /> Devolver
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
