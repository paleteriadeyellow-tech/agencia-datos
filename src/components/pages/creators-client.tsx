"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Plus, Download, Upload, Pencil, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { TopBar } from "@/components/top-bar";
import { StatusBadge } from "@/components/status-badge";
import { Button, EmptyState, Panel } from "@/components/ui";
import { Modal } from "@/components/modal";
import { CreatorForm } from "@/components/creator-form";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { formatDate } from "@/lib/utils";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";
import { useQuickCreate } from "@/components/quick-create";
import { PanelLoadError } from "@/components/panel-load-error";
import { deleteCreator } from "@/lib/actions";
import { whatsappUrl } from "@/lib/phone";
import { isAdmin } from "@/lib/permissions";
import { useAgency } from "@/lib/use-agency";

type CreatorRow = {
  id: string;
  name: string;
  phone: string;
  niche: string;
  joinDate: string;
  tiktokUser: string | null;
  groupName: string | null;
  status: string;
  managerName: string | null;
  managerId?: string | null;
  country?: string | null;
  notes?: string | null;
  diamondsMonth?: number;
  diamondsTotal?: number;
  diamonds?: number;
};

const field =
  "h-10 rounded-lg border border-border bg-bg px-3 text-sm text-text outline-none placeholder:text-text-muted/60 focus:border-accent";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function cell(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const needle = key.toLowerCase();
    const found = Object.entries(row).find(([k]) => {
      const h = k.trim().toLowerCase();
      return h === needle || h.includes(needle);
    });
    if (found && found[1] != null && String(found[1]).trim() !== "") {
      return String(found[1]).trim();
    }
  }
  return "";
}

