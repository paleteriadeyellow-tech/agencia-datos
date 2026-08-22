"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronDown, ExternalLink, Plus, Trash2 } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, EmptyState, Field, Panel, inputClass } from "@/components/ui";
import { Modal } from "@/components/modal";
import { cn } from "@/lib/utils";
import { MESES_NOMBRE } from "@/lib/bonos";
import { PANEL, persistPanelCache, mutatePanel, usePanelData } from "@/lib/swr";
import {
  BOOST_OPTIONS,
  CONTENT_IDEAS,
  CONTENT_TYPES,
  CREATED_OPTIONS,
  REPLICATE_MODES,
  dateParts,
  formatDay,
  todayIso,
} from "@/lib/video-suggestions";

type Row = {
  id: string;
  date: string;
  year: number;
  month: number;
  contentType: string;
  contentIdea: string;
  objective: string;
  suggestedBy: string;
  videoUrl: string;
  boostRequest: string;
  managerToCreate: string;
  managerToCreateId: string | null;
  replicateMode: string;
  replicateCreators: string;
  videoCreated: string;
  script: string;
};

type Payload = {
  rows: Row[];
  years: number[];
  managers: { id: string; name: string; role: string }[];
};

const cellClass = cn(inputClass, "h-9 min-w-0 px-2.5 py-0 text-sm");
const areaClass = cn(inputClass, "min-h-[4.5rem] px-2.5 py-2 text-sm");

function withOption(list: readonly string[], value: string) {
  if (!value || list.includes(value)) return list;
  return [value, ...list];
}

function shortUrl(url: string) {
  const raw = url.trim();
  if (!raw) return "Sin link";
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const path = u.pathname === "/" ? "" : u.pathname;
    const shown = `${u.hostname.replace(/^www\./, "")}${path}`;
    return shown.length > 42 ? `${shown.slice(0, 42)}…` : shown;
  } catch {
    return raw.length > 42 ? `${raw.slice(0, 42)}…` : raw;
  }
}

function emptyDraft(suggestedBy: string) {
  return {
    date: todayIso(),
    videoUrl: "",
    managerToCreateId: "",
    managerToCreate: "",
    suggestedBy,
  };
}

