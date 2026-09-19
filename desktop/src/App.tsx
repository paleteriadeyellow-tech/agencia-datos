import { LoginPage, useBootSession } from "./pages/Login";
import { CreatorsPage } from "./pages/Creators";
import type { DesktopUser } from "./lib/api";

function Shell({
  user,
  onLogout,
}: {
  user: DesktopUser;
  onLogout: () => void;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="brand-kicker">Desktop</p>
          <h2 className="brand-title">Agencia Panel</h2>
        </div>
        <nav className="nav">
          <button type="button" className="nav-item active">
            Creadores
          </button>
          <button type="button" className="nav-item" disabled title="Próximamente">
            Diamantes
          </button>
          <button type="button" className="nav-item" disabled title="Próximamente">
            Envío KPI
          </button>
          <button type="button" className="nav-item" disabled title="Próximamente">
            Campañas
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="muted">Sesión</span>
            <strong>{user.name}</strong>
            <span className="role-badge">
              {user.role === "admin" ? "Admin" : "Manager"}
            </span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onLogout}>
            Salir
          </button>
        </div>
      </aside>
      <main className="main">
        <CreatorsPage user={user} />
      </main>
    </div>
  );
}

export default function App() {
  const { ready, user, setUser, logout } = useBootSession();

  if (!ready) {
    return <div className="login-page muted">Cargando…</div>;
  }

  if (!user) {
    return <LoginPage onLoggedIn={setUser} />;
  }

  return <Shell user={user} onLogout={logout} />;
}
