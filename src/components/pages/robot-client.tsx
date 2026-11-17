"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Bot, Flame, Moon, MessageCircle, Play, FileText, Clock, Database } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, Panel } from "@/components/ui";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";
import { cn, formatNumber } from "@/lib/utils";
import type { RobotCreator, RobotKind, RobotReport } from "@/lib/robot";

type Payload = { report: RobotReport; telegram: boolean };

const KINDS: { id: RobotKind; label: string; icon: typeof Flame; style: string }[] = [
  { id: "riesgo", label: "En riesgo", icon: AlertTriangle, style: "border-danger/35 bg-danger/10 text-danger" },
  { id: "sin_actividad", label: "Sin LIVE", icon: Moon, style: "border-warning/35 bg-warning/10 text-warning" },
  { id: "cerca", label: "Cerca de nivel", icon: Flame, style: "border-success/35 bg-success/10 text-success" },
];

export default function RobotPage() {
  const { data, error, mutate } = usePanelData(PANEL.robot) as {
    data?: Payload;
    error?: unknown;
    mutate: () => Promise<unknown>;
  };
  const [filter, setFilter] = useState<RobotKind | "todos">("todos");
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const report = data?.report;
  const list = useMemo(
    () => (report?.creators ?? []).filter((c) => filter === "todos" || c.kind === filter),
    [report, filter]
  );

  async function runNow() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(PANEL.robot, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Error al correr el robot");
      const r = json.report as RobotReport;
      setMsg(
        `Listo: ${r.managerTasksCreated} tareas de contacto y ${r.tasksCreated} tareas fijas creadas. ` +
          (json.notify?.sent ? "Resumen enviado a Telegram." : `Telegram: ${json.notify?.reason ?? "no enviado"}.`)
      );
      invalidatePanel(PANEL.tasks);
      await mutate();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  function openWa(c: RobotCreator) {
    if (!c.waLink) return;
    window.open(c.waLink, "_blank", "noopener,noreferrer");
    setSent((s) => new Set(s).add(c.creatorId));
  }

  if (error && !data) return <PanelLoadError />;

  return (
    <div>
      <TopBar
        title="Robot diario"
        subtitle="Revisa a tus creadores todos los días a las 7:00 a.m. solo, crea las tareas y te manda el resumen."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={runNow} disabled={busy}>
          <Play className="h-4 w-4" /> {busy ? "Corriendo…" : "Correr el robot ahora"}
        </Button>
        {data && !data.telegram && (
          <span className="text-xs text-text-muted">
            Avisos al celular apagados: falta configurar TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en Vercel.
          </span>
        )}
        {msg && <span className="text-sm text-text-muted">{msg}</span>}
      </div>

      {!report ? (
        <Panel>Cargando…</Panel>
      ) : (
        <>
          {report.dataStale && (
            <Panel className="mb-4 border border-warning/40">
              <div className="flex items-center gap-2 text-warning">
                <Database className="h-4 w-4" />
                {report.dataAgeDays == null
                  ? "No hay datos de Backstage cargados. Sube el Excel en Control de diamantes."
                  : `Los datos de Backstage tienen ${report.dataAgeDays} días. Sube el Excel nuevo en Control de diamantes para que el robot vea lo de hoy.`}
              </div>
            </Panel>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={`Diamantes ${report.period}`} value={formatNumber(report.totalDiamonds)} hint={`Día ${report.dayOfMonth} de ${report.daysInMonth}`} />
            <Stat
              label="Proyección del mes"
              value={formatNumber(report.projectedDiamonds)}
              hint={report.agencyGoal ? `Meta ${formatNumber(report.agencyGoal)}` : "Sin meta mensual"}
              tone={report.agencyGoal ? (report.projectedDiamonds >= report.agencyGoal ? "good" : "bad") : undefined}
            />
            <Stat label="Creadores activos" value={String(report.activeCreators)} hint={`${report.creators.length} necesitan atención`} />
            <Stat label="Quedan" value={`${report.daysLeft} días`} hint="del mes, contando hoy" />
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <Chip active={filter === "todos"} onClick={() => setFilter("todos")}>
              Todos ({report.creators.length})
            </Chip>
            {KINDS.map((k) => (
              <Chip key={k.id} active={filter === k.id} onClick={() => setFilter(k.id)}>
                <k.icon className="h-3.5 w-3.5" /> {k.label} ({report.creators.filter((c) => c.kind === k.id).length})
              </Chip>
            ))}
          </div>

          <Panel className="mb-4 p-0">
            {list.length === 0 ? (
              <p className="p-5 text-sm text-text-muted">Nadie en esta lista hoy. 🎉</p>
            ) : (
              <ul className="divide-y divide-border">
                {list.map((c) => {
                  const k = KINDS.find((x) => x.id === c.kind)!;
                  return (
                    <li key={c.creatorId} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{c.name}</span>
                          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", k.style)}>
                            <k.icon className="h-3 w-3" /> {k.label}
                          </span>
                          {c.managerName && <span className="text-xs text-text-muted">· {c.managerName}</span>}
                        </div>
                        <p className="mt-1 text-sm text-text-muted">{c.reason}</p>
                        <p className="text-xs text-text-muted">
                          {formatNumber(c.diamonds)} 💎 · {c.days} días · {c.hours.toFixed(1)}h · Nivel {c.level}
                        </p>
                      </div>
                      <Button
                        variant={sent.has(c.creatorId) ? "secondary" : "primary"}
                        disabled={!c.waLink}
                        onClick={() => openWa(c)}
                        title={c.waLink ? c.message : "Sin teléfono registrado"}
                        className="shrink-0"
                      >
                        <MessageCircle className="h-4 w-4" /> {c.waLink ? (sent.has(c.creatorId) ? "Abierto" : "WhatsApp") : "Sin teléfono"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <h3 className="mb-2 flex items-center gap-2 font-medium">
                <FileText className="h-4 w-4" /> Contratos por vencer
              </h3>
              {report.contractsExpiring.length === 0 ? (
                <p className="text-sm text-text-muted">Ninguno en los próximos 15 días.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {report.contractsExpiring.map((k, i) => (
                    <li key={i}>
                      {k.creator} — {k.title} · vence {k.endDate} ({k.daysLeft} días)
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel>
              <h3 className="mb-2 flex items-center gap-2 font-medium">
                <Clock className="h-4 w-4" /> Tareas atrasadas por persona
              </h3>
              {report.overdueByManager.length === 0 ? (
                <p className="text-sm text-text-muted">Nadie tiene tareas atrasadas.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {report.overdueByManager.map((m) => (
                    <li key={m.managerId ?? "none"}>
                      {m.managerName}: <b>{m.count}</b>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <p className="mt-4 flex items-center gap-2 text-xs text-text-muted">
            <Bot className="h-3.5 w-3.5" /> Cada mañana el robot le deja a cada manager una tarea con los creadores que debe contactar y los links de WhatsApp listos.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <Panel className="p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold", tone === "good" && "text-success", tone === "bad" && "text-danger")}>{value}</p>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </Panel>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition",
        active ? "border-accent bg-accent/15 text-text" : "border-border text-text-muted hover:bg-bg-hover"
      )}
    >
      {children}
    </button>
  );
}
