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

export function getApiBase() {
  const saved = localStorage.getItem(API_KEY);
  if (saved !== null && saved !== undefined) {
    return saved.replace(/\/$/, "");
  }
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (fromEnv === "" || fromEnv === undefined) {
    // Dev: Vite proxy → Next. Prod: pon la URL de Vercel en el login.
    return "";
  }
  return String(fromEnv).replace(/\/$/, "");
}

export function setApiBase(url: string) {
  localStorage.setItem(API_KEY, url.replace(/\/$/, ""));
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
  });

  if (res.status === 401) {
    clearSession();
    throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `Error ${res.status}`
    );
  }
  return data as T;
}
