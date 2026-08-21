/** Rutas relativas (sin prefijo /a/[agency]) que un manager sí puede ver. */
export const MANAGER_ALLOWED_PATHS = [
  "/dashboard",
  "/creadores",
  "/reclutamiento",
  "/control-diamantes",
  "/metricas",
  "/envio-kpi",
  "/mensajes-wa",
  "/tareas",
  "/campanas",
  "/calendario",
  "/programacion",
  "/reporte",
] as const;

export const ADMIN_ONLY_PATHS = [
  "/finanzas",
  "/bonos",
  "/contratos",
  "/managers",
] as const;

/** Quita `/a/{slug}` del pathname. */
export function stripAgencyPrefix(pathname: string): string {
  const m = pathname.match(/^\/a\/[^/]+(.*)$/);
  if (!m) return pathname;
  return m[1] || "/";
}

export function isAdmin(role?: string | null) {
  return role === "admin";
}

export function isManager(role?: string | null) {
  return role === "manager";
}

/** ¿Puede el rol entrar a esta ruta relativa de página? */
export function canAccessPath(role: string | null | undefined, pathname: string) {
  const path = stripAgencyPrefix(pathname);
  if (isAdmin(role)) return true;
  return MANAGER_ALLOWED_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`)
  );
}

/** Ítems de nav visibles según rol (hrefs relativos sin agencia). */
export function filterNavByRole<T extends { href: string }>(
  items: T[],
  role: string | null | undefined
): T[] {
  if (isAdmin(role)) return items;
  return items.filter((item) =>
    MANAGER_ALLOWED_PATHS.some(
      (p) => item.href === p || item.href.startsWith(`${p}/`)
    )
  );
}
