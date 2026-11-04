"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowDown, ArrowUp, Download, Eye, EyeOff, Plus, SlidersHorizontal, Trash2, Upload } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, Field, inputClass } from "@/components/ui";
import { Modal } from "@/components/modal";
import { cn } from "@/lib/utils";
import { MESES_NOMBRE } from "@/lib/bonos";
import { PANEL, persistPanelCache, mutatePanel, usePanelData } from "@/lib/swr";
import { useViewAs } from "@/components/view-as";
import { isAdmin } from "@/lib/permissions";
import {
  CORE_KEYS,
  RECRUITMENT_COLUMNS,
  SHEET_COL_TYPES,
  STEP_KEYS,
  dateParts,
  parseExcelDate,
  parseRecruitmentSheet,
  situationTone,
  type SheetColType,
} from "@/lib/recruitment";
import { nickKey } from "@/lib/scope-view";

type Col = { id: string; key: string; label: string; type: SheetColType; options: string | null; sortOrder: number; hidden: boolean; builtin: boolean };

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
  extra: Record<string, string>;
};

type Payload = {
  isAdmin: boolean;
  rows: Lead[];
  managers: { id: string; name: string; role: string }[];
  years: number[];
  columns: Col[];
};

const CORE = new Set<string>(CORE_KEYS);
const STEPS = new Set<string>(STEP_KEYS);
const GROUP_OF = new Map(RECRUITMENT_COLUMNS.map((c) => [c.key, c.group]));

const pad = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
};

function getVal(row: Lead, key: string): string {
  if (CORE.has(key)) {
    const v = (row as unknown as Record<string, unknown>)[key];
    return v == null ? "" : String(v);
  }
  if (STEPS.has(key)) return row.steps[key] ?? "";
  return row.extra?.[key] ?? "";
}

function patchFor(key: string, value: string): Partial<Lead> {
  if (CORE.has(key)) return { [key]: key === "requestDate" || key === "integrationDate" ? value || null : value } as Partial<Lead>;
  if (STEPS.has(key)) return { steps: { [key]: value } };
  return { extra: { [key]: value } };
}

function mergePatch(a: Partial<Lead>, b: Partial<Lead>): Partial<Lead> {
  return { ...a, ...b, steps: { ...a.steps, ...b.steps }, extra: { ...a.extra, ...b.extra } };
}

/** Ajusta un texto pegado desde Excel al tipo de la columna. */
function coerce(col: Col, raw: string): string {
  const v = raw.trim();
  if (col.type === "date") return parseExcelDate(v) ?? "";
  if (col.type === "number") return v.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (col.type === "check") return /^(1|si|sí|true|x|✓|yes)$/i.test(v) ? "1" : "";
  return v;
}

/** Peso relativo de cada columna: la hoja reparte todo el ancho disponible entre ellas, sin scroll lateral. */
function colWeight(c: Col) {
  if (c.key === "creatorName") return 1.5;
  if (c.key === "recruiter") return 1.1;
  if (c.type === "date") return 1.25;
  if (c.type === "number") return 0.85;
  if (c.type === "check") return 0.6;
  if (c.type === "select") return 1.15;
  return c.label.length > 22 ? 1.4 : 1;
}

const HEADER_TONE: Record<string, string> = {
  pipeline: "bg-emerald-600/35 text-emerald-100",
  contacto: "bg-sky-600/35 text-sky-100",
  custom: "bg-violet-600/35 text-violet-100",
  other: "bg-slate-600/35 text-slate-100",
};
function headerTone(c: Col) {
  if (!c.builtin) return HEADER_TONE.custom;
  const g = GROUP_OF.get(c.key);
  if (g === "pipeline") return HEADER_TONE.pipeline;
  if (g === "contacto") return HEADER_TONE.contacto;
  return HEADER_TONE.other;
}

