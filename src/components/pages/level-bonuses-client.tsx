"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Gift, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, Field, Panel, inputClass } from "@/components/ui";
import { MESES_NOMBRE, periodKey } from "@/lib/bonos";
import {
  DIAMOND_TIERS,
  HOURS_TIERS,
  INCORP2_TIERS,
  KIND_LABEL,
  LEVELS,
  LEVEL_LABEL,
  awardsFor,
  type BonusKind,
  type Level,
} from "@/lib/level-bonuses";
import { fmtHours } from "@/lib/goal-levels";
import { openInvoice, type InvoiceData } from "@/lib/bonus-invoice";
import { cn, formatNumber } from "@/lib/utils";

const API = "/api/panel/level-bonuses";

type AwardState = { id: string; status: string; scheduledFor: string | null; method: string | null; paidAt: string | null; note: string | null; saved: true } | null;
type Bonus = { kind: BonusKind; tier: string; coins: number; usd: number | null; advisory: boolean; outdated: boolean; award: AwardState };
type Item = {
  username: string;
  creatorId: string | null;
  creatorName: string | null;
  level: Level;
  levelAuto: Level;
  manual: boolean;
  manualFrom: string | null;
  metrics: { diamonds: number; days: number; hours: number };
  payout: string;
  hint: string | null;
  welcome: string | null;
  bonuses: Bonus[];
};
type Money = { coins: number; usd: number };
type PendingRow = { id: string; period: string; username: string; kind: BonusKind; tier: string; level: Level; coins: number; usd: number | null; advisory: boolean; status: string; note: string | null };
type Payload = {
  period: string;
  items: Item[];
  byLevel: Record<Level, number>;
  totals: { toPay: Money; saved: number; paid: Money; pendingBefore: Money };
  pending: PendingRow[];
};

const LEVEL_STYLE: Record<Level, string> = {
  E: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  D: "border-teal-400/40 bg-teal-500/15 text-teal-200",
  C: "border-sky-400/40 bg-sky-500/15 text-sky-200",
  B: "border-violet-400/40 bg-violet-500/15 text-violet-200",
  A: "border-amber-400/50 bg-amber-500/15 text-amber-200",
};

const STATUS_LABEL: Record<string, string> = {
  calculado: "Calculado",
  programado: "Programado",
  pagado: "Pagado",
  acumulado: "Acumulado al mes siguiente",
};
const STATUS_STYLE: Record<string, string> = {
  calculado: "border-border text-text-muted",
  programado: "border-sky-400/40 bg-sky-500/10 text-sky-200",
  pagado: "border-success/40 bg-success/10 text-success",
  acumulado: "border-amber-400/40 bg-amber-500/10 text-amber-200",
};
const METHOD_LABEL: Record<string, string> = {
  batalla: "Batalla agendada",
  live_normal: "LIVE normal",
  tiktok_shop: "TikTok Shop",
  transferencia: "Transferencia bancaria",
};

const money = (m: Money) => `${formatNumber(m.coins)} monedas${m.usd ? ` · ${formatNumber(Math.round(m.usd))} USD` : ""}`;

function reward(b: { coins: number; usd: number | null; advisory: boolean }, level: Level) {
  if (b.advisory) return "Asesoría personalizada y estrategia";
  if (level === "A" && b.usd != null) return `${b.usd} USD`;
  if (b.usd != null) return `${b.usd} USD (${formatNumber(b.coins)} monedas)`;
  return `${formatNumber(b.coins)} monedas`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-bg-elevated/70 p-3.5">
      <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-syne)] text-lg font-bold leading-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-text-muted">{sub}</p>}
    </div>
  );
}

const TIERS_BY_KIND: Record<BonusKind, { name: string; coins: number; usd: number | null; advisory?: boolean }[]> = {
  horas: HOURS_TIERS,
  diamantes: DIAMOND_TIERS,
  incorporacion2: INCORP2_TIERS,
};

