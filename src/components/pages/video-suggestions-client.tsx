"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, EmptyState, Field, Panel, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MESES_NOMBRE } from "@/lib/bonos";
import { PANEL, persistPanelCache, usePanelData } from "@/lib/swr";
import { mutate as cacheMutate } from "swr";
import {
  BOOST_OPTIONS,
  CONTENT_IDEAS,
  CONTENT_TYPES,
  CREATED_OPTIONS,
  REPLICATE_MODES,
  dateParts,
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

const cellClass = cn(inputClass, "h-8 min-w-[7.5rem] px-2 py-0 text-xs");
const areaClass = cn(inputClass, "min-h-[2.5rem] min-w-[10rem] px-2 py-1.5 text-xs");

function withOption(list: readonly string[], value: string) {
  if (!value || list.includes(value)) return list;
  return [value, ...list];
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
      void cacheMutate(
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

  function addRow() {
    const date = todayIso();
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
      suggestedBy: session?.user?.name ?? "",
      videoUrl: "",
      boostRequest: "NO",
      managerToCreate: "",
      managerToCreateId: null,
      replicateMode: "SOLO MANAGERS",
      replicateCreators: "",
      videoCreated: "AUN NO",
      script: "",
    };
    writeList(targetYear, targetMonth, (list) => [optimistic, ...list]);
    setYear(targetYear);
    setMonth(targetMonth);
    setHint("Fila agregada. Completa los campos en la tabla.");

    void fetch(PANEL.videoSuggestions, {
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
    })
      .then(async (res) => {
        const json = (await res.json()) as { error?: string; row?: Row };
        if (!res.ok || !json.row) {
          writeList(targetYear, targetMonth, (list) =>
            list.filter((r) => r.id !== tempId)
          );
          setHint(json.error || "No se pudo agregar");
          return;
        }
        writeList(targetYear, targetMonth, (list) =>
          list.map((r) => (r.id === tempId ? { ...optimistic, ...json.row } : r))
        );
      })
      .catch(() => {
        writeList(targetYear, targetMonth, (list) =>
          list.filter((r) => r.id !== tempId)
        );
        setHint("No se pudo agregar");
      });
  }

  function removeRow(id: string) {
    writeList(year, month, (list) => list.filter((r) => r.id !== id));
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

      {error ? (
        <PanelLoadError onRetry={() => void mutate()} />
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
              <Button type="button" className="w-full" onClick={addRow}>
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
                  ? "Agrega una fila y completa la idea, el link y a quién le toca crearla."
                  : "No hay registros en este archivo. Cambia mes o año, o vuelve al mes actual."
              }
            />
          ) : (
            <Panel className="overflow-x-auto p-0">
              <table className="w-full min-w-[1480px] text-left text-sm">
                <thead className="border-b border-border-soft text-[10px] uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Fecha</th>
                    <th className="px-3 py-2.5 font-medium">Tipo de contenido</th>
                    <th className="px-3 py-2.5 font-medium">Idea de contenido</th>
                    <th className="px-3 py-2.5 font-medium">Objetivo</th>
                    <th className="px-3 py-2.5 font-medium">Sugerencia de</th>
                    <th className="px-3 py-2.5 font-medium">Link del video</th>
                    <th className="px-3 py-2.5 font-medium">Petición de impulso</th>
                    <th className="px-3 py-2.5 font-medium">Manager a crear</th>
                    <th className="px-3 py-2.5 font-medium">Creadores a replicar</th>
                    <th className="px-3 py-2.5 font-medium">Se creó video</th>
                    <th className="px-3 py-2.5 font-medium">Guion del video</th>
                    <th className="px-3 py-2.5 text-right font-medium"> </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const ideas = withOption(CONTENT_IDEAS, row.contentIdea);
                    const types = withOption(CONTENT_TYPES, row.contentType);
                    const boosts = withOption(BOOST_OPTIONS, row.boostRequest);
                    const modes = withOption(REPLICATE_MODES, row.replicateMode);
                    const created = withOption(CREATED_OPTIONS, row.videoCreated);
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border-soft/70 align-top hover:bg-bg-hover/30"
                      >
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            className={cn(cellClass, "min-w-[8.5rem]")}
                            value={row.date}
                            onChange={(e) =>
                              saveFields(row, { date: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
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
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className={cn(cellClass, "min-w-[10rem]")}
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
                        </td>
                        <td className="px-3 py-2">
                          <textarea
                            className={cn(areaClass, "min-w-[12rem]")}
                            rows={2}
                            placeholder="Objetivo del video"
                            value={row.objective}
                            onChange={(e) =>
                              saveFields(row, { objective: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={cellClass}
                            placeholder="Quién sugiere"
                            value={row.suggestedBy}
                            onChange={(e) =>
                              saveFields(row, { suggestedBy: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              className={cn(cellClass, "min-w-[11rem]")}
                              placeholder="https://tiktok.com/…"
                              value={row.videoUrl}
                              onChange={(e) =>
                                saveFields(row, { videoUrl: e.target.value })
                              }
                            />
                            {row.videoUrl.trim() && (
                              <a
                                href={row.videoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-cyan hover:bg-cyan/10"
                                title="Abrir link"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className={cn(
                              cellClass,
                              "min-w-[5.5rem]",
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
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className={cn(cellClass, "min-w-[9rem]")}
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
                        </td>
                        <td className="px-3 py-2">
                          <div className="space-y-1">
                            <select
                              className={cn(cellClass, "min-w-[9.5rem]")}
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
                                className={cn(cellClass, "min-w-[9.5rem]")}
                                placeholder="@creadores"
                                value={row.replicateCreators}
                                onChange={(e) =>
                                  saveFields(row, {
                                    replicateCreators: e.target.value,
                                  })
                                }
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className={cn(
                              cellClass,
                              "min-w-[7.5rem]",
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
                        </td>
                        <td className="px-3 py-2">
                          <textarea
                            className={cn(areaClass, "min-w-[14rem]")}
                            rows={2}
                            placeholder="Guion…"
                            value={row.script}
                            onChange={(e) =>
                              saveFields(row, { script: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            title="Eliminar"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-danger/15 hover:text-danger"
                            onClick={() => removeRow(row.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
