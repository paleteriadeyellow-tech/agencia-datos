"use client";

import { useState } from "react";
import { Link2, Send } from "lucide-react";
import { Button, Field, Panel, inputClass } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { PANEL } from "@/lib/swr";

type Note = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export function CreatorOps({
  creatorId,
  agency,
  period,
  initialNotes,
  initialGoal,
  initialToken,
}: {
  creatorId: string;
  agency: string;
  period: string;
  initialNotes: Note[];
  initialGoal: { targetDiamonds: number; targetHours: number };
  initialToken: string | null;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [body, setBody] = useState("");
  const [goalD, setGoalD] = useState(initialGoal.targetDiamonds);
  const [goalH, setGoalH] = useState(initialGoal.targetHours);
  const [token, setToken] = useState(initialToken);
  const [msg, setMsg] = useState("");

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const res = await fetch(PANEL.hub, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "note", creatorId, body }),
    });
    const json = await res.json();
    if (json.row) {
      setNotes((prev) => [json.row, ...prev]);
      setBody("");
    }
  }

  async function saveGoal(e: React.FormEvent) {
    e.preventDefault();
    await fetch(PANEL.hub, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "goal",
        creatorId,
        period,
        targetDiamonds: goalD,
        targetHours: goalH,
      }),
    });
    setMsg("Meta del mes guardada.");
  }

  async function makePortal() {
    const res = await fetch(PANEL.hub, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "portal", creatorId }),
    });
    const json = await res.json();
    if (json.token) {
      setToken(json.token);
      setMsg("Link del portal listo. Cópialo y mándaselo al creador.");
    }
  }

  const portalUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/a/${agency}/p/${token}`
    : "";

  return (
    <div className="mb-8 grid gap-6 lg:grid-cols-2">
      <Panel>
        <h2 className="mb-3 font-[family-name:var(--font-syne)] text-lg font-semibold">
          Bitácora
        </h2>
        <form onSubmit={(e) => void addNote(e)} className="mb-4 flex gap-2">
          <input
            className={inputClass}
            placeholder="Hablé con ella, va a subir 2 horas…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button type="submit">
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {notes.length === 0 && (
            <li className="text-sm text-text-muted">Sin notas aún.</li>
          )}
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-xl border border-border-soft bg-bg px-3 py-2 text-sm"
            >
              <p>{n.body}</p>
              <p className="mt-1 text-xs text-text-muted">
                {n.authorName} · {formatDateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="space-y-6">
        <Panel>
          <h2 className="mb-3 font-[family-name:var(--font-syne)] text-lg font-semibold">
            Meta individual ({period})
          </h2>
          <form onSubmit={(e) => void saveGoal(e)} className="grid gap-3 sm:grid-cols-2">
            <Field label="Diamantes">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={goalD}
                onChange={(e) => setGoalD(Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Horas">
              <input
                type="number"
                min={0}
                step={0.5}
                className={inputClass}
                value={goalH}
                onChange={(e) => setGoalH(Number(e.target.value) || 0)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">Guardar meta</Button>
            </div>
          </form>
        </Panel>

        <Panel>
          <h2 className="mb-2 font-[family-name:var(--font-syne)] text-lg font-semibold">
            Portal del creador
          </h2>
          <p className="mb-3 text-sm text-text-muted">
            Link para que vea su avance, sin entrar al panel.
          </p>
          {portalUrl && (
            <p className="mb-3 break-all rounded-lg border border-border-soft bg-bg px-3 py-2 text-xs">
              {portalUrl}
            </p>
          )}
          <Button type="button" variant="secondary" onClick={() => void makePortal()}>
            <Link2 className="h-4 w-4" />
            {token ? "Regenerar link" : "Crear link"}
          </Button>
        </Panel>
        {msg && <p className="text-sm text-success">{msg}</p>}
      </div>
    </div>
  );
}
