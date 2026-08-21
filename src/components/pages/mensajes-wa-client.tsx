"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { Button, EmptyState, Field, Panel, inputClass } from "@/components/ui";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { PanelLoadError } from "@/components/panel-load-error";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";
import { useViewAs } from "@/components/view-as";
import { filterByManagerId } from "@/lib/scope-view";
import { whatsappUrl } from "@/lib/phone";
import { cn, currentMonth, formatNumber } from "@/lib/utils";
import {
  DEFAULT_WA_TEMPLATES,
  WA_TEMPLATE_VARS,
  fillWaTemplate,
} from "@/lib/wa-template";

type CreatorRow = {
  id: string;
  name: string;
  phone: string;
  tiktokUser: string | null;
  country?: string | null;
  status: string;
  diamondsMonth?: number;
  diamondsTotal?: number;
  diamonds?: number;
  managerId?: string | null;
};

const STORAGE_KEY = "mensajes_wa_drafts_v1";

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

function loadDrafts(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export default function MensajesWaClient() {
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState("");
  const { viewAsId } = useViewAs();

  const { data, error, mutate } = usePanelData(PANEL.creators) as {
    data?: { creators: CreatorRow[] };
    error?: Error;
    mutate: () => void;
  };
  const { data: hub, mutate: mutateHub } = usePanelData(
    `${PANEL.hub}?period=${period}`
  ) as {
    data?: {
      templates: { id: string; name: string; body: string }[];
      roster?: {
        id: string;
        diamonds: number;
        hours: number;
        days: number;
        targetDiamonds: number;
      }[];
    };
    mutate: () => void;
  };

  const [tplName, setTplName] = useState("");
  const [tplBody, setTplBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTpl, setActiveTpl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const period = currentMonth();

  useEffect(() => {
    setDrafts(loadDrafts());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    } catch {
      /* ignore quota */
    }
  }, [drafts, ready]);

  const list = useMemo(() => {
    const creators = filterByManagerId(data?.creators ?? [], viewAsId);
    const query = q.trim().toLowerCase();
    return creators
      .filter((c) => {
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
  }, [data, q, viewAsId]);

  const rosterById = useMemo(() => {
    const map = new Map<
      string,
      { diamonds: number; hours: number; days: number; targetDiamonds: number }
    >();
    for (const row of hub?.roster ?? []) {
      map.set(row.id, row);
    }
    return map;
  }, [hub?.roster]);

  function varsFor(c: CreatorRow) {
    const stats = rosterById.get(c.id);
    const diamonds = stats?.diamonds ?? c.diamondsMonth ?? c.diamonds ?? 0;
    const hours = stats ? Math.round(stats.hours) : null;
    const days = stats?.days ?? null;
    const meta = stats?.targetDiamonds ?? 0;
    const faltan = meta > 0 ? Math.max(0, meta - diamonds) : null;
    return {
      nombre: c.name,
      diamantes: formatNumber(diamonds),
      horas: hours == null ? "—" : String(hours),
      dias: days == null ? "—" : String(days),
      meta: meta > 0 ? formatNumber(meta) : "—",
      faltan: faltan == null ? "—" : formatNumber(faltan),
      nicho: "",
    };
  }

  function setMessage(id: string, value: string) {
    setDrafts((prev) => {
      const next = { ...prev };
      if (!value.trim()) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  function applyTemplate(body: string, name?: string) {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const c of list) {
        next[c.id] = fillWaTemplate(body, varsFor(c));
      }
      return next;
    });
    if (name) setActiveTpl(name);
    setHint("Plantilla aplicada a los creadores visibles.");
  }

  function insertVar(key: string) {
    const token = `{${key}}`;
    const el = bodyRef.current;
    if (!el) {
      setTplBody((prev) => `${prev}${token}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${tplBody.slice(0, start)}${token}${tplBody.slice(end)}`;
    setTplBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function newTemplate() {
    setEditingId(null);
    setActiveTpl(null);
    setTplName("");
    setTplBody("Hola {nombre}, vas {diamantes} diamantes y {dias} días LIVE.");
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!tplName.trim() || !tplBody.trim()) return;
    setSaving(true);
    const wasEdit = Boolean(editingId);
    try {
      const res = await fetch(PANEL.hub, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "template",
          id: editingId ?? undefined,
          name: tplName.trim(),
          body: tplBody.trim(),
        }),
      });
      const json = (await res.json()) as { row?: { id: string } };
      if (!res.ok) {
        setHint("No se pudo guardar la plantilla.");
        return;
      }
      if (json.row?.id) setEditingId(json.row.id);
      applyTemplate(tplBody.trim(), tplName.trim());
      setHint(
        wasEdit
          ? "Plantilla actualizada y aplicada."
          : "Plantilla guardada y aplicada."
      );
      invalidatePanel(PANEL.hub);
      await mutateHub();
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    await fetch(PANEL.hub, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-template", id }),
    });
    if (editingId === id) newTemplate();
    invalidatePanel(PANEL.hub);
    await mutateHub();
    setHint("Plantilla eliminada.");
  }

  function openWa(c: CreatorRow) {
    const link = whatsappUrl(c.phone, c.country);
    if (!link) {
      setHint(`Sin WhatsApp válido para ${c.name}`);
      return;
    }
    const text = (drafts[c.id] ?? "").trim();
    if (!text) {
      setHint("Escribe un mensaje antes de enviar");
      return;
    }
    setHint("");
    window.open(
      `${link}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  if (error) {
    return (
      <div>
        <TopBar
          title="Mensajes WhatsApp"
          subtitle="Escribe y abre el chat con el mensaje listo"
        />
        <PanelLoadError
          message={error.message}
          onRetry={() => mutate()}
        />
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title="Mensajes WhatsApp"
        subtitle="Mismo orden que Creadores · abre WhatsApp con tu texto (no se envía solo desde aquí)"
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-text-muted">
            Buscar
          </label>
          <input
            className={inputClass}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, TikTok o teléfono…"
          />
        </div>
        <p className="pb-2 text-xs text-text-muted">
          {formatNumber(list.length)} creadores
        </p>
      </div>

      <Panel className="mb-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Plantillas</p>
            <p className="mt-1 text-xs text-text-muted">
              Clic en una variable para insertarla. Se reemplaza sola con el
              nombre, diamantes, horas y días de cada creador.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={newTemplate}>
            <Plus className="h-4 w-4" /> Nueva plantilla
          </Button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {WA_TEMPLATE_VARS.map((v) => (
            <button
              key={v.key}
              type="button"
              title={`Insertar {${v.key}} · ej. ${v.example}`}
              className="rounded-full border border-cyan/30 bg-cyan/10 px-2.5 py-1 font-mono text-[11px] text-cyan hover:bg-cyan/20"
              onClick={() => insertVar(v.key)}
            >
              {`{${v.key}}`}
              <span className="ml-1.5 font-sans text-text-muted">{v.label}</span>
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {DEFAULT_WA_TEMPLATES.map((t) => (
            <button
              key={t.name}
              type="button"
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                activeTpl === t.name
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border hover:border-accent"
              )}
              onClick={() => {
                setEditingId(null);
                setTplName(t.name);
                setTplBody(t.body);
                applyTemplate(t.body, t.name);
              }}
            >
              {t.name}
            </button>
          ))}
          {(hub?.templates ?? []).map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1">
              <button
                type="button"
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  editingId === t.id || activeTpl === t.name
                    ? "border-cyan bg-cyan/15 text-cyan"
                    : "border-cyan/30 bg-cyan/10 text-cyan hover:border-cyan"
                )}
                onClick={() => {
                  setEditingId(t.id);
                  setTplName(t.name);
                  setTplBody(t.body);
                  applyTemplate(t.body, t.name);
                }}
              >
                {t.name}
              </button>
              <button
                type="button"
                title="Eliminar plantilla"
                className="rounded-full border border-border p-1 text-text-muted hover:border-danger hover:text-danger"
                onClick={() => void deleteTemplate(t.id)}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>

        <form onSubmit={(e) => void saveTemplate(e)} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[200px_1fr]">
            <Field label="Nombre de la plantilla">
              <input
                className={inputClass}
                placeholder="Ej. Recordatorio de días"
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                required
              />
            </Field>
            <div className="flex items-end">
              <p className="pb-2.5 text-xs text-text-muted">
                {editingId
                  ? "Estás editando una plantilla guardada."
                  : "Se guardará como plantilla nueva de la agencia."}
              </p>
            </div>
          </div>
          <Field label="Mensaje">
            <textarea
              ref={bodyRef}
              className={cn(inputClass, "min-h-[6rem] resize-y leading-relaxed")}
              placeholder="Hola {nombre}, vas {diamantes} diamantes y {dias} días LIVE…"
              value={tplBody}
              onChange={(e) => setTplBody(e.target.value)}
              required
            />
          </Field>
          {tplBody.trim() && list[0] && (
            <p className="rounded-lg border border-border-soft bg-bg px-3 py-2 text-xs text-text-muted">
              Vista previa · {list[0].name}:{" "}
              <span className="text-text">
                {fillWaTemplate(tplBody, varsFor(list[0]))}
              </span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving
                ? "Guardando…"
                : editingId
                  ? "Guardar cambios"
                  : "Guardar plantilla"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!tplBody.trim()}
              onClick={() => applyTemplate(tplBody, tplName || "Personalizada")}
            >
              Aplicar a visibles
            </Button>
          </div>
        </form>
      </Panel>

      {hint && (
        <p className="mb-3 text-xs text-cyan">{hint}</p>
      )}

      {!data ? (
        <Panel>
          <div className="h-40 animate-pulse rounded-lg bg-bg-hover/40" />
        </Panel>
      ) : list.length === 0 ? (
        <EmptyState
          title="Sin creadores"
          description="No hay usuarios que coincidan. Revisa Creadores o limpia el filtro."
        />
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="max-h-[calc(100vh-14rem)] overflow-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-border-soft bg-bg-elevated text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Creador</th>
                  <th className="w-[45%] px-4 py-2.5 font-medium">Mensaje</th>
                  <th className="px-4 py-2.5 text-right font-medium">Enviar</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const wa = whatsappUrl(c.phone, c.country);
                  const msg = drafts[c.id] ?? "";
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-border-soft/70 align-top hover:bg-bg-hover/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <TikTokAvatar
                            username={c.tiktokUser}
                            name={c.name}
                            size={36}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.name}</p>
                            <p className="truncate text-xs text-text-muted">
                              {c.tiktokUser ? `@${c.tiktokUser}` : "sin TikTok"}
                              {c.phone ? ` · ${c.phone}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <textarea
                          value={msg}
                          onChange={(e) => setMessage(c.id, e.target.value)}
                          rows={3}
                          placeholder="Escribe el mensaje personalizado para este creador…"
                          className={cn(
                            inputClass,
                            "min-h-[4.5rem] resize-y py-2 leading-relaxed"
                          )}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={!wa || !msg.trim()}
                            title={
                              !wa
                                ? "Teléfono inválido"
                                : !msg.trim()
                                  ? "Escribe un mensaje"
                                  : "Abrir WhatsApp con el mensaje"
                            }
                            onClick={() => openWa(c)}
                            className={cn(
                              "border-[#25D366]/40 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20",
                              "disabled:opacity-40"
                            )}
                          >
                            <WhatsAppIcon className="h-4 w-4" />
                            Enviar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
