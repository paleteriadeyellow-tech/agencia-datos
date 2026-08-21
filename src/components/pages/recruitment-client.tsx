"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronDown, Download, Plus, Trash2, Upload } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, EmptyState, Field, Panel, inputClass } from "@/components/ui";
import { Modal } from "@/components/modal";
import { cn } from "@/lib/utils";
import { MESES_NOMBRE } from "@/lib/bonos";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";
import { useViewAs } from "@/components/view-as";
import { isAdmin } from "@/lib/permissions";
import {
  RECRUITMENT_COLUMNS,
  RECRUITMENT_GROUPS,
  SITUATION_OPTIONS,
  STEP_KEYS,
  dateParts,
  parseRecruitmentSheet,
  templateHeaders,
} from "@/lib/recruitment";
import { nickKey } from "@/lib/scope-view";

type Lead = {
  id: string;
  recruiter: string;
  managerId: string | null;
  requestDate: string | null;
  year: number | null;
  month: number | null;
  creatorName: string;
  situation: string;
  phone: string;
  comment: string;
  comment2: string;
  recontact: string;
  integrationDate: string | null;
  steps: Record<string, string>;
};

type Payload = {
  isAdmin: boolean;
  rows: Lead[];
  managers: { id: string; name: string; role: string }[];
  years: number[];
};

const IDENTITY_KEYS = new Set([
  "recruiter",
  "requestDate",
  "creatorName",
  "situation",
  "phone",
]);

function situationBar(situation: string) {
  const s = situation.toLowerCase();
  if (s.includes("no apto")) return "border-l-danger";
  if (s.includes("apto")) return "border-l-success";
  if (s.includes("pendiente")) return "border-l-warning";
  return "border-l-cyan/40";
}

