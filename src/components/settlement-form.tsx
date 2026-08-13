"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { upsertSettlement } from "@/lib/actions";
import { Button, Field, inputClass, Panel } from "@/components/ui";
import {
  CreatorSuggestInput,
  type SuggestCreator,
} from "@/components/creator-suggest";
import { calcularBonoTotal } from "@/lib/bonos";
import { PANEL } from "@/lib/swr";
import { currentMonth, formatCurrency } from "@/lib/utils";

type CreatorOpt = {
  id: string;
  name: string;
  tiktokUser?: string | null;
  diamonds?: number;
};

type Existing = {
  creatorId?: string;
  creatorName: string;
  diamonds: number;
  hours?: number;
  days?: number;
  estimatedPay: number;
  agencyAmount: number;
  creatorAmount?: number;
  status?: string;
  notes?: string | null;
  month: string;
};

export function SettlementForm({
  creators,
  onSaved,
  defaultMonth,
  existing = [],
}: {
  creators: CreatorOpt[];
  onSaved?: () => void;
  defaultMonth?: string;
  existing?: Existing[];
}) {
  const monthValue = defaultMonth || currentMonth();
  const [creatorId, setCreatorId] = useState("");
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState(monthValue);
  const [diamonds, setDiamonds] = useState(0);
  const [hours, setHours] = useState(0);
  const [days, setDays] = useState(0);
  const [bono, setBono] = useState(0);
  const [agencyGain, setAgencyGain] = useState(0);
  const [bonoManual, setBonoManual] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const skipHydrate = useRef(false);

  const autoBono = useMemo(
    () => calcularBonoTotal(days, hours, diamonds),
    [days, hours, diamonds]
  );

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

  useEffect(() => {
    setMonth(monthValue);
  }, [monthValue]);

  // Bono automático solo si el usuario no lo editó a mano
  useEffect(() => {
    if (bonoManual || skipHydrate.current) return;
    setBono(autoBono);
  }, [autoBono, bonoManual]);

  useEffect(() => {
    if (!creatorId || !month) return;
    const creator = creators.find((c) => c.id === creatorId);
    const found = existing.find(
      (s) =>
        s.month === month &&
        (s.creatorId === creatorId ||
          (creator && s.creatorName === creator.name))
    );
    skipHydrate.current = true;
    if (found) {
      setDiamonds(found.diamonds);
      setHours(found.hours ?? 0);
      setDays(found.days ?? 0);
      setBono(found.estimatedPay || found.creatorAmount || 0);
      setAgencyGain(found.agencyAmount);
      setBonoManual(true);
      setMsg("Registro existente · edítalo y pulsa Agregar para actualizar");
    } else {
      setDiamonds(0);
      setHours(0);
      setDays(0);
      setBono(0);
      setAgencyGain(0);
      setBonoManual(false);
      setMsg("");
    }
    queueMicrotask(() => {
      skipHydrate.current = false;
    });
  }, [creatorId, month, existing, creators]);

  // Si escribe el @ exacto, vincular creatorId
  useEffect(() => {
    const nick = query.replace(/^@/, "").trim().toLowerCase();
    if (!nick || creatorId) return;
    const match = creators.find((c) => {
      const t = (c.tiktokUser || "").replace(/^@/, "").trim().toLowerCase();
      return t === nick || c.name.toLowerCase() === nick;
    });
    if (match) setCreatorId(match.id);
  }, [query, creators, creatorId]);

  function resolveCreator(): CreatorOpt | null {
    if (creatorId) {
      return creators.find((c) => c.id === creatorId) ?? null;
    }
    const nick = query.replace(/^@/, "").trim().toLowerCase();
    if (!nick) return null;
    return (
      creators.find((c) => {
        const t = (c.tiktokUser || "").replace(/^@/, "").trim().toLowerCase();
        return t === nick || c.name.toLowerCase() === nick;
      }) ?? null
    );
  }

  function pickCreator(c: SuggestCreator) {
    if (c.id) setCreatorId(c.id);
  }

  function resetForm() {
    setCreatorId("");
    setQuery("");
    setDiamonds(0);
    setHours(0);
    setDays(0);
    setBono(0);
    setAgencyGain(0);
    setBonoManual(false);
  }

  function useAutoBono() {
    setBonoManual(false);
    setBono(autoBono);
  }

  async function saveToBonosTable(nick: string) {
    const res = await fetch(PANEL.bonos, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period: month,
        nombre: nick,
        diamantes: diamonds,
        horas: hours,
        dias: days,
        bono: Number(bono) || 0,
        gananciaAgencia: Number(agencyGain) || 0,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(
        (json as { error?: string }).error || "No se pudo guardar en Bonos"
      );
    }
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const creator = resolveCreator();
    if (!creator) {
      setError("Elige un usuario de la lista (o escribe su @ exacto)");
      return;
    }
    const nick = (creator.tiktokUser || creator.name || query)
      .replace(/^@/, "")
      .trim();
    if (!nick) {
      setError("Usuario inválido");
      return;
    }

    setBusy(true);
    setError("");
    setMsg("");

    try {
      const fd = new FormData();
      fd.set("creatorId", creator.id);
      fd.set("month", month);
      fd.set("diamonds", String(diamonds));
      fd.set("hours", String(hours));
      fd.set("days", String(days));
      fd.set("bono", String(bono));
      fd.set("agencyAmount", String(agencyGain));
      const res = await upsertSettlement(fd);
      if (res.error) {
        setError(res.error);
        return;
      }

      await saveToBonosTable(nick);

      setMsg(
        bonoManual
          ? "Agregado a liquidaciones y Bonos (bono manual)"
          : "Agregado a liquidaciones y Bonos"
      );
      resetForm();
      onSaved?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Guardado en liquidaciones, pero falló Bonos"
      );
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(creatorId || query.trim()) && !busy;

  return (
    <Panel className="overflow-visible">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
          Registrar / actualizar liquidación
        </h2>
        <p className="text-xs text-text-muted">Periodo {month}</p>
      </div>
      <form
        onSubmit={(e) => void onAdd(e)}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="relative z-30 sm:col-span-2 lg:col-span-1">
          <CreatorSuggestInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setCreatorId("");
            }}
            onPick={pickCreator}
            creators={suggestList}
            required
          />
        </div>
        <Field label="Diamantes">
          <input
            type="number"
            min={0}
            value={diamonds}
            onChange={(e) => setDiamonds(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
        <Field label="Días">
          <input
            type="number"
            min={0}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
        <Field label="Horas">
          <input
            type="number"
            min={0}
            step={0.1}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
        <Field
          label={
            bonoManual
              ? "Bono (USD) · manual"
              : "Bono (USD) · automático"
          }
        >
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step={0.01}
              value={bono}
              onChange={(e) => {
                setBonoManual(true);
                setBono(Number(e.target.value) || 0);
              }}
              className={inputClass}
            />
            {bonoManual && (
              <Button
                type="button"
                variant="secondary"
                title={`Volver al bono automático (${autoBono})`}
                onClick={useAutoBono}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </Field>
        <Field label="Ganancia por creador (agencia)">
          <input
            type="number"
            min={0}
            step={0.01}
            value={agencyGain}
            onChange={(e) => setAgencyGain(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
          <div className="flex-1 rounded-xl border border-border-soft bg-bg px-4 py-3 text-sm text-text-muted">
            Bono:{" "}
            <strong className="text-success">{formatCurrency(bono)}</strong>
            {bonoManual && autoBono !== bono && (
              <span className="ml-1 text-[11px]">
                (auto sería {formatCurrency(autoBono)})
              </span>
            )}
            {" · "}
            Agencia:{" "}
            <strong className="text-accent">{formatCurrency(agencyGain)}</strong>
          </div>
          <Button type="submit" disabled={!canSubmit}>
            <Plus className="h-4 w-4" />
            {busy ? "Guardando…" : "Agregar"}
          </Button>
        </div>
        {msg && (
          <p className="text-xs text-text-muted sm:col-span-2 lg:col-span-3">
            {msg}
          </p>
        )}
        {error && (
          <p className="text-sm text-danger sm:col-span-2 lg:col-span-3">
            {error}
          </p>
        )}
      </form>
    </Panel>
  );
}
