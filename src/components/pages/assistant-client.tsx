"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MessageCircle, Send, Sparkles, Trash2 } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { Button, Panel, inputClass } from "@/components/ui";
import { invalidatePanel, PANEL } from "@/lib/swr";
import { cn } from "@/lib/utils";
import { useAgency } from "@/lib/use-agency";
import type { AssistantAction } from "@/lib/assistant";

type Turn = { role: "user" | "assistant"; text: string; actions?: AssistantAction[]; error?: boolean };

const EXAMPLES = [
  "¿Cómo vamos este mes?",
  "Prepara un WhatsApp para todos los que están en riesgo animándolos a hacer LIVE hoy",
  "Crea una tarea para Majo: llamar a los 10 creadores con más diamantes que están sin LIVE",
  "¿Quién del equipo tiene más tareas atrasadas?",
  "Corre el robot del día",
];

export default function AssistantPage() {
  const { slug } = useAgency();
  const storeKey = `assistant:${slug}`;
  const [turns, setTurns] = useState<Turn[]>([]);
  // Historial completo para el modelo (incluye herramientas); se guarda solo en este navegador.
  const history = useRef<unknown[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storeKey) || "null");
      if (saved) {
        setTurns(saved.turns ?? []);
        history.current = saved.history ?? [];
      }
    } catch {
      /* sin almacenamiento */
    }
  }, [storeKey]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  function persist(nextTurns: Turn[]) {
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ turns: nextTurns, history: history.current }));
    } catch {
      /* sin almacenamiento */
    }
  }

  async function send(order: string) {
    const t = order.trim();
    if (!t || busy) return;
    const withUser: Turn[] = [...turns, { role: "user", text: t }];
    setTurns(withUser);
    setText("");
    setBusy(true);
    try {
      const res = await fetch("/api/panel/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, history: history.current }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(json.error || "Error"), { actions: json.actions });
      history.current = json.history ?? [];
      const next: Turn[] = [...withUser, { role: "assistant", text: json.reply, actions: json.actions }];
      setTurns(next);
      persist(next);
      if ((json.actions as AssistantAction[] | undefined)?.some((a) => a.type !== "whatsapp")) {
        invalidatePanel(PANEL.tasks, PANEL.creators);
      }
    } catch (e) {
      const err = e as Error & { actions?: AssistantAction[] };
      const next: Turn[] = [...withUser, { role: "assistant", text: err.message, actions: err.actions, error: true }];
      setTurns(next);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setTurns([]);
    history.current = [];
    try {
      sessionStorage.removeItem(storeKey);
    } catch {
      /* sin almacenamiento */
    }
  }

  function openWa(link: string) {
    window.open(link, "_blank", "noopener,noreferrer");
    setOpened((s) => new Set(s).add(link));
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <TopBar title="Asistente" subtitle="Dale una orden y la hace en el panel: tareas, notas, mensajes de WhatsApp, reportes." />

      <Panel className="flex min-h-0 flex-1 flex-col p-0">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {turns.length === 0 && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-text-muted">
                <Sparkles className="h-4 w-4" /> Prueba con algo como:
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => send(ex)}
                    className="rounded-full border border-border px-3 py-1.5 text-left text-sm text-text-muted transition hover:bg-bg-hover hover:text-text"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => (
            <div key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[90%] rounded-xl px-4 py-3 text-sm sm:max-w-[75%]",
                  t.role === "user" ? "bg-accent text-white" : "border border-border bg-bg-panel",
                  t.error && "border-danger/40 text-danger"
                )}
              >
                <p className="whitespace-pre-wrap">{t.text}</p>
                {!!t.actions?.length && <ActionList actions={t.actions} opened={opened} onOpen={openWa} />}
              </div>
            </div>
          ))}

          {busy && <p className="text-sm text-text-muted">Trabajando en eso…</p>}
          <div ref={bottom} />
        </div>

        <form
          className="flex gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <input
            className={inputClass}
            placeholder="Escribe una orden… ej. «crea una tarea para vian de revisar contratos»"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !text.trim()} aria-label="Enviar">
            <Send className="h-4 w-4" />
          </Button>
          {turns.length > 0 && (
            <Button type="button" variant="ghost" onClick={reset} disabled={busy} aria-label="Nueva conversación" title="Nueva conversación">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </form>
      </Panel>
    </div>
  );
}

function ActionList({ actions, opened, onOpen }: { actions: AssistantAction[]; opened: Set<string>; onOpen: (l: string) => void }) {
  const wa = actions.filter((a): a is Extract<AssistantAction, { type: "whatsapp" }> => a.type === "whatsapp");
  const other = actions.filter((a) => a.type !== "whatsapp");
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {other.map((a, i) => (
        <p key={i} className="flex items-start gap-2 text-xs text-text-muted">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
          {a.type === "task" && `Tarea creada: ${a.title}${a.assignee ? ` → ${a.assignee}` : ""}`}
          {a.type === "note" && `Nota agregada a ${a.creator}`}
          {a.type === "update" && a.text}
        </p>
      ))}
      {wa.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-text-muted">
            {wa.length} mensajes listos · {wa.filter((w) => opened.has(w.link)).length} abiertos
          </p>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {wa.map((w) => (
              <li key={w.link} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs" title={w.message}>
                  {w.name}
                </span>
                <button
                  type="button"
                  onClick={() => onOpen(w.link)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs",
                    opened.has(w.link) ? "border border-border text-text-muted" : "bg-success/20 text-success hover:bg-success/30"
                  )}
                >
                  <MessageCircle className="h-3 w-3" /> {opened.has(w.link) ? "Abierto" : "Enviar"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
