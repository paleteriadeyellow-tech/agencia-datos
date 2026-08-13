"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { createCampaign, updateCampaign } from "@/lib/actions";
import { Button, Field, inputClass, Panel } from "@/components/ui";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import {
  CreatorSuggestInput,
  type SuggestCreator,
} from "@/components/creator-suggest";

type CreatorOpt = {
  id: string;
  name: string;
  tiktokUser?: string | null;
  diamonds?: number;
};

export type CampaignInitial = {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  targetDiamonds: number;
  targetHours: number;
  status: string;
  assignedCreatorIds?: string[];
};

function toDateInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function CampaignForm({
  creators,
  onSaved,
  initial,
  onCancel,
  embedded,
}: {
  creators: CreatorOpt[];
  onSaved?: () => void;
  initial?: CampaignInitial | null;
  onCancel?: () => void;
  embedded?: boolean;
}) {
  const editing = !!initial?.id;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [name, setName] = useState(initial?.name ?? "");
  const [status, setStatus] = useState(initial?.status ?? "activa");
  const [startDate, setStartDate] = useState(
    initial ? toDateInput(initial.startDate) : ""
  );
  const [endDate, setEndDate] = useState(
    initial ? toDateInput(initial.endDate) : ""
  );
  const [targetDiamonds, setTargetDiamonds] = useState(
    initial?.targetDiamonds ?? 0
  );
  const [targetHours, setTargetHours] = useState(initial?.targetHours ?? 0);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [selected, setSelected] = useState<CreatorOpt[]>(() => {
    if (!initial?.assignedCreatorIds?.length) return [];
    return creators.filter((c) => initial.assignedCreatorIds!.includes(c.id));
  });

  useEffect(() => {
    if (!initial) return;
    setName(initial.name);
    setStatus(initial.status);
    setStartDate(toDateInput(initial.startDate));
    setEndDate(toDateInput(initial.endDate));
    setTargetDiamonds(initial.targetDiamonds);
    setTargetHours(initial.targetHours);
    setDescription(initial.description ?? "");
    setSelected(
      creators.filter((c) => initial.assignedCreatorIds?.includes(c.id))
    );
    setQuery("");
    setError("");
  }, [initial, creators]);

  const suggestList: SuggestCreator[] = useMemo(
    () =>
      creators.map((c) => ({
        id: c.id,
        nick: (c.tiktokUser || c.name).replace(/^@/, "").trim().toLowerCase(),
        name: c.name,
        diamonds: c.diamonds ?? 0,
      })),
    [creators]
  );

  const excludeNicks = useMemo(
    () =>
      new Set(
        selected.map((c) =>
          (c.tiktokUser || c.name).replace(/^@/, "").trim().toLowerCase()
        )
      ),
    [selected]
  );

  function pickCreator(s: SuggestCreator) {
    const full = creators.find((c) => c.id === s.id);
    if (!full) return;
    setSelected((prev) =>
      prev.some((x) => x.id === full.id) ? prev : [...prev, full]
    );
    // query lo limpia CreatorSuggestInput (clearOnPick)
  }

  function removeCreator(id: string) {
    setSelected((prev) => prev.filter((c) => c.id !== id));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData();
    if (editing) fd.set("id", initial!.id);
    fd.set("name", name);
    fd.set("status", status);
    fd.set("startDate", startDate);
    fd.set("endDate", endDate);
    fd.set("targetDiamonds", String(targetDiamonds));
    fd.set("targetHours", String(targetHours));
    fd.set("description", description);
    for (const c of selected) {
      fd.append("creatorIds", c.id);
    }
    const res = editing ? await updateCampaign(fd) : await createCampaign(fd);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (!editing) {
      setName("");
      setStatus("activa");
      setStartDate("");
      setEndDate("");
      setTargetDiamonds(0);
      setTargetHours(0);
      setDescription("");
      setSelected([]);
      setQuery("");
    }
    onSaved?.();
  }

  const body = (
    <>
      {!embedded && (
        <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-semibold">
          {editing ? "Editar campaña" : "Nueva campaña"}
        </h2>
      )}
      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
        <Field label="Nombre">
          <input
            name="name"
            required
            className={inputClass}
            placeholder="Creator League Q1"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Estado">
          <select
            name="status"
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="activa">Activa</option>
            <option value="borrador">Borrador</option>
            <option value="finalizada">Finalizada</option>
          </select>
        </Field>
        <Field label="Inicio">
          <input
            name="startDate"
            type="date"
            required
            className={inputClass}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Fin">
          <input
            name="endDate"
            type="date"
            required
            className={inputClass}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
        <Field label="Meta diamantes">
          <input
            name="targetDiamonds"
            type="number"
            min={0}
            className={inputClass}
            value={targetDiamonds}
            onChange={(e) => setTargetDiamonds(Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Meta horas">
          <input
            name="targetHours"
            type="number"
            min={0}
            step={0.1}
            className={inputClass}
            value={targetHours}
            onChange={(e) => setTargetHours(Number(e.target.value) || 0)}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Descripción">
            <textarea
              name="description"
              rows={2}
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
        <div className="relative z-30 md:col-span-2">
          <CreatorSuggestInput
            value={query}
            onChange={setQuery}
            onPick={pickCreator}
            creators={suggestList}
            excludeNicks={excludeNicks}
            clearOnPick
            keepOpenOnPick
          />
          {selected.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {selected.map((c) => {
                const nick = c.tiktokUser || c.name;
                return (
                  <li
                    key={c.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-border-soft bg-bg px-2 py-1.5 text-sm"
                  >
                    <TikTokAvatar
                      username={c.tiktokUser}
                      name={c.name}
                      size={20}
                      link={false}
                    />
                    <span>{nick}</span>
                    <button
                      type="button"
                      title="Quitar"
                      onClick={() => removeCreator(c.id)}
                      className="rounded p-0.5 text-text-muted hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-1 text-xs text-text-muted">
            Vacío = todos los de Control de diamantes del mes de la campaña.
          </p>
        </div>
        {error && <p className="text-sm text-danger md:col-span-2">{error}</p>}
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button type="submit" disabled={loading}>
            {loading
              ? "…"
              : editing
                ? "Guardar cambios"
                : "Crear campaña"}
          </Button>
          {editing && onCancel && (
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={onCancel}
            >
              Cancelar
            </Button>
          )}
        </div>
      </form>
    </>
  );

  if (embedded) return <div>{body}</div>;
  return <Panel className="overflow-visible">{body}</Panel>;
}
