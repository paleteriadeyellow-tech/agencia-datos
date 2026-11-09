"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { PanelLoadError } from "@/components/panel-load-error";
import { EmptyState, Panel, inputClass } from "@/components/ui";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";

type Edition = { id: string; number: number; date: string; status: string };
type Reg = {
  id: string; editionId: string; folio: string; name: string; tiktokUser: string; profileUrl: string | null; creatorAgency: string;
  photoUrl: string | null; bio: string; contentType: string; availability: string; cameraMode: string; imageConsent: boolean;
  status: string; responsibleId: string | null; comment: string | null; createdAt: string;
};

export const REG_STATUS_LABEL: Record<string, string> = {
  registrado: "Registrado",
  pendiente_contacto: "Pendiente de contacto",
  contactado: "Contactado",
  aceptado: "Aceptado",
  pendiente_grupo: "Pendiente de incorporación al grupo",
  en_grupo: "Dentro del grupo",
  capacitado: "Capacitación completada",
  confirmado: "Confirmado",
  participo: "Participó",
  no_asistio: "No asistió",
  cancelo: "Canceló",
};

const PENDING = ["registrado", "pendiente_contacto", "contactado", "aceptado", "pendiente_grupo", "en_grupo", "capacitado"];

export default function AuctionParticipantsClient({ editions }: { editions: Edition[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultEdition = (editions.find((e) => e.status === "programada" && e.date >= today) ?? editions[editions.length - 1])?.id ?? "";
  const [editionId, setEditionId] = useState(defaultEdition);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [fail, setFail] = useState("");

  const url = editionId ? `${PANEL.auctions}/registrations?editionId=${editionId}` : null;
  const { data, error, mutate } = usePanelData(url) as {
    data?: { registrations: Reg[]; users: { id: string; name: string }[] }; error?: Error; mutate: () => void;
  };
  const rows = useMemo(() => data?.registrations ?? [], [data?.registrations]);

  const stats = useMemo(() => ({
    total: rows.filter((r) => r.status !== "cancelo").length,
    confirmed: rows.filter((r) => r.status === "confirmado").length,
    pending: rows.filter((r) => PENDING.includes(r.status)).length,
    inGroup: rows.filter((r) => ["en_grupo", "capacitado", "confirmado"].includes(r.status)).length,
    camera: rows.filter((r) => r.status !== "cancelo" && r.cameraMode === "camara").length,
    image: rows.filter((r) => r.status !== "cancelo" && r.cameraMode === "imagen").length,
  }), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^@/, "");
    return rows.filter((r) => (!status || r.status === status) && (!needle || [r.name, r.tiktokUser, r.folio, r.creatorAgency].some((v) => v.toLowerCase().includes(needle))));
  }, [rows, status, q]);

  async function patch(id: string, body: Record<string, unknown>) {
    setFail("");
    const res = await fetch(`${PANEL.auctions}/registrations`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setFail(j.error ?? "No se pudo guardar"); return; }
    invalidatePanel(PANEL.auctions);
    mutate();
  }

  if (!editions.length) return <EmptyState title="Aún no hay ediciones" description="Genera una edición en la pestaña Calendario para recibir inscripciones." />;
  if (error && !data) return <PanelLoadError message={error.message} onRetry={() => mutate()} />;

  const Stat = ({ label, value }: { label: string; value: number }) => (
    <Panel className="py-3 text-center"><p className="text-2xl font-bold">{value}</p><p className="text-xs text-text-muted">{label}</p></Panel>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Inscritos" value={stats.total} />
        <Stat label="Confirmados" value={stats.confirmed} />
        <Stat label="Pendientes" value={stats.pending} />
        <Stat label="En el grupo" value={stats.inGroup} />
        <Stat label="Con cámara" value={stats.camera} />
        <Stat label="Con imagen" value={stats.image} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <select className={inputClass} value={editionId} onChange={(e) => setEditionId(e.target.value)}>
          {editions.map((e) => <option key={e.id} value={e.id}>Edición #{e.number} · {e.date}{e.status === "cancelada" ? " (cancelada)" : ""}</option>)}
        </select>
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(REG_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className={inputClass} placeholder="Buscar nombre, usuario, folio o agencia" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {fail && <p className="text-sm text-danger">{fail}</p>}

      {!data ? <p className="text-sm text-text-muted">Cargando…</p> : shown.length === 0 ? (
        <EmptyState title={rows.length ? "Sin resultados" : "Aún no hay inscripciones"} description={rows.length ? "Prueba con otro filtro." : "Abre el registro de la edición en la pestaña Calendario y comparte el enlace."} />
      ) : shown.map((r) => (
        <Panel key={r.id} className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{r.name} <span className="text-text-muted">@{r.tiktokUser}</span></p>
              <p className="text-xs text-text-muted">{r.folio} · {r.creatorAgency} · {r.cameraMode === "camara" ? "Cámara" : "Imagen"}{r.imageConsent ? " · Autorizó su imagen" : ""}</p>
            </div>
            <button className="text-xs text-cyan hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Ocultar datos" : "Ver datos"}</button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1"><span className="text-xs text-text-muted">Estado</span>
              <select className={inputClass} value={r.status} onChange={(e) => patch(r.id, { status: e.target.value })}>
                {Object.entries(REG_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="space-y-1"><span className="text-xs text-text-muted">Responsable</span>
              <select className={inputClass} value={r.responsibleId ?? ""} onChange={(e) => patch(r.id, { responsibleId: e.target.value || null })}>
                <option value="">Sin asignar</option>
                {data.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-1"><span className="text-xs text-text-muted">Comentario (se guarda al salir del campo)</span>
            <textarea className={inputClass} rows={2} defaultValue={r.comment ?? ""} maxLength={1000} onBlur={(e) => { if (e.target.value !== (r.comment ?? "")) patch(r.id, { comment: e.target.value }); }} />
          </label>

          {open === r.id && (
            <div className="space-y-1 border-t border-border-soft pt-3 text-sm">
              <p><span className="text-text-muted">Descripción:</span> {r.bio}</p>
              <p><span className="text-text-muted">Contenido:</span> {r.contentType}</p>
              <p><span className="text-text-muted">Disponibilidad:</span> {r.availability}</p>
              <div className="flex flex-wrap gap-3 pt-1">
                {r.profileUrl && <a className="inline-flex items-center gap-1 text-cyan hover:underline" href={r.profileUrl} target="_blank" rel="noopener noreferrer">Perfil <ExternalLink className="h-3 w-3" /></a>}
                {r.photoUrl && <a className="inline-flex items-center gap-1 text-cyan hover:underline" href={r.photoUrl} target="_blank" rel="noopener noreferrer">Foto o imagen <ExternalLink className="h-3 w-3" /></a>}
              </div>
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}
