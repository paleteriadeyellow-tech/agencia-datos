"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, EmptyState, Field, Panel, inputClass } from "@/components/ui";
import { Modal } from "@/components/modal";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { cn } from "@/lib/utils";
import { MESES_NOMBRE } from "@/lib/bonos";
import { PANEL, persistPanelCache, usePanelData } from "@/lib/swr";
import { mutate as cacheMutate } from "swr";
import {
  CHECK_KEYS,
  ONBOARDING_CHECKS,
  ONBOARDING_GROUPS,
  ONBOARDING_SITUATIONS,
  checkedCount,
} from "@/lib/onboarding";

type Row = {
  id: string;
  creatorName: string;
  phone: string;
  situation: string;
  integrationMonth: string;
  year: number | null;
  month: number | null;
  managerId: string | null;
  managerName: string;
  checks: Record<string, boolean>;
};

type Payload = {
  rows: Row[];
  years: number[];
};

const TOTAL = CHECK_KEYS.length;

export default function OnboardingClient() {
  const { data: session } = useSession();
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonthNum = String(now.getMonth() + 1);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonthNum);
  const [q, setQ] = useState("");
  const [hint, setHint] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftSituation, setDraftSituation] = useState("capacitación");
  const timers = useRef<Record<string, number>>({});

  const url = `${PANEL.onboarding}?year=${year}&month=${month}`;
  const { data, error, mutate } = usePanelData(url);
  const payload = data as Payload | undefined;
  const rowsAll = payload?.rows ?? [];

  const years = useMemo(() => {
    const y0 = Number(currentYear);
    const fromApi = payload?.years ?? [];
    return [...new Set([y0, y0 - 1, y0 + 1, ...fromApi])].sort((a, b) => b - a);
  }, [payload?.years, currentYear]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rowsAll;
    return rowsAll.filter(
      (r) =>
        r.creatorName.toLowerCase().includes(query) ||
        r.phone.toLowerCase().includes(query) ||
        r.situation.toLowerCase().includes(query) ||
        r.managerName.toLowerCase().includes(query)
    );
  }, [rowsAll, q]);

  const writeList = useCallback(
    (targetYear: string, targetMonth: string, updater: (rows: Row[]) => Row[]) => {
      const key = `${PANEL.onboarding}?year=${targetYear}&month=${targetMonth}`;
      void cacheMutate(
        key,
        (current: Payload | undefined) => {
          const base: Payload = current ?? { rows: [], years: payload?.years ?? [] };
          const next = { ...base, rows: updater(base.rows) };
          persistPanelCache(key, next);
          return next;
        },
        { revalidate: false }
      );
    },
    [payload?.years]
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
      patchRow(row.id, patch);
      const key = `f-${row.id}`;
      if (timers.current[key]) window.clearTimeout(timers.current[key]);
      timers.current[key] = window.setTimeout(() => {
        void fetch(PANEL.onboarding, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "upsert",
            id: row.id,
            creatorName: patch.creatorName ?? row.creatorName,
            phone: patch.phone ?? row.phone,
            situation: patch.situation ?? row.situation,
            integrationMonth: patch.integrationMonth ?? row.integrationMonth,
          }),
        });
      }, 400);
    },
    [patchRow]
  );

  function toggleCheck(row: Row, key: string) {
    const done = !row.checks[key];
    const checks = { ...row.checks };
    if (done) checks[key] = true;
    else delete checks[key];
    patchRow(row.id, { checks });
    void fetch(PANEL.onboarding, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", id: row.id, key, done }),
    }).catch(() => {
      setHint("No se pudo guardar el check.");
      void mutate();
    });
  }

  const viewingCurrent = year === currentYear && month === currentMonthNum;
  const periodLabel =
    year !== "all" && month !== "all"
      ? `${MESES_NOMBRE[Number(month)]} ${year}`
      : year !== "all"
        ? `Archivo ${year}`
        : "Archivo";

  function targetPeriod() {
    const y = year === "all" ? currentYear : year;
    const m = month === "all" ? currentMonthNum : month;
    return { y, m };
  }

  function addRow(e: React.FormEvent) {
    e.preventDefault();
    const creatorName = draftName.trim();
    if (!creatorName) {
      setHint("Escribe el usuario del creador.");
      return;
    }
    const { y: targetYear, m: targetMonth } = targetPeriod();
    const tempId = `tmp-${Date.now()}`;
    const optimistic: Row = {
      id: tempId,
      creatorName,
      phone: draftPhone.trim(),
      situation: draftSituation,
      integrationMonth: MESES_NOMBRE[Number(targetMonth)] ?? "",
      year: Number(targetYear),
      month: Number(targetMonth),
      managerId: session?.user?.id ?? null,
      managerName: session?.user?.name ?? "",
      checks: {},
    };
    writeList(targetYear, targetMonth, (list) => [optimistic, ...list]);
    setYear(targetYear);
    setMonth(targetMonth);
    setOpenAdd(false);
    setOpenId(tempId);
    setDraftName("");
    setDraftPhone("");
    setDraftSituation("capacitación");
    setHint(`Agregado: ${creatorName} · ${MESES_NOMBRE[Number(targetMonth)]} ${targetYear}`);

    void fetch(PANEL.onboarding, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        creatorName,
        phone: optimistic.phone,
        situation: optimistic.situation,
        integrationMonth: optimistic.integrationMonth,
        year: Number(targetYear),
        month: Number(targetMonth),
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
        setOpenId(json.row.id);
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
    if (openId === id) setOpenId(null);
    if (!id.startsWith("tmp-")) {
      void fetch(`${PANEL.onboarding}?id=${encodeURIComponent(id)}`, {
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
        title="Control de usuarios"
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
                placeholder="@usuario o teléfono"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button type="button" className="w-full" onClick={() => setOpenAdd(true)}>
                <Plus className="h-4 w-4" />
                Agregar
              </Button>
            </div>
          </div>

          <p className="mb-3 text-xs text-text-muted">
            {rows.length} usuarios
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
                onClick={goCurrent}
              >
                Volver al mes actual
              </button>
            )}
          </p>

          {hint && <p className="mb-3 text-xs text-cyan">{hint}</p>}

          {!rows.length ? (
            <EmptyState
              title="Nadie en este periodo"
              description={
                viewingCurrent
                  ? "No hay usuarios de este mes. Revisa el archivo o agrega uno."
                  : "No hay registros en este archivo. Cambia mes o año, o vuelve al mes actual."
              }
              action={
                <Button type="button" onClick={() => setOpenAdd(true)}>
                  <Plus className="h-4 w-4" />
                  Agregar usuario
                </Button>
              }
            />
          ) : (
            <Panel className="overflow-hidden p-0">
              {rows.map((row) => {
                const open = openId === row.id;
                const done = checkedCount(row.checks);
                const situationOpts = ONBOARDING_SITUATIONS.includes(
                  row.situation as (typeof ONBOARDING_SITUATIONS)[number]
                )
                  ? ONBOARDING_SITUATIONS
                  : row.situation
                    ? [row.situation, ...ONBOARDING_SITUATIONS]
                    : ONBOARDING_SITUATIONS;
                return (
                  <div
                    key={row.id}
                    className="border-b border-border-soft/70 last:border-b-0"
                  >
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : row.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <TikTokAvatar
                          username={row.creatorName}
                          name={row.creatorName}
                          size={28}
                          link={false}
                        />
                        <span className="w-[10rem] shrink-0 truncate text-sm font-medium">
                          {row.creatorName.startsWith("@")
                            ? row.creatorName
                            : `@${row.creatorName}`}
                        </span>
                        <span className="hidden min-w-0 flex-1 truncate text-xs text-text-muted md:block">
                          {row.phone || "Sin teléfono"}
                        </span>
                        <span className="hidden shrink-0 text-xs text-text-muted lg:block">
                          {row.managerName || "—"}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                            done === TOTAL
                              ? "bg-success/15 text-success"
                              : "bg-bg-hover text-text-muted"
                          )}
                        >
                          {done}/{TOTAL}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 text-text-muted transition",
                            open && "rotate-180"
                          )}
                        />
                      </button>
                      <select
                        className={cn(inputClass, "h-8 w-[9.5rem] shrink-0 px-2 py-0 text-xs")}
                        value={row.situation}
                        onChange={(e) =>
                          saveFields(row, { situation: e.target.value })
                        }
                      >
                        {situationOpts.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        title="Eliminar"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-danger/15 hover:text-danger"
                        onClick={() => removeRow(row.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {open && (
                      <div className="space-y-4 border-t border-border-soft/70 px-3 py-3">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <label className="block space-y-1">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                              Creador
                            </span>
                            <input
                              className={cn(inputClass, "h-9 py-0 text-sm")}
                              value={row.creatorName}
                              onChange={(e) =>
                                saveFields(row, { creatorName: e.target.value })
                              }
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                              Teléfono
                            </span>
                            <input
                              className={cn(inputClass, "h-9 py-0 text-sm")}
                              value={row.phone}
                              onChange={(e) =>
                                saveFields(row, { phone: e.target.value })
                              }
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                              Fecha de integración
                            </span>
                            <input
                              className={cn(inputClass, "h-9 py-0 text-sm")}
                              placeholder="julio"
                              value={row.integrationMonth}
                              onChange={(e) =>
                                saveFields(row, {
                                  integrationMonth: e.target.value,
                                })
                              }
                            />
                          </label>
                          <div className="flex items-end">
                            <p className="text-xs text-text-muted">
                              {done} de {TOTAL} pasos listos
                            </p>
                          </div>
                        </div>

                        {ONBOARDING_GROUPS.map((group) => {
                          const cols = ONBOARDING_CHECKS.filter(
                            (c) => c.group === group.id
                          );
                          return (
                            <section key={group.id}>
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan">
                                {group.label}
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {cols.map((col) => {
                                  const on = Boolean(row.checks[col.key]);
                                  return (
                                    <button
                                      key={col.key}
                                      type="button"
                                      onClick={() => toggleCheck(row, col.key)}
                                      className={cn(
                                        "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition",
                                        on
                                          ? "border-success/40 bg-success/10 text-success"
                                          : "border-border text-text-muted hover:bg-bg-hover hover:text-text"
                                      )}
                                    >
                                      <span
                                        className={cn(
                                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                          on
                                            ? "border-success bg-success text-white"
                                            : "border-border-soft"
                                        )}
                                      >
                                        {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                                      </span>
                                      <span className="leading-tight">{col.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </Panel>
          )}
        </>
      )}

      <Modal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        title="Agregar usuario"
        subtitle={`Se guarda en ${
          year === "all" || month === "all"
            ? `${MESES_NOMBRE[Number(currentMonthNum)]} ${currentYear}`
            : `${MESES_NOMBRE[Number(month)]} ${year}`
        }. Al agregarlo salen todos los pasos para ir marcando.`}
      >
        <form onSubmit={addRow} className="space-y-4">
          <Field label="Creador">
            <input
              className={inputClass}
              required
              placeholder="@usuario"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Teléfono">
            <input
              className={inputClass}
              placeholder="521..."
              value={draftPhone}
              onChange={(e) => setDraftPhone(e.target.value)}
            />
          </Field>
          <Field label="Situación">
            <select
              className={inputClass}
              value={draftSituation}
              onChange={(e) => setDraftSituation(e.target.value)}
            >
              {ONBOARDING_SITUATIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpenAdd(false)}>
              Cancelar
            </Button>
            <Button type="submit">Agregar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
