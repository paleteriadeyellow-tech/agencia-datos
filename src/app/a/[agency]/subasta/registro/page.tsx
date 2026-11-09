"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button, Field, Panel, inputClass } from "@/components/ui";

type Edition = { number: number; date: string; time: string; host: string };

function longDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
function time12(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "p. m." : "a. m."}`;
}

const empty = {
  name: "", tiktokUser: "", profileUrl: "", creatorAgency: "", photoUrl: "", bio: "", contentType: "", availability: "",
  cameraMode: "camara", canChangeName: false, acceptedRules: false, imageConsent: false, website: "",
};

export default function AuctionRegistrationPage() {
  const { agency } = useParams<{ agency: string }>();
  const [edition, setEdition] = useState<Edition | null | undefined>(undefined);
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [folio, setFolio] = useState("");

  useEffect(() => {
    fetch(`/api/public/auctions/register?agency=${encodeURIComponent(agency)}`)
      .then((r) => r.json())
      .then((j) => setEdition(j.edition ?? null))
      .catch(() => setEdition(null));
  }, [agency]);

  const set = (k: keyof typeof empty, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/public/auctions/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agency, ...f }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "No se pudo enviar."); return; }
      setFolio(j.folio);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-cyan">Subasta de Creadores de El Árbol</p>
      <h1 className="mt-1 font-[family-name:var(--font-syne)] text-3xl font-bold">Inscripción de creadores</h1>

      {edition === undefined && <p className="mt-6 text-sm text-text-muted">Cargando…</p>}

      {edition === null && (
        <Panel className="mt-6 text-sm text-text-muted">Por ahora no hay una subasta con inscripciones abiertas. Vuelve pronto.</Panel>
      )}

      {edition && folio && (
        <Panel className="mt-6 space-y-2">
          <p className="font-semibold text-success">¡Inscripción recibida!</p>
          <p className="text-sm">Tu folio es:</p>
          <p className="font-mono text-2xl font-bold tracking-wider">{folio}</p>
          <p className="text-sm text-text-muted">Guárdalo. Tu inscripción queda en revisión: el equipo se pondrá en contacto contigo. Esto aún no confirma tu lugar.</p>
        </Panel>
      )}

      {edition && !folio && (
        <>
          <Panel className="mt-6 text-sm">
            <p className="font-medium">Edición #{edition.number}</p>
            <p className="capitalize text-text-muted">{longDate(edition.date)} · {time12(edition.time)} · Anfitriona: {edition.host}</p>
          </Panel>

          <form onSubmit={submit} className="mt-4 space-y-4">
            <Panel className="space-y-4">
              <Field label="Nombre completo o artístico *"><input className={inputClass} value={f.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} /></Field>
              <Field label="Usuario de TikTok *"><input className={inputClass} value={f.tiktokUser} onChange={(e) => set("tiktokUser", e.target.value)} placeholder="@usuario" required maxLength={60} /></Field>
              <Field label="Enlace de tu perfil"><input type="url" className={inputClass} value={f.profileUrl} onChange={(e) => set("profileUrl", e.target.value)} placeholder="https://www.tiktok.com/@usuario" /></Field>
              <Field label="Agencia a la que perteneces *"><input className={inputClass} value={f.creatorAgency} onChange={(e) => set("creatorAgency", e.target.value)} required maxLength={120} /></Field>
              <Field label="Descripción personal * (10 a 500 caracteres)"><textarea className={inputClass} rows={3} value={f.bio} onChange={(e) => set("bio", e.target.value)} required minLength={10} maxLength={500} /></Field>
              <Field label="Tipo de contenido *"><input className={inputClass} value={f.contentType} onChange={(e) => set("contentType", e.target.value)} required maxLength={120} /></Field>
              <Field label="Disponibilidad para participar *"><input className={inputClass} value={f.availability} onChange={(e) => set("availability", e.target.value)} placeholder="Ej. Estaré conectado desde las 7:30 p. m." required maxLength={200} /></Field>
            </Panel>

            <Panel className="space-y-4">
              <Field label="¿Cómo participarás? *">
                <select className={inputClass} value={f.cameraMode} onChange={(e) => set("cameraMode", e.target.value)}>
                  <option value="camara">Con la cámara encendida</option>
                  <option value="imagen">Con una imagen representativa</option>
                </select>
              </Field>
              <Field label={f.cameraMode === "imagen" ? "Enlace de tu imagen representativa *" : "Enlace de una foto tuya (opcional)"}>
                <input type="url" className={inputClass} value={f.photoUrl} onChange={(e) => set("photoUrl", e.target.value)} placeholder="https://…" required={f.cameraMode === "imagen"} />
              </Field>
            </Panel>

            <Panel className="space-y-3 text-sm">
              <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.canChangeName} onChange={(e) => set("canChangeName", e.target.checked)} required /> Confirmo que puedo cambiar mi nombre de usuario durante la dinámica. *</label>
              <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.acceptedRules} onChange={(e) => set("acceptedRules", e.target.checked)} required /> Acepto las reglas de participación que me comparta la organización. *</label>
              <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.imageConsent} onChange={(e) => set("imageConsent", e.target.checked)} /> Autorizo el uso de mi imagen para la promoción del evento.</label>
            </Panel>

            {/* Trampa para bots: las personas no lo ven */}
            <input tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={(e) => set("website", e.target.value)} aria-hidden />

            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Enviando…" : "Inscribirme"}</Button>
          </form>
        </>
      )}
    </main>
  );
}
