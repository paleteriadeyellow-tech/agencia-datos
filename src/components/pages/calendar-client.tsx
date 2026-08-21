"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, Field, Panel, inputClass } from "@/components/ui";
import { PANEL, usePanelData, invalidatePanel } from "@/lib/swr";
import { weekBounds } from "@/lib/utils";
import { useCreatorsRoster } from "@/lib/use-creators-roster";

type CreatorOpt = { id: string; name: string };
type Slot = {
  id: string;
  startAt: string;
  durationMin: number;
  status: string;
  notes: string | null;
  creatorId: string;
  creatorName: string;
};

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function ymdLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarClient() {
  const { start } = weekBounds();
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      }),
    [start]
  );

  const { creators: roster } = useCreatorsRoster();
  const { data, error, mutate } = usePanelData(PANEL.hub) as {
    data?: { calendar: Slot[] };
    error?: Error;
    mutate: () => void;
  };
  const { data: creatorsData } = usePanelData(PANEL.creators) as {
    data?: { creators: CreatorOpt[] };
  };

  const [creatorId, setCreatorId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [durationMin, setDurationMin] = useState(120);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const slots = useMemo(() => {
    const list = data?.calendar ?? [];
    if (!roster.length) return list;
    const ids = new Set(roster.map((c) => c.id));
    return list.filter((s) => ids.has(s.creatorId));
  }, [data?.calendar, roster]);
  const creators = roster.length
    ? roster.map((c) => ({ id: c.id, name: c.name }))
    : creatorsData?.creators ?? [];

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!creatorId || !startAt) return;
    setSaving(true);
    await fetch(PANEL.hub, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "schedule",
        creatorId,
        startAt,
        durationMin,
        notes,
      }),
    });
    setSaving(false);
    setNotes("");
    invalidatePanel(PANEL.hub, PANEL.dashboard);
    mutate();
  }

  return (
    <div>
      <TopBar
        title="Calendario LIVE"
        subtitle="Agenda de la semana · quién transmite y cuándo"
      />

      {error ? (
        <PanelLoadError onRetry={() => mutate()} />
      ) : (
        <>
          <Panel className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4 text-accent" />
              <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
                Agendar live
              </h2>
            </div>
            <form
              onSubmit={(e) => void addSlot(e)}
              className="grid gap-3 md:grid-cols-4 md:items-end"
            >
              <Field label="Creador">
                <select
                  className={inputClass}
                  value={creatorId}
                  onChange={(e) => setCreatorId(e.target.value)}
                  required
                >
                  <option value="">Selecciona</option>
                  {creators.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Inicio">
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  required
                />
              </Field>
              <Field label="Minutos">
                <input
                  type="number"
                  min={15}
                  className={inputClass}
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value) || 120)}
                />
              </Field>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Agendar"}
              </Button>
            </form>
          </Panel>

          <div className="grid gap-3 md:grid-cols-7">
            {weekDays.map((day, i) => {
              const key = ymdLocal(day);
              const daySlots = slots.filter(
                (s) => ymdLocal(new Date(s.startAt)) === key
              );
              const isToday = ymdLocal(new Date()) === key;
              return (
                <div
                  key={key}
                  className={`rounded-2xl border p-3 ${
                    isToday
                      ? "border-cyan/40 bg-cyan/5"
                      : "border-border-soft bg-bg-panel"
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    {DAYS[i]}
                  </p>
                  <p className="mb-3 font-[family-name:var(--font-syne)] text-lg font-bold">
                    {day.getDate()}
                  </p>
                  <ul className="space-y-2">
                    {daySlots.length === 0 && (
                      <li className="text-xs text-text-muted">Libre</li>
                    )}
                    {daySlots.map((s) => (
                      <li
                        key={s.id}
                        className="rounded-lg border border-border-soft bg-bg px-2 py-1.5 text-xs"
                      >
                        <p className="font-medium">{s.creatorName}</p>
                        <p className="text-text-muted">
                          {new Date(s.startAt).toLocaleTimeString("es-MX", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          · {s.durationMin}m
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
