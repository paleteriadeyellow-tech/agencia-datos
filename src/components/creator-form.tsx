"use client";

import { useMemo, useState } from "react";
import { createCreator, updateCreator, deleteCreator } from "@/lib/actions";
import { useSoftRefresh } from "@/lib/use-soft-refresh";
import { Button, Field, inputClass, Panel } from "@/components/ui";
import { CREATOR_STATUSES, NICHES } from "@/lib/utils";
import { normalizePhone } from "@/lib/phone";
import { useAgency } from "@/lib/use-agency";

type Manager = { id: string; name: string };
type CreatorData = {
  id?: string;
  name: string;
  phone: string;
  niche: string;
  joinDate: string;
  tiktokUser?: string | null;
  country?: string | null;
  status: string;
  groupName?: string | null;
  notes?: string | null;
  managerId?: string | null;
};

export function CreatorForm({
  managers,
  initial,
  embedded,
  onDone,
  onCancel,
}: {
  managers: Manager[];
  initial?: CreatorData;
  embedded?: boolean;
  onDone?: (id?: string) => void;
  onCancel?: () => void;
}) {
  const { softPush, pending } = useSoftRefresh();
  const { path } = useAgency();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [country, setCountry] = useState(initial?.country ?? "MX");

  const phoneInfo = useMemo(
    () => normalizePhone(phone, country),
    [phone, country]
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    if (phoneInfo) {
      form.set("phone", phoneInfo.display);
      form.set("country", phoneInfo.iso);
    }
    const res = initial?.id
      ? await updateCreator(initial.id, form)
      : await createCreator(form);
    setLoading(false);
    if ("error" in res && res.error) {
      setError(res.error);
      return;
    }
    const id = ("id" in res && res.id ? res.id : initial?.id) as string;
    if (onDone) {
      onDone(id);
      return;
    }
    softPush(path(`/creadores/${id}`));
  }

  async function onDelete() {
    if (!initial?.id) return;
    if (!confirm("¿Eliminar este creador y todos sus registros?")) return;
    setLoading(true);
    setError("");
    const res = await deleteCreator(initial.id);
    setLoading(false);
    if (res && "error" in res && res.error) {
      setError(res.error);
      return;
    }
    if (onDone) {
      onDone();
      return;
    }
    softPush(path("/creadores"));
  }

  function onPhoneBlur() {
    if (!phoneInfo) return;
    setPhone(phoneInfo.display);
    setCountry(phoneInfo.iso);
  }

  const form = (
    <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
      <Field label="Nombre *">
        <input
          name="name"
          required
          defaultValue={initial?.name}
          className={inputClass}
          placeholder="Nombre del streamer"
          autoFocus={embedded}
        />
      </Field>
      <Field label="Teléfono *">
        <input
          name="phone"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={onPhoneBlur}
          className={inputClass}
          placeholder="55 1234 5678 o +52…"
          inputMode="tel"
        />
        {phoneInfo ? (
          <p className="mt-1 text-[11px] text-success">
            WhatsApp: {phoneInfo.display} · {phoneInfo.countryName} detectado
          </p>
        ) : phone.trim() ? (
          <p className="mt-1 text-[11px] text-text-muted">
            Escribe el número; se detecta el país (MX por defecto si son 10
            dígitos).
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-text-muted">
            Ej. 5512345678 → +52 · o con +57 / +34 / +1…
          </p>
        )}
      </Field>
      <Field label="Nicho *">
        <select
          name="niche"
          required
          defaultValue={initial?.niche ?? ""}
          className={inputClass}
        >
          <option value="" disabled>
            Selecciona nicho
          </option>
          {NICHES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Fecha de incorporación *">
        <input
          name="joinDate"
          type="date"
          required
          defaultValue={
            initial?.joinDate ?? new Date().toISOString().slice(0, 10)
          }
          className={inputClass}
        />
      </Field>
      <Field label="Usuario TikTok">
        <input
          name="tiktokUser"
          defaultValue={initial?.tiktokUser ?? ""}
          className={inputClass}
          placeholder="sin @"
        />
      </Field>
      <Field label="País">
        <input
          name="country"
          value={country}
          onChange={(e) => setCountry(e.target.value.toUpperCase())}
          className={inputClass}
        />
      </Field>
      <Field label="Estado">
        <select
          name="status"
          defaultValue={initial?.status ?? "activo"}
          className={inputClass}
        >
          {CREATOR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Grupo / equipo">
        <input
          name="groupName"
          defaultValue={initial?.groupName ?? ""}
          className={inputClass}
          placeholder="Team Alpha"
        />
      </Field>
      <Field label="Manager asignado">
        <select
          name="managerId"
          defaultValue={initial?.managerId ?? ""}
          className={inputClass}
        >
          <option value="">
            {initial?.id ? "Sin asignar" : "Auto (menos roster)"}
          </option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="md:col-span-2">
        <Field label="Notas internas">
          <textarea
            name="notes"
            rows={embedded ? 3 : 4}
            defaultValue={initial?.notes ?? ""}
            className={inputClass}
            placeholder="Observaciones del manager…"
          />
        </Field>
      </div>
      {error && <p className="md:col-span-2 text-sm text-danger">{error}</p>}
      <div className="md:col-span-2 flex flex-wrap gap-3">
        <Button type="submit" disabled={loading || pending}>
          {loading || pending
            ? "Guardando…"
            : initial?.id
              ? "Guardar cambios"
              : "Registrar creador"}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        {initial?.id && (
          <Button
            type="button"
            variant="danger"
            onClick={onDelete}
            disabled={loading}
          >
            Eliminar
          </Button>
        )}
      </div>
    </form>
  );

  if (embedded) return form;
  return <Panel>{form}</Panel>;
}
