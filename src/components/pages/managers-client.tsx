"use client";

import { useState } from "react";
import { UserPlus, Trash2, Shield, Eye } from "lucide-react";
import { useSession } from "next-auth/react";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, Field, Panel, inputClass } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";
import { createManager, deleteManager, setUserPosition } from "@/lib/actions";
import { POSITIONS, POSITION_LABEL } from "@/lib/positions";
import { useViewAs } from "@/components/view-as";

type ManagerRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  position: string | null;
  createdAt: string;
  creatorsCount: number;
};

export default function ManagersClient() {
  const { data: session } = useSession();
  const { setViewAs, viewAsId } = useViewAs();
  const { data, error, mutate } = usePanelData(PANEL.managers) as {
    data?: { managers: ManagerRow[] };
    error?: Error;
    mutate: (data?: unknown, opts?: { revalidate?: boolean }) => Promise<unknown> | void;
  };

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("manager");
  const [position, setPosition] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    setMsg("");
    const fd = new FormData();
    fd.set("name", name);
    fd.set("email", email);
    fd.set("password", password);
    fd.set("role", role);
    fd.set("position", position);
    const res = await createManager(fd);
    setSaving(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    setRole("manager");
    setPosition("");
    setMsg("Manager creado. Ya puede iniciar sesión y asignarse a creadores.");
    mutate();
    invalidatePanel(PANEL.creators);
  }

  async function onPosition(m: ManagerRow, value: string) {
    setErr("");
    setMsg("");
    const next = value || null;
    // Se ve al instante; si falla, se revierte y se muestra el motivo.
    await mutate(
      (cur?: { managers: ManagerRow[] }) =>
        cur && { managers: cur.managers.map((x) => (x.id === m.id ? { ...x, position: next } : x)) },
      { revalidate: false }
    );
    try {
      const res = await setUserPosition(m.id, next);
      if (res.error) throw new Error(res.error);
      setMsg(`Puesto de ${m.name} guardado.`);
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "No se pudo guardar el puesto. Revisa que la base de datos tenga las columnas nuevas.");
    }
    // Confirmar contra el servidor sin usar la caché del navegador
    try {
      const fresh = await fetch(PANEL.managers, { cache: "no-store", headers: { "x-skip-view-as": "1" } });
      if (fresh.ok) await mutate(await fresh.json(), { revalidate: false });
    } catch {
      /* se queda lo que ya se ve */
    }
    invalidatePanel("/api/panel/mi-dia", PANEL.tasks);
  }

  async function onDelete(m: ManagerRow) {
    if (!confirm(`¿Eliminar a ${m.name} (${m.email})?`)) return;
    const res = await deleteManager(m.id);
    if (res.error) {
      setErr(res.error);
      return;
    }
    mutate();
    invalidatePanel(PANEL.creators);
  }

  if (error) {
    return (
      <div>
        <TopBar title="Managers" subtitle="Accesos al panel de la agencia" />
        <PanelLoadError onRetry={() => mutate()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <TopBar title="Managers" subtitle="Accesos al panel de la agencia" />
        <div className="glass-panel h-64 animate-pulse rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title="Managers"
        subtitle="Se agregan al registrarse o desde aquí"
      />

      <Panel className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-accent" />
          <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
            Nuevo manager
          </h2>
        </div>
        <p className="mb-4 text-sm text-text-muted">
          Solo un admin puede crear cuentas aquí. El registro público está
          desactivado.
        </p>
        <form onSubmit={onCreate} className="grid gap-3 md:grid-cols-2">
          <Field label="Nombre">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Sofía Manager"
            />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="sofia@agencia.com"
            />
          </Field>
          <Field label="Contraseña">
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="Mínimo 6 caracteres"
            />
          </Field>
          <Field label="Rol">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={inputClass}
            >
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Field label="Puesto (define sus tareas fijas de cada día)">
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className={inputClass}
            >
              <option value="">Sin puesto</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {POSITION_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          {err && <p className="text-sm text-danger md:col-span-2">{err}</p>}
          {msg && <p className="text-sm text-success md:col-span-2">{msg}</p>}
          <div className="md:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Creando…" : "Crear manager"}
            </Button>
          </div>
        </form>
      </Panel>

      {(err || msg) && (
        <p className={`mb-3 text-sm ${err ? "text-danger" : "text-success"}`}>{err || msg}</p>
      )}

      <Panel className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border-soft text-[11px] uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Nombre</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Rol</th>
              <th className="px-4 py-2.5 font-medium">Puesto</th>
              <th className="px-4 py-2.5 font-medium">Creadores</th>
              <th className="px-4 py-2.5 font-medium">Alta</th>
              <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.managers.map((m) => (
              <tr
                key={m.id}
                className={`border-b border-border-soft/70 hover:bg-bg-hover/40 ${
                  viewAsId === m.id ? "bg-cyan/10" : ""
                }`}
              >
                <td className="px-4 py-2.5 font-medium">{m.name}</td>
                <td className="px-4 py-2.5 text-text-muted">{m.email}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-xs capitalize text-accent">
                    <Shield className="h-3 w-3" />
                    {m.role}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={m.position ?? ""}
                    onChange={(e) => void onPosition(m, e.target.value)}
                    className={`${inputClass} !py-1 text-xs`}
                    aria-label={`Puesto de ${m.name}`}
                  >
                    <option value="">Sin puesto</option>
                    {POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {POSITION_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2.5 text-text-muted">
                  {m.creatorsCount}
                </td>
                <td className="px-4 py-2.5 text-text-muted">
                  {formatDate(m.createdAt)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-2">
                    {m.role === "manager" && (
                      <button
                        type="button"
                        title="Ver su vista"
                        className="rounded-lg border border-border p-2 text-text-muted hover:border-cyan hover:text-cyan"
                        onClick={() => setViewAs(m.id, m.name)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Eliminar"
                      disabled={session?.user?.id === m.id}
                      className="rounded-lg border border-border p-2 text-text-muted hover:border-danger hover:text-danger disabled:opacity-40"
                      onClick={() => void onDelete(m)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