/** Edita categoría, monto y nota de un bono guardado, o lo elimina. */
function BonusEditor({ bonus, level, onSave, onDelete }: { bonus: Bonus; level: Level; onSave: (p: { tier: string; coins: number; usd: number | null; advisory: boolean; note: string | null }) => Promise<void>; onDelete: () => Promise<void> }) {
  const award = bonus.award!;
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState(bonus.tier);
  const [coins, setCoins] = useState(String(bonus.coins));
  const [usd, setUsd] = useState(bonus.usd == null ? "" : String(bonus.usd));
  const [advisory, setAdvisory] = useState(bonus.advisory);
  const [note, setNote] = useState(award.note ?? "");
  const [saving, setSaving] = useState(false);
  const paid = award.status === "pagado";

  function pickTier(name: string) {
    setTier(name);
    const t = TIERS_BY_KIND[bonus.kind].find((x) => x.name === name);
    if (!t) return;
    setCoins(String(t.coins));
    setUsd(level === "B" || level === "A" ? (t.usd == null ? "" : String(t.usd)) : "");
    setAdvisory(!!t.advisory);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-[11px] font-semibold text-accent hover:underline">
        Editar bono
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
      {paid && <p className="text-[11px] text-amber-300">Bono pagado: solo puedes editar la nota. Para cambiar el monto o eliminarlo, regrésalo antes a otro estado.</p>}
      <div className="grid gap-2 sm:grid-cols-4">
        <Field label="Categoría">
          <select value={tier} onChange={(e) => pickTier(e.target.value)} disabled={paid} className={inputClass}>
            {!TIERS_BY_KIND[bonus.kind].some((t) => t.name === tier) && <option value={tier}>{tier}</option>}
            {TIERS_BY_KIND[bonus.kind].map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Monedas">
          <input inputMode="numeric" value={coins} onChange={(e) => setCoins(e.target.value)} disabled={paid || advisory} className={inputClass} />
        </Field>
        <Field label="USD (opcional)">
          <input inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} disabled={paid || advisory} className={inputClass} />
        </Field>
        <Field label="Nota">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} maxLength={500} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={saving}
          onClick={() => {
            void (async () => {
              setSaving(true);
              const c = Math.max(0, Math.round(Number(coins.replace(",", ".")) || 0));
              const u = usd.trim() === "" ? null : Number(usd.replace(",", "."));
              await onSave({ tier, coins: advisory ? 0 : c, usd: advisory || u == null || Number.isNaN(u) ? null : u, advisory, note: note.trim() || null });
              setSaving(false);
              setOpen(false);
            })();
          }}
        >
          Guardar cambios
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        {!paid && (
          <Button
            variant="secondary"
            onClick={() => {
              if (window.confirm("¿Eliminar este bono? Esta acción no se puede deshacer.")) void onDelete();
            }}
          >
            <Trash2 className="h-4 w-4" /> Eliminar
          </Button>
        )}
      </div>
    </div>
  );
}

type ManualRow = { period: string; diamonds: string; days: string; hours: string };

