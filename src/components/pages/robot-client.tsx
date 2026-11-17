"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bot, Flame, Moon, MessageCircle, Play, FileText, Clock, Database, Upload, X } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, Panel } from "@/components/ui";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";
import { cn, formatNumber } from "@/lib/utils";
import type { RobotCreator, RobotKind, RobotReport } from "@/lib/robot";
import type { ImportSummary } from "@/lib/backstage-import-server";
import { parseBackstageSheet } from "@/lib/backstage-import";

type Payload = { report: RobotReport; telegram: boolean };

function monthOptions() {
  const now = new Date();
  return [0, 1].map((back) => {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
    return { key, label: back === 0 ? `${label} (este mes)` : label };
  });
}

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
  const fileRef = useRef<HTMLInputElement>(null);
  // Fechas y datos guardados en el navegador solo después de montar (evita diferencias con el servidor).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const months = useMemo(() => (mounted ? monthOptions() : []), [mounted]);
  const [importPeriod, setImportPeriod] = useState("");
  useEffect(() => {
    if (months.length && !importPeriod) setImportPeriod(months[0].key);
  }, [months, importPeriod]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function importExcel(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setImportError("");
    setSummary(null);
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]!];
      if (!sheet) throw new Error("El Excel está vacío.");
      const parsed = parseBackstageSheet(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }));
      if (!parsed.ok) throw new Error(parsed.error);
      const res = await fetch(`${PANEL.robot}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, period: importPeriod || undefined, rows: parsed.rows }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Error al importar");
      setSummary(json.summary as ImportSummary);
      invalidatePanel(PANEL.tasks, PANEL.diamonds, PANEL.hub, PANEL.dashboard, PANEL.creators);
      await mutate();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "No se pudo importar el Excel.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const report = mounted ? data?.report : undefined;
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

      <Panel className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => void importExcel(e.target.files?.[0])}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={importing || busy}>
            <Upload className="h-4 w-4" /> {importing ? "Actualizando todo…" : "Subir Excel y actualizar todo"}
          </Button>
          <label className="flex items-center gap-2 text-sm text-text-muted">
            Mes del Excel:
            <select
              value={importPeriod}
              onChange={(e) => setImportPeriod(e.target.value)}
              className="rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-text"
              disabled={importing}
            >
              {months.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Descarga en Backstage el Excel de «Datos del creador» de esta agencia y súbelo aquí: se importa a Control de diamantes, corre el robot y te muestra qué cambió.
        </p>
        {importError && <p className="mt-2 text-sm text-danger">{importError}</p>}
        {summary && <ImportResult s={summary} onClose={() => setSummary(null)} />}
      </Panel>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={runNow} disabled={busy || importing}>
          <Play className="h-4 w-4" /> {busy ? "Corriendo…" : "Correr el robot ahora"}
        </Button>
        {mounted && data && !data.telegram && (
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

function ImportResult({ s, onClose }: { s: ImportSummary; onClose: () => void }) {
  const diff = s.diamondsAfter - s.diamondsBefore;
  const delta = (a: number, b: number) => (b === a ? `${b}` : `${a} → ${b}`);
  return (
    <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-4 text-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="font-medium text-success">
          ✅ Datos actualizados ({s.period}) · {s.upserted} usuarios importados
        </p>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="text-text-muted hover:text-text">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="space-y-1">
        <li>
          💎 Diamantes: {formatNumber(s.diamondsBefore)} → <b>{formatNumber(s.diamondsAfter)}</b>{" "}
          <span className={diff >= 0 ? "text-success" : "text-danger"}>
            ({diff >= 0 ? "+" : ""}
            {formatNumber(diff)})
          </span>
        </li>
        <li>
          ⚠️ En riesgo: {delta(s.riskBefore.riesgo, s.riskAfter.riesgo)} · 😴 Sin LIVE: {delta(s.riskBefore.sin_actividad, s.riskAfter.sin_actividad)} · 🔥 Cerca de nivel:{" "}
          {delta(s.riskBefore.cerca, s.riskAfter.cerca)}
        </li>
        {s.robot && (
          <li>
            🤖 Robot: {s.robot.managerTasksCreated} tareas de contacto y {s.robot.tasksCreated} tareas fijas nuevas
          </li>
        )}
        {s.topGainers.length > 0 && (
          <li>
            📈 Más subieron: {s.topGainers.slice(0, 5).map((g) => `${g.username} (+${formatNumber(g.gained)})`).join(", ")}
          </li>
        )}
        {s.startedLive.length > 0 && <li>🎬 Empezaron a hacer LIVE: {s.startedLive.join(", ")}</li>}
        {s.leftRisk.length > 0 && <li>🎉 Salieron de riesgo / sin LIVE: {s.leftRisk.join(", ")}</li>}
        {s.notInRoster > 0 && (
          <li className="text-text-muted">
            ℹ️ {s.notInRoster} usuarios del Excel no están dados de alta en Creadores (sí quedan en Control de diamantes).
          </li>
        )}
      </ul>
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
