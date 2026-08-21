"use client";

import { useMemo, useState } from "react";
import { Gem, Pencil, Target, Users } from "lucide-react";
import { Button, Field, Panel, inputClass } from "@/components/ui";
import { formatNumber, cn } from "@/lib/utils";
import { useViewAs } from "@/components/view-as";

export type DiamondGoal = {
  target: number;
  agencyTotal: number;
  myTotal: number;
  canEdit: boolean;
  isManagerView?: boolean;
  updatedAt: string | null;
  managers: { id: string; name: string; diamonds: number }[];
};

function parseDiamondInput(raw: string) {
  const n = Number(String(raw).replace(/[^\d]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.min(1_000_000_000, Math.max(0, Math.floor(n)));
}

function pctOf(current: number, target: number) {
  if (target <= 0) return 0;
  return Math.min(100, (current / target) * 100);
}

function ProgressBar({
  value,
  tone,
}: {
  value: number;
  tone: "accent" | "cyan" | "success";
}) {
  const tones = {
    accent: "bg-accent",
    cyan: "bg-cyan",
    success: "bg-success",
  };
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-bg-hover">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          tones[tone]
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function DiamondGoalCard({
  goal,
  periodLabel,
  period,
  onSaved,
}: {
  goal: DiamondGoal;
  periodLabel: string;
  period: string;
  onSaved: () => void | Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    goal.target > 0 ? formatNumber(goal.target) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setViewAs } = useViewAs();
  const showTeam = Boolean(goal.isManagerView);

  const parsedTarget = parseDiamondInput(draft);
  const agencyPct = pctOf(goal.agencyTotal, goal.target);
  const myPctOfGoal = pctOf(goal.myTotal, goal.target);
  const myPctOfTotal =
    goal.agencyTotal > 0
      ? Math.min(100, (goal.myTotal / goal.agencyTotal) * 100)
      : 0;
  const remaining = Math.max(0, goal.target - goal.agencyTotal);
  const over = Math.max(0, goal.agencyTotal - goal.target);

  const topManagers = useMemo(() => goal.managers ?? [], [goal.managers]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/panel/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, target: parsedTarget }),
      });
      if (!res.ok) {
        setError("No se pudo guardar la meta.");
        return;
      }
      setEditing(false);
      await onSaved();
    } catch {
      setError("No se pudo guardar la meta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel className="mt-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg border border-border-soft bg-bg p-2 text-cyan">
            <Target className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
              Meta de diamantes
            </h2>
            <p className="text-sm text-text-muted">
              {periodLabel} · progreso de la agencia
            </p>
          </div>
        </div>
        {goal.canEdit && !editing && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setDraft(goal.target > 0 ? formatNumber(goal.target) : "");
              setError(null);
              setEditing(true);
            }}
          >
            <Pencil className="h-4 w-4" />
            {goal.target > 0 ? "Editar meta" : "Definir meta"}
          </Button>
        )}
      </div>

      {editing && (
        <form
          className="mb-5 grid gap-3 rounded-xl border border-border-soft bg-bg p-4 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Meta mensual (diamantes)">
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="3,000,000"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <p className="mt-1 text-xs text-text-muted">
              {parsedTarget > 0
                ? `Se guardará ${formatNumber(parsedTarget)} diamantes`
                : "Pon 0 para quitar la meta de este mes"}
            </p>
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
          {error && (
            <p className="text-sm text-danger sm:col-span-2">{error}</p>
          )}
        </form>
      )}

      {goal.target <= 0 ? (
        <p className="text-sm text-text-muted">
          {goal.canEdit
            ? "Aún no hay meta este mes. Defínela para que los managers vean el avance en tiempo real."
            : "El admin aún no definió una meta de diamantes para este mes."}
        </p>
      ) : (
        <div className={cn("grid gap-4", showTeam && "lg:grid-cols-2")}>
          <div className="rounded-xl border border-border-soft bg-bg p-4">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 text-text-muted">
                <Gem className="h-3.5 w-3.5 text-cyan" />
                Total agencia
              </span>
              <span className="font-[family-name:var(--font-syne)] text-sm font-bold">
                {agencyPct.toFixed(1)}%
              </span>
            </div>
            <p className="mb-2 font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight">
              {formatNumber(goal.agencyTotal)}
              <span className="text-sm font-normal text-text-muted">
                {" "}
                / {formatNumber(goal.target)}
              </span>
            </p>
            <ProgressBar
              value={agencyPct}
              tone={agencyPct >= 100 ? "success" : "cyan"}
            />
            <p className="mt-2 text-xs text-text-muted">
              {over > 0
                ? `${formatNumber(over)} diamantes sobre la meta`
                : `Faltan ${formatNumber(remaining)} diamantes`}
            </p>
          </div>

          {showTeam && (
            <div className="rounded-xl border border-border-soft bg-bg p-4">
              <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 text-text-muted">
                  <Users className="h-3.5 w-3.5 text-accent" />
                  Aporte del equipo
                </span>
                <span className="font-[family-name:var(--font-syne)] text-sm font-bold">
                  {myPctOfGoal.toFixed(1)}%
                </span>
              </div>
              <p className="mb-2 font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight">
                {formatNumber(goal.myTotal)}
                <span className="text-sm font-normal text-text-muted">
                  {" "}
                  de la meta
                </span>
              </p>
              <ProgressBar value={myPctOfGoal} tone="accent" />
              <p className="mt-2 text-xs text-text-muted">
                {myPctOfTotal.toFixed(1)}% del total actual · diamantes de tus
                creadores
              </p>
            </div>
          )}
        </div>
      )}

      {goal.canEdit && !showTeam && goal.target > 0 && topManagers.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Aporte por manager · clic para ver su vista
          </p>
          <ul className="space-y-2">
            {topManagers.map((m) => {
              const pct = pctOf(m.diamonds, goal.target);
              const canOpen = m.id !== "unassigned";
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={!canOpen}
                    onClick={() => canOpen && setViewAs(m.id, m.name)}
                    className="w-full text-left disabled:cursor-default"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium hover:text-accent">
                        {m.name}
                      </span>
                      <span className="tabular-nums text-text-muted">
                        {formatNumber(m.diamonds)} · {pct.toFixed(1)}%
                      </span>
                    </div>
                    <ProgressBar value={pct} tone="accent" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}
