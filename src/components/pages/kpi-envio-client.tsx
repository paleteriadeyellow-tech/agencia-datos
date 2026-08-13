"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  onValue,
  push,
  ref,
  remove,
  get,
  update,
} from "firebase/database";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { Send, Trash2, Eraser, Upload, Download, Pencil, X } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { Button, Field, Panel, inputClass } from "@/components/ui";
import {
  CreatorSuggestInput,
  type SuggestCreator,
} from "@/components/creator-suggest";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { formatNumber, cn } from "@/lib/utils";
import {
  MESES_NOMBRE,
  periodKey,
  resolveTikTokExportColumns,
  parseLiveDurationHours,
  parseNumericCell,
} from "@/lib/bonos";
import { whatsappUrl, normalizePhone } from "@/lib/phone";
import {
  KPI_ROOT,
  KPI_LEGACY_ROOT,
  firebaseAuth,
  firebaseDb,
} from "@/lib/firebase";
import { useCreatorsRoster } from "@/lib/use-creators-roster";
import { PANEL } from "@/lib/swr";

type KpiRow = {
  id: string;
  nombre: string;
  whatsapp: string;
  diamantes: number;
  horas: number;
  dias: number;
};

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function kpiWaMessage(u: {
  diamantes: number;
  horas: number;
  dias: number;
}) {
  return (
    `Buen día Creador, te comparto tus estadísticas de lo que llevas actualmente en el mes...\n` +
    `Diamantes: ${u.diamantes}\n` +
    `Horas: ${u.horas}\n` +
    `Días: ${u.dias}`
  );
}

