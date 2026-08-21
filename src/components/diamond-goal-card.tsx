"use client";

import { useMemo, useState } from "react";
import {
  Eye,
  Gem,
  Pencil,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";
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

const MANAGER_TONES = [
  { bar: "bg-cyan", chip: "bg-cyan/15 text-cyan", avatar: "bg-cyan/20 text-cyan ring-cyan/30" },
  { bar: "bg-accent", chip: "bg-accent/15 text-accent", avatar: "bg-accent/20 text-accent ring-accent/30" },
  { bar: "bg-warning", chip: "bg-warning/15 text-warning", avatar: "bg-warning/20 text-warning ring-warning/30" },
  { bar: "bg-success", chip: "bg-success/15 text-success", avatar: "bg-success/20 text-success ring-success/30" },
  { bar: "bg-[#a78bfa]", chip: "bg-[#a78bfa]/15 text-[#c4b5fd]", avatar: "bg-[#a78bfa]/20 text-[#c4b5fd] ring-[#a78bfa]/30" },
] as const;

function parseDiamondInput(raw: string) {
  const n = Number(String(raw).replace(/[^\d]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.min(1_000_000_000, Math.max(0, Math.floor(n)));
}

function pctOf(current: number, target: number) {
  if (target <= 0) return 0;
  return Math.min(100, (current / target) * 100);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function Ring({
  value,
  size = 168,
  tone = "cyan",
  label,
}: {
  value: number;
  size?: number;
  tone?: "cyan" | "accent" | "success";
  label?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const stroke =
    tone === "success" ? "#3dd68c" : tone === "accent" ? "#fe2c55" : "#25f4ee";
  const glow =
    tone === "success"
      ? "0 0 28px rgba(61,214,140,0.28)"
      : tone === "accent"
        ? "0 0 28px rgba(254,44,85,0.28)"
        : "0 0 28px rgba(37,244,238,0.28)";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 128 128"
        className="h-full w-full -rotate-90"
        style={{ filter: `drop-shadow(${glow})` }}
      >
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="10"
        />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-[family-name:var(--font-syne)] text-3xl font-bold tracking-tight">
          {pct.toFixed(1)}%
        </p>
        {label && (
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-text-muted">
            {label}
          </p>
        )}
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "cyan" | "accent" | "success" | "warning";
}) {
  const tones = {
    cyan: "border-cyan/20 bg-cyan/8",
    accent: "border-accent/20 bg-accent/8",
    success: "border-success/20 bg-success/8",
    warning: "border-warning/20 bg-warning/8",
  };
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3",
        tone ? tones[tone] : "border-border-soft bg-bg/60"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
        {label}
      </p>
      <p className="mt-1 font-[family-name:var(--font-syne)] text-xl font-bold tabular-nums tracking-tight sm:text-2xl">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-text-muted">{hint}</p>}
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
  const reached = agencyPct >= 100;

  const managers = useMemo(() => goal.managers ?? [], [goal.managers]);
  const ranked = useMemo(
    () =>
      [...managers].sort((a, b) => b.diamonds - a.diamonds),
    [managers]
  );

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
    <section className="relative overflow-hidden rounded-2xl border border-border-soft bg-bg-panel">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background: reached
            ? "radial-gradient(ellipse 70% 80% at 12% 20%, rgba(61,214,140,0.16), transparent 55%)"
            : "radial-gradient(ellipse 70% 80% at 8% 0%, rgba(37,244,238,0.14), transparent 52%), radial-gradient(ellipse 50% 60% at 100% 100%, rgba(254,44,85,0.10), transparent 50%)",
        }}
      />
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan/5 blur-3xl" />

      <div className="relative p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan/25 bg-cyan/10 text-cyan shadow-[0_0_24px_rgba(37,244,238,0.18)]">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-[family-name:var(--font-syne)] text-xl font-bold tracking-tight">
                  Meta de diamantes
                </h2>
                {reached && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                    <Sparkles className="h-3 w-3" /> Meta alcanzada
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-text-muted">
                {periodLabel} · progreso de la agencia
              </p>
            </div>
          </div>
          {goal.canEdit && !editing && (
            <Button
              type="button"
              variant="secondary"
              className="border-cyan/20 bg-bg/40 hover:border-cyan/40"
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
            className="mb-5 grid gap-3 rounded-2xl border border-cyan/20 bg-bg/50 p-4 sm:grid-cols-[1fr_auto] sm:items-end"
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
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan/10 text-cyan">
              <Gem className="h-6 w-6" />
            </div>
            <p className="font-[family-name:var(--font-syne)] text-lg font-semibold">
              Sin meta este mes
            </p>
            <p className="mt-1 max-w-md text-sm text-text-muted">
              {goal.canEdit
                ? "Define una meta para que los managers vean el avance en tiempo real y cuánto aporta cada equipo."
                : "El admin aún no definió una meta de diamantes para este mes."}
            </p>
          </div>
        ) : (
          <>
            <div
              className={cn(
                "grid items-center gap-6",
                showTeam ? "lg:grid-cols-2" : "lg:grid-cols-[auto_1fr]"
              )}
            >
              <div className="flex justify-center lg:justify-start">
                <Ring
                  value={agencyPct}
                  tone={reached ? "success" : "cyan"}
                  label="agencia"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <StatChip
                  label="Llevamos"
                  value={formatNumber(goal.agencyTotal)}
                  hint="diamantes del mes"
                  tone="cyan"
                />
                <StatChip
                  label="Meta"
                  value={formatNumber(goal.target)}
                  hint={periodLabel}
                />
                <StatChip
                  label={over > 0 ? "Sobre la meta" : "Faltan"}
                  value={formatNumber(over > 0 ? over : remaining)}
                  hint={over > 0 ? "ya rebasaron el objetivo" : "para cerrar el mes"}
                  tone={over > 0 ? "success" : "warning"}
                />
              </div>
            </div>

            {showTeam && (
              <div className="mt-5 overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/10 via-bg/40 to-transparent p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                        Aporte del equipo
                      </p>
                      <p className="mt-1 font-[family-name:var(--font-syne)] text-3xl font-bold tabular-nums tracking-tight">
                        {formatNumber(goal.myTotal)}
                      </p>
                      <p className="mt-1 text-sm text-text-muted">
                        {myPctOfGoal.toFixed(1)}% de la meta · {myPctOfTotal.toFixed(1)}%
                        del total actual
                      </p>
                    </div>
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
                      <span>Tu equipo vs meta</span>
                      <span className="font-semibold text-accent">
                        {myPctOfGoal.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-bg-hover">
                      <div
                        className="h-full rounded-full bg-accent shadow-[0_0_16px_rgba(254,44,85,0.45)] transition-[width] duration-700"
                        style={{ width: `${myPctOfGoal}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!showTeam && ranked.length > 0 && (
              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    <Trophy className="h-3.5 w-3.5 text-warning" />
                    Aporte por manager
                  </p>
                  <p className="text-xs text-text-muted">
                    Clic para ver su vista
                  </p>
                </div>

                <div className="mb-4 h-3.5 overflow-hidden rounded-full bg-bg-hover ring-1 ring-white/5">
                  <div className="flex h-full w-full">
                    {ranked.map((m, i) => {
                      const share = pctOf(m.diamonds, goal.target);
                      if (share <= 0) return null;
                      const tone = MANAGER_TONES[i % MANAGER_TONES.length];
                      return (
                        <div
                          key={m.id}
                          className={cn("h-full first:rounded-l-full last:rounded-r-full", tone.bar)}
                          style={{ width: `${share}%` }}
                          title={`${m.name}: ${formatNumber(m.diamonds)}`}
                        />
                      );
                    })}
                  </div>
                </div>

                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {ranked.map((m, i) => {
                    const pct = pctOf(m.diamonds, goal.target);
                    const shareOfTotal =
                      goal.agencyTotal > 0
                        ? Math.min(100, (m.diamonds / goal.agencyTotal) * 100)
                        : 0;
                    const canOpen = m.id !== "unassigned";
                    const tone = MANAGER_TONES[i % MANAGER_TONES.length];
                    const rank = i + 1;

                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          disabled={!canOpen}
                          onClick={() => canOpen && setViewAs(m.id, m.name)}
                          className={cn(
                            "group relative w-full overflow-hidden rounded-2xl border border-border-soft bg-bg/55 p-4 text-left transition",
                            canOpen &&
                              "hover:border-cyan/35 hover:bg-bg-hover/60 hover:shadow-[0_0_0_1px_rgba(37,244,238,0.12)]"
                          )}
                        >
                          <div className="mb-3 flex items-center gap-3">
                            <div className="relative">
                              <div
                                className={cn(
                                  "flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold ring-1",
                                  tone.avatar
                                )}
                              >
                                {initials(m.name)}
                              </div>
                              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border-soft bg-bg-panel text-[10px] font-bold text-text-muted">
                                {rank}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold">{m.name}</p>
                              <p className="text-xs text-text-muted">
                                {shareOfTotal.toFixed(1)}% del total actual
                              </p>
                            </div>
                            {canOpen && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-border-soft bg-bg-panel px-2 py-1 text-[10px] uppercase tracking-wide text-text-muted opacity-0 transition group-hover:opacity-100">
                                <Eye className="h-3 w-3" /> Ver
                              </span>
                            )}
                          </div>
                          <p className="font-[family-name:var(--font-syne)] text-2xl font-bold tabular-nums tracking-tight">
                            {formatNumber(m.diamonds)}
                          </p>
                          <div className="mt-2 flex items-center justify-between text-xs">
                            <span className={cn("rounded-full px-2 py-0.5 font-semibold", tone.chip)}>
                              {pct.toFixed(1)}% de la meta
                            </span>
                            {rank === 1 && m.diamonds > 0 && (
                              <span className="inline-flex items-center gap-1 text-warning">
                                <TrendingUp className="h-3 w-3" /> Top
                              </span>
                            )}
                          </div>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-hover">
                            <div
                              className={cn(
                                "h-full rounded-full transition-[width] duration-700",
                                tone.bar
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