function focusCell(r: number, c: number) {
  const el = document.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`);
  if (!el) return false;
  el.focus();
  if (el instanceof HTMLInputElement && el.type === "text") el.select();
  return true;
}

const CELL = "h-8 w-full min-w-0 truncate text-ellipsis bg-transparent px-1.5 text-[12px] outline-none transition focus:bg-white/10 focus:ring-1 focus:ring-inset focus:ring-accent disabled:opacity-60";

const Cell = memo(function Cell({
  row,
  col,
  r,
  c,
  value,
  disabled,
  onCommit,
  onPasteGrid,
}: {
  row: Lead;
  col: Col;
  r: number;
  c: number;
  value: string;
  disabled: boolean;
  onCommit: (row: Lead, col: Col, value: string) => void;
  onPasteGrid: (r: number, c: number, text: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const commit = (v: string) => {
    if (v !== value) onCommit(row, col, v);
  };

  if (col.type === "check") {
    return (
      <label className="flex h-8 items-center justify-center">
        <input data-cell={`${r}-${c}`} type="checkbox" disabled={disabled} checked={value === "1"} onChange={(e) => onCommit(row, col, e.target.checked ? "1" : "")} className="h-4 w-4 accent-accent" />
      </label>
    );
  }
  if (col.type === "select") {
    const opts = (col.options ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (value && !opts.includes(value)) opts.unshift(value);
    return (
      <select data-cell={`${r}-${c}`} disabled={disabled} value={value} onChange={(e) => onCommit(row, col, e.target.value)} className={cn(CELL, "cursor-pointer")}>
        <option value="" className="text-black">
          —
        </option>
        {opts.map((o) => (
          <option key={o} value={o} className="text-black">
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (col.type === "date") {
    return (
      <input
        data-cell={`${r}-${c}`}
        type="date"
        disabled={disabled}
        value={value}
        onChange={(e) => onCommit(row, col, e.target.value)}
        onDoubleClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
        title={value ? undefined : "Escribe la fecha o haz doble clic para abrir el calendario"}
        className={cn(CELL, "[&::-webkit-calendar-picker-indicator]:hidden")}
      />
    );
  }
  return (
    <input
      data-cell={`${r}-${c}`}
      type="text"
      inputMode={col.type === "number" ? "decimal" : undefined}
      disabled={disabled}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => commit(col.type === "number" ? coerce(col, local) : local)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(col.type === "number" ? coerce(col, local) : local);
          focusCell(r + 1, c);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          focusCell(r + 1, c);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          focusCell(r - 1, c);
        } else if (e.key === "Escape") {
          setLocal(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      onPaste={(e) => {
        const text = e.clipboardData.getData("text");
        // Varias celdas copiadas de Excel: se reparten hacia abajo y a la derecha
        if (/[\t\n]/.test(text.replace(/\n+$/, ""))) {
          e.preventDefault();
          onPasteGrid(r, c, text);
        }
      }}
      className={CELL}
    />
  );
});

const SheetRow = memo(function SheetRow({
  row,
  r,
  cols,
  status,
  onCommit,
  onPasteGrid,
  onRemove,
}: {
  row: Lead;
  r: number;
  cols: Col[];
  status: string | undefined;
  onCommit: (row: Lead, col: Col, value: string) => void;
  onPasteGrid: (r: number, c: number, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const tone = situationTone(row.situation);
  const temp = row.id.startsWith("tmp-");
  return (
    <tr className={cn("group", tone)}>
      <td className="border-b border-r border-white/10 bg-bg-elevated px-0.5 text-center text-[10px] text-text-muted">
        {status === "…" ? "…" : status === "Error" ? <span className="text-danger">!</span> : r + 1}
      </td>
      {cols.map((col, c) => (
        <td key={col.key} className="border-b border-r border-white/10 p-0" title={getVal(row, col.key) || undefined}>
          <Cell row={row} col={col} r={r} c={c} value={getVal(row, col.key)} disabled={temp} onCommit={onCommit} onPasteGrid={onPasteGrid} />
        </td>
      ))}
      <td className="border-b border-white/10 px-0.5 text-center">
        <button type="button" onClick={() => onRemove(row.id)} title="Eliminar fila" className="rounded p-1 text-text-muted opacity-0 transition hover:text-danger group-hover:opacity-100 focus:opacity-100">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
});

export default function RecruitmentSheetClient() {
  const { data: session } = useSession();
  const admin = isAdmin(session?.user?.role);
  const { viewAsId, viewAsName } = useViewAs();
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonthNum = String(now.getMonth() + 1);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonthNum);
  const [managerFilter, setManagerFilter] = useState("all");
  const [q, setQ] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [saveMap, setSaveMap] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const timers = useRef<Record<string, number>>({});
  const pending = useRef<Record<string, Partial<Lead>>>({});
  const focusAfter = useRef<{ id: string; c: number } | null>(null);

  const url = `${PANEL.recruitment}?year=${year}&month=${month}`;
  const { data, error, mutate } = usePanelData(url);
  const payload = data as Payload | undefined;

  const years = useMemo(() => {
    const y0 = new Date().getFullYear();
    return [...new Set([y0, y0 - 1, y0 - 2, y0 + 1, ...(payload?.years ?? [])])].sort((a, b) => b - a);
  }, [payload?.years]);

  const managers = useMemo(() => payload?.managers ?? [], [payload?.managers]);
  const allCols = useMemo(() => [...(payload?.columns ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [payload?.columns]);
  const cols = useMemo(() => allCols.filter((c) => !c.hidden), [allCols]);
  const weightSum = useMemo(() => cols.reduce((a, c) => a + colWeight(c), 0) || 1, [cols]);
  // Si hay demasiadas columnas para que se lean, la hoja se desplaza en lugar de apretarlas más
  const minTableWidth = 36 + 30 + cols.length * 66;

  const rows = useMemo(() => {
    let list = payload?.rows ?? [];
    const mid = viewAsId || (managerFilter !== "all" ? managerFilter : null);
    if (mid) {
      const name = nickKey(viewAsName || managers.find((m) => m.id === mid)?.name || "");
      list = list.filter((r) => r.managerId === mid || (name && nickKey(r.recruiter) === name) || (name && nickKey(r.recruiter).startsWith(name.split(" ")[0] ?? name)));
    }
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter((r) => r.creatorName.toLowerCase().includes(query) || r.recruiter.toLowerCase().includes(query) || r.phone.toLowerCase().includes(query) || r.situation.toLowerCase().includes(query));
    }
    return list;
  }, [payload?.rows, viewAsId, viewAsName, managerFilter, managers, q]);

  // Siempre con lo último, sin la caché del navegador (las rutas del panel se guardan 60 s)
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store", headers: { "x-skip-view-as": "1" } });
      if (res.ok) {
        const json = await res.json();
        persistPanelCache(url, json);
        await mutate(json, { revalidate: false });
      }
    } catch {
      /* se queda lo que ya se ve */
    }
  }, [url, mutate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach((x) => window.clearTimeout(x));
  }, []);

  const applyLocal = useCallback(
    (id: string, patch: Partial<Lead>) => {
      void mutate(
        (current: Payload | undefined) =>
          current && {
            ...current,
            rows: current.rows.map((r) => (r.id === id ? { ...r, ...patch, steps: { ...r.steps, ...patch.steps }, extra: { ...r.extra, ...patch.extra } } : r)),
          },
        { revalidate: false }
      );
    },
    [mutate]
  );

  const writeList = useCallback(
    (updater: (list: Lead[]) => Lead[]) => {
      void mutatePanel(
        url,
        (current: Payload | undefined) => {
          if (!current) return current;
          const next = { ...current, rows: updater(current.rows) };
          persistPanelCache(url, next);
          return next;
        },
        { revalidate: false }
      );
    },
    [url]
  );

  /** Guarda una celda: se ve al instante y se manda al servidor 0.6 s después del último cambio de esa fila. */
  const autosave = useCallback(
    (row: Lead, patch: Partial<Lead>) => {
      const prev = pending.current[row.id] ?? {};
      pending.current[row.id] = { ...prev, ...patch, steps: { ...row.steps, ...prev.steps, ...patch.steps }, extra: { ...row.extra, ...prev.extra, ...patch.extra } };
      applyLocal(row.id, patch);
      setSaveMap((m) => ({ ...m, [row.id]: "…" }));
      if (timers.current[row.id]) window.clearTimeout(timers.current[row.id]);
      timers.current[row.id] = window.setTimeout(async () => {
        const acc = pending.current[row.id] ?? patch;
        delete pending.current[row.id];
        try {
          const res = await fetch(PANEL.recruitment, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upsert", id: row.id, ...acc }) });
          if (!res.ok) throw new Error("fail");
          setSaveMap((m) => ({ ...m, [row.id]: "Guardado" }));
        } catch {
          setSaveMap((m) => ({ ...m, [row.id]: "Error" }));
        }
      }, 600);
    },
    [applyLocal]
  );

  const onCommit = useCallback((row: Lead, col: Col, value: string) => autosave(row, patchFor(col.key, value)), [autosave]);

  /** Crea una fila (al instante en pantalla; el servidor la confirma después). */
  const createRow = useCallback(
    async (init: Partial<Lead> = {}) => {
      const manager = admin && (viewAsId || managerFilter !== "all") ? managers.find((m) => m.id === (viewAsId || managerFilter)) : null;
      const recruiter = init.recruiter ?? (admin ? viewAsName || manager?.name || "" : session?.user?.name ?? "");
      const inCurrent = year === currentYear && month === currentMonthNum;
      const requestDate = init.requestDate ?? (inCurrent || year === "all" || month === "all" ? todayIso() : `${year}-${pad(Number(month))}-01`);
      const parts = dateParts(requestDate);
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const base: Lead = {
        id: tempId,
        recruiter,
        managerId: admin ? viewAsId || (managerFilter !== "all" ? managerFilter : null) : null,
        requestDate,
        year: parts.year,
        month: parts.month,
        creatorName: init.creatorName ?? "",
        situation: init.situation ?? "pendiente",
        phone: init.phone ?? "",
        comment: init.comment ?? "",
        comment2: init.comment2 ?? "",
        recontact: init.recontact ?? "",
        integrationDate: init.integrationDate ?? null,
        steps: init.steps ?? {},
        extra: init.extra ?? {},
      };
      writeList((list) => [...list, base]);
      try {
        const res = await fetch(PANEL.recruitment, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            creatorName: base.creatorName,
            recruiter,
            managerId: base.managerId ?? undefined,
            requestDate,
            situation: base.situation,
            phone: base.phone,
            comment: base.comment,
            comment2: base.comment2,
            recontact: base.recontact,
            integrationDate: base.integrationDate,
            steps: base.steps,
            extra: base.extra,
          }),
        });
        const json = (await res.json()) as { error?: string; row?: Lead };
        if (!res.ok || !json.row) throw new Error(json.error || "No se pudo agregar");
        writeList((list) => list.map((r) => (r.id === tempId ? { ...base, ...json.row! } : r)));
        return json.row;
      } catch (e) {
        writeList((list) => list.filter((r) => r.id !== tempId));
        setHint(e instanceof Error ? e.message : "No se pudo agregar");
        return null;
      }
    },
    [admin, viewAsId, viewAsName, managerFilter, managers, session?.user?.name, year, month, currentYear, currentMonthNum, writeList]
  );

  async function addRow() {
    const created = await createRow({ creatorName: "" });
    if (created) focusAfter.current = { id: created.id, c: Math.max(0, cols.findIndex((c) => c.key === "creatorName")) };
  }

  // Después de crear una fila, el cursor va a su celda de "Creador"
  useEffect(() => {
    const f = focusAfter.current;
    if (!f) return;
    const r = rows.findIndex((x) => x.id === f.id);
    if (r >= 0) {
      focusAfter.current = null;
      window.setTimeout(() => focusCell(r, f.c), 30);
    }
  }, [rows]);

  /** Pega celdas copiadas de Excel/Sheets: se reparten desde la celda elegida hacia abajo y a la derecha. */
  const pasteGrid = useCallback(
    async (r0: number, c0: number, text: string) => {
      const matrix = text.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((l) => l.split("\t"));
      if (matrix.length > 300) {
        setHint("Pega máximo 300 filas a la vez.");
        return;
      }
      let created = 0;
      for (let i = 0; i < matrix.length; i++) {
        let patch: Partial<Lead> = {};
        for (let j = 0; j < matrix[i].length; j++) {
          const col = cols[c0 + j];
          if (!col) break;
          patch = mergePatch(patch, patchFor(col.key, coerce(col, matrix[i][j])));
        }
        const target = rows[r0 + i];
        if (target) {
          if (!target.id.startsWith("tmp-")) autosave(target, patch);
        } else {
          await createRow(patch);
          created++;
        }
      }
      setHint(`Se pegaron ${matrix.length} filas${created ? ` (${created} nuevas)` : ""}.`);
    },
    [cols, rows, autosave, createRow]
  );

  const removeRow = useCallback(
    (id: string) => {
      if (!confirm("¿Eliminar esta fila?")) return;
      const snapshot = payload?.rows ?? [];
      writeList((list) => list.filter((r) => r.id !== id));
      if (id.startsWith("tmp-")) return;
      void fetch(`${PANEL.recruitment}?id=${encodeURIComponent(id)}`, { method: "DELETE" })
        .then((res) => {
          if (!res.ok) throw new Error();
        })
        .catch(() => {
          writeList(() => snapshot);
          setHint("No se pudo eliminar");
        });
    },
    [payload?.rows, writeList]
  );

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
        book = XLSX.read(text, { type: "string", raw: false, cellDates: true, FS: name.endsWith(".tsv") ? "\t" : semi ? ";" : "," });
      } else {
        book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, raw: false });
      }
      const custom = allCols.filter((c) => !c.builtin).map((c) => ({ key: c.key, label: c.label }));
      let parsed = parseRecruitmentSheet([], custom);
      for (const sheetName of book.SheetNames) {
        const sheet = book.Sheets[sheetName];
        if (!sheet) continue;
        const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false });
        const next = parseRecruitmentSheet(sheetRows, custom);
        if (next.mapped > parsed.mapped || (next.mapped === parsed.mapped && next.rows.length > parsed.rows.length)) parsed = next;
      }
      if (parsed.mapped < 2) {
        const sample = (parsed.headers ?? []).filter(Boolean).slice(0, 8).join(" · ");
        setHint(sample ? `No se reconocieron las columnas. Encabezados vistos: ${sample}` : "No se reconocieron las columnas. Descarga Microsoft Excel (.xlsx) y no CSV.");
        return;
      }
      if (!parsed.rows.length) {
        setHint("El archivo no tiene filas con nombre de creador.");
        return;
      }
      let upserted = 0;
      let skipped = 0;
      for (let i = 0; i < parsed.rows.length; i += 80) {
        const chunk = parsed.rows.slice(i, i + 80);
        const res = await fetch(PANEL.recruitment, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", rows: chunk }) });
        const json = (await res.json().catch(() => ({}))) as { error?: string; upserted?: number; skipped?: number };
        if (!res.ok) {
          setHint(json.error || "No se pudo importar");
          return;
        }
        upserted += json.upserted ?? chunk.length;
        skipped += json.skipped ?? 0;
      }
      setHint(`Importadas ${upserted} filas${skipped ? ` · ${skipped} omitidas` : ""} · ${parsed.mapped} columnas reconocidas.`);
      await refresh();
    } catch (e) {
      setHint(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([cols.map((c) => c.label)]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Reclutamiento");
    XLSX.writeFile(book, "plantilla-reclutamiento.xlsx");
  }

  async function exportXlsx() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([cols.map((c) => c.label), ...rows.map((r) => cols.map((c) => (c.type === "check" ? (getVal(r, c.key) === "1" ? "Sí" : "") : getVal(r, c.key))))]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Reclutamiento");
    XLSX.writeFile(book, `reclutamiento-${year}${month !== "all" ? `-${pad(Number(month))}` : ""}.xlsx`);
  }

  if (error) {
    return (
      <div>
        <TopBar title="Reclutamiento y seguimiento" subtitle="Hoja de solicitudes e integración" />
        <PanelLoadError message={error.message} onRetry={() => void mutate()} />
      </div>
    );
  }

  const monthLabel = month === "all" ? "Todos los meses" : MESES_NOMBRE[Number(month)];

  return (
    <div className="space-y-4">
      <TopBar title="Reclutamiento y seguimiento" subtitle={`${monthLabel} ${year === "all" ? "" : year} · edita directo en la hoja, se guarda solo`} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Año">
          <select className={inputClass} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">Todos</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mes">
          <select className={inputClass} value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">Todos los meses</option>
            {MESES_NOMBRE.slice(1).map((m, i) => (
              <option key={m} value={String(i + 1)}>
                {m}
                {year === currentYear && String(i + 1) === currentMonthNum ? " · mes actual" : ""}
              </option>
            ))}
          </select>
        </Field>
        {admin && !viewAsId && (
          <Field label="Manager">
            <select className={inputClass} value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}>
              <option value="all">Todos</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Buscar">
          <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Creador, reclutador o teléfono…" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void addRow()}>
          <Plus className="h-4 w-4" /> Fila
        </Button>
        {admin && (
          <Button variant="secondary" onClick={() => setColsOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" /> Columnas
          </Button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden" onChange={(e) => e.target.files?.[0] && void importXlsx(e.target.files[0])} />
          <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> {busy ? "Importando…" : "Importar Excel"}
          </Button>
          <Button variant="ghost" onClick={() => void downloadTemplate()}>
            <Download className="h-4 w-4" /> Plantilla
          </Button>
          <Button variant="ghost" onClick={() => void exportXlsx()}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
        </div>
      </div>
      <p className="text-xs text-text-muted">
        {rows.length} {rows.length === 1 ? "registro" : "registros"} · Enter baja a la celda de abajo · Puedes pegar celdas copiadas de Excel.
        {hint ? <span className="ml-2 text-text">{hint}</span> : null}
      </p>

      {!payload ? (
        <div className="glass-panel h-64 animate-pulse rounded-2xl" />
      ) : (
        <div className="max-h-[calc(100vh-19rem)] min-h-[16rem] overflow-auto rounded-xl border border-white/10">
          <table className="w-full border-separate border-spacing-0 text-sm" style={{ tableLayout: "fixed", minWidth: minTableWidth }}>
            <colgroup>
              <col style={{ width: 36 }} />
              {cols.map((col) => (
                <col key={col.key} style={{ width: `calc((100% - 66px) * ${colWeight(col) / weightSum})` }} />
              ))}
              <col style={{ width: 30 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="sticky top-0 z-20 border-b border-r border-white/10 bg-bg-elevated px-0.5 py-1.5 text-[10px] text-text-muted">#</th>
                {cols.map((col) => (
                  <th
                    key={col.key}
                    className={cn("sticky top-0 z-20 border-b border-r border-white/10 px-1.5 py-1.5 text-left text-[10px] font-semibold uppercase leading-tight tracking-wide", headerTone(col))}
                    title={col.label}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="sticky top-0 z-20 border-b border-white/10 bg-bg-elevated" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <SheetRow key={row.id} row={row} r={r} cols={cols} status={saveMap[row.id]} onCommit={onCommit} onPasteGrid={pasteGrid} onRemove={removeRow} />
              ))}
              <tr>
                <td colSpan={cols.length + 2} className="p-0">
                  <button type="button" onClick={() => void addRow()} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-text-muted transition hover:bg-white/5 hover:text-text">
                    <Plus className="h-3.5 w-3.5" /> {rows.length === 0 ? "No hay filas en este mes. Agrega la primera" : "Agregar fila"}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {admin && payload && <ColumnsModal open={colsOpen} onClose={() => setColsOpen(false)} columns={allCols} onChanged={refresh} />}
    </div>
  );
}

/** Administrar columnas: agregar, renombrar, cambiar tipo, ordenar, ocultar y eliminar (las que agregaste). */
function ColumnsModal({ open, onClose, columns, onChanged }: { open: boolean; onClose: () => void; columns: Col[]; onChanged: () => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<SheetColType>("text");
  const [options, setOptions] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(method: string, path: string, body?: unknown) {
    setErr("");
    const res = await fetch(`/api/panel/recruitment-columns${path}`, { method, headers: { "Content-Type": "application/json", "x-skip-view-as": "1" }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json.error ?? "No se pudo guardar.");
      return false;
    }
    await onChanged();
    return true;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await call("POST", "", { label, type, options: type === "select" ? options : null });
    setBusy(false);
    if (ok) {
      setLabel("");
      setOptions("");
      setType("text");
    }
  }

  async function move(i: number, delta: number) {
    const ids = columns.map((c) => c.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await call("PUT", "", { ids });
  }

  return (
    <Modal open={open} onClose={onClose} title="Columnas de la hoja" subtitle="Agrega, ordena, renombra u oculta columnas. Los cambios son para toda la agencia." wide>
      <form onSubmit={add} className="mb-5 grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 sm:grid-cols-[1fr_10rem_auto]">
        <Field label="Nueva columna">
          <input required value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} className={inputClass} placeholder="Ej. Fecha de la llamada" />
        </Field>
        <Field label="Tipo">
          <select value={type} onChange={(e) => setType(e.target.value as SheetColType)} className={inputClass}>
            {SHEET_COL_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={busy}>
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </div>
        {type === "select" && (
          <div className="sm:col-span-3">
            <Field label="Opciones (separadas por coma)">
              <input value={options} onChange={(e) => setOptions(e.target.value)} className={inputClass} placeholder="Sí, No, Pendiente" />
            </Field>
          </div>
        )}
      </form>
      {err && <p className="mb-3 text-sm text-danger">{err}</p>}

      <ul className="space-y-1.5">
        {columns.map((c, i) => (
          <li key={c.id} className={cn("grid items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 sm:grid-cols-[auto_1fr_9rem_auto]", c.hidden && "opacity-55")}>
            <button type="button" title={c.hidden ? "Mostrar" : "Ocultar"} onClick={() => void call("PATCH", "", { id: c.id, hidden: !c.hidden })} className="rounded p-1.5 text-text-muted hover:text-text">
              {c.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <div className="min-w-0">
              <input
                defaultValue={c.label}
                key={c.label}
                maxLength={80}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== c.label) void call("PATCH", "", { id: c.id, label: v });
                  else e.target.value = c.label;
                }}
                className={cn(inputClass, "!py-1 text-sm")}
                aria-label={`Nombre de la columna ${c.label}`}
              />
              {c.type === "select" && !c.builtin && (
                <input
                  defaultValue={c.options ?? ""}
                  key={c.options ?? ""}
                  onBlur={(e) => e.target.value !== (c.options ?? "") && void call("PATCH", "", { id: c.id, options: e.target.value })}
                  className={cn(inputClass, "mt-1 !py-1 text-xs")}
                  placeholder="Opciones separadas por coma"
                  aria-label="Opciones"
                />
              )}
            </div>
            {c.builtin ? (
              <span className="text-xs text-text-muted">{SHEET_COL_TYPES.find((t) => t.id === c.type)?.label ?? "Texto"} · de siempre</span>
            ) : (
              <select value={c.type} onChange={(e) => void call("PATCH", "", { id: c.id, type: e.target.value })} className={cn(inputClass, "!py-1 text-xs")} aria-label="Tipo">
                {SHEET_COL_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
            <div className="flex items-center justify-end gap-0.5">
              <button type="button" onClick={() => void move(i, -1)} disabled={i === 0} title="Subir" className="rounded p-1.5 text-text-muted hover:text-text disabled:opacity-30">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => void move(i, 1)} disabled={i === columns.length - 1} title="Bajar" className="rounded p-1.5 text-text-muted hover:text-text disabled:opacity-30">
                <ArrowDown className="h-4 w-4" />
              </button>
              {!c.builtin && (
                <button
                  type="button"
                  title="Eliminar columna"
                  onClick={() => {
                    if (confirm(`¿Eliminar la columna “${c.label}”? Sus datos dejarán de mostrarse.`)) void call("DELETE", `?id=${c.id}`);
                  }}
                  className="rounded p-1.5 text-text-muted hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