export default function CreatorsClient() {
  const { data: session } = useSession();
  const { path } = useAgency();
  const canEditCreators = isAdmin(session?.user?.role);
  const { openCreateCreator } = useQuickCreate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [niche, setNiche] = useState("");
  const [status, setStatus] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [busy, setBusy] = useState<"import" | "export" | null>(null);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<CreatorRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, error, mutate } = usePanelData(PANEL.creators) as {
    data?: {
      creators: CreatorRow[];
      niches: string[];
      groups: string[];
      managers: { id: string; name: string; role?: string }[];
    };
    error?: Error;
    mutate: () => void;
  };

  const filtered = useMemo(() => {
    const list = data?.creators ?? [];
    const query = q.trim().toLowerCase();
    return list
      .filter((c) => {
        if (niche && c.niche !== niche) return false;
        if (status && c.status !== status) return false;
        if (managerFilter === "__none__") {
          if (c.managerId) return false;
        } else if (managerFilter && c.managerId !== managerFilter) {
          return false;
        }
        if (!query) return true;
        return (
          c.name.toLowerCase().includes(query) ||
          c.phone.toLowerCase().includes(query) ||
          (c.tiktokUser ?? "").toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const da = a.diamonds ?? a.diamondsMonth ?? a.diamondsTotal ?? 0;
        const db = b.diamonds ?? b.diamondsMonth ?? b.diamondsTotal ?? 0;
        if (db !== da) return db - da;
        return a.name.localeCompare(b.name);
      });
  }, [data, q, niche, status, managerFilter]);

  const niches = (data?.niches ?? []).filter(Boolean);
  const managers = data?.managers ?? [];

  function refreshList() {
    mutate();
    invalidatePanel(
      PANEL.creators,
      PANEL.dashboard,
      PANEL.ops,
      PANEL.tasks,
      PANEL.metrics,
      PANEL.livecoins
    );
  }

  async function exportXlsx() {
    if (!canEditCreators) return;
    setBusy("export");
    setMsg("");
    try {
      const XLSX = await import("xlsx");
      const rows = filtered.map((c) => ({
        nombre: c.name,
        telefono: c.phone,
        nicho: c.niche,
        diamantes_mes: c.diamondsMonth ?? 0,
        diamantes_total: c.diamondsTotal ?? 0,
        fecha_incorporacion: String(c.joinDate).slice(0, 10),
        tiktok: c.tiktokUser ?? "",
        pais: c.country ?? "",
        estado: c.status,
        grupo: c.groupName ?? "",
        manager: c.managerName ?? "",
        notas: c.notes ?? "",
      }));
      const sheet = XLSX.utils.json_to_sheet(rows);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Creadores");
      XLSX.writeFile(book, "creadores.xlsx");
    } catch {
      setMsg("No se pudo exportar el archivo.");
    } finally {
      setBusy(null);
    }
  }

  async function importXlsx(file: File) {
    if (!canEditCreators) return;
    setBusy("import");
    setMsg("");
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]!];
      if (!sheet) throw new Error("empty");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });

      const rows = raw
        .map((r) => {
          let nombre = cell(
            r,
            "nombre",
            "name",
            "creador",
            "streamer",
            "nombre completo"
          );
          const telefono = cell(
            r,
            "telefono",
            "teléfono",
            "phone",
            "celular",
            "whatsapp"
          );
          const nicho = cell(
            r,
            "nicho",
            "niche",
            "categoria",
            "categoría",
            "categoria principal"
          );
          let tiktok = cell(
            r,
            "tiktok",
            "tiktokUser",
            "usuario",
            "user",
            "nick",
            "username",
            "nombre de usuario",
            "nombre de usuario del creador",
            "usuario tiktok",
            "@"
          );

          // Si solo hay una columna con texto (p. ej. lista de @), úsala
          if (!nombre && !tiktok && !telefono) {
            for (const v of Object.values(r)) {
              const s = String(v ?? "").trim();
              if (!s) continue;
              if (/^https?:\/\//i.test(s)) continue;
              tiktok = s.replace(/^@/, "");
              break;
            }
          }

          if (!nombre && tiktok) nombre = tiktok.replace(/^@/, "");
          if (!tiktok && nombre && !/\s/.test(nombre)) {
            tiktok = nombre.replace(/^@/, "");
          }

          return {
            nombre,
            telefono,
            nicho,
            fecha_incorporacion: cell(
              r,
              "fecha_incorporacion",
              "fecha",
              "joinDate",
              "incorporacion"
            ),
            tiktok: tiktok.replace(/^@/, ""),
            pais: cell(r, "pais", "país", "country"),
            estado: cell(r, "estado", "status"),
            grupo: cell(r, "grupo", "group", "groupName"),
            notas: cell(r, "notas", "notes"),
            diamantes: cell(
              r,
              "diamantes",
              "diamonds",
              "diamond",
              "diamante",
              "total diamantes",
              "total diamonds",
              "💎"
            ),
          };
        })
        .filter((r) => r.nombre || r.tiktok || r.telefono);

      if (!rows.length) {
        setMsg(
          "El Excel no tiene filas reconocibles. Basta con una columna de usuario o nombre."
        );
        return;
      }

      const res = await fetch("/api/creators/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = (await res.json()) as {
        error?: string;
        created?: number;
        updated?: number;
        skipped?: number;
        withDiamonds?: number;
      };
      if (!res.ok) {
        setMsg(json.error || "Error al importar.");
        return;
      }

      refreshList();
      setMsg(
        `Importados: ${json.created ?? 0} nuevos, ${json.updated ?? 0} actualizados` +
          (json.withDiamonds
            ? ` · ${json.withDiamonds} con diamantes`
            : "") +
          (json.skipped ? ` · ${json.skipped} vacíos omitidos` : "") +
          ". Ordenados de mayor a menor diamantes."
      );
    } catch {
      setMsg("No se pudo leer el archivo XLSX.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDelete(c: CreatorRow) {
    if (!canEditCreators) return;
    if (
      !confirm(
        `¿Eliminar a ${c.name}? Se borrarán también sus métricas, tareas y registros ligados.`
      )
    ) {
      return;
    }
    setDeletingId(c.id);
    setMsg("");
    try {
      const res = await deleteCreator(c.id);
      if (res && "error" in res && res.error) {
        setMsg(res.error);
        return;
      }
      refreshList();
    } catch {
      setMsg("No se pudo eliminar el creador.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <TopBar
        title="Creadores"
        subtitle="Roster completo de tu agencia TikTok LIVE"
      />

      <div className="mb-5 space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nombre / teléfono…"
            className={`${field} col-span-2 sm:col-span-1`}
          />
          <select
            className={field}
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
          >
            <option value="">Todos los nichos</option>
            {niches.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <select
            className={field}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="pausado">Pausado</option>
            <option value="baja">Baja</option>
          </select>
          <select
            className={field}
            value={managerFilter}
            onChange={(e) => setManagerFilter(e.target.value)}
          >
            <option value="">Todos los managers</option>
            <option value="__none__">Sin manager</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.role === "admin"
                  ? " · Admin"
                  : m.role === "manager"
                    ? " · Manager"
                    : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEditCreators && (
            <>
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
                disabled={busy !== null}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {busy === "import" ? "Importando…" : "Importar XLSX"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy !== null || !filtered.length}
                onClick={() => void exportXlsx()}
              >
                <Download className="h-4 w-4" />
                {busy === "export" ? "Exportando…" : "Exportar XLSX"}
              </Button>
            </>
          )}
          <Button type="button" onClick={openCreateCreator}>
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        </div>
      </div>

      {msg && (
        <p
          className={`mb-3 text-xs ${
            /error|no se pudo|solo un admin|inválid/i.test(msg)
              ? "text-danger"
              : "text-text-muted"
          }`}
        >
          {msg}
        </p>
      )}

      {error ? (
        <PanelLoadError onRetry={() => mutate()} />
      ) : !data ? (
        <Panel className="animate-pulse space-y-3 p-4">
          <div className="h-4 w-1/3 rounded bg-bg-hover" />
          <div className="h-9 rounded bg-bg-hover" />
          <div className="h-9 rounded bg-bg-hover" />
        </Panel>
      ) : data.creators.length === 0 ? (
        <EmptyState
          title="Sin creadores"
          description={
            canEditCreators
              ? "Registra tu primer streamer o importa un Excel (.xlsx). Basta con el usuario TikTok; el resto lo editas después."
              : "Aún no hay creadores en el roster. Pide a un admin que los registre."
          }
          action={
            <div className="flex gap-2">
              {canEditCreators && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-4 w-4" /> Importar XLSX
                </Button>
              )}
              <Button type="button" onClick={openCreateCreator}>
                <Plus className="h-4 w-4" /> Registrar creador
              </Button>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <Panel>
          <p className="text-sm text-text-muted">
            No hay resultados con esos filtros.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setQ("");
              setNiche("");
              setStatus("");
              setManagerFilter("");
            }}
          >
            Limpiar filtros
          </Button>
        </Panel>
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[920px] table-fixed text-left text-[12px] leading-snug">
            <colgroup>
              <col className="w-[17%]" />
              <col className="w-[13%]" />
              <col className="w-[9%]" />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[11%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead className="border-b border-border-soft text-[10px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-2.5 py-2 font-medium">Nombre</th>
                <th className="px-2.5 py-2 font-medium">Teléfono</th>
                <th className="px-2.5 py-2 font-medium">Nicho</th>
                <th className="px-2.5 py-2 font-medium">Incorporación</th>
                <th className="px-2.5 py-2 font-medium">TikTok</th>
                <th className="px-2.5 py-2 font-medium">Grupo</th>
                <th className="px-2.5 py-2 font-medium">Estado</th>
                <th className="px-2.5 py-2 font-medium">Manager</th>
                <th className="px-2.5 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border-soft/70 hover:bg-bg-hover/40"
                >
                  <td className="px-2.5 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <TikTokAvatar
                        username={c.tiktokUser}
                        name={c.name}
                        size={28}
                      />
                      <Link
                        href={path(`/creadores/${c.id}`)}
                        className="truncate font-medium hover:text-accent"
                        title={c.name}
                      >
                        {c.name}
                      </Link>
                    </div>
                  </td>
                  <td
                    className="truncate px-2.5 py-2 text-text-muted"
                    title={c.phone}
                  >
                    {c.phone}
                  </td>
                  <td className="truncate px-2.5 py-2" title={c.niche}>
                    {c.niche}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-text-muted">
                    {formatDate(c.joinDate)}
                  </td>
                  <td
                    className="truncate px-2.5 py-2 text-text-muted"
                    title={c.tiktokUser ? `@${c.tiktokUser}` : undefined}
                  >
                    {c.tiktokUser ? `@${c.tiktokUser}` : "—"}
                  </td>
                  <td className="truncate px-2.5 py-2 text-text-muted">
                    {c.groupName ?? "—"}
                  </td>
                  <td className="px-2.5 py-2">
                    <StatusBadge status={c.status} />
                  </td>
                  <td
                    className="truncate px-2.5 py-2 text-text-muted"
                    title={c.managerName ?? undefined}
                  >
                    {c.managerName ?? "—"}
                  </td>
                  <td className="px-2.5 py-2">
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      {whatsappUrl(c.phone, c.country) && (
                        <a
                          href={whatsappUrl(c.phone, c.country)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir WhatsApp"
                          className="rounded-md border border-border p-1.5 text-[#25D366] hover:border-[#25D366] hover:bg-[#25D366]/10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <WhatsAppIcon className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {canEditCreators && (
                        <>
                          <button
                            type="button"
                            title="Editar"
                            className="rounded-md border border-border p-1.5 text-text-muted hover:border-accent hover:text-accent"
                            onClick={() => setEditing(c)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Borrar"
                            disabled={deletingId === c.id}
                            className="rounded-md border border-border p-1.5 text-text-muted hover:border-danger hover:text-danger disabled:opacity-50"
                            onClick={() => void onDelete(c)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Modal
        open={!!editing && canEditCreators}
        onClose={() => setEditing(null)}
        title="Editar creador"
        subtitle={editing ? `@${editing.tiktokUser ?? "sin-usuario"}` : undefined}
        wide
      >
        {editing && (
          <CreatorForm
            managers={managers}
            embedded
            initial={{
              id: editing.id,
              name: editing.name,
              phone: editing.phone,
              niche: editing.niche,
              joinDate: String(editing.joinDate).slice(0, 10),
              tiktokUser: editing.tiktokUser,
              country: editing.country,
              status: editing.status,
              groupName: editing.groupName,
              notes: editing.notes,
              managerId: editing.managerId,
            }}
            onDone={() => {
              setEditing(null);
              refreshList();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}