export default function VideoSuggestionsClient() {
  const { data: session } = useSession();
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonthNum = String(now.getMonth() + 1);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonthNum);
  const [q, setQ] = useState("");
  const [hint, setHint] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => emptyDraft(""));
  const timers = useRef<Record<string, number>>({});

  const url = `${PANEL.videoSuggestions}?year=${year}&month=${month}`;
  const { data, error, mutate } = usePanelData(url);
  const payload = data as Payload | undefined;
  const rowsAll = payload?.rows ?? [];
  const managers = payload?.managers ?? [];

  const years = useMemo(() => {
    const y0 = Number(currentYear);
    const fromApi = payload?.years ?? [];
    return [...new Set([y0, y0 - 1, y0 + 1, ...fromApi])].sort((a, b) => b - a);
  }, [payload?.years, currentYear]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rowsAll;
    return rowsAll.filter((r) =>
      [
        r.contentType,
        r.contentIdea,
        r.objective,
        r.suggestedBy,
        r.managerToCreate,
        r.replicateCreators,
        r.script,
        r.videoUrl,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [rowsAll, q]);

  const writeList = useCallback(
    (targetYear: string, targetMonth: string, updater: (rows: Row[]) => Row[]) => {
      const key = `${PANEL.videoSuggestions}?year=${targetYear}&month=${targetMonth}`;
      void mutatePanel(
        key,
        (current: Payload | undefined) => {
          const base: Payload = current ?? {
            rows: [],
            years: payload?.years ?? [],
            managers,
          };
          const next = { ...base, rows: updater(base.rows) };
          persistPanelCache(key, next);
          return next;
        },
        { revalidate: false }
      );
    },
    [payload?.years, managers]
  );

  const patchRow = useCallback(
    (id: string, patch: Partial<Row>) => {
      writeList(year, month, (list) =>
        list.map((r) => (r.id === id ? { ...r, ...patch } : r))
      );
    },
    [writeList, year, month]
  );

  const saveFields = useCallback(
    (row: Row, patch: Partial<Row>) => {
      const next = { ...row, ...patch };
      if (patch.date) {
        const parts = dateParts(patch.date);
        next.year = parts.year;
        next.month = parts.month;
      }
      const stillHere =
        (year === "all" || next.year === Number(year)) &&
        (month === "all" || next.month === Number(month));
      if (stillHere) {
        patchRow(row.id, next);
      } else {
        writeList(year, month, (list) => list.filter((r) => r.id !== row.id));
        writeList(String(next.year), String(next.month), (list) => [next, ...list]);
      }
      const key = `f-${row.id}`;
      if (timers.current[key]) window.clearTimeout(timers.current[key]);
      timers.current[key] = window.setTimeout(() => {
        if (row.id.startsWith("tmp-")) return;
        void fetch(PANEL.videoSuggestions, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "upsert", ...next }),
        }).catch(() => {
          setHint("No se pudo guardar.");
          void mutate();
        });
      }, 400);
    },
    [patchRow, writeList, year, month, mutate]
  );

  const viewingCurrent = year === currentYear && month === currentMonthNum;
  const periodLabel =
    year !== "all" && month !== "all"
      ? `${MESES_NOMBRE[Number(month)]} ${year}`
      : year !== "all"
        ? `Archivo ${year}`
        : "Archivo";

  function openCreate() {
    setDraft(emptyDraft(session?.user?.name ?? ""));
    setHint("");
    setOpenAdd(true);
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const date = draft.date || todayIso();
    const parts = dateParts(date);
    const targetYear = String(parts.year);
    const targetMonth = String(parts.month);
    const tempId = `tmp-${Date.now()}`;
    const optimistic: Row = {
      id: tempId,
      date,
      year: parts.year,
      month: parts.month,
      contentType: "VIDEO",
      contentIdea: "",
      objective: "",
      suggestedBy: draft.suggestedBy || session?.user?.name || "",
      videoUrl: draft.videoUrl.trim(),
      boostRequest: "NO",
      managerToCreate: draft.managerToCreate,
      managerToCreateId: draft.managerToCreateId || null,
      replicateMode: "SOLO MANAGERS",
      replicateCreators: "",
      videoCreated: "AUN NO",
      script: "",
    };

    writeList(targetYear, targetMonth, (list) => [optimistic, ...list]);
    setYear(targetYear);
    setMonth(targetMonth);
    setOpenAdd(false);
    setOpenId(tempId);
    setAdding(true);

    try {
      const res = await fetch(PANEL.videoSuggestions, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          date: optimistic.date,
          year: optimistic.year,
          month: optimistic.month,
          contentType: optimistic.contentType,
          contentIdea: optimistic.contentIdea,
          objective: optimistic.objective,
          suggestedBy: optimistic.suggestedBy,
          videoUrl: optimistic.videoUrl,
          boostRequest: optimistic.boostRequest,
          managerToCreate: optimistic.managerToCreate,
          managerToCreateId: optimistic.managerToCreateId,
          replicateMode: optimistic.replicateMode,
          replicateCreators: optimistic.replicateCreators,
          videoCreated: optimistic.videoCreated,
          script: optimistic.script,
        }),
      });
      const json = (await res.json()) as { error?: string; row?: Row };
      if (!res.ok || !json.row) {
        writeList(targetYear, targetMonth, (list) =>
          list.filter((r) => r.id !== tempId)
        );
        setHint(json.error || "No se pudo agregar");
        setOpenId(null);
        return;
      }
      writeList(targetYear, targetMonth, (list) =>
        list.map((r) => (r.id === tempId ? { ...optimistic, ...json.row } : r))
      );
      setOpenId(json.row.id);
    } catch {
      writeList(targetYear, targetMonth, (list) =>
        list.filter((r) => r.id !== tempId)
      );
      setHint("No se pudo agregar");
      setOpenId(null);
    } finally {
      setAdding(false);
    }
  }

  function removeRow(id: string) {
    writeList(year, month, (list) => list.filter((r) => r.id !== id));
    if (openId === id) setOpenId(null);
    if (!id.startsWith("tmp-")) {
      void fetch(`${PANEL.videoSuggestions}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }).catch(() => {
        setHint("No se pudo eliminar");
        void mutate();
      });
    }
  }

  return (
    <div>
      <TopBar
        title="Sugerencia de video"
        subtitle={
          viewingCurrent
            ? `${periodLabel} · ideas para replicar`
            : `${periodLabel} · archivo`
        }
      />

      {error && !payload ? (
        <PanelLoadError
          message={error instanceof Error ? error.message : undefined}
          onRetry={() => void mutate()}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Año">
              <select
                className={inputClass}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value={currentYear}>{currentYear} · actual</option>
                <option value="all">Todos</option>
                {years.map((y) =>
                  String(y) === currentYear ? null : (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  )
                )}
              </select>
            </Field>
            <Field label="Mes">
              <select
                className={inputClass}
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              >
                <option value={currentMonthNum}>
                  {MESES_NOMBRE[Number(currentMonthNum)]} · mes actual
                </option>
                <option value="all">Archivo · todos los meses</option>
                {MESES_NOMBRE.slice(1).map((name, i) =>
                  String(i + 1) === currentMonthNum ? null : (
                    <option key={name} value={i + 1}>
                      {name} · archivo
                    </option>
                  )
                )}
              </select>
            </Field>
            <Field label="Buscar">
              <input
                className={inputClass}
                placeholder="Idea, manager, objetivo…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button type="button" className="w-full" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Agregar
              </Button>
            </div>
          </div>

          <p className="mb-3 text-xs text-text-muted">
            {rows.length} sugerencias
            {viewingCurrent
              ? ` · ${MESES_NOMBRE[Number(currentMonthNum)]} ${currentYear}`
              : " · archivo"}
            {" · "}
            {viewingCurrent ? (
              <button
                type="button"
                className="text-cyan hover:underline"
                onClick={() => {
                  setYear(currentYear);
                  setMonth("all");
                }}
              >
                Ver archivo
              </button>
            ) : (
              <button
                type="button"
                className="text-cyan hover:underline"
                onClick={() => {
                  setYear(currentYear);
                  setMonth(currentMonthNum);
                }}
              >
                Volver al mes actual
              </button>
            )}
          </p>

          {hint && <p className="mb-3 text-xs text-cyan">{hint}</p>}

          {!payload ? (
            <Panel>
              <div className="h-40 animate-pulse rounded-lg bg-bg-hover/40" />
            </Panel>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Sin sugerencias en este periodo"
              description={
                viewingCurrent
                  ? "Agrega una sugerencia con fecha, manager y el link del video."
                  : "No hay registros en este archivo. Cambia mes o año, o vuelve al mes actual."
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border-soft bg-bg-panel">
              <div className="hidden grid-cols-[8.5rem_1fr_minmax(0,1.4fr)_auto] gap-3 border-b border-border-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-text-muted sm:grid">
                <span>Fecha</span>
                <span>Manager</span>
                <span>Link del video</span>
                <span className="w-16" />
              </div>
              {rows.map((row) => {
                const open = openId === row.id;
                const ideas = withOption(CONTENT_IDEAS, row.contentIdea);
                const types = withOption(CONTENT_TYPES, row.contentType);
                const boosts = withOption(BOOST_OPTIONS, row.boostRequest);
                const modes = withOption(REPLICATE_MODES, row.replicateMode);
                const created = withOption(CREATED_OPTIONS, row.videoCreated);
                const managerLabel = row.managerToCreate || "Sin asignar";
                return (
                  <div
                    key={row.id}
                    className={cn(
                      "border-b border-border-soft/70 last:border-b-0",
                      open && "bg-bg-hover/15"
                    )}
                  >
                    <div
                      className="flex cursor-pointer items-center gap-3 px-4 py-2.5 sm:grid sm:grid-cols-[8.5rem_1fr_minmax(0,1.4fr)_auto] sm:gap-3"
                      onClick={() => setOpenId(open ? null : row.id)}
                    >
                      <span className="w-[7.5rem] shrink-0 text-sm font-medium tabular-nums sm:w-auto">
                        {formatDay(row.date)}
                      </span>
                      <span
                        className={cn(
                          "hidden min-w-0 truncate text-sm sm:block",
                          row.managerToCreate ? "font-medium" : "text-text-muted"
                        )}
                      >
                        {managerLabel}
                      </span>
                      <span className="hidden min-w-0 items-center gap-2 truncate text-sm text-cyan sm:flex">
                        {shortUrl(row.videoUrl)}
                      </span>
                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        {row.videoUrl.trim() && (
                          <a
                            href={row.videoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-cyan hover:bg-cyan/10"
                            title="Abrir link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-text-muted transition",
                            open && "rotate-180"
                          )}
                        />
                        <button
                          type="button"
                          title="Eliminar"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-danger/15 hover:text-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRow(row.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="px-4 pb-2 text-xs text-text-muted sm:hidden">
                      <p>{managerLabel}</p>
                      <p className="truncate text-cyan">{shortUrl(row.videoUrl)}</p>
                    </div>

                    {open && (
                      <div className="grid gap-3 border-t border-border-soft/70 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
                        <label className="block space-y-1">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                            Fecha
                          </span>
                          <input
                            type="date"
                            className={cellClass}
                            value={row.date}
                            onChange={(e) =>
                              saveFields(row, { date: e.target.value })
                            }
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                            Manager a crear
                          </span>
                          <select
                            className={cellClass}
                            value={row.managerToCreateId ?? ""}
                            onChange={(e) => {
                              const id = e.target.value;
                              const name =
                                managers.find((m) => m.id === id)?.name ?? "";
                              saveFields(row, {
                                managerToCreateId: id || null,
                                managerToCreate: name,
                              });
                            }}
                          >
                            <option value="">Sin asignar</option>
                            {managers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1 sm:col-span-2 xl:col-span-1">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                            Link del video
                          </span>
                          <input
                            className={cellClass}
                            placeholder="https://tiktok.com/…"
                            value={row.videoUrl}
                            onChange={(e) =>
                              saveFields(row, { videoUrl: e.target.value })
                            }
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                            Tipo de contenido
                          </span>
                          <select
                            className={cellClass}
                            value={row.contentType}
                            onChange={(e) =>
                              saveFields(row, { contentType: e.target.value })
                            }
                          >
                            {types.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                            Idea de contenido
                          </span>
                          <select
                            className={cellClass}
                            value={row.contentIdea}
                            onChange={(e) =>
                              saveFields(row, { contentIdea: e.target.value })
                            }
                          >
                            <option value="">Elegir</option>
                            {ideas.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                            Sugerencia de
                          </span>
                          <input
                            className={cellClass}
                            placeholder="Quién sugiere"
                            value={row.suggestedBy}
                            onChange={(e) =>
                              saveFields(row, { suggestedBy: e.target.value })
                            }
                          />
                        </label>
                        <label className="block space-y-1 sm:col-span-2">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                            Objetivo
                          </span>
                          <textarea
                            className={areaClass}
                            rows={2}
                            placeholder="Objetivo del video"
                            value={row.objective}
                            onChange={(e) =>
                              saveFields(row, { objective: e.target.value })
                            }
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                            Petición de impulso
                          </span>
                          <select
                            className={cn(
                              cellClass,
                              row.boostRequest === "SI"
                                ? "border-success/40 text-success"
                                : "text-text-muted"
                            )}
                            value={row.boostRequest}
                            onChange={(e) =>
                              saveFields(row, { boostRequest: e.target.value })
                            }
                          >
                            {boosts.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                            Creadores a replicar
                          </span>
                          <select
                            className={cellClass}
                            value={row.replicateMode}
                            onChange={(e) =>
                              saveFields(row, {
                                replicateMode: e.target.value,
                                replicateCreators:
                                  e.target.value === "SOLO MANAGERS"
                                    ? ""
                                    : row.replicateCreators,
                              })
                            }
                          >
                            {modes.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                          {row.replicateMode === "ELEGIR" && (
                            <input
                              className={cn(cellClass, "mt-1")}
                              placeholder="@creadores"
                              value={row.replicateCreators}
                              onChange={(e) =>
                                saveFields(row, {
                                  replicateCreators: e.target.value,
                                })
                              }
                            />
                          )}
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                            Se creó video
                          </span>
                          <select
                            className={cn(
                              cellClass,
                              row.videoCreated === "SI"
                                ? "border-success/40 text-success"
                                : row.videoCreated === "EN PROCESO"
                                  ? "border-warning/40 text-warning"
                                  : "text-text-muted"
                            )}
                            value={row.videoCreated}
                            onChange={(e) =>
                              saveFields(row, { videoCreated: e.target.value })
                            }
                          >
                            {created.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1 sm:col-span-2 xl:col-span-3">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                            Guion del video
                          </span>
                          <textarea
                            className={areaClass}
                            rows={3}
                            placeholder="Guion…"
                            value={row.script}
                            onChange={(e) =>
                              saveFields(row, { script: e.target.value })
                            }
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <Modal
            open={openAdd}
            onClose={() => setOpenAdd(false)}
            title="Nueva sugerencia"
            subtitle="Fecha, manager y el link. El resto lo completas al desplegar la fila."
          >
            <form onSubmit={(e) => void submitAdd(e)} className="space-y-4">
              <label className="block space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  Fecha
                </span>
                <input
                  type="date"
                  required
                  className={cn(inputClass, "h-10 py-0")}
                  value={draft.date}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, date: e.target.value }))
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  Manager a crear
                </span>
                <select
                  className={cn(inputClass, "h-10 py-0")}
                  value={draft.managerToCreateId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const name = managers.find((m) => m.id === id)?.name ?? "";
                    setDraft((d) => ({
                      ...d,
                      managerToCreateId: id,
                      managerToCreate: name,
                    }));
                  }}
                >
                  <option value="">Sin asignar</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  Link del video
                </span>
                <input
                  className={cn(inputClass, "h-10 py-0")}
                  placeholder="https://tiktok.com/…"
                  value={draft.videoUrl}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, videoUrl: e.target.value }))
                  }
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpenAdd(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={adding}>
                  {adding ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </form>
          </Modal>
        </>
      )}
    </div>
  );
}
