"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Plus, Trash2 } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { Button, Field, Panel, inputClass } from "@/components/ui";
import { formatNumber, cn } from "@/lib/utils";
import {
  MESES_NOMBRE,
  periodKey,
  findColumnIndex,
  resolveTikTokExportColumns,
  parseNumericCell,
  parseLiveDurationHours,
} from "@/lib/bonos";
import { PANEL, invalidatePanel } from "@/lib/swr";
import useSWR from "swr";

type Row = {
  id: string;
  period: string;
  username: string;
  diamonds: number;
  hours: number;
  days: number;
  notes: string | null;
  creatorName: string | null;
  updatedAt?: string;
};

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Error al cargar");
  return res.json();
}

export default function DiamondsControlClient() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const period = periodKey(anio, mes);
  const url = `${PANEL.diamonds}?period=${period}`;

  const { data, error, mutate: reload } = useSWR(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10000,
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [newUser, setNewUser] = useState("");
  const [newDiamonds, setNewDiamonds] = useState(0);
  const [saveMap, setSaveMap] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, number>>({});

  const years = useMemo(() => {
    const y0 = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => y0 - 4 + i);
  }, []);

  const rows: Row[] = data?.rows ?? [];

  const autosave = useCallback(
    (row: Row, patch: Partial<Pick<Row, "diamonds" | "hours" | "days" | "notes" | "username">>) => {
      const id = row.id;
      setSaveMap((m) => ({ ...m, [id]: "Autoguardando…" }));
      if (timers.current[id]) window.clearTimeout(timers.current[id]);
      timers.current[id] = window.setTimeout(async () => {
        try {
          const res = await fetch(PANEL.diamonds, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: row.id,
              period: row.period,
              username: patch.username ?? row.username,
              diamonds: patch.diamonds ?? row.diamonds,
              hours: patch.hours ?? row.hours,
              days: patch.days ?? row.days,
              notes: patch.notes ?? row.notes,
            }),
          });
          if (!res.ok) throw new Error("fail");
          setSaveMap((m) => ({ ...m, [id]: "Guardado" }));
          void reload();
          invalidatePanel(
            PANEL.creators,
            PANEL.dashboard,
            PANEL.metrics,
            PANEL.ops
          );
        } catch {
          setSaveMap((m) => ({ ...m, [id]: "Error" }));
        }
      }, 650);
    },
    [reload]
  );

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  async function addRow(e: React.FormEvent) {
    e.preventDefault();
    const username = newUser.replace(/^@/, "").trim();
    if (!username) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(PANEL.diamonds, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period,
          username,
          diamonds: newDiamonds,
          hours: 0,
          days: 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error || "No se pudo agregar");
        return;
      }
      setNewUser("");
      setNewDiamonds(0);
      await reload();
      invalidatePanel(PANEL.creators, PANEL.ops);
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(id: string) {
    if (!confirm("¿Eliminar este registro?")) return;
    await fetch(`${PANEL.diamonds}?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await reload();
    invalidatePanel(PANEL.creators, PANEL.dashboard, PANEL.ops);
  }

  async function importXlsx(file: File) {
    setBusy(true);
    setMsg("");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const book = XLSX.read(buf, { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]!];
      if (!sheet) throw new Error("empty");
      const sheetRows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
        header: 1,
        defval: "",
      });
      if (!sheetRows || sheetRows.length < 2) {
        setMsg("El Excel no tiene encabezados o filas.");
        return;
      }

      // Si la fila 0 no trae encabezados útiles, probar fila 1 (título arriba)
      let headerRowIdx = 0;
      const probe = (idx: number) =>
        (sheetRows[idx] ?? []).map((h) => String(h));
      let headers = probe(0);
      if (
        findColumnIndex(headers, ["diamantes", "diamonds"]) < 0 &&
        sheetRows.length > 2
      ) {
        const h1 = probe(1);
        if (findColumnIndex(h1, ["diamantes", "diamonds"]) >= 0) {
          headers = h1;
          headerRowIdx = 1;
        }
      }

      // Misma detección de columnas que la pestaña Bonos
      const { iUser, iDm, iH, iD } = resolveTikTokExportColumns(headers);

      if (iUser < 0 || iDm < 0) {
        setMsg(
          "Faltan columnas de usuario o diamantes (igual que en Bonos)."
        );
        return;
      }
      if (iH < 0 || iD < 0) {
        setMsg(
          "Faltan duración LIVE o días válidos (igual que en Bonos). Encabezados: " +
            headers.filter(Boolean).slice(0, 16).join(" · ")
        );
        return;
      }
      if (new Set([iUser, iDm, iH, iD]).size < 4) {
        setMsg(
          "Columnas duplicadas. Se detectó: " +
            [headers[iUser], headers[iDm], headers[iH], headers[iD]].join(" | ")
        );
        return;
      }

      const dataSamples = sheetRows
        .slice(headerRowIdx + 1, headerRowIdx + 25)
        .filter((r) => Array.isArray(r)) as unknown[][];

      let preview = "";
      for (const row of dataSamples) {
        const u = String(row[iUser] ?? "")
          .replace(/^@/, "")
          .trim();
        if (!u) continue;
        preview = ` · ej. @${u}: ${Math.round(parseLiveDurationHours(row[iH]) * 10) / 10}h, ${Math.floor(parseNumericCell(row[iD]))} días`;
        break;
      }

      const importRows = [];
      for (let r = headerRowIdx + 1; r < sheetRows.length; r++) {
        const row = sheetRows[r];
        if (!row || row.length === 0) continue;
        const username = String(row[iUser] ?? "")
          .replace(/^@/, "")
          .trim();
        if (!username) continue;
        importRows.push({
          username,
          diamantes: Math.max(0, Math.floor(parseNumericCell(row[iDm]))),
          horas: Math.max(
            0,
            Math.round(parseLiveDurationHours(row[iH]) * 10) / 10
          ),
          dias: Math.max(0, Math.floor(parseNumericCell(row[iD]))),
        });
      }

      if (!importRows.length) {
        setMsg("El Excel no tiene usuarios reconocibles.");
        return;
      }

      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 55000);
      let res: Response;
      try {
        res = await fetch(PANEL.diamonds, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ period, rows: importRows }),
          signal: ctrl.signal,
        });
      } finally {
        window.clearTimeout(timer);
      }

      let json: {
        error?: string;
        upserted?: number;
        skipped?: number;
      } = {};
      try {
        json = await res.json();
      } catch {
        setMsg("El servidor no respondió bien. Revisa deploy/base y reintenta.");
        return;
      }
      if (!res.ok) {
        setMsg(json.error || "Error al importar");
        return;
      }
      setMsg(
        `Importados/actualizados: ${json.upserted ?? 0}` +
          (json.skipped ? ` · ${json.skipped} omitidos` : "") +
          ` · “${headers[iH]}” + “${headers[iD]}”` +
          preview
      );
      await reload(undefined, { revalidate: true });
      invalidatePanel(PANEL.creators, PANEL.dashboard, PANEL.ops);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setMsg(
          "La importación tardó demasiado y se cortó. Vuelve a importar el mismo archivo (completa lo que faltó)."
        );
      } else {
        setMsg("No se pudo leer el archivo XLSX.");
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (error) {
    return (
      <div>
        <TopBar
          title="Control de diamantes"
          subtitle="Seguimiento por usuario y periodo"
        />
        <PanelLoadError onRetry={() => reload()} />
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title="Control de diamantes"
        subtitle={`${MESES_NOMBRE[mes]} ${anio} · Autoguardado al editar`}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Panel>
          <p className="text-xs text-text-muted">Usuarios del periodo</p>
          <p className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-bold">
            {formatNumber(data?.totalUsers ?? 0)}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs text-text-muted">Total diamantes</p>
          <p className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-bold text-accent">
            {formatNumber(data?.totalDiamonds ?? 0)}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs text-text-muted">Periodo</p>
          <div className="mt-2 flex gap-2">
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
          </div>
        </Panel>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
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
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {busy ? "Importando…" : "Importar XLSX"}
        </Button>
        <p className="text-xs text-text-muted">
          ES/EN: usuario, Diamantes/Diamonds, Duración de LIVE / LIVE duration,
          Días válidos / Valid days
        </p>
      </div>

      {msg && <p className="mb-3 text-xs text-text-muted">{msg}</p>}

      <Panel className="mb-6">
        <form
          onSubmit={addRow}
          className="grid gap-3 sm:grid-cols-[1fr_8rem_auto]"
        >
          <Field label="Usuario TikTok">
            <input
              value={newUser}
              onChange={(e) => setNewUser(e.target.value)}
              className={inputClass}
              placeholder="@usuario"
              required
            />
          </Field>
          <Field label="Diamantes">
            <input
              type="number"
              min={0}
              value={newDiamonds}
              onChange={(e) => setNewDiamonds(Number(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={busy} className="w-full">
              <Plus className="h-4 w-4" /> Añadir
            </Button>
          </div>
        </form>
      </Panel>

      {!data ? (
        <div className="glass-panel h-64 animate-pulse rounded-2xl" />
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border-soft text-[11px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Usuario</th>
                <th className="px-4 py-2.5 font-medium">Diamantes</th>
                <th className="px-4 py-2.5 font-medium">Horas LIVE</th>
                <th className="px-4 py-2.5 font-medium">Días válidos</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-text-muted"
                  >
                    Sin registros en este mes. Importa un XLSX o añade uno.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const rowKey = `${r.id}-${r.updatedAt ?? ""}-${r.diamonds}-${r.hours}-${r.days}`;
                  return (
                  <tr
                    key={rowKey}
                    className="border-b border-border-soft/70 hover:bg-bg-hover/40"
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <TikTokAvatar
                          username={r.username}
                          name={r.creatorName || r.username}
                          size={32}
                        />
                        <div>
                          <input
                            className={cn(inputClass, "h-9 py-1")}
                            defaultValue={r.username}
                            onChange={(e) =>
                              autosave(r, {
                                username: e.target.value.replace(/^@/, ""),
                              })
                            }
                          />
                          {r.creatorName && (
                            <p className="mt-0.5 text-[11px] text-text-muted">
                              {r.creatorName}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        className={cn(inputClass, "h-9 w-28 py-1 font-semibold text-accent")}
                        defaultValue={r.diamonds}
                        onChange={(e) =>
                          autosave(r, {
                            diamonds: Math.round(Number(e.target.value) || 0),
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        className={cn(inputClass, "h-9 w-24 py-1")}
                        defaultValue={r.hours}
                        onChange={(e) =>
                          autosave(r, {
                            hours: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        className={cn(inputClass, "h-9 w-20 py-1")}
                        defaultValue={r.days}
                        onChange={(e) =>
                          autosave(r, {
                            days: Math.round(Number(e.target.value) || 0),
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-2 text-xs text-text-muted">
                      {saveMap[r.id] || "—"}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="rounded-lg border border-border p-2 text-text-muted hover:border-danger hover:text-danger"
                          onClick={() => void removeRow(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
