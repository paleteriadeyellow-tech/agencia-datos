"use client";

import { useMemo, useState } from "react";
import { Copy, ExternalLink, Settings2 } from "lucide-react";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { Field, Panel, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  ALERT_LABEL,
  SEVERITY_LABEL,
  computeFollowUp,
  statsByRecruiter,
  todayKey,
  type AlertKind,
  type FollowRow,
  type FollowSettings,
  type Severity,
} from "@/lib/recruitment-followup";

type ColLite = { key: string; label: string };

type Scope = "mes" | "30" | "60" | "todo";

const SEV_STYLE: Record<Severity, { box: string; chip: string; title: string }> = {
  1: { box: "border-danger/40", chip: "border-danger/40 bg-danger/10 text-danger", title: "text-danger" },
  2: { box: "border-orange-400/40", chip: "border-orange-400/40 bg-orange-500/10 text-orange-300", title: "text-orange-300" },
  3: { box: "border-amber-400/30", chip: "border-amber-400/30 bg-amber-500/10 text-amber-200", title: "text-amber-200" },
  4: { box: "border-white/10", chip: "border-border text-text-muted", title: "text-text-muted" },
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
  columns: ColLite[];
  admin: boolean;
  year: string;
  month: string;
  loading: boolean;
  onSaveSettings: (patch: Partial<FollowSettings>) => Promise<void>;
  onOpen: (row: FollowRow) => void;
}) {
  const [scope, setScope] = useState<Scope>("mes");
  const [recruiter, setRecruiter] = useState("all");
  const [kind, setKind] = useState<AlertKind | "all">("all");
  const [sev, setSev] = useState<Severity | "all">("all");
  const [cfgOpen, setCfgOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const today = todayKey();

  // Lo que se revisa: el mes elegido arriba, o una ventana reciente
  const inScope = useMemo(() => {
    const dayMs = 86_400_000;
    const now = Date.parse(`${today}T00:00:00Z`);
    return rows.filter((r) => {
      if (!r.requestDate) return scope === "todo";
      if (scope === "todo") return true;
      if (scope === "mes") {
        const [y, m] = r.requestDate.split("-");
        return (year === "all" || y === year) && (month === "all" || Number(m) === Number(month));
      }
      const age = (now - Date.parse(`${r.requestDate}T00:00:00Z`)) / dayMs;
      return age >= 0 && age <= Number(scope);
    });
  }, [rows, scope, year, month, today]);

  const items = useMemo(() => computeFollowUp(inScope, settings, today), [inScope, settings, today]);
  const stats = useMemo(() => statsByRecruiter(inScope, items, settings), [inScope, items, settings]);

  const shown = items.filter(
    (i) =>
      (recruiter === "all" || (i.row.recruiter.trim() || "Sin reclutador") === recruiter) &&
      (kind === "all" || i.alerts.some((a) => a.kind === kind)) &&
      (sev === "all" || i.severity === sev)
  );

  const bySev = ([1, 2, 3, 4] as Severity[]).map((s) => ({ s, n: items.filter((i) => i.severity === s).length }));
  const byKind = (Object.keys(ALERT_LABEL) as AlertKind[]).map((k) => ({ k, n: items.filter((i) => i.alerts.some((a) => a.kind === k)).length }));

  async function copyList() {
    const text = shown
      .map((i) => `${i.row.creatorName.startsWith("@") ? "" : "@"}${i.row.creatorName} (${i.row.recruiter || "sin reclutador"}) — ${i.alerts.map((a) => a.text).join("; ")}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* sin permiso del portapapeles */
    }
  }

  const monthText = month === "all" ? "todos los meses" : `el mes elegido`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Qué revisar">
          <select className={inputClass} value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="mes">Solicitudes de {monthText}</option>
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
        El mensaje y el comentario se hacen en la app de TikTok; aquí solo se registran. Esta vista muestra lo que <b className="text-text">falta registrar o hacer</b>, para revisar cómo trabaja el
        personal. Una casilla vacía o que dice “no” cuenta como pendiente.
      </p>

      {admin && cfgOpen && <SettingsPanel settings={settings} columns={columns} onSave={onSaveSettings} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {bySev.map(({ s, n }) => (
          <button
            key={s}
            type="button"
            onClick={() => setSev(sev === s ? "all" : s)}
            className={cn("rounded-xl border bg-bg-elevated/70 p-3.5 text-left transition hover:border-white/30", SEV_STYLE[s].box, sev === s && "ring-2 ring-accent/60")}
          >
            <p className={cn("text-[11px] font-semibold uppercase tracking-wide", SEV_STYLE[s].title)}>{SEVERITY_LABEL[s]}</p>
            <p className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-bold">{n}</p>
            <p className="text-[11px] text-text-muted">{s === 1 ? "vencen hoy o en pocos días" : s === 2 ? "vencidas o sin mensaje" : s === 3 ? "sin comentar video / volver a contactar" : "sin teléfono"}</p>
          </button>
        ))}
      </div>

      {stats.length > 0 && (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-border-soft text-[11px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Reclutador</th>
                <th className="px-3 py-2.5 text-right font-medium">Solicitudes activas</th>
                <th className="px-3 py-2.5 text-right font-medium">Con mensaje</th>
                <th className="px-3 py-2.5 text-right font-medium">Video comentado</th>
                <th className="px-3 py-2.5 text-right font-medium">Pendientes</th>
                <th className="px-3 py-2.5 text-right font-medium">Urgentes</th>
                <th className="px-3 py-2.5 text-right font-medium">Vencidas</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr
                  key={s.recruiter}
                  onClick={() => setRecruiter(recruiter === s.recruiter ? "all" : s.recruiter)}
                  className={cn("cursor-pointer border-b border-border-soft/70 transition hover:bg-bg-hover/40", recruiter === s.recruiter && "bg-accent/10")}
                >
                  <td className="px-4 py-2 font-medium">{s.recruiter}</td>
                  <td className="px-3 py-2 text-right text-text-muted">{s.total}</td>
                  <td className={cn("px-3 py-2 text-right", pct(s.messageDone, s.total) < 80 ? "text-orange-300" : "text-success")}>{pct(s.messageDone, s.total)}%</td>
                  <td className={cn("px-3 py-2 text-right", pct(s.videoDone, s.total) < 80 ? "text-orange-300" : "text-success")}>{pct(s.videoDone, s.total)}%</td>
                  <td className="px-3 py-2 text-right">{s.pendientes}</td>
                  <td className={cn("px-3 py-2 text-right", s.urgentes ? "font-semibold text-danger" : "text-text-muted")}>{s.urgentes}</td>
                  <td className={cn("px-3 py-2 text-right", s.vencidas ? "text-orange-300" : "text-text-muted")}>{s.vencidas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setKind("all")} className={cn("rounded-md border px-2.5 py-1 text-[11px] font-semibold transition", kind === "all" ? "border-white/60 bg-white/15 text-white" : "border-border text-text-muted hover:text-text")}>
          Todos los avisos · {items.length}
        </button>
        {byKind.map(({ k, n }) => (
          <button key={k} type="button" onClick={() => setKind(kind === k ? "all" : k)} className={cn("rounded-md border px-2.5 py-1 text-[11px] transition", kind === k ? "border-accent bg-accent text-white" : "border-border text-text-muted hover:text-text")}>
            {ALERT_LABEL[k]} · {n}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="glass-panel h-40 animate-pulse rounded-2xl" />
      ) : shown.length === 0 ? (
        <Panel className="py-10 text-center text-sm text-text-muted">{items.length === 0 ? "¡Todo al día! No hay pendientes en lo que estás revisando." : "No hay avisos con esos filtros."}</Panel>
      ) : (
        <div className="space-y-5">
          {([1, 2, 3, 4] as Severity[]).map((s) => {
            const group = shown.filter((i) => i.severity === s);
            if (!group.length) return null;
            return (
              <section key={s} className="space-y-2">
                <h3 className={cn("text-xs font-semibold uppercase tracking-wide", SEV_STYLE[s].title)}>
                  {SEVERITY_LABEL[s]} · {group.length}
                </h3>
                <ul className="grid gap-2 lg:grid-cols-2">
                  {group.map((i) => (
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
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {i.alerts.map((a) => (
                          <span key={a.kind} className={cn("rounded-md border px-2 py-0.5 text-[11px]", SEV_STYLE[a.severity].chip)}>
                            {a.text}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Reglas del seguimiento (solo admin): días de vigencia y qué columnas se revisan. */
function SettingsPanel({ settings, columns, onSave }: { settings: FollowSettings; columns: ColLite[]; onSave: (patch: Partial<FollowSettings>) => Promise<void> }) {
  const [days, setDays] = useState(String(settings.validityDays));
  const [soon, setSoon] = useState(String(settings.soonDays));
  return (
    <Panel className="space-y-3">
      <p className="text-sm font-semibold">Reglas del seguimiento</p>
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
        <Field label="Columna del mensaje enviado">
          <select className={inputClass} value={settings.messageKey} onChange={(e) => void onSave({ messageKey: e.target.value })}>
            {columns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Columna del comentario de video">
          <select className={inputClass} value={settings.videoKey} onChange={(e) => void onSave({ videoKey: e.target.value })}>
            {columns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-xs text-text-muted">Se ignoran los casos ya integrados y los marcados como “otra agencia” o “sin permiso de datos”.</p>
    </Panel>
  );
}
