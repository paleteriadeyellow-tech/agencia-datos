import { useEffect, useState } from "react";
import {
  apiFetch,
  clearSession,
  getApiBase,
  getToken,
  getUser,
  setApiBase,
  setSession,
  type DesktopUser,
} from "../lib/api";

type Agency = { slug: string; name: string };

export function LoginPage({ onLoggedIn }: { onLoggedIn: (u: DesktopUser) => void }) {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agencySlug, setAgencySlug] = useState("streamersfederation");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiBase, setApiBaseInput] = useState(getApiBase() || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setApiBase(apiBase);
    apiFetch<{ agencies: Agency[] }>("/api/desktop/login")
      .then((d) => {
        if (d.agencies?.length) {
          setAgencies(d.agencies);
          setAgencySlug(d.agencies[0]!.slug);
        }
      })
      .catch(() => {
        setAgencies([
          { slug: "streamersfederation", name: "Streamersfederation" },
          { slug: "elarbol", name: "El Árbol" },
        ]);
      });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setApiBase(apiBase);
    try {
      const data = await apiFetch<{
        accessToken: string;
        user: DesktopUser;
      }>("/api/desktop/login", {
        method: "POST",
        body: JSON.stringify({ email, password, agencySlug }),
      });
      setSession(data.accessToken, data.user);
      onLoggedIn(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="brand-kicker">App de escritorio</p>
        <h1>Agencia Panel</h1>
        <p className="sub">
          Misma base de datos que la web. UI hecha para PC.
        </p>
        <form className="stack" onSubmit={onSubmit}>
          <div>
            <label className="label">Servidor API</label>
            <input
              className="field"
              value={apiBase}
              onChange={(e) => setApiBaseInput(e.target.value)}
              placeholder="(vacío = proxy local) o https://tu-app.vercel.app"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label">Agencia</label>
            <select
              className="select"
              value={agencySlug}
              onChange={(e) => setAgencySlug(e.target.value)}
            >
              {agencies.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="field"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input
              className="field"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="api-hint">Conecta al backend Next (local o Vercel).</p>
      </div>
    </div>
  );
}

export function useBootSession() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<DesktopUser | null>(null);

  useEffect(() => {
    const token = getToken();
    const u = getUser();
    if (token && u) setUser(u);
    setReady(true);
  }, []);

  function logout() {
    clearSession();
    setUser(null);
  }

  return { ready, user, setUser, logout };
}
