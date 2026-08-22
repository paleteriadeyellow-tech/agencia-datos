"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, Field, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MESES_NOMBRE } from "@/lib/bonos";
import { PANEL, persistPanelCache, usePanelData } from "@/lib/swr";
import { mutate as cacheMutate } from "swr";
import { useCreatorsRoster } from "@/lib/use-creators-roster";
import {
  BATTLE_COLORS,
  BATTLE_COLUMNS,
  battleColorClass,
} from "@/lib/battles";

type Card = {
  id: string;
  year: number;
  month: number;
  columnKey: string;
  creatorName: string;
  note: string;
  color: string;
  done: boolean;
  sortOrder: number;
  managerName: string;
};

type Payload = {
  year: number;
  month: number;
  rows: Card[];
  years: number[];
};

export default function BattlesClient() {
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonthNum = String(now.getMonth() + 1);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonthNum);
  const [hint, setHint] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, number>>({});
  const { creators: roster } = useCreatorsRoster();

  const url = `${PANEL.battles}?year=${year}&month=${month}`;
  const { data, error, mutate } = usePanelData(url);
  const payload = data as Payload | undefined;
  const rows = payload?.rows ?? [];

  const years = useMemo(() => {
    const y0 = Number(currentYear);
    const fromApi = payload?.years ?? [];
    return [...new Set([y0, y0 - 1, y0 + 1, ...fromApi])].sort((a, b) => b - a);
  }, [payload?.years, currentYear]);

  const viewingCurrent = year === currentYear && month === currentMonthNum;
  const periodLabel = `${MESES_NOMBRE[Number(month)]} ${year}`;

  const byColumn = useMemo(() => {
    const map: Record<string, Card[]> = {};
    for (const col of BATTLE_COLUMNS) map[col.id] = [];
    for (const row of rows) {
      (map[row.columnKey] ?? (map[row.columnKey] = [])).push(row);
    }
    return map;
  }, [rows]);

  const writeList = useCallback(
    (updater: (rows: Card[]) => Card[]) => {
      void cacheMutate(
        url,
        (current: Payload | undefined) => {
          const base: Payload = current ?? {
            year: Number(year),
            month: Number(month),
            rows: [],
            years: payload?.years ?? [],
          };
          const next = { ...base, rows: updater(base.rows) };
          persistPanelCache(url, next);
          return next;
        },
        { revalidate: false }
      );
    },
    [url, year, month, payload?.years]
  );

  const patchCard = useCallback(
    (id: string, patch: Partial<Card>) => {
      writeList((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      if (timers.current[id]) window.clearTimeout(timers.current[id]);
      timers.current[id] = window.setTimeout(() => {
        void fetch(PANEL.battles, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "upsert", id, ...patch }),
        }).catch(() => {
          setHint("No se pudo guardar.");
          void mutate();
        });
      }, 280);
    },
    [writeList, mutate]
  );

  function addCard(columnKey: string) {
    const creatorName = (drafts[columnKey] ?? "").trim();
    if (!creatorName) return;
    const tempId = `tmp-${Date.now()}`;
    const optimistic: Card = {
      id: tempId,
      year: Number(year),
      month: Number(month),
      columnKey,
      creatorName,
      note: "",
      color: "none",
      done: false,
      sortOrder: (byColumn[columnKey]?.length ?? 0) + 1,
      managerName: "",
    };
    writeList((list) => [...list, optimistic]);
    setDrafts((d) => ({ ...d, [columnKey]: "" }));
    void fetch(PANEL.battles, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        columnKey,
        creatorName,
        year: Number(year),
        month: Number(month),
      }),
    })
      .then(async (res) => {
        const json = (await res.json()) as { row?: Card; error?: string };
        if (!res.ok || !json.row) {
          writeList((list) => list.filter((r) => r.id !== tempId));
          setHint(json.error || "No se pudo agregar");
          return;
        }
        writeList((list) =>
          list.map((r) => (r.id === tempId ? { ...optimistic, ...json.row } : r))
        );
      })
      .catch(() => {
        writeList((list) => list.filter((r) => r.id !== tempId));
        setHint("No se pudo agregar");
      });
  }

  function removeCard(id: string) {
    writeList((list) => list.filter((r) => r.id !== id));
    if (!id.startsWith("tmp-")) {
      void fetch(`${PANEL.battles}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }).catch(() => {
        setHint("No se pudo eliminar");
        void mutate();
      });
    }
  }

  function goCurrent() {
    setYear(currentYear);
    setMonth(currentMonthNum);
  }

  return (
    <div>
      <TopBar
        title="Graduación de batallas"
        subtitle={
          viewingCurrent
            ? `${periodLabel} · mes en curso`
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
                {MESES_NOMBRE.slice(1).map((name, i) =>
                  String(i + 1) === currentMonthNum ? null : (
                    <option key={name} value={i + 1}>
                      {name} · archivo
                    </option>
                  )
                )}
              </select>
            </Field>
            <div className="flex items-end sm:col-span-2">
              <Button type="button" variant="secondary" onClick={goCurrent}>
                Mes actual
              </Button>
            </div>
          </div>

          <p className="mb-3 text-[11px] leading-relaxed text-text-muted">
            Novatos: más de 20 mil diamantes mensuales. Toca el color o la palomita
            para marcar el estado. Escribe un usuario y Enter para agregarlo a la
            columna.
            {!viewingCurrent && (
              <>
                {" "}
                <button
                  type="button"
                  className="text-cyan hover:underline"
                  onClick={goCurrent}
                >
                  Volver al mes actual
                </button>
              </>
            )}
          </p>
          {hint && <p className="mb-3 text-xs text-cyan">{hint}</p>}

          <datalist id="battle-creators">
            {roster.map((c) => (
              <option key={c.id} value={c.tiktokUser || c.name} />
            ))}
          </datalist>

          <div className="overflow-x-auto pb-4">
            <div className="flex min-w-[1480px] gap-2">
              {BATTLE_COLUMNS.map((col) => {
                const cards = byColumn[col.id] ?? [];
                return (
                  <section
                    key={col.id}
                    className="flex w-[142px] shrink-0 flex-col rounded-xl border border-sky-500/20 bg-sky-500/5"
                  >
                    <header className="rounded-t-xl bg-sky-600/40 px-2 py-2 text-center">
                      <h2 className="text-[10px] font-bold uppercase leading-tight tracking-wide text-white">
                        {col.label}
                      </h2>
                      <p className="mt-0.5 text-[10px] text-sky-100/80">
                        {cards.length}
                      </p>
                    </header>
                    <div className="flex flex-1 flex-col gap-1.5 p-1.5">
                      {cards.map((card) => (
                        <article
                          key={card.id}
                          className={cn(
                            "rounded-lg border px-1.5 py-1.5",
                            battleColorClass(card.color),
                            card.done && "opacity-70"
                          )}
                        >
                          <div className="flex items-start gap-1">
                            <button
                              type="button"
                              title={card.done ? "Quitar palomita" : "Marcar listo"}
                              onClick={() =>
                                patchCard(card.id, { done: !card.done })
                              }
                              className={cn(
                                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                card.done
                                  ? "border-success bg-success text-white"
                                  : "border-border-soft"
                              )}
                            >
                              {card.done ? (
                                <Check className="h-3 w-3" strokeWidth={3} />
                              ) : null}
                            </button>
                            <input
                              className="min-w-0 flex-1 bg-transparent text-[11px] font-medium outline-none"
                              value={card.creatorName}
                              onChange={(e) =>
                                patchCard(card.id, { creatorName: e.target.value })
                              }
                            />
                            <button
                              type="button"
                              className="text-text-muted hover:text-danger"
                              onClick={() => removeCard(card.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <input
                            className="mt-1 w-full bg-transparent text-[10px] text-text-muted outline-none"
                            placeholder="nota / horario"
                            value={card.note}
                            onChange={(e) =>
                              patchCard(card.id, { note: e.target.value })
                            }
                          />
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {BATTLE_COLORS.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                title={c.label}
                                onClick={() => patchCard(card.id, { color: c.id })}
                                className={cn(
                                  "h-2.5 w-2.5 rounded-full border",
                                  c.className,
                                  card.color === c.id && "ring-1 ring-white"
                                )}
                              />
                            ))}
                          </div>
                          <select
                            className="mt-1 w-full bg-transparent text-[10px] text-text-muted outline-none"
                            value={card.columnKey}
                            onChange={(e) =>
                              patchCard(card.id, { columnKey: e.target.value })
                            }
                          >
                            {BATTLE_COLUMNS.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </article>
                      ))}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          addCard(col.id);
                        }}
                        className="mt-auto"
                      >
                        <div className="flex items-center gap-1 rounded-lg border border-dashed border-border-soft px-1.5 py-1">
                          <Plus className="h-3 w-3 text-text-muted" />
                          <input
                            list="battle-creators"
                            className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-text-muted/50"
                            placeholder="Agregar…"
                            value={drafts[col.id] ?? ""}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [col.id]: e.target.value }))
                            }
                          />
                        </div>
                      </form>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