export default function KpiEnvioClient() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<KpiRow[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const [nombre, setNombre] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [diamantes, setDiamantes] = useState(0);
  const [horas, setHoras] = useState(0);
  const [dias, setDias] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  const { creators: roster, suggestList: rosterSuggest } = useCreatorsRoster();

  const [diamondMap, setDiamondMap] = useState<
    Map<string, { diamantes: number; horas: number; dias: number }>
  >(new Map());

  const years = useMemo(() => {
    const y0 = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => y0 - 4 + i);
  }, []);

  const period = periodKey(anio, mes);

  const suggestList = useMemo(() => {
    return rosterSuggest
      .map((c) => ({
        ...c,
        diamonds: diamondMap.get(c.nick)?.diamantes ?? c.diamonds ?? 0,
      }))
      .sort((a, b) => {
        const da = a.diamonds ?? 0;
        const db = b.diamonds ?? 0;
        if (db !== da) return db - da;
        return a.nick.localeCompare(b.nick);
      });
  }, [rosterSuggest, diamondMap]);

  const phoneByNick = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of roster) {
      const nick = (c.tiktokUser || c.name)
        .replace(/^@/, "")
        .trim()
        .toLowerCase();
      if (!nick) continue;
      const phoneNorm = normalizePhone(String(c.phone || ""));
      const digits =
        phoneNorm?.e164Digits || String(c.phone || "").replace(/\D/g, "");
      if (digits) map.set(nick, digits);
    }
    return map;
  }, [roster]);

  // Firebase auth (igual que Bonos)
  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
      if (cancelled) return;
      if (user) {
        setReady(true);
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
          /* rules pueden permitir anon */
        }
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Limpiar datos viejos una vez + suscribir mes
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      setLoading(true);
      setError("");
      setRows([]);
      try {
        // Reiniciar legacy federation_stats_v1
        const legacy = await get(ref(firebaseDb, KPI_LEGACY_ROOT));
        if (legacy.exists()) {
          await remove(ref(firebaseDb, KPI_LEGACY_ROOT));
        }
      } catch {
        /* ignore */
      }

      if (cancelled) return;
      const mesRef = ref(firebaseDb, `${KPI_ROOT}/meses/${period}`);
      unsub = onValue(
        mesRef,
        (snap) => {
          const val = snap.val();
          const list: KpiRow[] = [];
          if (val && typeof val === "object") {
            for (const id of Object.keys(val)) {
              const u = val[id] as Record<string, unknown>;
              list.push({
                id,
                nombre: String(u.nombre ?? ""),
                whatsapp: String(u.whatsapp ?? "").replace(/\D/g, ""),
                diamantes: Number(u.diamantes ?? 0),
                horas: Number(u.horas ?? 0),
                dias: Number(u.dias ?? 0),
              });
            }
          }
          list.sort((a, b) => b.diamantes - a.diamantes || a.nombre.localeCompare(b.nombre));
          setRows(list);
          setLoading(false);
        },
        (err) => {
          setError(err.message || "No se pudo cargar Firebase");
          setLoading(false);
        }
      );
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [ready, period]);

  // Diamantes del periodo (Control de diamantes) para autocompletar KPI
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${PANEL.diamonds}?period=${period}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const map = new Map<string, { diamantes: number; horas: number; dias: number }>();
        for (const r of json.rows ?? []) {
          const nick = String(r.username || "")
            .replace(/^@/, "")
            .trim()
            .toLowerCase();
          if (!nick) continue;
          map.set(nick, {
            diamantes: Number(r.diamonds ?? 0),
            horas: Number(r.hours ?? 0),
            dias: Number(r.days ?? 0),
          });
        }
        setDiamondMap(map);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  function pickCreator(c: SuggestCreator) {
    setNombre(c.nick);
    const phone = phoneByNick.get(c.nick);
    if (phone) setWhatsapp(phone);
    const stats = diamondMap.get(c.nick);
    if (stats) {
      setDiamantes(stats.diamantes);
      setHoras(stats.horas);
      setDias(stats.dias);
    }
  }

  function resetForm() {
    setEditingId(null);
    setNombre("");
    setWhatsapp("");
    setDiamantes(0);
    setHoras(0);
    setDias(0);
  }

  function startEdit(row: KpiRow) {
    setEditingId(row.id);
    setNombre(row.nombre);
    setWhatsapp(row.whatsapp);
    setDiamantes(row.diamantes);
    setHoras(row.horas);
    setDias(row.dias);
    setMsg(`Editando @${row.nombre}`);
    formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const nick = nombre.replace(/^@/, "").trim();
    if (!nick) return;
    const wa =
      normalizePhone(whatsapp)?.e164Digits ||
      whatsapp.replace(/\D/g, "");
    if (!wa) {
      setMsg("WhatsApp / teléfono inválido");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const payload = {
        nombre: nick,
        whatsapp: wa,
        diamantes: Math.max(0, Math.round(diamantes)),
        horas: Math.max(0, Number(horas) || 0),
        dias: Math.max(0, Math.round(dias)),
      };
      if (editingId) {
        await update(
          ref(firebaseDb, `${KPI_ROOT}/meses/${period}/${editingId}`),
          payload
        );
        resetForm();
        setMsg("Actualizado");
      } else {
        await push(ref(firebaseDb, `${KPI_ROOT}/meses/${period}`), payload);
        resetForm();
        const link = whatsappUrl(wa) || `https://wa.me/${wa}`;
        const text = encodeURIComponent(kpiWaMessage(payload));
        window.open(`${link}?text=${text}`, "_blank", "noopener,noreferrer");
        setMsg("Agregado · WhatsApp abierto");
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(row: KpiRow) {
    if (!confirm(`¿Eliminar a ${row.nombre}?`)) return;
    if (editingId === row.id) resetForm();
    await remove(ref(firebaseDb, `${KPI_ROOT}/meses/${period}/${row.id}`));
  }

  async function clearMonth() {
    if (
      !confirm(
        `¿Vaciar todos los KPI de ${MESES_NOMBRE[mes]} ${anio}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await remove(ref(firebaseDb, `${KPI_ROOT}/meses/${period}`));
      setMsg("Periodo vaciado");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "No se pudo vaciar");
    } finally {
      setBusy(false);
    }
  }

  async function importXlsx(file: File) {
    setBusy(true);
    setMsg("");
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

      const existingByNick = new Map(
        rows.map((r) => [r.nombre.replace(/^@/, "").trim().toLowerCase(), r.id])
      );

      let imported = 0;
      let updated = 0;
      let skippedEmpty = 0;
      let missingWa = 0;
      const mesPath = `${KPI_ROOT}/meses/${period}`;

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
        const nickKey = nick.toLowerCase();
        const d = Math.max(0, Math.floor(parseNumericCell(row[iDm])));
        const h = Math.max(0, Math.floor(parseLiveDurationHours(row[iH])));
        const daysN = Math.max(0, Math.floor(parseNumericCell(row[iD])));
        const wa = phoneByNick.get(nickKey) || "";
        if (!wa) missingWa++;

        const payload = {
          nombre: nick,
          whatsapp: wa,
          diamantes: d,
          horas: h,
          dias: daysN,
        };

        const existingId = existingByNick.get(nickKey);
        if (existingId) {
          await update(ref(firebaseDb, `${mesPath}/${existingId}`), payload);
          updated++;
        } else {
          const newRef = await push(ref(firebaseDb, mesPath), payload);
          if (newRef.key) existingByNick.set(nickKey, newRef.key);
          imported++;
        }
      }

      setMsg(
        `Importación lista · nuevos: ${imported} · actualizados: ${updated} · vacíos: ${skippedEmpty}` +
          (missingWa ? ` · sin WhatsApp: ${missingWa}` : "")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function exportXlsx() {
    setBusy(true);
    setMsg("");
    try {
      const XLSX = await import("xlsx");
      const data = rows.map((r) => ({
        Usuario: r.nombre,
        WhatsApp: r.whatsapp,
        Diamantes: r.diamantes,
        Horas: r.horas,
        Dias: r.dias,
      }));
      const sheet = XLSX.utils.json_to_sheet(data);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "KPI");
      XLSX.writeFile(
        book,
        `kpi_${MESES_NOMBRE[mes].toLowerCase()}_${anio}.xlsx`
      );
      setMsg("Exportación lista");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "No se pudo exportar");
    } finally {
      setBusy(false);
    }
  }

  function openWa(row: KpiRow) {
    const link = whatsappUrl(row.whatsapp) || `https://wa.me/${row.whatsapp}`;
    const text = encodeURIComponent(kpiWaMessage(row));
    window.open(`${link}?text=${text}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <TopBar
        title="Envío de KPI"
        subtitle={`${MESES_NOMBRE[mes]} ${anio} · envía stats por WhatsApp`}
      />

      {error && (
        <Panel className="mb-4 border-danger/30">
          <p className="text-sm text-danger">{error}</p>
        </Panel>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
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
        <p className="pb-2 text-xs text-cyan">
          Viendo: {MESES_NOMBRE[mes]} {anio}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
            disabled={busy || loading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" /> Importar
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || loading || rows.length === 0}
            onClick={() => void exportXlsx()}
          >
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || loading}
            onClick={() => void clearMonth()}
          >
            <Eraser className="h-4 w-4" /> Vaciar mes
          </Button>
        </div>
      </div>

      <div ref={formTopRef}>
      <Panel className="mb-5">
        <h2 className="mb-4 font-[family-name:var(--font-syne)] text-lg font-semibold">
          {editingId ? "Editar KPI" : "Agregar / enviar KPI"}
        </h2>
        <form
          onSubmit={onAdd}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1.1fr_0.8fr_0.7fr_0.6fr_auto]"
        >
          <CreatorSuggestInput
            className="relative z-30"
            value={nombre}
            onChange={setNombre}
            onPick={pickCreator}
            creators={suggestList}
            required
          />
          <Field label="WhatsApp">
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className={inputClass}
              placeholder="52155… o 55…"
              required
              inputMode="tel"
            />
          </Field>
          <Field label="Diamantes">
            <input
              type="number"
              min={0}
              value={diamantes}
              onChange={(e) => setDiamantes(Number(e.target.value) || 0)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Horas">
            <input
              type="number"
              min={0}
              step={0.1}
              value={horas}
              onChange={(e) => setHoras(Number(e.target.value) || 0)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Días">
            <input
              type="number"
              min={0}
              value={dias}
              onChange={(e) => setDias(Number(e.target.value) || 0)}
              className={inputClass}
              required
            />
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={busy} className="w-full">
              <Send className="h-4 w-4" />
              {busy ? "…" : editingId ? "Guardar" : "Agregar"}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  resetForm();
                  setMsg("");
                }}
                title="Cancelar edición"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
        {msg && <p className="mt-3 text-xs text-text-muted">{msg}</p>}
      </Panel>
      </div>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <h2 className="font-[family-name:var(--font-syne)] text-base font-semibold">
            Control general
          </h2>
          <span className="text-xs text-text-muted">
            {formatNumber(rows.length)} registros
          </span>
        </div>

        {loading ? (
          <div className="h-40 animate-pulse bg-bg-hover/40" />
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-text-muted">
            Sin KPI en este mes. Agrega un usuario o elige otro periodo.
          </p>
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 border-b border-border-soft bg-bg-elevated text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Usuario</th>
                  <th className="px-4 py-2.5 font-medium">Diamantes</th>
                  <th className="px-4 py-2.5 font-medium">Horas</th>
                  <th className="px-4 py-2.5 font-medium">Días</th>
                  <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border-soft/70 hover:bg-bg-hover/40"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <TikTokAvatar
                          username={r.nombre}
                          name={r.nombre}
                          size={32}
                        />
                        <span className="font-medium">{r.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-accent">
                      {formatNumber(r.diamantes)}
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">
                      {formatNumber(r.horas)}
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">
                      {formatNumber(r.dias)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          title="Enviar WhatsApp"
                          onClick={() => openWa(r)}
                          className={cn(
                            "inline-flex items-center justify-center rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 p-1.5 text-[#25D366]",
                            "hover:bg-[#25D366]/20"
                          )}
                        >
                          <WhatsAppIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => startEdit(r)}
                          className="rounded-lg border border-border p-1.5 text-text-muted hover:border-cyan hover:text-cyan"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() => void onDelete(r)}
                          className="rounded-lg border border-border p-1.5 text-text-muted hover:border-danger hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
