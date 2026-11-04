"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, Plus, Search, Trash2 } from "lucide-react";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { TopBar } from "@/components/top-bar";
import { PanelLoadError } from "@/components/panel-load-error";
import { Button, Field, Panel, inputClass } from "@/components/ui";
import { MESES_NOMBRE } from "@/lib/bonos";
import { cn, formatDate } from "@/lib/utils";

const API = "/api/panel/prospects";

type Row = {
  id: string;
  username: string;
  year: number;
  month: number;
  publishedAt: string;
  claimedById: string | null;
  claimedByName: string | null;
  claimedAt: string | null;
};
type UserOpt = { id: string; name: string; role: string };
type Payload = { isAdmin: boolean; me: string | null; rows: Row[]; users: UserOpt[]; years: number[] };

type State = "todos" | "sin" | "asignados";

export default function ProspectsClient() {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>("todos");
  const [who, setWho] = useState("");
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}?year=${year}&month=${month}`, { cache: "no-store", headers: { "x-skip-view-as": "1" } });
      if (!res.ok) throw new Error();
      setData((await res.json()) as Payload);
      setError(false);
    } catch {
      setError(true);
    }
  }, [year, month]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  const years = useMemo(() => {
    const y0 = new Date().getFullYear();
    return [...new Set([y0, y0 - 1, y0 + 1, ...(data?.years ?? [])])].sort((a, b) => b - a);
  }, [data?.years]);

  const admin = !!data?.isAdmin;
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^@/, "");
    return (data?.rows ?? []).filter((r) => {
      if (term && !r.username.includes(term)) return false;
      if (state === "sin" && r.claimedById) return false;
      if (state === "asignados" && !r.claimedById) return false;
      if (who && r.claimedById !== who) return false;
      return true;
    });
  }, [data, q, state, who]);

  const counts = useMemo(() => {
    const all = data?.rows ?? [];
    const byWho = new Map<string, { name: string; n: number }>();
    for (const r of all) {
      if (!r.claimedById) continue;
      const cur = byWho.get(r.claimedById) ?? { name: r.claimedByName ?? "—", n: 0 };
      cur.n++;
      byWho.set(r.claimedById, cur);
    }
    return { total: all.length, sin: all.filter((r) => !r.claimedById).length, byWho: [...byWho.entries()].sort((a, b) => b[1].n - a[1].n) };
  }, [data]);

  async function call(method: string, body?: unknown, query = "") {
    setMsg("");
    const res = await fetch(`${API}${query}`, { method, headers: { "Content-Type": "application/json", "x-skip-view-as": "1" }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json } as { ok: boolean; json: Record<string, unknown> & { error?: string } };
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    // Si estás viendo "todos los meses", se publican en el mes en curso
    const y = year === "all" ? now.getFullYear() : Number(year);
    const m = month === "all" ? now.getMonth() + 1 : Number(month);
    const r = await call("POST", { usernames: text, year: y, month: m });
    setAdding(false);
    if (!r.ok) {
      setMsg(r.json.error ?? "No se pudo publicar.");
      return;
    }
    const invalid = (r.json.invalid as string[] | undefined) ?? [];
    setMsg(`Se publicaron ${r.json.added} prospectos${r.json.repeated ? ` · ${r.json.repeated} ya estaban` : ""}${invalid.length ? ` · no entendí: ${invalid.join(", ")}` : ""}.`);
    setText("");
    if (year === "all" || month === "all") {
      setYear(String(y));
      setMonth(String(m));
    } else {
      await load();
    }
  }

  /** Marcar quién lo contacta. Un manager lo puede hacer solo una vez; después solo el admin lo cambia. */
  async function assign(row: Row, userId: string | null) {
    const person = userId ? data?.users.find((u) => u.id === userId)?.name : null;
    if (userId && !admin && !confirm(`¿Marcar a ${person} como quien contactará a @${row.username}?\n\nDespués solo el admin podrá cambiarlo.`)) return;
    setBusyId(row.id);
    const r = await call("PATCH", { id: row.id, userId });
    setBusyId(null);
    if (!r.ok) setMsg(r.json.error ?? "No se pudo guardar.");
    await load();
  }

  async function remove(row: Row) {
    if (!confirm(`¿Quitar a @${row.username} de la lista?`)) return;
    const r = await call("DELETE", undefined, `?id=${row.id}`);
    if (!r.ok) setMsg(r.json.error ?? "No se pudo borrar.");
    await load();
  }

  if (error) {
    return (
      <div>
        <TopBar title="Prospectos" subtitle="Usuarios por contactar y reclutar" />
        <PanelLoadError onRetry={() => void load()} />
      </div>
    );
  }

  const monthLabel = month === "all" ? "Todos los meses" : MESES_NOMBRE[Number(month)];

  return (
    <div className="space-y-4">
      <TopBar title="Prospectos" subtitle={`${monthLabel}${year === "all" ? "" : ` ${year}`} · quién contacta a cada usuario`} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Año">
          <select className={inputClass} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">Todos</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mes">
          <select className={inputClass} value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">Todos los meses</option>
            {MESES_NOMBRE.slice(1).map((m, i) => (
              <option key={m} value={String(i + 1)}>
                {m}
                {year === String(now.getFullYear()) && i + 1 === now.getMonth() + 1 ? " · mes actual" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estado">
          <select className={inputClass} value={state} onChange={(e) => setState(e.target.value as State)}>
            <option value="todos">Todos</option>
            <option value="sin">Sin asignar (nadie lo contacta aún)</option>
            <option value="asignados">Ya asignados</option>
          </select>
        </Field>
        <Field label="Buscar usuario">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} className={cn(inputClass, "pl-9")} placeholder="@usuario" />
          </div>
        </Field>
      </div>

      {admin && (
        <Panel className="space-y-3">
          <form onSubmit={add} className="space-y-3">
            <Field label="Publicar prospectos">
              <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} className={inputClass} placeholder={"@usuario1\n@usuario2\nhttps://www.tiktok.com/@usuario3"} />
            </Field>
            <p className="text-xs text-text-muted">Pega los usuarios, uno por renglón (con o sin @, o el enlace de TikTok). Se publican en el mes elegido arriba.</p>
            <Button type="submit" disabled={adding || !text.trim()}>
              <Plus className="h-4 w-4" /> {adding ? "Publicando…" : "Publicar"}
            </Button>
          </form>
        </Panel>
      )}

      {msg && <p className="text-sm text-text-muted">{msg}</p>}

      {data && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <button type="button" onClick={() => { setState("todos"); setWho(""); }} className={cn("rounded-md border px-2.5 py-1 font-semibold transition", state === "todos" && !who ? "border-white/60 bg-white/15 text-white" : "border-border text-text-muted hover:text-text")}>
            Total · {counts.total}
          </button>
          <button type="button" onClick={() => { setState(state === "sin" ? "todos" : "sin"); setWho(""); }} className={cn("rounded-md border px-2.5 py-1 transition", state === "sin" ? "border-accent bg-accent text-white" : "border-amber-400/40 bg-amber-500/10 text-amber-200")}>
            Sin asignar · {counts.sin}
          </button>
          {counts.byWho.map(([id, v]) => (
            <button key={id} type="button" onClick={() => { setWho(who === id ? "" : id); setState("todos"); }} className={cn("rounded-md border px-2.5 py-1 transition", who === id ? "border-accent bg-accent text-white" : "border-border text-text-muted hover:text-text")}>
              {v.name} · {v.n}
            </button>
          ))}
        </div>
      )}

      {!data ? (
        <div className="glass-panel h-48 animate-pulse rounded-2xl" />
      ) : rows.length === 0 ? (
        <Panel className="py-10 text-center text-sm text-text-muted">
          {counts.total === 0 ? `No hay prospectos en ${monthLabel}${year === "all" ? "" : ` ${year}`}.${admin ? " Publícalos arriba." : " Cuando el admin publique usuarios aparecerán aquí."}` : "Ninguno coincide con esos filtros."}
        </Panel>
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border-soft text-[11px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Usuario</th>
                <th className="px-3 py-2.5 font-medium">Publicado</th>
                <th className="px-3 py-2.5 font-medium">Lo contacta</th>
                {admin && <th className="w-10 px-2 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn("border-b border-border-soft/70", !r.claimedById && "bg-amber-500/[0.04]")}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2.5">
                      <TikTokAvatar username={r.username} name={r.username} size={32} />
                      <span className="font-medium">@{r.username}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-text-muted">{formatDate(r.publishedAt)}</td>
                  <td className="px-3 py-2">
                    {r.claimedById && !admin ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2 py-1 text-xs text-success" title="Ya está asignado: solo el admin puede cambiarlo">
                        <Lock className="h-3 w-3" /> {r.claimedByName}
                      </span>
                    ) : (
                      <select
                        value={r.claimedById ?? ""}
                        disabled={busyId === r.id}
                        onChange={(e) => void assign(r, e.target.value || null)}
                        className={cn(inputClass, "!w-auto min-w-[11rem] !py-1.5 text-xs", r.claimedById && "border-success/40 text-success")}
                        aria-label={`Quién contacta a @${r.username}`}
                      >
                        <option value="">{admin ? "Sin asignar" : "Elegir quién lo contacta…"}</option>
                        {(data.users ?? []).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {r.claimedById && r.claimedAt && <span className="ml-2 text-[11px] text-text-muted">{formatDate(r.claimedAt)}</span>}
                  </td>
                  {admin && (
                    <td className="px-2 py-2 text-center">
                      <button type="button" onClick={() => void remove(r)} title="Quitar de la lista" className="rounded p-1.5 text-text-muted hover:text-danger">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
