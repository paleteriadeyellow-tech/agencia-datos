"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  onValue,
  push,
  ref,
  remove,
  update,
  get,
} from "firebase/database";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { Gift, Upload, Pencil, Trash2, X } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { Button, Field, Panel, inputClass } from "@/components/ui";
import { CreatorSuggestInput } from "@/components/creator-suggest";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import {
  BONOS_ROOT,
  firebaseAuth,
  firebaseDb,
} from "@/lib/firebase";
import {
  MESES_NOMBRE,
  calcularBonoTotal,
  resolveTikTokExportColumns,
  parseLiveDurationHours,
  parseNumericCell,
  periodKey,
} from "@/lib/bonos";
import { useCreatorsRoster } from "@/lib/use-creators-roster";

type BonoRow = {
  id: string;
  nombre: string;
  diamantes: number;
  horas: number;
  dias: number;
  bono: string;
};

export default function BonosClient() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<BonoRow[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
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

  const years = useMemo(() => {
    const y0 = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => y0 - 4 + i);
  }, []);

  const totalBono = useMemo(
    () => rows.reduce((a, r) => a + (parseFloat(r.bono) || 0), 0),
    [rows]
  );

  // Entrada directa: sesión Firebase previa o auto-login opcional por env
  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
      if (cancelled) return;
      if (user) {
        setReady(true);
        setLoading(false);
        return;
      }
      const email =
        process.env.NEXT_PUBLIC_BONOS_EMAIL || "agencias@tiktok.com";
      const pass = process.env.NEXT_PUBLIC_BONOS_PASSWORD || "";
      if (pass) {
        try {
          await signInWithEmailAndPassword(firebaseAuth, email, pass);
          return;
        } catch {
          // sigue sin auth; puede fallar si las rules lo exigen
        }
      }
      setReady(true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Suscripción al mes (sin copiar datos viejos a otros periodos)
  useEffect(() => {
    if (!ready) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;

    setRows([]);
    setEditingId(null);
    setLoading(true);
    setError("");

    (async () => {
      try {
        const rootRef = ref(firebaseDb, BONOS_ROOT);
        const snap = await get(rootRef);
        const val = snap.val();

        // 1) Borrar registros legacy sueltos (no meterlos en el mes actual)
        if (val && typeof val === "object") {
          const legacyKeys = Object.keys(val).filter((k) => {
            if (k === "meses") return false;
            const o = (val as Record<string, unknown>)[k];
            return (
              o &&
              typeof o === "object" &&
              ("nombre" in (o as object) || "diamantes" in (o as object))
            );
          });
          if (legacyKeys.length) {
            const wipe: Record<string, null> = {};
            for (const id of legacyKeys) wipe[id] = null;
            await update(rootRef, wipe);
          }
        }

        // 2) Una sola vez: dejar solo el mes Agosto 2026 (donde agregaste datos)
        //    y vaciar el resto de periodos viejos en Firebase
        const CLEAN_FLAG = "bonos_keep_only_2026_08_v1";
        if (
          typeof window !== "undefined" &&
          !window.localStorage.getItem(CLEAN_FLAG)
        ) {
          const mesesSnap = await get(ref(firebaseDb, `${BONOS_ROOT}/meses`));
          const meses = (mesesSnap.val() || {}) as Record<string, unknown>;
          const keep = "2026-08";
          const wipeMonths: Record<string, null> = {};
          for (const k of Object.keys(meses)) {
            if (k !== keep) wipeMonths[k] = null;
          }
          if (Object.keys(wipeMonths).length) {
            await update(ref(firebaseDb, `${BONOS_ROOT}/meses`), wipeMonths);
          }
          window.localStorage.setItem(CLEAN_FLAG, "1");
        }

        if (cancelled) return;
        const mesRef = ref(
          firebaseDb,
          `${BONOS_ROOT}/meses/${periodKey(anio, mes)}`
        );
        unsub = onValue(
          mesRef,
          (s) => {
            const data = s.val();
            if (!data) {
              setRows([]);
              setLoading(false);
              return;
            }
            const list: BonoRow[] = Object.keys(data).map((id) => ({
              id,
              nombre: String(data[id].nombre ?? ""),
              diamantes: Number(data[id].diamantes ?? 0),
              horas: Number(data[id].horas ?? 0),
              dias: Number(data[id].dias ?? 0),
              bono: String(data[id].bono ?? "0"),
            }));
            list.sort(
              (a, b) =>
                Number(b.diamantes) - Number(a.diamantes) ||
                a.nombre.localeCompare(b.nombre)
            );
            setRows(list);
            setLoading(false);
          },
          (err) => {
            setError(err.message || "No se pudo leer Firebase");
            setLoading(false);
          }
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error cargando bonos");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [ready, anio, mes]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const nick = nombre.trim();
    if (!nick) return;
    setSaving(true);
    setError("");
    try {
      const bono = calcularBonoTotal(dias, horas, diamantes).toFixed(2);
      await push(ref(firebaseDb, `${BONOS_ROOT}/meses/${periodKey(anio, mes)}`), {
        nombre: nick,
        diamantes,
        horas,
        dias,
        bono,
        pagado: false,
      });
      setNombre("");
      setDiamantes(0);
      setHoras(0);
      setDias(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar este registro?")) return;
    try {
      await remove(
        ref(firebaseDb, `${BONOS_ROOT}/meses/${periodKey(anio, mes)}/${id}`)
      );
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
    const bono = calcularBonoTotal(
      draft.dias,
      draft.horas,
      draft.diamantes
    ).toFixed(2);
    await update(ref(firebaseDb, `${BONOS_ROOT}/meses/${periodKey(anio, mes)}/${id}`), {
      ...draft,
      bono,
    });
  }

  useEffect(() => {
    if (!editingId) return;
    if (editSkip.current) {
      editSkip.current = false;
      return;
    }
    if (editTimer.current) window.clearTimeout(editTimer.current);
    setEditSaveLabel("Autoguardando…");
    editTimer.current = window.setTimeout(() => {
      void persistEdit(editingId, editDraft)
        .then(() => setEditSaveLabel("Guardado"))
        .catch((err) => {
          setError(err instanceof Error ? err.message : "No se pudo actualizar");
          setEditSaveLabel("Error");
        });
    }, 600);
    return () => {
      if (editTimer.current) window.clearTimeout(editTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDraft, editingId, anio, mes]);

  function cancelEdit() {
    setEditingId(null);
    setEditSaveLabel("");
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
      const mesPath = `${BONOS_ROOT}/meses/${periodKey(anio, mes)}`;

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
        await push(ref(firebaseDb, mesPath), {
          nombre: nick,
          diamantes: d,
          horas: h,
          dias: daysN,
          bono: bonoNum.toFixed(2),
          pagado: false,
        });
        imported++;
      }

      alert(
        `Importación lista.\nAñadidos con bono: ${imported}\nOmitidos (vacío): ${skippedEmpty}\nOmitidos (sin bono): ${skippedNoBono}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function clearOtherMonths() {
    if (
      !confirm(
        `¿Vaciar TODOS los meses excepto ${MESES_NOMBRE[mes]} ${anio}? Solo se conserva el periodo actual.`
      )
    ) {
      return;
    }
    try {
      setSaving(true);
      const keep = periodKey(anio, mes);
      const mesesSnap = await get(ref(firebaseDb, `${BONOS_ROOT}/meses`));
      const meses = (mesesSnap.val() || {}) as Record<string, unknown>;
      const wipe: Record<string, null> = {};
      for (const k of Object.keys(meses)) {
        if (k !== keep) wipe[k] = null;
      }
      if (Object.keys(wipe).length) {
        await update(ref(firebaseDb, `${BONOS_ROOT}/meses`), wipe);
      }
      window.localStorage.setItem("bonos_keep_only_2026_08_v1", "1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron limpiar meses");
    } finally {
      setSaving(false);
    }
  }

  async function clearCurrentMonth() {
    if (
      !confirm(
        `¿Borrar TODOS los bonos de ${MESES_NOMBRE[mes]} ${anio}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    try {
      setSaving(true);
      await remove(ref(firebaseDb, `${BONOS_ROOT}/meses/${periodKey(anio, mes)}`));
      setRows([]);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo vaciar el mes");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !rows.length && !error) {
    return (
      <div>
        <TopBar title="Bonos" subtitle="Registro oficial de liquidación" />
        <div className="glass-panel h-64 animate-pulse rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title="Bonos"
        subtitle={`${MESES_NOMBRE[mes]} ${anio} · Registro oficial de liquidación`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Panel>
          <p className="text-xs text-text-muted">Registros del mes</p>
          <p className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-bold">
            {formatNumber(rows.length)}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs text-text-muted">Total bonos</p>
          <p className="mt-2 font-[family-name:var(--font-syne)] text-2xl font-bold text-success">
            {formatCurrency(totalBono)}
          </p>
        </Panel>
        <Panel>
          <p className="text-xs text-text-muted">Periodo</p>
          <div className="mt-2 flex flex-wrap gap-2">
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
            <Button
              type="button"
              variant="danger"
              disabled={saving || rows.length === 0}
              onClick={() => void clearCurrentMonth()}
            >
              Vaciar mes
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => void clearOtherMonths()}
            >
              Limpiar otros meses
            </Button>
          </div>
        </Panel>
      </div>

      {error && (
        <Panel className="mb-4 border-danger/40 text-sm text-danger">{error}</Panel>
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
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "…" : "Añadir"}
            </Button>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-3">
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
            <Upload className="h-4 w-4" /> Importar Excel
          </Button>
          <p className="text-xs text-text-muted">
            Bono estimado al añadir:{" "}
            <span className="font-medium text-success">
              {formatCurrency(calcularBonoTotal(dias, horas, diamantes))}
            </span>
          </p>
        </div>
      </Panel>

      <Panel className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border-soft text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-5 py-4 font-medium">Usuario</th>
              <th className="px-5 py-4 font-medium">Diamantes</th>
              <th className="px-5 py-4 font-medium">Horas</th>
              <th className="px-5 py-4 font-medium">Días</th>
              <th className="px-5 py-4 font-medium">Bono</th>
              <th className="px-5 py-4 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-text-muted">
                  Sin registros en este mes. Añade manualmente o importa un Excel.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const editing = editingId === row.id;
              const bonoNum = parseFloat(row.bono) || 0;
              return (
                <tr key={row.id} className="border-b border-border-soft/60">
                  <td className="px-5 py-3">
                    {editing ? (
                      <input
                        className={inputClass}
                        value={editDraft.nombre}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, nombre: e.target.value }))
                        }
                      />
                    ) : (
                      <span className="font-medium">{row.nombre}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {editing ? (
                      <input
                        className={inputClass}
                        type="number"
                        value={editDraft.diamantes}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            diamantes: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    ) : (
                      formatNumber(row.diamantes)
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {editing ? (
                      <input
                        className={inputClass}
                        type="number"
                        value={editDraft.horas}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            horas: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    ) : (
                      row.horas
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {editing ? (
                      <input
                        className={inputClass}
                        type="number"
                        value={editDraft.dias}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            dias: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    ) : (
                      row.dias
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-5 py-3 font-semibold",
                      bonoNum === 0 ? "text-danger" : "text-success"
                    )}
                  >
                    {editing
                      ? formatCurrency(
                          calcularBonoTotal(
                            editDraft.dias,
                            editDraft.horas,
                            editDraft.diamantes
                          )
                        )
                      : `$${row.bono}`}
                  </td>
                  <td className="px-5 py-3">
                    {editing ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-text-muted">
                          {editSaveLabel || "Edita y se guarda solo"}
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={cancelEdit}
                        >
                          <X className="h-3.5 w-3.5" /> Cerrar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => startEdit(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => onDelete(row.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
