"use client";

import { useState } from "react";
import { createMetric } from "@/lib/actions";
import { Button, Field, inputClass, Panel } from "@/components/ui";

export function MetricForm({
  creators,
  onSaved,
}: {
  creators: { id: string; name: string }[];
  onSaved?: () => void;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = e.currentTarget;
    const res = await createMetric(new FormData(form));
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    form.reset();
    onSaved?.();
  }

  return (
    <Panel>
      <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-semibold">
        Registrar métrica
      </h2>
      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-3">
        <Field label="Creador">
          <select name="creatorId" required className={inputClass} defaultValue="">
            <option value="" disabled>
              Selecciona
            </option>
            {creators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha">
          <input
            name="date"
            type="date"
            required
            className={inputClass}
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="Diamantes">
          <input name="diamonds" type="number" min={0} defaultValue={0} className={inputClass} />
        </Field>
        <Field label="Horas LIVE">
          <input
            name="hoursLive"
            type="number"
            min={0}
            step={0.1}
            defaultValue={0}
            className={inputClass}
          />
        </Field>
        <Field label="Viewers pico">
          <input name="peakViewers" type="number" min={0} defaultValue={0} className={inputClass} />
        </Field>
        <Field label="Combates">
          <input name="battles" type="number" min={0} defaultValue={0} className={inputClass} />
        </Field>
        <div className="md:col-span-3">
          <Field label="Notas">
            <input name="notes" className={inputClass} placeholder="Opcional" />
          </Field>
        </div>
        {error && <p className="text-sm text-danger md:col-span-3">{error}</p>}
        <div className="md:col-span-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Guardando…" : "Guardar métrica"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
