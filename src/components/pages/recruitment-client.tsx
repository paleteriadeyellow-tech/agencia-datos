"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, EmptyState, Field, Panel, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MESES_NOMBRE } from "@/lib/bonos";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";
import { useViewAs } from "@/components/view-as";
import { isAdmin } from "@/lib/permissions";
import {
  RECRUITMENT_COLUMNS,
  RECRUITMENT_GROUPS,
  SITUATION_OPTIONS,
  parseRecruitmentSheet,
  situationTone,
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

const cellClass =
  "h-8 w-full min-w-0 rounded-md border border-white/10 bg-white/5 px-1.5 text-[11px] text-text outline-none placeholder:text-text-muted/50 hover:border-white/20 focus:border-accent/50";

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
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [month, setMonth] = useState<string>("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [q, setQ] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const timers = useRef<Record<string, number>>({});
  const pending = useRef<Record<string, Partial<Lead>>>({});
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

  const groupSpans = useMemo(() => {
    const counts = new Map<string, number>();
    for (const col of RECRUITMENT_COLUMNS) {
      counts.set(col.group, (counts.get(col.group) ?? 0) + 1);
    }
    return counts;
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
    setBusy(true);
    setHint("");
    try {
      const res = await fetch(PANEL.recruitment, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          creatorName: newName.trim() || "Nuevo creador",
          recruiter: session?.user?.name ?? "",
          managerId: viewAsId || (admin ? null : undefined),
          requestDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
          situation: "pendiente",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setHint(json.error || "No se pudo agregar");
        return;
      }
      setNewName("");
      await mutate();
      invalidatePanel(PANEL.recruitment);
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
      const res = await fetch(PANEL.recruitment, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import",
          rows: parsed.rows,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setHint(json.error || "No se pudo importar");
        return;
      }
      setHint(
        `Importadas ${json.upserted} filas` +
          (json.skipped ? ` · ${json.skipped} omitidas` : "") +
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
    <div>
      <TopBar
        title="Reclutamiento y seguimiento"
        subtitle="Mismas columnas del Excel · admin ve todo, cada manager solo lo suyo"
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
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
        <Field label="Mes / fecha">
          <select
            className={inputClass}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          >
            <option value="all">Todos</option>
            {MESES_NOMBRE.slice(1).map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
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
        <div className="min-w-[180px] flex-1">
          <Field label="Buscar">
            <input
              className={inputClass}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Creador, reclutador, teléfono…"
            />
          </Field>
        </div>
        <p className="pb-2.5 text-xs text-text-muted">
          {rows.length} filas
        </p>
      </div>

      <Panel className="mb-4">
        <form
          onSubmit={(e) => void addRow(e)}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-text-muted">
              Nuevo creador
            </label>
            <input
              className={inputClass}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Usuario TikTok o nombre"
            />
          </div>
          <Button type="submit" disabled={busy}>
            <Plus className="h-4 w-4" /> Agregar fila
          </Button>
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
        </form>
        {hint && <p className="mt-3 text-xs text-cyan">{hint}</p>}
      </Panel>

      {!payload ? (
        <Panel>
          <div className="h-40 animate-pulse rounded-lg bg-bg-hover/40" />
        </Panel>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Sin registros"
          description="Agrega una fila o importa el Excel de reclutamiento. Las columnas se acomodan solas."
        />
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="max-h-[calc(100vh-16rem)] overflow-auto">
            <table className="w-max min-w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-20">
                <tr>
                  {RECRUITMENT_GROUPS.map((g) => {
                    const span = groupSpans.get(g.id) ?? 0;
                    if (!span) return null;
                    return (
                      <th
                        key={g.id}
                        colSpan={span}
                        className={cn(
                          "border-b border-border px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide",
                          g.className
                        )}
                      >
                        {g.label}
                      </th>
                    );
                  })}
                  <th className="border-b border-border bg-bg-elevated" />
                </tr>
                <tr className="bg-bg-elevated">
                  {RECRUITMENT_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                        className={cn(
                          "border-b border-border-soft px-1.5 py-2 font-medium uppercase tracking-wide text-text-muted",
                          col.width,
                          col.key === "recruiter" &&
                            "sticky left-0 z-10 bg-bg-elevated",
                          col.key === "creatorName" &&
                            "sticky left-[8.5rem] z-10 bg-bg-elevated"
                        )}
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="sticky right-0 z-10 w-10 bg-bg-elevated" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border-soft/70 hover:bg-bg-hover/20",
                      situationTone(row.situation)
                    )}
                  >
                    {RECRUITMENT_COLUMNS.map((col) => {
                      const value = cellValue(row, col.key);
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "px-1 py-1",
                            col.width,
                            col.key === "recruiter" &&
                              "sticky left-0 z-[1] bg-bg-elevated",
                            col.key === "creatorName" &&
                              "sticky left-[8.5rem] z-[1] bg-bg-elevated"
                          )}
                        >
                          {col.key === "situation" ? (
                            <input
                              list={`sit-${row.id}`}
                              className={cellClass}
                              value={value}
                              onChange={(e) =>
                                autosave(row, patchFromKey(col.key, e.target.value))
                              }
                            />
                          ) : (
                            <input
                              type={col.type === "date" ? "date" : "text"}
                              className={cellClass}
                              value={value}
                              onChange={(e) =>
                                autosave(row, patchFromKey(col.key, e.target.value))
                              }
                            />
                          )}
                          {col.key === "situation" && (
                            <datalist id={`sit-${row.id}`}>
                              {SITUATION_OPTIONS.map((opt) => (
                                <option key={opt} value={opt} />
                              ))}
                            </datalist>
                          )}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 bg-bg-elevated/95 px-1 py-1">
                      <button
                        type="button"
                        title="Eliminar"
                        className="rounded p-1 text-text-muted hover:text-danger"
                        onClick={() => void removeRow(row.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      {saveMap[row.id] && (
                        <span className="sr-only">{saveMap[row.id]}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
