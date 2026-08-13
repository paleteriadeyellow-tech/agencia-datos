"use client";

import { useMemo, useRef, useState } from "react";
import { Gift, Upload, Pencil, Trash2, X } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { Button, Field, Panel, inputClass } from "@/components/ui";
import { CreatorSuggestInput } from "@/components/creator-suggest";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import {
  MESES_NOMBRE,
  calcularBonoTotal,
  resolveTikTokExportColumns,
  parseLiveDurationHours,
  parseNumericCell,
  periodKey,
} from "@/lib/bonos";
import { useCreatorsRoster } from "@/lib/use-creators-roster";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";
import { fetchJsonWithTimeout } from "@/lib/fetch-timeout";

type BonoRow = {
  id: string;
  nombre: string;
  diamantes: number;
  horas: number;
  dias: number;
  bono: number;
  gananciaAgencia?: number;
  pagado?: boolean;
};

export default function BonosClient() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editSaveLabel, setEditSaveLabel] = useState("");
  const editTimer = useRef<number | null>(null);
  const editSkip = useRef(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    nombre: "",
    diamantes: 0,
    horas: 0,
    dias: 0,
  });

  const [nombre, setNombre] = useState("");
  const [diamantes, setDiamantes] = useState(0);
  const [horas, setHoras] = useState(0);
  const [dias, setDias] = useState(1);

  const { suggestList } = useCreatorsRoster();
  const fileRef = useRef<HTMLInputElement>(null);
  const pk = periodKey(anio, mes);

  const years = useMemo(() => {
    const y0 = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => y0 - 4 + i);
  }, []);

  const { data, error: loadError, mutate, isLoading } = usePanelData(
    `${PANEL.bonos}?period=${pk}`
  ) as {
    data?: { rows: BonoRow[]; totalBono: number };
    error?: Error;
    mutate: () => void;
    isLoading: boolean;
  };

  const rows = data?.rows ?? [];
  const totalBono = data?.totalBono ?? 0;

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const nick = nombre.trim();
    if (!nick) return;
    setSaving(true);
    setError("");
    try {
      const bono = calcularBonoTotal(dias, horas, diamantes);
      const res = await fetch(PANEL.bonos, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: pk,
          nombre: nick,
          diamantes,
          horas,
          dias,
          bono,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo guardar");
      setNombre("");
      setDiamantes(0);
      setHoras(0);
      setDias(1);
      mutate();
      invalidatePanel(PANEL.bonos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar este registro?")) return;
    try {
      const res = await fetch(`${PANEL.bonos}?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo eliminar");
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  function startEdit(row: BonoRow) {
    editSkip.current = true;
    setEditingId(row.id);
    setEditDraft({
      nombre: row.nombre,
      diamantes: row.diamantes,
      horas: row.horas,
      dias: row.dias,
    });
    setEditSaveLabel("");
  }

  async function persistEdit(
    id: string,
    draft: { nombre: string; diamantes: number; horas: number; dias: number }
  ) {
    const bono = calcularBonoTotal(draft.dias, draft.horas, draft.diamantes);
    await fetch(PANEL.bonos, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...draft, bono }),
    });
    mutate();
  }

  function schedulePersist(
    id: string,
    draft: { nombre: string; diamantes: number; horas: number; dias: number }
  ) {
    if (editTimer.current) window.clearTimeout(editTimer.current);
    setEditSaveLabel("Guardando…");
    editTimer.current = window.setTimeout(() => {
      void persistEdit(id, draft)
        .then(() => setEditSaveLabel("Guardado"))
        .catch(() => setEditSaveLabel("Error"));
    }, 450);
  }

  async function importXlsx(file: File) {
    setSaving(true);
    setError("");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("El archivo no tiene hojas");
      const sheetRows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
        header: 1,
        defval: "",
      });
      if (!sheetRows || sheetRows.length < 2) {
        throw new Error("Faltan encabezados o filas de datos");
      }
      const headers = sheetRows[0].map((h) => String(h));
      const { iUser, iDm, iH, iD } = resolveTikTokExportColumns(headers);
      if (iUser < 0 || iDm < 0 || iH < 0 || iD < 0) {
        throw new Error(
          "Columnas no encontradas. Usa export TikTok: usuario, diamantes, duración LIVE, días válidos."
        );
      }

      let imported = 0;
      let skippedEmpty = 0;
      let skippedNoBono = 0;
      const batch: {
        nombre: string;
        diamantes: number;
        horas: number;
        dias: number;
        bono: number;
      }[] = [];

      for (let r = 1; r < sheetRows.length; r++) {
        const row = sheetRows[r];
        if (!row || row.length === 0) continue;
        const nick = String(row[iUser] ?? "")
          .replace(/^@/, "")
          .trim();
        if (!nick) {
          skippedEmpty++;
          continue;
        }
        const d = Math.max(0, Math.floor(parseNumericCell(row[iDm])));
        const h = Math.max(0, Math.floor(parseLiveDurationHours(row[iH])));
        const daysN = Math.max(0, Math.floor(parseNumericCell(row[iD])));
        const bonoNum = calcularBonoTotal(daysN, h, d);
        if (bonoNum <= 0) {
          skippedNoBono++;
          continue;
        }
        batch.push({
          nombre: nick,
          diamantes: d,
          horas: h,
          dias: daysN,
          bono: bonoNum,
        });
        imported++;
      }

      if (batch.length) {
        const { res, json } = await fetchJsonWithTimeout(PANEL.bonos, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ period: pk, rows: batch }),
        });
        if (!res.ok) throw new Error(String(json.error || "Error al importar"));
      }

      alert(
        `Importación lista.\nAñadidos con bono: ${imported}\nOmitidos (vacío): ${skippedEmpty}\nOmitidos (sin bono): ${skippedNoBono}`
      );
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function clearCurrentMonth() {
    if (!confirm(`¿Vaciar todos los bonos de ${MESES_NOMBRE[mes]} ${anio}?`))
      return;
    setSaving(true);
    try {
      await fetch(`${PANEL.bonos}?clearPeriod=1&period=${pk}`, {
        method: "DELETE",
      });
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo vaciar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <TopBar
        title="Bonos"
        subtitle={`${MESES_NOMBRE[mes]} ${anio} · total ${formatCurrency(totalBono)}`}
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Mes">
          <select
            className={inputClass}
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
          >
            {MESES_NOMBRE.slice(1).map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Año">
          <select
            className={inputClass}
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importXlsx(f);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" /> Importar XLSX
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={saving || rows.length === 0}
          onClick={() => void clearCurrentMonth()}
        >
          Vaciar mes
        </Button>
      </div>

      {(error || loadError) && (
        <Panel className="mb-4 border-danger/40 text-sm text-danger">
          {error || loadError?.message}
        </Panel>
      )}

      <Panel className="mb-6 overflow-visible">
        <div className="mb-4 flex items-center gap-2">
          <Gift className="h-4 w-4 text-accent" />
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
            Añadir registro
          </h2>
        </div>
        <form onSubmit={onAdd} className="grid gap-3 md:grid-cols-6">
          <CreatorSuggestInput
            className="relative z-30 md:col-span-2"
            value={nombre}
            onChange={setNombre}
            creators={suggestList}
            required
          />
          <Field label="Diamantes">
            <input
              className={inputClass}
              type="number"
              min={0}
              value={diamantes}
              onChange={(e) => setDiamantes(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Horas">
            <input
              className={inputClass}
              type="number"
              min={0}
              value={horas}
              onChange={(e) => setHoras(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Días">
            <input
              className={inputClass}
              type="number"
              min={0}
              value={dias}
              onChange={(e) => setDias(Number(e.target.value) || 0)}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "…" : "Agregar"}
            </Button>
          </div>
        </form>
        <p className="mt-2 text-xs text-text-muted">
          Bono estimado:{" "}
          <strong className="text-success">
            {formatCurrency(calcularBonoTotal(dias, horas, diamantes))}
          </strong>
        </p>
      </Panel>

      <Panel className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border-soft text-xs uppercase text-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Diamantes</th>
              <th className="px-4 py-3 font-medium">Días</th>
              <th className="px-4 py-3 font-medium">Horas</th>
              <th className="px-4 py-3 font-medium">Bono</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-text-muted"
                >
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-text-muted"
                >
                  Sin registros este mes.
                </td>
              </tr>
            ) : (
              rows.map((b) => {
                const editing = editingId === b.id;
                return (
                  <tr key={b.id} className="border-b border-border-soft/60">
                    {editing ? (
                      <>
                        <td className="px-2 py-2">
                          <input
                            className={cn(inputClass, "h-8 text-sm")}
                            value={editDraft.nombre}
                            onChange={(e) => {
                              const next = {
                                ...editDraft,
                                nombre: e.target.value,
                              };
                              setEditDraft(next);
                              schedulePersist(b.id, next);
                            }}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            className={cn(inputClass, "h-8 w-28 text-sm")}
                            value={editDraft.diamantes}
                            onChange={(e) => {
                              const next = {
                                ...editDraft,
                                diamantes: Number(e.target.value) || 0,
                              };
                              setEditDraft(next);
                              schedulePersist(b.id, next);
                            }}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            className={cn(inputClass, "h-8 w-20 text-sm")}
                            value={editDraft.dias}
                            onChange={(e) => {
                              const next = {
                                ...editDraft,
                                dias: Number(e.target.value) || 0,
                              };
                              setEditDraft(next);
                              schedulePersist(b.id, next);
                            }}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            className={cn(inputClass, "h-8 w-20 text-sm")}
                            value={editDraft.horas}
                            onChange={(e) => {
                              const next = {
                                ...editDraft,
                                horas: Number(e.target.value) || 0,
                              };
                              setEditDraft(next);
                              schedulePersist(b.id, next);
                            }}
                          />
                        </td>
                        <td className="px-4 py-2 font-medium text-success">
                          {formatCurrency(
                            calcularBonoTotal(
                              editDraft.dias,
                              editDraft.horas,
                              editDraft.diamantes
                            )
                          )}
                          {editSaveLabel && (
                            <span className="ml-2 text-[10px] text-text-muted">
                              {editSaveLabel}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-8 px-2"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 font-medium">{b.nombre}</td>
                        <td className="px-4 py-2.5">
                          {formatNumber(b.diamantes)}
                        </td>
                        <td className="px-4 py-2.5">{formatNumber(b.dias)}</td>
                        <td className="px-4 py-2.5">{b.horas}</td>
                        <td className="px-4 py-2.5 font-medium text-success">
                          {formatCurrency(b.bono)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              title="Editar"
                              className="rounded-md border border-border p-1.5 text-text-muted hover:border-accent hover:text-accent"
                              onClick={() => startEdit(b)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Borrar"
                              className="rounded-md border border-border p-1.5 text-text-muted hover:border-danger hover:text-danger"
                              onClick={() => void onDelete(b.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
