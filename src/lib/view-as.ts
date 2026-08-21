export const VIEW_AS_COOKIE = "view_as_manager";

const listeners = new Set<() => void>();
let currentId: string | null | undefined;

export function parseViewAsId(raw?: string | null) {
  const id = String(raw ?? "").trim();
  if (!id || id.length > 64 || !/^[a-z0-9_-]+$/i.test(id)) return null;
  return id;
}

export function readViewAsCookie() {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split("; ");
  const row = parts.find((p) => p.startsWith(`${VIEW_AS_COOKIE}=`));
  if (!row) return null;
  return parseViewAsId(decodeURIComponent(row.slice(VIEW_AS_COOKIE.length + 1)));
}

export function getViewAsId() {
  if (currentId === undefined) currentId = readViewAsCookie();
  return currentId ?? null;
}

export function subscribeViewAs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function writeViewAsCookie(id: string | null) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const next = id ? parseViewAsId(id) : null;
  if (next) {
    document.cookie = `${VIEW_AS_COOKIE}=${encodeURIComponent(next)}; Path=/; SameSite=Lax; Max-Age=2592000${secure}`;
  } else {
    document.cookie = `${VIEW_AS_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
  }
  currentId = next;
  listeners.forEach((fn) => fn());
}
