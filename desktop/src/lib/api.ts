export type DesktopUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  agencySlug: string;
};

const TOKEN_KEY = "agencia.desktop.token";
const USER_KEY = "agencia.desktop.user";
const API_KEY = "agencia.desktop.apiBase";

/** Quita rutas de la web (/a/..., /login, barras finales). */
export function normalizeApiBase(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    // Si pegaron la URL del panel web, nos quedamos solo con el origen.
    return u.origin;
  } catch {
    return trimmed.replace(/\/$/, "").replace(/\/a\/[^/].*$/i, "");
  }
}

export function getApiBase() {
  const saved = localStorage.getItem(API_KEY);
  if (saved !== null && saved !== undefined) {
    return normalizeApiBase(saved);
  }
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (fromEnv === "" || fromEnv === undefined) {
    return "";
  }
  return normalizeApiBase(String(fromEnv));
}

export function setApiBase(url: string) {
  localStorage.setItem(API_KEY, normalizeApiBase(url));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): DesktopUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DesktopUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: DesktopUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers,
  }).catch(() => {
    throw new Error(
      getApiBase()
        ? `No se pudo conectar a ${getApiBase()}. Usa solo el dominio (ej. https://agencia-datos.vercel.app) sin /a/..., o deja vacío y corre el backend local.`
        : "No se pudo conectar al backend local. Arranca `npm run dev` en la carpeta agencia datos (puerto 3000)."
    );
  });

  if (res.status === 401) {
    clearSession();
    throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  }

  if (res.status === 404) {
    throw new Error(
      "Ese servidor no tiene /api/desktop/login (aún no está desplegado). Usa backend local o sube el código a Vercel."
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `Error ${res.status}`
    );
  }
  return data as T;
}
