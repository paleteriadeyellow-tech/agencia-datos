"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Settings2 } from "lucide-react";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { Field, Panel, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  SEVERITY_LABEL,
  computeFollowUp,
  isClosed,
  isIntegrated,
  statsByRecruiter,
  todayKey,
  type FollowRow,
  type FollowSettings,
  type MissingCell,
  type Severity,
} from "@/lib/recruitment-followup";

type Scope = "mes" | "30" | "60" | "todo";
type Order = "urgente" | "faltan" | "cerca" | "antiguos";

const SEV_STYLE: Record<Severity, { box: string; title: string; chip: string }> = {
  1: { box: "border-danger/40", title: "text-danger", chip: "border-danger/40 bg-danger/10 text-danger" },
  2: { box: "border-orange-400/40", title: "text-orange-300", chip: "border-orange-400/40 bg-orange-500/10 text-orange-300" },
  3: { box: "border-white/10", title: "text-text-muted", chip: "border-amber-400/30 bg-amber-500/10 text-amber-200" },
};

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function fmtDay(iso: string | null) {
  if (!iso) return "Sin fecha";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function FollowUpView({
  rows,
  settings,
  columns,
  admin,
  year,
  month,
  loading,
  onSaveSettings,
  onOpen,
}: {
  rows: FollowRow[];
  settings: FollowSettings;
  /** Columnas visibles de la hoja, en orden. */
  columns: MissingCell[];
  admin: boolean;
  year: string;
  month: string;
  loading: boolean;
  onSaveSettings: (patch: Partial<FollowSettings>) => Promise<void>;
  onOpen: (row: FollowRow) => void;
}) {
  const [scope, setScope] = useState<Scope>("mes");
  const [recruiter, setRecruiter] = useState("all");
  const [cell, setCell] = useState<string>("all");
  const [sev, setSev] = useState<Severity | "all">("all");
  const [order, setOrder] = useState<Order>("urgente");
  const [cfgOpen, setCfgOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const today = todayKey();

  // Lo que se revisa: el mes elegido arriba, o una ventana reciente
  const inScope = useMemo(() => {
    const now = Date.parse(`${today}T00:00:00Z`);
    return rows.filter((r) => {
      if (scope === "todo") return true;
      if (!r.requestDate) return false;
      if (scope === "mes") {
        const [y, m] = r.requestDate.split("-");
        return (year === "all" || y === year) && (month === "all" || Number(m) === Number(month));
      }
      const age = (now - Date.parse(`${r.requestDate}T00:00:00Z`)) / 86_400_000;
      return age >= 0 && age <= Number(scope);
    });
  }, [rows, scope, year, month, today]);

  const items = useMemo(() => computeFollowUp(inScope, settings, columns, today), [inScope, settings, columns, today]);
  const stats = useMemo(() => statsByRecruiter(inScope, items), [inScope, items]);

  const activeTotal = inScope.filter((r) => r.creatorName.trim() && !isClosed(r)).length;
  const integrated = inScope.filter((r) => r.creatorName.trim() && !isClosed(r) && isIntegrated(r)).length;
  const closed = inScope.filter((r) => r.creatorName.trim() && isClosed(r)).length;

  const shown = useMemo(() => {
    const list = items.filter(
      (i) =>
        (recruiter === "all" || (i.row.recruiter.trim() || "Sin reclutador") === recruiter) &&
        (cell === "all" || i.missing.some((m) => m.key === cell)) &&
        (sev === "all" || i.severity === sev)
    );
    if (order === "faltan") list.sort((a, b) => b.missing.length - a.missing.length);
    else if (order === "cerca") list.sort((a, b) => a.missing.length - b.missing.length);
    else if (order === "antiguos") list.sort((a, b) => (a.row.requestDate ?? "").localeCompare(b.row.requestDate ?? ""));
    return list;
  }, [items, recruiter, cell, sev, order]);

  const required = columns.filter((c) => settings.requiredKeys.includes(c.key));
  const bySev = ([1, 2, 3] as Severity[]).map((s) => ({ s, n: items.filter((i) => i.severity === s).length }));
  const byCell = required.map((c) => ({ ...c, n: items.filter((i) => i.missing.some((m) => m.key === c.key)).length })).filter((c) => c.n > 0);

  async function copyList() {
    const text = shown
      .map((i) => `@${i.row.creatorName.replace(/^@/, "")} (${i.row.recruiter || "sin reclutador"}) — ${i.expiry ? i.expiry.text + ". " : ""}Faltan: ${i.missing.map((m) => m.label).join(", ") || "nada"}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* sin permiso del portapapeles */
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Qué revisar">
          <select className={inputClass} value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="mes">Solicitudes del mes elegido</option>
            <option value="30">Últimos 30 días</option>
            <option value="60">Últimos 60 días</option>
            <option value="todo">Todo el historial</option>
          </select>
        </Field>
        <Field label="Reclutador">
          <select className={inputClass} value={recruiter} onChange={(e) => setRecruiter(e.target.value)}>
            <option value="all">Todos</option>
            {stats.map((s) => (
              <option key={s.recruiter} value={s.recruiter}>
                {s.recruiter}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ordenar por">
          <select className={inputClass} value={order} onChange={(e) => setOrder(e.target.value as Order)}>
            <option value="urgente">Más urgentes primero</option>
            <option value="faltan">Más casillas faltantes</option>
            <option value="cerca">Más cerca de completar</option>
            <option value="antiguos">Más antiguos</option>
          </select>
        </Field>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => void copyList()} disabled={!shown.length} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-text-muted transition hover:border-white/25 hover:text-text disabled:opacity-40">
            <Copy className="h-4 w-4" /> {copied ? "¡Copiado!" : "Copiar lista"}
          </button>
          {admin && (
            <button type="button" onClick={() => setCfgOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-text-muted transition hover:border-white/25 hover:text-text">
              <Settings2 className="h-4 w-4" /> Reglas
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-text-muted">
        Cada creador debe llegar a su <b className="text-text">integración</b>, que es cuando su fila queda en verde. Aquí ves las casillas que le faltan por registrar y quién las dejó pendientes. El mensaje y el
        comentario se hacen en TikTok; la hoja es el registro que revisa la dirección. Una casilla vacía o que dice “no” cuenta como pendiente.
      </p>

      {admin && cfgOpen && <SettingsPanel settings={settings} columns={columns} onSave={onSaveSettings} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {bySev.slice(0, 2).map(({ s, n }) => (
          <button key={s} type="button" onClick={() => setSev(sev === s ? "all" : s)} className={cn("rounded-xl border bg-bg-elevated/70 p-3.5 text-left transition hover:border-white/30", SEV_STYLE[s].box, sev === s && "ring-2 ring-accent/60")}>
            <p className={cn("text-[11px] font-semibold uppercase tracking-wide", SEV_STYLE[s].title)}>{SEVERITY_LABEL[s]}</p>
            <p className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-bold">{n}</p>
            <p className="text-[11px] text-text-muted">{s === 1 ? "vencen hoy o en pocos días" : "la solicitud ya venció"}</p>
          </button>
        ))}
        <button type="button" onClick={() => setSev(sev === 3 ? "all" : 3)} className={cn("rounded-xl border bg-bg-elevated/70 p-3.5 text-left transition hover:border-white/30", SEV_STYLE[3].box, sev === 3 && "ring-2 ring-accent/60")}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">Por completar</p>
          <p className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-bold">{items.length}</p>
          <p className="text-[11px] text-text-muted">con casillas faltantes</p>
        </button>
        <div className="rounded-xl border border-success/40 bg-success/5 p-3.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> En verde (integrados)
          </p>
          <p className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-bold">
            {integrated}
            <span className="text-base text-text-muted"> de {activeTotal}</span>
          </p>
          <p className="text-[11px] text-text-muted">
            {pct(integrated, activeTotal)}% completo{closed ? ` · ${closed} cerrados sin integrarse` : ""}
          </p>
        </div>
      </div>

      {stats.length > 0 && (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-border-soft text-[11px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Reclutador</th>
                <th className="px-3 py-2.5 text-right font-medium">Solicitudes</th>
                <th className="px-3 py-2.5 text-right font-medium">Integrados</th>
                <th className="px-3 py-2.5 text-right font-medium">Por completar</th>
                <th className="px-3 py-2.5 text-right font-medium">Casillas faltantes</th>
                <th className="px-3 py-2.5 text-right font-medium">Urgentes</th>
                <th className="px-3 py-2.5 text-right font-medium">Vencidas</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.recruiter} onClick={() => setRecruiter(recruiter === s.recruiter ? "all" : s.recruiter)} className={cn("cursor-pointer border-b border-border-soft/70 transition hover:bg-bg-hover/40", recruiter === s.recruiter && "bg-accent/10")}>
                  <td className="px-4 py-2 font-medium">{s.recruiter}</td>
                  <td className="px-3 py-2 text-right text-text-muted">{s.total}</td>
                  <td className="px-3 py-2 text-right text-success">
                    {s.integrated} <span className="text-text-muted">({pct(s.integrated, s.total)}%)</span>
                  </td>
                  <td className="px-3 py-2 text-right">{s.pending}</td>
                  <td className="px-3 py-2 text-right">{s.missingCells}</td>
                  <td className={cn("px-3 py-2 text-right", s.urgentes ? "font-semibold text-danger" : "text-text-muted")}>{s.urgentes}</td>
                  <td className={cn("px-3 py-2 text-right", s.vencidas ? "text-orange-300" : "text-text-muted")}>{s.vencidas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {byCell.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-text-muted">Casillas que más faltan (toca una para ver solo esos creadores):</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setCell("all")} className={cn("rounded-md border px-2.5 py-1 text-[11px] font-semibold transition", cell === "all" ? "border-white/60 bg-white/15 text-white" : "border-border text-text-muted hover:text-text")}>
              Todas · {items.length}
            </button>
            {byCell.map((c) => (
              <button key={c.key} type="button" onClick={() => setCell(cell === c.key ? "all" : c.key)} className={cn("rounded-md border px-2.5 py-1 text-[11px] transition", cell === c.key ? "border-accent bg-accent text-white" : "border-border text-text-muted hover:text-text")}>
                {c.label} · {c.n}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="glass-panel h-40 animate-pulse rounded-2xl" />
      ) : shown.length === 0 ? (
        <Panel className="py-10 text-center text-sm text-text-muted">
          {items.length === 0 ? "¡Todo en verde! No hay casillas pendientes en lo que estás revisando." : "No hay creadores con esos filtros."}
        </Panel>
      ) : (
        <div className="space-y-5">
          {([1, 2, 3] as Severity[]).map((s) => {
            const group = shown.filter((i) => i.severity === s);
            if (!group.length) return null;
            return (
              <section key={s} className="space-y-2">
                <h3 className={cn("text-xs font-semibold uppercase tracking-wide", SEV_STYLE[s].title)}>
                  {SEVERITY_LABEL[s]} · {group.length}
                </h3>
                <ul className="grid gap-2 lg:grid-cols-2">
                  {group.map((i) => {
                    const done = pct(i.filled, i.required);
                    return (
                      <li key={i.row.id} className={cn("rounded-xl border bg-bg-elevated/80 p-3", SEV_STYLE[s].box)}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <TikTokAvatar username={i.row.creatorName} name={i.row.creatorName} size={36} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">@{i.row.creatorName.replace(/^@/, "")}</p>
                              <p className="truncate text-[11px] text-text-muted">
                                {i.row.recruiter || "Sin reclutador"} · solicitud {fmtDay(i.row.requestDate)}
                                {i.row.phone ? ` · ${i.row.phone}` : ""}
                              </p>
                            </div>
                          </div>
                          <button type="button" onClick={() => onOpen(i.row)} title="Abrir esta fila en la hoja de captura" className="shrink-0 rounded-md border border-border p-1.5 text-text-muted transition hover:border-white/25 hover:text-text">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {i.expiry && <p className={cn("mt-2 inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold", SEV_STYLE[i.expiry.severity].chip)}>{i.expiry.text}</p>}

                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div className={cn("h-full rounded-full transition-all", done >= 100 ? "bg-success" : "bg-cyan")} style={{ width: `${done}%` }} />
                          </div>
                          <span className="text-[11px] text-text-muted">
                            {i.filled}/{i.required} casillas
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {i.missing.map((m) => (
                            <span key={m.key} className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                              Falta: {m.label}
                            </span>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Reglas del seguimiento (solo admin): qué casillas son obligatorias y cuántos días dura una solicitud. */
function SettingsPanel({ settings, columns, onSave }: { settings: FollowSettings; columns: MissingCell[]; onSave: (patch: Partial<FollowSettings>) => Promise<void> }) {
  const [days, setDays] = useState(String(settings.validityDays));
  const [soon, setSoon] = useState(String(settings.soonDays));
  // Las columnas de identidad no se piden como casilla
  const selectable = columns.filter((c) => !["recruiter", "requestDate", "creatorName"].includes(c.key));

  function toggle(key: string) {
    const set = new Set(settings.requiredKeys);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    // Se guarda en el orden de las columnas de la hoja
    void onSave({ requiredKeys: columns.filter((c) => set.has(c.key)).map((c) => c.key) });
  }

  return (
    <Panel className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold">Casillas obligatorias hasta la integración</p>
        <p className="mb-2 text-xs text-text-muted">Marca las casillas que cada creador debe tener llenas. Las que falten aparecen como aviso hasta que se integre.</p>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {selectable.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-sm hover:bg-white/5">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={settings.requiredKeys.includes(c.key)} onChange={() => toggle(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Cómo se cuenta el vencimiento">
          <select className={inputClass} value={settings.expiryMode} onChange={(e) => void onSave({ expiryMode: e.target.value as FollowSettings["expiryMode"] })}>
            <option value="fixed">Días fijos desde la fecha de solicitud</option>
            <option value="column">Usar la columna “Días para que venza”</option>
            <option value="off">No avisar vencimientos</option>
          </select>
        </Field>
        <Field label="Días que dura una solicitud">
          <input type="number" min={1} max={90} className={inputClass} value={days} disabled={settings.expiryMode !== "fixed"} onChange={(e) => setDays(e.target.value)} onBlur={() => Number(days) >= 1 && Number(days) !== settings.validityDays && void onSave({ validityDays: Number(days) })} />
        </Field>
        <Field label="“Vence pronto” si faltan (días) o menos">
          <input type="number" min={0} max={30} className={inputClass} value={soon} onChange={(e) => setSoon(e.target.value)} onBlur={() => Number(soon) >= 0 && Number(soon) !== settings.soonDays && void onSave({ soonDays: Number(soon) })} />
        </Field>
      </div>
      <p className="text-xs text-text-muted">Se ignoran los casos ya integrados y los marcados como “otra agencia”, “sin permiso de datos” o “no apto”.</p>
    </Panel>
  );
}
