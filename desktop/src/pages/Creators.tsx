import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import type { DesktopUser } from "../lib/api";

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
  diamonds?: number;
};

type CreatorsPayload = {
  creators: CreatorRow[];
  niches: string[];
  managers: { id: string; name: string; role?: string }[];
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

function statusBadge(status: string) {
  if (status === "activo") return "badge badge-ok";
  if (status === "pausado") return "badge badge-warn";
  return "badge badge-muted";
}

export function CreatorsPage({ user }: { user: DesktopUser }) {
  const isAdmin = user.role === "admin";
  const [data, setData] = useState<CreatorsPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [niche, setNiche] = useState("");
  const [status, setStatus] = useState("");
  const [managerFilter, setManagerFilter] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<CreatorsPayload>("/api/panel/creators");
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const list = data?.creators ?? [];
    const query = q.trim().toLowerCase();
    return list.filter((c) => {
      if (niche && c.niche !== niche) return false;
      if (status && c.status !== status) return false;
      if (isAdmin) {
        if (managerFilter === "__none__" && c.managerId) return false;
        if (
          managerFilter &&
          managerFilter !== "__none__" &&
          c.managerId !== managerFilter
        ) {
          return false;
        }
      }
      if (!query) return true;
      return (
        c.name.toLowerCase().includes(query) ||
        c.phone.toLowerCase().includes(query) ||
        (c.tiktokUser ?? "").toLowerCase().includes(query)
      );
    });
  }, [data, q, niche, status, managerFilter, isAdmin]);

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Creadores</h1>
          <p>
            Roster de escritorio ·{" "}
            {isAdmin
              ? "vista admin (todos)"
              : "solo tus creadores asignados"}
          </p>
        </div>
        <button className="btn" type="button" onClick={() => void load()}>
          Actualizar
        </button>
      </header>

      <div className="content">
        <div className="toolbar">
          <input
            className="search"
            placeholder="Buscar nombre / teléfono / TikTok…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="select"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
          >
            <option value="">Todos los nichos</option>
            {(data?.niches ?? []).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="pausado">Pausado</option>
            <option value="baja">Baja</option>
          </select>
          {isAdmin && (
            <select
              className="select"
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
            >
              <option value="">Todos los managers</option>
              <option value="__none__">Sin manager</option>
              {(data?.managers ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && <p className="error" style={{ marginBottom: 12 }}>{error}</p>}

        <div className="panel">
          <div className="table-wrap">
            {loading && !data ? (
              <div className="empty">Cargando creadores…</div>
            ) : filtered.length === 0 ? (
              <div className="empty">
                {isAdmin
                  ? "No hay creadores con esos filtros."
                  : "No tienes creadores asignados (o no coinciden con el filtro)."}
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Nicho</th>
                    <th>Incorporación</th>
                    <th>TikTok</th>
                    <th>Grupo</th>
                    <th>Estado</th>
                    {isAdmin && <th>Manager</th>}
                    <th>Diamantes</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="name-cell">
                          <span className="avatar">{initials(c.name)}</span>
                          <span>{c.name}</span>
                        </div>
                      </td>
                      <td className="muted">{c.phone}</td>
                      <td>{c.niche}</td>
                      <td className="muted">{formatDate(c.joinDate)}</td>
                      <td className="muted">
                        {c.tiktokUser ? `@${c.tiktokUser}` : "—"}
                      </td>
                      <td className="muted">{c.groupName ?? "—"}</td>
                      <td>
                        <span className={statusBadge(c.status)}>
                          {c.status}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="muted">{c.managerName ?? "—"}</td>
                      )}
                      <td>{(c.diamonds ?? 0).toLocaleString("es-MX")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
