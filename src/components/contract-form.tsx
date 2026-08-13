"use client";

import { useState } from "react";
import { createContract } from "@/lib/actions";
import { Button, Field, inputClass, Panel } from "@/components/ui";
import { CONTRACT_STATUSES } from "@/lib/utils";

export function ContractForm({
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
    const res = await createContract(new FormData(form));
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
        Nuevo contrato
      </h2>
      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
        <Field label="Creador">
          <select name="creatorId" required defaultValue="" className={inputClass}>
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
        <Field label="Título">
          <input name="title" required className={inputClass} placeholder="Contrato management 2026" />
        </Field>
        <Field label="Estado">
          <select name="status" defaultValue="activo" className={inputClass}>
            {CONTRACT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="URL archivo (PDF / Drive / Supabase)">
          <input name="fileUrl" className={inputClass} placeholder="https://…" />
        </Field>
        <Field label="Inicio">
          <input name="startDate" type="date" className={inputClass} />
        </Field>
        <Field label="Fin">
          <input name="endDate" type="date" className={inputClass} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Notas">
            <textarea name="notes" rows={3} className={inputClass} />
          </Field>
        </div>
        {error && <p className="text-sm text-danger md:col-span-2">{error}</p>}
        <div className="md:col-span-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Guardando…" : "Guardar contrato"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
