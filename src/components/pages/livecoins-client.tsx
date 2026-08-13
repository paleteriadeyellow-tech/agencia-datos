"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Smartphone } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { KpiCard } from "@/components/kpi-card";
import { Panel, inputClass } from "@/components/ui";
import { formatNumber, cn } from "@/lib/utils";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";

const STATUSES = [
  { value: "pendiente", label: "Pendiente" },
  { value: "contactado", label: "Contactado" },
  { value: "habilitada", label: "App habilitada" },
  { value: "no_quiere", label: "No la quiere" },
] as const;

type LiveStatus = (typeof STATUSES)[number]["value"];

type Row = {
  id: string;
  name: string;
  tiktokUser: string | null;
  niche: string;
  diamonds: number;
  livecoinsStatus: LiveStatus;
  livecoinsComment: string;
  hasApp: boolean;
};

type Payload = {
  creators: Row[];
  counts: Record<LiveStatus, number>;
  total: number;
};

const selectClass =
  "h-9 min-w-[11rem] cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm text-text outline-none backdrop-blur-sm transition hover:border-white/20 hover:bg-white/10 focus:border-accent/50 focus:bg-white/10";

const commentClass =
  "h-9 w-full min-w-[12rem] rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm text-text outline-none backdrop-blur-sm transition placeholder:text-text-muted/50 hover:border-white/20 hover:bg-white/10 focus:border-accent/50 focus:bg-white/10";

export default function LivecoinsClient() {
  const { data, error, mutate } = usePanelData(PANEL.livecoins) as {
    data?: Payload;
    error?: Error;
    mutate: () => void;
  };

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<LiveStatus | "todos">("todos");
  const [saving, setSaving] = useState<Record<string, string>>({});
  const commentTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      Object.values(commentTimers.current).forEach((t) =>
        window.clearTimeout(t)
      );
    };
  }, []);

  const rows = useMemo(() => {
    const list = data?.creators ?? [];
    const query = q.trim().toLowerCase();
    return list.filter((c) => {
      if (filter !== "todos" && c.livecoinsStatus !== filter) return false;
      if (!query) return true;
      return (
        c.name.toLowerCase().includes(query) ||
        (c.tiktokUser ?? "").toLowerCase().includes(query) ||
        (c.livecoinsComment ?? "").toLowerCase().includes(query)
      );
    });
  }, [data, q, filter]);

  async function patchRow(
    id: string,
    body: { livecoinsStatus?: LiveStatus; livecoinsComment?: string }
  ) {
    setSaving((m) => ({ ...m, [id]: "Guardando…" }));
    try {
      const res = await fetch(PANEL.livecoins, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) throw new Error("fail");
      if (body.livecoinsStatus !== undefined) {
        await mutate();
        invalidatePanel(PANEL.creators);
      }
      setSaving((m) => ({ ...m, [id]: "Guardado" }));
      window.setTimeout(() => {
        setSaving((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
      }, 1200);
    } catch {
      setSaving((m) => ({ ...m, [id]: "Error" }));
      void mutate();
    }
  }

  function onCommentChange(id: string, value: string) {
    setSaving((m) => ({ ...m, [id]: "Autoguardando…" }));
    if (commentTimers.current[id]) {
      window.clearTimeout(commentTimers.current[id]);
    }
    commentTimers.current[id] = window.setTimeout(() => {
      void patchRow(id, { livecoinsComment: value });
    }, 650);
  }

  if (error) {
    return (
      <div>
        <TopBar
          title="App livecoins"
          subtitle="Seguimiento de adopción de la app"
        />
        <PanelLoadError onRetry={() => mutate()} />
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title="App livecoins"
        subtitle="Ordenados por diamantes · marca si ya tienen la app"
      />

      {!data ? (
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-panel h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="En roster"
              value={formatNumber(data.total)}
              hint="Creadores activos"
              icon={Smartphone}
            />
            <KpiCard
              label="App habilitada"
              value={formatNumber(data.counts.habilitada)}
              hint="Ya la usan"
              icon={Smartphone}
              tone="success"
            />
            <KpiCard
              label="Contactados"
              value={formatNumber(data.counts.contactado)}
              hint="Pendientes de activar"
              icon={Smartphone}
              tone="cyan"
            />
            <KpiCard
              label="No la quieren"
              value={formatNumber(data.counts.no_quiere)}
              hint={`${formatNumber(data.counts.pendiente)} aún pendientes`}
              icon={Smartphone}
              tone="warning"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar creador o comentario…"
              className={cn(inputClass, "max-w-xs")}
            />
            <select
              className={cn(inputClass, "w-auto")}
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as LiveStatus | "todos")
              }
            >
              <option value="todos">Todos los seguimientos</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <Panel className="mt-4 overflow-x-auto p-0">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-border-soft text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Creador</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 font-medium">Seguimiento</th>
                  <th className="px-4 py-2.5 font-medium">Comentario</th>
                  <th className="px-4 py-2.5 text-right font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-text-muted"
                    >
                      No hay creadores con ese filtro.
                    </td>
                  </tr>
                ) : (
                  rows.map((c) => {
                    const hasApp = c.livecoinsStatus === "habilitada";
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-border-soft/70 hover:bg-bg-hover/40"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <TikTokAvatar
                              username={c.tiktokUser}
                              name={c.name}
                              size={40}
                            />
                            <div>
                              <p className="font-medium">{c.name}</p>
                              <p className="text-xs text-text-muted">
                                {c.tiktokUser ? `@${c.tiktokUser}` : c.niche}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                              hasApp
                                ? "border-success/40 bg-success/15 text-success"
                                : "border-border-soft bg-bg-hover text-text-muted"
                            )}
                          >
                            {hasApp ? "Sí la tiene" : "No la tiene"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            className={cn(
                              selectClass,
                              hasApp && "border-success/30 text-success",
                              c.livecoinsStatus === "contactado" &&
                                "border-cyan/30 text-cyan",
                              c.livecoinsStatus === "no_quiere" &&
                                "border-danger/30 text-danger"
                            )}
                            value={c.livecoinsStatus}
                            onChange={(e) =>
                              void patchRow(c.id, {
                                livecoinsStatus: e.target
                                  .value as LiveStatus,
                              })
                            }
                          >
                            {STATUSES.map((s) => (
                              <option
                                key={s.value}
                                value={s.value}
                                className="bg-bg-elevated text-text"
                              >
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            defaultValue={c.livecoinsComment || ""}
                            placeholder="Escribe un comentario…"
                            className={commentClass}
                            onChange={(e) =>
                              onCommentChange(c.id, e.target.value)
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-[11px] text-text-muted">
                          {saving[c.id] ?? ""}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}