/** Calcula a mano los bonos adeudados de un creador en uno o varios meses pasados. */
function ManualPanel({ items, defaultPeriod, initialUser, onDone }: { items: Item[]; defaultPeriod: string; initialUser: string; onDone: (msg: string) => void }) {
  const blank = (): ManualRow => ({ period: defaultPeriod, diamonds: "", days: "", hours: "" });
  const [username, setUsername] = useState(initialUser);
  const [joinDate, setJoinDate] = useState("");
  const [lvl, setLvl] = useState<Level>("E");
  const [rows, setRows] = useState<ManualRow[]>([blank()]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const user = username.trim().replace(/^@/, "").toLowerCase();
  const known = items.find((i) => i.username.toLowerCase() === user);
  const patch = (idx: number, p: Partial<ManualRow>) => setRows((r) => r.map((x, i) => (i === idx ? { ...x, ...p } : x)));
  const num = (v: string) => Number(v.replace(",", ".")) || 0;
  const preview = (r: ManualRow) => awardsFor(lvl, { diamonds: Math.round(num(r.diamonds)), days: Math.round(num(r.days)), hours: num(r.hours) });
  const total = rows.reduce(
    (a, r) => {
      for (const b of preview(r)) {
        a.coins += b.coins;
        a.usd += b.usd ?? 0;
      }
      return a;
    },
    { coins: 0, usd: 0 }
  );

  async function save() {
    setErr("");
    if (!user) return setErr("Escribe el usuario del creador.");
    setSaving(true);
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-skip-view-as": "1" },
      body: JSON.stringify({
        action: "manual",
        username: user,
        level: lvl,
        joinDate: joinDate || null,
        months: rows.map((r) => ({ period: r.period, diamonds: Math.round(num(r.diamonds)), days: Math.round(num(r.days)), hours: num(r.hours) })),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setErr(j.error ?? "No se pudo guardar.");
    onDone(
      `@${user} · Nivel ${lvl}: ${j.created} bonos nuevos, ${j.updated} actualizados${j.locked ? `, ${j.locked} ya pagados sin cambios` : ""}${j.none ? `, ${j.none} mes(es) sin bono` : ""}.${
        j.joinUpdated ? " Fecha de ingreso actualizada." : joinDate && !j.creatorLinked ? " La fecha de ingreso no se guardó: el usuario no está vinculado a un creador." : ""
      }`
    );
    setRows([blank()]);
  }

  const periods = Array.from({ length: 36 }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    return periodKey(d.getFullYear(), d.getMonth() + 1);
  });

  return (
    <Panel className="mb-4 space-y-3">
      <p className="text-sm font-semibold">Bono manual / adeudos</p>
      <p className="text-xs text-text-muted">
        Para creadores a los que se les deben bonos de meses anteriores. Indica su fecha de ingreso, la liga y las métricas de cada mes adeudado; los bonos quedan
        guardados como pendientes de pago y la liga queda fijada desde el primer mes.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Usuario">
          <input list="bonus-users" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} placeholder="@usuario" />
          <datalist id="bonus-users">
            {items.map((i) => (
              <option key={i.username} value={i.username}>
                {i.creatorName ?? ""}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Fecha de ingreso (opcional)">
          <input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Liga">
          <select value={lvl} onChange={(e) => setLvl(e.target.value as Level)} className={inputClass}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                Nivel {l} · {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {known && <p className="text-[11px] text-text-muted">Ahora está en Nivel {known.level} este mes.</p>}

      <div className="space-y-2">
        {rows.map((r, idx) => {
          const got = preview(r);
          return (
            <div key={idx} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <div className="grid items-end gap-2 sm:grid-cols-[1.4fr_1fr_0.7fr_0.7fr_auto]">
                <Field label="Mes adeudado">
                  <select value={r.period} onChange={(e) => patch(idx, { period: e.target.value })} className={inputClass}>
                    {periods.map((p) => (
                      <option key={p} value={p}>
                        {MESES_NOMBRE[Number(p.slice(5))]} {p.slice(0, 4)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Diamantes">
                  <input inputMode="numeric" value={r.diamonds} onChange={(e) => patch(idx, { diamonds: e.target.value })} className={inputClass} placeholder="0" />
                </Field>
                <Field label="Días">
                  <input inputMode="numeric" value={r.days} onChange={(e) => patch(idx, { days: e.target.value })} className={inputClass} placeholder="0" />
                </Field>
                <Field label="Horas">
                  <input inputMode="decimal" value={r.hours} onChange={(e) => patch(idx, { hours: e.target.value })} className={inputClass} placeholder="0" />
                </Field>
                <Button variant="secondary" disabled={rows.length === 1} onClick={() => setRows((x) => x.filter((_, i) => i !== idx))} aria-label="Quitar mes">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-1.5 text-xs">
                {got.length === 0 ? (
                  <span className="text-text-muted">Con esas métricas no alcanza ningún bono de Nivel {lvl}.</span>
                ) : (
                  got.map((b) => (
                    <span key={b.kind} className="mr-3">
                      <span className="text-text-muted">
                        {KIND_LABEL[b.kind]} · {b.tier}:
                      </span>{" "}
                      <b className="text-accent">{reward(b, lvl)}</b>
                    </span>
                  ))
                )}
              </p>
            </div>
          );
        })}
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={rows.length >= 24} onClick={() => setRows((r) => [...r, blank()])}>
          <Plus className="h-4 w-4" /> Agregar otro mes
        </Button>
        <Button disabled={saving} onClick={() => void save()}>
          <Calculator className="h-4 w-4" /> {saving ? "Guardando…" : "Calcular y guardar adeudo"}
        </Button>
        <span className="text-xs text-text-muted">Total: {money(total)}</span>
      </div>
    </Panel>
  );
}

export default function LevelBonusesClient() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [level, setLevel] = useState<Level | "todos">("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [q, setQ] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manualUser, setManualUser] = useState("");
  const [manualKey, setManualKey] = useState(0);

  const period = periodKey(year, month);
  const thisYear = now.getFullYear();
  const years = useMemo(() => Array.from({ length: 7 }, (_, i) => thisYear - 4 + i), [thisYear]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}?period=${period}`, { cache: "no-store", headers: { "x-skip-view-as": "1" } });
      if (!res.ok) throw new Error();
      setData((await res.json()) as Payload);
      setError(false);
    } catch {
      setError(true);
    }
  }, [period]);

  useEffect(() => {
    setData(null);
    setLevel("todos");
    setStatusFilter("todos");
    void load();
  }, [load]);

  async function call(method: string, body: unknown) {
    setMsg("");
    const res = await fetch(API, { method, headers: { "Content-Type": "application/json", "x-skip-view-as": "1" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(json.error ?? "No se pudo guardar.");
      return null;
    }
    return json;
  }

  async function calculate() {
    setBusy(true);
    const r = await call("POST", { action: "calculate", period });
    if (r) {
      setMsg(
        `Mes calculado: ${r.created} premios nuevos, ${r.updated} actualizados${r.locked ? `, ${r.locked} ya pagados sin cambios` : ""}${r.removed ? `, ${r.removed} que ya no corresponden` : ""}.`
      );
      await load();
    }
    setBusy(false);
  }

  /** Cambia el estado/fecha/medio de un premio y lo refleja al instante. */
  async function setAward(id: string, patch: { status?: string; scheduledFor?: string | null; method?: string | null }) {
    setData((d) =>
      d && {
        ...d,
        items: d.items.map((i) => ({
          ...i,
          bonuses: i.bonuses.map((b) => (b.award?.id === id ? { ...b, award: { ...b.award, ...patch } as NonNullable<AwardState> } : b)),
        })),
      }
    );
    const r = await call("PATCH", { id, ...patch });
    if (!r) await load(); // se revierte
  }

  /** Fija el nivel a mano desde este mes (o vuelve al automático) y recalcula los premios de esa persona. */
  async function changeLevel(username: string, value: string) {
    const r = await call("POST", { action: "level", period, username, level: value === "auto" ? null : value });
    if (r) {
      setMsg(value === "auto" ? `@${username} vuelve al nivel automático.` : `@${username} queda en Nivel ${value} desde ${MESES_NOMBRE[month]} ${year}.`);
      await load();
    }
  }

  /** Abre la factura del creador con sus bonos pendientes de pago (y su motivo). */
  async function invoice(username: string) {
    setMsg("");
    try {
      const res = await fetch(`${API}?invoice=${encodeURIComponent(username)}`, { cache: "no-store", headers: { "x-skip-view-as": "1" } });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as InvoiceData;
      const pendingOnly = d.awards.some((a) => a.status !== "pagado");
      if (!openInvoice(d, { includePaid: !pendingOnly })) setMsg("El navegador bloqueó la ventana de la factura: permite las ventanas emergentes.");
      else if (!pendingOnly) setMsg(d.awards.length ? "No tiene bonos pendientes: la factura incluye los ya pagados." : "Este creador no tiene bonos guardados. Calcula el mes primero.");
    } catch {
      setMsg("No se pudo generar la factura.");
    }
  }

  async function setWelcome(username: string, reward: string) {
    setData((d) => d && { ...d, items: d.items.map((i) => (i.username === username ? { ...i, welcome: reward || null } : i)) });
    const r = await call("POST", { action: "welcome", username, reward: reward || null });
    if (!r) await load();
  }

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.items ?? []).filter((i) => {
      if (level !== "todos" && i.level !== level) return false;
      if (term && !i.username.toLowerCase().includes(term) && !(i.creatorName ?? "").toLowerCase().includes(term)) return false;
      if (statusFilter === "todos") return true;
      if (statusFilter === "sin_guardar") return i.bonuses.some((b) => !b.award);
      if (statusFilter === "sin_bono") return i.bonuses.length === 0;
      return i.bonuses.some((b) => b.award?.status === statusFilter);
    });
  }, [data, level, q, statusFilter]);

  if (error) {
    return (
      <div>
        <TopBar title="Bonos por niveles" subtitle="Niveles E, D, C, B y A" />
        <PanelLoadError onRetry={() => void load()} />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Bonos por niveles" subtitle={`${MESES_NOMBRE[month]} ${year} · sistema de niveles y bonos (E, D, C, B, A)`} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Mes">
          <select className={inputClass} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MESES_NOMBRE.slice(1).map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Año">
          <select className={inputClass} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Button disabled={busy || !data?.items.length} onClick={() => void calculate()}>
          <Calculator className="h-4 w-4" /> {busy ? "Calculando…" : "Calcular y guardar el mes"}
        </Button>
        <Button variant="secondary" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </Button>
        <Button variant="secondary" onClick={() => setShowManual((v) => !v)}>
          <Plus className="h-4 w-4" /> Bono manual / adeudos
        </Button>
        <div className="min-w-[12rem] flex-1">
          <Field label="Buscar creador">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} className={cn(inputClass, "pl-9")} placeholder="Nombre o @usuario" />
            </div>
          </Field>
        </div>
      </div>

      {showManual && (
        <ManualPanel
          key={manualKey}
          initialUser={manualUser}
          items={data?.items ?? []}
          defaultPeriod={period}
          onDone={(m) => {
            setMsg(m);
            void load();
          }}
        />
      )}

      {msg && <p className="mb-3 text-sm text-text-muted">{msg}</p>}

      {data && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Por pagar este mes" value={money(data.totals.toPay)} sub={`${data.items.length} creadores con datos`} />
            <Stat label="Ya pagado" value={money(data.totals.paid)} sub={`${data.totals.saved} premios guardados`} />
            <Stat label="Pendiente de meses anteriores" value={money(data.totals.pendingBefore)} sub={`${data.pending.length} premios sin pagar`} />
            <Stat label="Sin bono este mes" value={String(data.items.filter((i) => i.bonuses.length === 0).length)} sub="no cumplen ninguna categoría" />
          </div>

          <Panel className="mb-4 space-y-3">
            <p className="text-xs text-text-muted">
              El nivel se calcula solo con lo importado en Control de diamantes (diamantes, días y horas del mes). Para cobrar una categoría hay que cumplir los tres
              requisitos a la vez. Pulsa <b className="text-text">Calcular y guardar el mes</b> para registrar los premios y llevar su pago.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={() => setLevel("todos")}
                className={cn("rounded-md border px-2.5 py-1 text-[11px] font-semibold transition", level === "todos" ? "border-white/60 bg-white/15 text-white" : "border-border text-text-muted hover:text-text")}
              >
                Todos · {data.items.length}
              </button>
              {LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLevel(level === l ? "todos" : l)}
                  className={cn("rounded-md border px-2.5 py-1 text-[11px] transition", level === l ? "border-accent bg-accent text-white" : LEVEL_STYLE[l])}
                >
                  Nivel {l} · {data.byLevel[l]}
                </button>
              ))}
              <div className="ml-auto min-w-[12rem]">
                <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar por estado del pago">
                  <option value="todos">Todos los estados</option>
                  <option value="sin_guardar">Sin guardar (falta calcular)</option>
                  <option value="calculado">Calculado</option>
                  <option value="programado">Programado</option>
                  <option value="pagado">Pagado</option>
                  <option value="acumulado">Acumulado</option>
                  <option value="sin_bono">Sin bono este mes</option>
                </select>
              </div>
            </div>
          </Panel>

          {data.pending.length > 0 && (
            <details className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/5 p-3.5">
              <summary className="cursor-pointer text-sm font-semibold text-amber-200">
                Pendientes de meses anteriores · {data.pending.length} ({money(data.totals.pendingBefore)})
              </summary>
              <ul className="mt-3 space-y-2">
                {data.pending.map((p) => (
                  <li key={p.id} className="rounded-lg border border-white/10 bg-bg-elevated/60 px-3 py-2 text-xs">
                   <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <b>@{p.username}</b> · {MESES_NOMBRE[Number(p.period.slice(5))]} {p.period.slice(0, 4)} · {KIND_LABEL[p.kind]} {p.tier} ·{" "}
                      <span className="text-text-muted">{reward({ coins: p.coins, usd: p.usd, advisory: false }, p.level)}</span>
                    </span>
                    <select
                      value={p.status}
                      onChange={(e) => {
                        void (async () => {
                          await call("PATCH", { id: p.id, status: e.target.value });
                          await load();
                        })();
                      }}
                      className={cn(inputClass, "!w-auto !py-1 text-xs")}
                    >
                      {Object.entries(STATUS_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                   </div>
                   <BonusEditor
                      key={`${p.id}-${p.tier}-${p.coins}-${p.note ?? ""}`}
                      bonus={{
                        kind: p.kind,
                        tier: p.tier,
                        coins: p.coins,
                        usd: p.usd,
                        advisory: p.advisory,
                        outdated: false,
                        award: { id: p.id, status: p.status, scheduledFor: null, method: null, paidAt: null, note: p.note, saved: true },
                      }}
                      level={p.level}
                      onSave={async (patch) => {
                        const r = await call("PATCH", { id: p.id, ...patch });
                        if (r) setMsg("Bono actualizado.");
                        await load();
                      }}
                      onDelete={async () => {
                        const r = await call("DELETE", { id: p.id });
                        if (r) setMsg("Bono eliminado.");
                        await load();
                      }}
                    />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {!data ? (
        <div className="glass-panel h-64 animate-pulse rounded-2xl" />
      ) : data.items.length === 0 ? (
        <Panel className="py-10 text-center text-sm text-text-muted">
          No hay datos de {MESES_NOMBRE[month]} {year}. Importa el archivo en Control de diamantes y vuelve aquí.
        </Panel>
      ) : items.length === 0 ? (
        <Panel className="py-10 text-center text-sm text-text-muted">Ningún creador coincide con ese filtro.</Panel>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.username} className="rounded-xl border border-white/10 bg-bg-elevated/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <TikTokAvatar username={i.username} name={i.creatorName ?? i.username} size={44} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{i.creatorName ?? `@${i.username}`}</p>
                    <p className="truncate text-xs text-text-muted">
                      @{i.username}
                      {!i.creatorId && <span className="ml-2 text-amber-300">· sin vincular a un creador</span>}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setManualUser(i.username);
                      setManualKey((k) => k + 1);
                      setShowManual(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-accent hover:bg-white/5"
                    title="Calcular a mano bonos adeudados de este creador"
                  >
                    Bono manual
                  </button>
                  <button
                    type="button"
                    onClick={() => void invoice(i.username)}
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-accent hover:bg-white/5"
                    title="Generar factura con los bonos pendientes y su motivo"
                  >
                    Factura
                  </button>
                  <span className="text-text-muted">
                    <b className="text-text">{formatNumber(i.metrics.diamonds)}</b> 💎 · <b className="text-text">{i.metrics.days}</b> días · <b className="text-text">{fmtHours(i.metrics.hours)}</b>
                  </span>
                  <select
                    value={i.manual ? i.level : "auto"}
                    onChange={(e) => void changeLevel(i.username, e.target.value)}
                    className={cn("rounded-md border px-2 py-1 text-xs font-semibold outline-none", LEVEL_STYLE[i.level])}
                    aria-label={`Nivel de ${i.username}`}
                    title="Cambiar el nivel a mano"
                  >
                    <option value="auto" className="text-black">
                      Automático · Nivel {i.levelAuto}
                    </option>
                    {LEVELS.map((l) => (
                      <option key={l} value={l} className="text-black">
                        Nivel {l} · {LEVEL_LABEL[l]}
                      </option>
                    ))}
                  </select>
                  {i.manual && (
                    <span className="rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200" title={`Nivel fijado a mano desde ${i.manualFrom}`}>
                      Manual
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {i.bonuses.length === 0 && (
                  <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-text-muted">Este mes no cumple los requisitos (días, horas y diamantes) de ninguna categoría.</p>
                )}
                {i.bonuses.map((b) => (
                  <div key={b.kind} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-text-muted">
                          {KIND_LABEL[b.kind]} · <span className="text-text">{b.tier}</span>
                        </p>
                        <p className="text-sm font-bold text-accent">{reward(b, i.level)}</p>
                      </div>
                      {b.outdated && <span className="text-[11px] text-amber-300">Ya no corresponde con su nivel actual</span>}
                      {b.award ? (
                        <span className={cn("rounded-md border px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[b.award.status])}>{STATUS_LABEL[b.award.status]}</span>
                      ) : (
                        <span className="rounded-md border border-border px-2 py-0.5 text-[11px] text-text-muted">Sin guardar</span>
                      )}
                    </div>
                    {b.award && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <select
                          value={b.award.status}
                          onChange={(e) => void setAward(b.award!.id, { status: e.target.value })}
                          className={cn(inputClass, "!py-1.5 text-xs")}
                          aria-label="Estado del pago"
                        >
                          {Object.entries(STATUS_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={b.award.scheduledFor ?? ""}
                          onChange={(e) => void setAward(b.award!.id, { scheduledFor: e.target.value || null, ...(b.award!.status === "calculado" && e.target.value ? { status: "programado" } : {}) })}
                          className={cn(inputClass, "!py-1.5 text-xs")}
                          aria-label="Fecha programada (después del día 8)"
                          title="Fecha programada: los pagos comienzan después del día 8 de cada mes"
                        />
                        <select
                          value={b.award.method ?? ""}
                          onChange={(e) => void setAward(b.award!.id, { method: e.target.value || null })}
                          className={cn(inputClass, "!py-1.5 text-xs")}
                          aria-label="Medio de pago"
                        >
                          <option value="">Medio de pago…</option>
                          {Object.entries(METHOD_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {b.award && (
                      <BonusEditor
                        key={`${b.award.id}-${b.tier}-${b.coins}-${b.award.note ?? ""}`}
                        bonus={b}
                        level={i.level}
                        onSave={async (p) => {
                          const r = await call("PATCH", { id: b.award!.id, ...p });
                          if (r) setMsg("Bono actualizado.");
                          await load();
                        }}
                        onDelete={async () => {
                          const r = await call("DELETE", { id: b.award!.id });
                          if (r) setMsg("Bono eliminado.");
                          await load();
                        }}
                      />
                    )}
                  </div>
                ))}

                {i.level === "E" && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-xs">
                    <Gift className="h-4 w-4 text-emerald-300" />
                    <span className="font-semibold">Regalo de bienvenida (Bono #1):</span>
                    <select value={i.welcome ?? ""} onChange={(e) => void setWelcome(i.username, e.target.value)} className={cn(inputClass, "!w-auto !py-1 text-xs")}>
                      <option value="">Pendiente</option>
                      <option value="osito">Entregado: Osito Miska</option>
                      <option value="cofres">Entregado: 5 cofres para el público</option>
                    </select>
                    <span className="text-text-muted">Se da al completar 3 transmisiones válidas (45 min o más, una por día).</span>
                  </div>
                )}
              </div>

              <p className="mt-2 text-[11px] text-text-muted">
                {i.manual ? `Nivel fijado a mano desde ${i.manualFrom} (el automático sería ${i.levelAuto}). ` : ""}Pago: {i.payout}.{i.hint && !i.manual ? ` ${i.hint}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-6 rounded-xl border border-white/10 bg-bg-elevated/60 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Ver las tablas y reglas del programa</summary>
        <div className="mt-3 space-y-5 text-xs">
          {(
            [
              ["Bono por horas (niveles D, C, B y A)", HOURS_TIERS],
              ["Bono por diamantes (niveles C, B y A)", DIAMOND_TIERS],
              ["Bono de incorporación #2 (nivel E)", INCORP2_TIERS],
            ] as const
          ).map(([title, tiers]) => (
            <div key={title}>
              <p className="mb-1.5 font-semibold">{title}</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left">
                  <thead className="text-[11px] uppercase text-text-muted">
                    <tr>
                      <th className="py-1 pr-3">Categoría</th>
                      <th className="py-1 pr-3">Días</th>
                      <th className="py-1 pr-3">Horas</th>
                      <th className="py-1 pr-3">Diamantes mín.</th>
                      <th className="py-1">Premio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.map((t) => (
                      <tr key={t.name} className="border-t border-white/10">
                        <td className="py-1 pr-3 font-medium">{t.name}</td>
                        <td className="py-1 pr-3">{t.days}</td>
                        <td className="py-1 pr-3">{t.hours}</td>
                        <td className="py-1 pr-3">{formatNumber(t.diamonds)}</td>
                        <td className="py-1">{t.advisory ? "Asesoría y estrategia" : `${formatNumber(t.coins)} monedas${t.usd ? ` · ${t.usd} USD` : ""}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <ul className="list-disc space-y-1 pl-5 text-text-muted">
            <li>Nivel C: más de 30,000 diamantes en un mes, o 90 días dentro de la agencia. Nivel B: más de 100,000. Nivel A: más de 300,000 (solo por diamantes).</li>
            <li>De E a D: automático, el mes siguiente al de ingreso. Todo ascenso (C, B, A) aplica desde el mes siguiente a lograrlo. El nivel nunca baja.</li>
            <li>Los pagos empiezan después del día 8 de cada mes, de preferencia en batallas agendadas. Lo que no se paga se acumula al siguiente periodo.</li>
            <li>Nivel B: monedas o productos de TikTok Shop (mínimo 20 USD acumulados). Nivel A: transferencia bancaria en dólares reales, con retenciones.</li>
          </ul>
        </div>
      </details>
    </div>
  );
}