function formatDay(iso: string | null) {
  if (!iso) return "Sin fecha";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function todayIso() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function emptyDraft(recruiter: string): Record<string, string> {
  return {
    creatorName: "",
    recruiter,
    managerId: "",
    requestDate: todayIso(),
    phone: "",
    situation: "pendiente",
    comment: "",
    comment2: "",
    recontact: "",
    integrationDate: "",
  };
}

function cellValue(row: Lead, key: string) {
  if (key === "recruiter") return row.recruiter;
  if (key === "requestDate") return row.requestDate ?? "";
  if (key === "creatorName") return row.creatorName;
  if (key === "situation") return row.situation;
  if (key === "phone") return row.phone;
  if (key === "comment") return row.comment;
  if (key === "comment2") return row.comment2;
  if (key === "recontact") return row.recontact;
  if (key === "integrationDate") return row.integrationDate ?? "";
  return row.steps[key] ?? "";
}

function patchFromKey(key: string, value: string): Partial<Lead> {
  if (key === "recruiter") return { recruiter: value };
  if (key === "requestDate") return { requestDate: value || null };
  if (key === "creatorName") return { creatorName: value };
  if (key === "situation") return { situation: value };
  if (key === "phone") return { phone: value };
  if (key === "comment") return { comment: value };
  if (key === "comment2") return { comment2: value };
  if (key === "recontact") return { recontact: value };
  if (key === "integrationDate") return { integrationDate: value || null };
  return { steps: { [key]: value } };
}

export default function RecruitmentClient() {
  const { data: session } = useSession();
  const admin = isAdmin(session?.user?.role);
  const { viewAsId, viewAsName } = useViewAs();
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonthNum = String(now.getMonth() + 1);
  const [year, setYear] = useState<string>(currentYear);
  const [month, setMonth] = useState<string>(currentMonthNum);
  const [managerFilter, setManagerFilter] = useState("all");
  const [q, setQ] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    emptyDraft("")
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const timers = useRef<Record<string, number>>({});
  const pending = useRef<Record<string, Partial<Lead>>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [saveMap, setSaveMap] = useState<Record<string, string>>({});

  const url = `${PANEL.recruitment}?year=${year}&month=${month}`;
  const { data, error, mutate } = usePanelData(url);
  const payload = data as Payload | undefined;

  const years = useMemo(() => {
    const y0 = new Date().getFullYear();
    const fromApi = payload?.years ?? [];
    return [...new Set([y0, y0 - 1, y0 - 2, y0 + 1, ...fromApi])].sort(
      (a, b) => b - a
    );
  }, [payload?.years]);

  const managers = payload?.managers ?? [];

  const rows = useMemo(() => {
    let list = payload?.rows ?? [];
    const mid = viewAsId || (managerFilter !== "all" ? managerFilter : null);
    if (mid) {
      const name = nickKey(
        viewAsName ||
          managers.find((m) => m.id === mid)?.name ||
          ""
      );
      list = list.filter(
        (r) =>
          r.managerId === mid ||
          (name && nickKey(r.recruiter) === name) ||
          (name && nickKey(r.recruiter).startsWith(name.split(" ")[0] ?? name))
      );
    }
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (r) =>
          r.creatorName.toLowerCase().includes(query) ||
          r.recruiter.toLowerCase().includes(query) ||
          r.phone.toLowerCase().includes(query) ||
          r.situation.toLowerCase().includes(query)
      );
    }
    return list;
  }, [payload?.rows, viewAsId, viewAsName, managerFilter, managers, q]);

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const applyLocal = useCallback(
    (id: string, patch: Partial<Lead>) => {
      void mutate(
        (current: Payload | undefined) => {
          if (!current) return current;
          return {
            ...current,
            rows: current.rows.map((r) => {
              if (r.id !== id) return r;
              return {
                ...r,
                ...patch,
                steps: { ...r.steps, ...(patch.steps ?? {}) },
              };
            }),
          };
        },
        { revalidate: false }
      );
    },
    [mutate]
  );

  const autosave = useCallback(
    (row: Lead, patch: Partial<Lead>) => {
      const prev = pending.current[row.id] ?? {};
      pending.current[row.id] = {
        ...prev,
        ...patch,
        steps: { ...row.steps, ...prev.steps, ...patch.steps },
      };
      applyLocal(row.id, patch);
      setSaveMap((m) => ({ ...m, [row.id]: "…" }));
      if (timers.current[row.id]) window.clearTimeout(timers.current[row.id]);
      timers.current[row.id] = window.setTimeout(async () => {
        const acc = pending.current[row.id] ?? patch;
        delete pending.current[row.id];
        try {
          const res = await fetch(PANEL.recruitment, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "upsert",
              id: row.id,
              ...acc,
            }),
          });
          if (!res.ok) throw new Error("fail");
          setSaveMap((m) => ({ ...m, [row.id]: "Guardado" }));
        } catch {
          setSaveMap((m) => ({ ...m, [row.id]: "Error" }));
        }
      }, 650);
    },
    [applyLocal]
  );

  async function addRow(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.creatorName.trim()) {
      setHint("Escribe el nombre o usuario del creador.");
      return;
    }
    setBusy(true);
    setHint("");
    try {
      const manager =
        admin && (viewAsId || draft.managerId)
          ? managers.find((m) => m.id === (viewAsId || draft.managerId))
          : null;
      const recruiter = admin
        ? viewAsName || manager?.name || draft.recruiter.trim()
        : session?.user?.name ?? draft.recruiter;
      const steps: Record<string, string> = {};
      for (const key of STEP_KEYS) {
        const v = (draft[key] ?? "").trim();
        if (v) steps[key] = v;
      }
      const res = await fetch(PANEL.recruitment, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          creatorName: draft.creatorName.trim(),
          recruiter,
          managerId: admin ? viewAsId || draft.managerId || null : undefined,
          requestDate: draft.requestDate || todayIso(),
          situation: draft.situation || "pendiente",
          phone: draft.phone,
          comment: draft.comment,
          comment2: draft.comment2,
          recontact: draft.recontact,
          integrationDate: draft.integrationDate || null,
          steps,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setHint(json.error || "No se pudo agregar");
        return;
      }
      const parts = dateParts(draft.requestDate || todayIso());
      if (parts.year) setYear(String(parts.year));
      if (parts.month) setMonth(String(parts.month));
      setOpenAdd(false);
      setDraft(emptyDraft(session?.user?.name ?? ""));
      const mesNombre = parts.month ? MESES_NOMBRE[parts.month] : "";
      setHint(
        `Ficha de ${draft.creatorName.trim()} guardada en ${mesNombre} ${parts.year ?? ""}`.trim()
      );
      invalidatePanel(PANEL.recruitment);
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(id: string) {
    if (!confirm("¿Eliminar esta fila?")) return;
    await fetch(`${PANEL.recruitment}?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await mutate();
  }

  async function importXlsx(file: File) {
    setBusy(true);
    setHint("");
    try {
      const XLSX = await import("xlsx");
      const name = file.name.toLowerCase();
      const isCsv = name.endsWith(".csv") || name.endsWith(".tsv");
      let book: import("xlsx").WorkBook;
      if (isCsv) {
        const text = await file.text();
        const semi = (text.split(";").length || 0) > (text.split(",").length || 0);
        book = XLSX.read(text, {
          type: "string",
          raw: false,
          cellDates: true,
          FS: name.endsWith(".tsv") ? "\t" : semi ? ";" : ",",
        });
      } else {
        const buf = await file.arrayBuffer();
        book = XLSX.read(buf, { type: "array", cellDates: true, raw: false });
      }

      let parsed = parseRecruitmentSheet([]);
      for (const sheetName of book.SheetNames) {
        const sheet = book.Sheets[sheetName];
        if (!sheet) continue;
        const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: "",
          raw: false,
          blankrows: false,
        });
        const next = parseRecruitmentSheet(sheetRows);
        if (
          next.mapped > parsed.mapped ||
          (next.mapped === parsed.mapped && next.rows.length > parsed.rows.length)
        ) {
          parsed = next;
        }
      }

      const sample = (parsed.headers ?? [])
        .filter(Boolean)
        .slice(0, 8)
        .join(" · ");
      if (parsed.mapped < 2) {
        setHint(
          sample
            ? `No se reconocieron las columnas. Encabezados vistos: ${sample}`
            : "No se reconocieron las columnas. Descarga Microsoft Excel (.xlsx) y no CSV."
        );
        return;
      }
      if (!parsed.rows.length) {
        setHint("El archivo no tiene filas con nombre de creador.");
        return;
      }

      let upserted = 0;
      let skipped = 0;
      const chunkSize = 80;
      for (let i = 0; i < parsed.rows.length; i += chunkSize) {
        const chunk = parsed.rows.slice(i, i + chunkSize);
        const res = await fetch(PANEL.recruitment, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "import", rows: chunk }),
        });
        const text = await res.text();
        let json: { error?: string; upserted?: number; skipped?: number } = {};
        try {
          json = text ? (JSON.parse(text) as typeof json) : {};
        } catch {
          setHint(
            "El servidor no pudo guardar este Excel. Prueba de nuevo; si el archivo es muy grande, parte las filas."
          );
          return;
        }
        if (!res.ok) {
          setHint(json.error || "No se pudo importar");
          return;
        }
        upserted += json.upserted ?? chunk.length;
        skipped += json.skipped ?? 0;
      }

      setHint(
        `Importadas ${upserted} filas` +
          (skipped ? ` · ${skipped} omitidas` : "") +
          ` · ${parsed.mapped} columnas reconocidas.`
      );
      await mutate();
      invalidatePanel(PANEL.recruitment);
    } catch (e) {
      setHint(
        e instanceof Error ? e.message : "No se pudo leer el archivo."
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([templateHeaders()]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Reclutamiento");
    XLSX.writeFile(book, "plantilla-reclutamiento.xlsx");
  }

  async function exportXlsx() {
    const XLSX = await import("xlsx");
    const header = templateHeaders();
    const body = rows.map((r) =>
      RECRUITMENT_COLUMNS.map((c) => cellValue(r, c.key))
    );
    const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Reclutamiento");
    XLSX.writeFile(book, `reclutamiento-${year}.xlsx`);
  }

  if (error) {
    return (
      <div>
        <TopBar
          title="Reclutamiento y seguimiento"
          subtitle="Pipeline de solicitudes e integración"
        />
        <PanelLoadError message={error.message} onRetry={() => mutate()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TopBar
        title="Reclutamiento y seguimiento"
        subtitle="Solo el mes en curso · el resto queda en archivo"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Año">
          <select
            className={inputClass}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="all">Todos</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
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
        {admin && !viewAsId && (
          <Field label="Manager">
            <select
              className={inputClass}
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.role === "admin" ? " · admin" : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className={admin && !viewAsId ? "lg:col-span-2" : "sm:col-span-2 lg:col-span-3"}>
          <Field label="Buscar">
            <input
              className={inputClass}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Creador, reclutador o teléfono…"
            />
          </Field>
        </div>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            onClick={() => {
              const next = emptyDraft(viewAsName || session?.user?.name || "");
              if (viewAsId) next.managerId = viewAsId;
              setDraft(next);
              setOpenAdd(true);
            }}
          >
            <Plus className="h-4 w-4" /> Agregar
          </Button>
          {admin && (
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.tsv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importXlsx(file);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {busy ? "Importando…" : "Importar Excel"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => void downloadTemplate()}>
                <Download className="h-4 w-4" /> Plantilla
              </Button>
              <Button type="button" variant="ghost" onClick={() => void exportXlsx()}>
                <Download className="h-4 w-4" /> Exportar
              </Button>
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-text-muted">
          {rows.length} registros
          {month === currentMonthNum && year === currentYear
            ? ` · ${MESES_NOMBRE[Number(currentMonthNum)]} ${year}`
            : " · archivo"}
          {month === currentMonthNum && year === currentYear ? (
            <>
              {" · "}
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
            </>
          ) : (
            <>
              {" · "}
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
            </>
          )}
        </p>
        {hint && <p className="mt-2 text-sm text-cyan">{hint}</p>}
      </Panel>

      {!payload ? (
        <Panel>
          <div className="h-40 animate-pulse rounded-lg bg-bg-hover/40" />
        </Panel>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Sin registros"
          description={
            month === currentMonthNum && year === currentYear
              ? "No hay solicitudes de este mes. Revisa el archivo o agrega una ficha."
              : "No hay registros en este archivo. Cambia mes o año, o importa un Excel."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-soft bg-bg-panel">
          {rows.map((row, idx) => {
            const open = openId === row.id;
            const prev = rows[idx - 1];
            const showRecruiter =
              !prev || nickKey(prev.recruiter) !== nickKey(row.recruiter);
            const done = filledCount(row);
            const situationOpts = SITUATION_OPTIONS.includes(row.situation)
              ? SITUATION_OPTIONS
              : row.situation
                ? [row.situation, ...SITUATION_OPTIONS]
                : SITUATION_OPTIONS;
            return (
              <div key={row.id}>
                {showRecruiter && (
                  <div className="border-b border-border-soft bg-bg-hover/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan">
                    {row.recruiter || "Sin reclutador"}
                  </div>
                )}
                <div
                  className={cn(
                    "border-b border-border-soft/70 last:border-b-0",
                    situationBar(row.situation),
                    "border-l-2",
                    open && "bg-bg-hover/20"
                  )}
                >
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : row.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-hover text-[10px] font-semibold text-cyan">
                        {row.creatorName.slice(0, 2).toUpperCase() || "—"}
                      </span>
                      <span className="w-[9.5rem] shrink-0 truncate text-sm font-medium">
                        {row.creatorName.startsWith("@")
                          ? row.creatorName
                          : `@${row.creatorName}`}
                      </span>
                      <span className="hidden w-[5.25rem] shrink-0 text-xs text-text-muted sm:block">
                        {formatDay(row.requestDate)}
                      </span>
                      <span className="hidden min-w-0 flex-1 truncate text-xs text-text-muted md:block">
                        {row.phone || "Sin teléfono"}
                      </span>
                      <span className="hidden shrink-0 text-[10px] tabular-nums text-text-muted lg:block">
                        {done}/{RECRUITMENT_COLUMNS.length}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-text-muted transition",
                          open && "rotate-180"
                        )}
                      />
                    </button>
                    <select
                      className={cn(
                        inputClass,
                        "h-8 w-[11rem] shrink-0 px-2 py-0 text-xs"
                      )}
                      value={row.situation}
                      onChange={(e) =>
                        autosave(row, { situation: e.target.value })
                      }
                    >
                      {!row.situation && <option value="">Situación</option>}
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
                      onClick={() => void removeRow(row.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {open && (
                    <div className="space-y-4 border-t border-border-soft/70 px-3 py-3">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {[
                          { key: "creatorName", label: "Creador", type: "text" },
                          { key: "recruiter", label: "Reclutador", type: "text" },
                          { key: "requestDate", label: "Solicitud", type: "date" },
                          { key: "phone", label: "Teléfono", type: "text" },
                        ].map((field) => (
                          <label key={field.key} className="block space-y-1">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                              {field.label}
                            </span>
                            <input
                              type={field.type}
                              className={cn(inputClass, "h-9 py-0 text-sm")}
                              value={cellValue(row, field.key)}
                              onChange={(e) =>
                                autosave(
                                  row,
                                  patchFromKey(field.key, e.target.value)
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                      {RECRUITMENT_GROUPS.map((group) => {
                        const cols = RECRUITMENT_COLUMNS.filter(
                          (c) => c.group === group.id && !IDENTITY_KEYS.has(c.key)
                        );
                        if (!cols.length) return null;
                        return (
                          <section key={group.id}>
                            <p
                              className={cn(
                                "mb-2 text-[10px] font-semibold uppercase tracking-[0.14em]",
                                group.className.split(" ").slice(-1)[0]
                              )}
                            >
                              {group.label}
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              {cols.map((col) => (
                                <label key={col.key} className="block space-y-1">
                                  <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                                    {col.label}
                                  </span>
                                  <input
                                    type={col.type === "date" ? "date" : "text"}
                                    className={cn(inputClass, "h-9 py-0 text-sm")}
                                    value={cellValue(row, col.key)}
                                    onChange={(e) =>
                                      autosave(
                                        row,
                                        patchFromKey(col.key, e.target.value)
                                      )
                                    }
                                  />
                                </label>
                              ))}
                            </div>
                          </section>
                        );
                      })}
                      {saveMap[row.id] && (
                        <p className="text-[11px] text-text-muted">
                          {saveMap[row.id]}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        wide
        title="Nueva ficha"
        subtitle={
          admin
            ? "Se guarda en el mes de la fecha de solicitud. Elige el manager."
            : "Se guarda en tu lista y en el mes de la fecha de solicitud."
        }
      >
        <form onSubmit={(e) => void addRow(e)} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                Creador
              </span>
              <input
                className={cn(inputClass, "h-9 py-0 text-sm")}
                required
                placeholder="@usuario"
                value={draft.creatorName}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, creatorName: e.target.value }))
                }
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                Fecha de solicitud
              </span>
              <input
                type="date"
                className={cn(inputClass, "h-9 py-0 text-sm")}
                required
                value={draft.requestDate}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, requestDate: e.target.value }))
                }
              />
            </label>
            {admin && !viewAsId ? (
              <label className="block space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  Manager
                </span>
                <select
                  className={cn(inputClass, "h-9 py-0 text-sm")}
                  value={draft.managerId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const name = managers.find((m) => m.id === id)?.name ?? "";
                    setDraft((d) => ({ ...d, managerId: id, recruiter: name }));
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
            ) : (
              <label className="block space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  Manager
                </span>
                <input
                  className={cn(inputClass, "h-9 py-0 text-sm")}
                  readOnly
                  value={viewAsName || session?.user?.name || ""}
                />
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                Teléfono
              </span>
              <input
                className={cn(inputClass, "h-9 py-0 text-sm")}
                value={draft.phone}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, phone: e.target.value }))
                }
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                Situación
              </span>
              <select
                className={cn(inputClass, "h-9 py-0 text-sm")}
                value={draft.situation}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, situation: e.target.value }))
                }
              >
                {SITUATION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {RECRUITMENT_GROUPS.map((group) => {
            const cols = RECRUITMENT_COLUMNS.filter(
              (c) => c.group === group.id && !IDENTITY_KEYS.has(c.key)
            );
            if (!cols.length) return null;
            return (
              <section key={group.id}>
                <p
                  className={cn(
                    "mb-2 text-[10px] font-semibold uppercase tracking-[0.14em]",
                    group.className.split(" ").slice(-1)[0]
                  )}
                >
                  {group.label}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {cols.map((col) => (
                    <label key={col.key} className="block space-y-1">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                        {col.label}
                      </span>
                      <input
                        type={col.type === "date" ? "date" : "text"}
                        className={cn(inputClass, "h-9 py-0 text-sm")}
                        value={draft[col.key] ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [col.key]: e.target.value }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>
            );
          })}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpenAdd(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar ficha"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
