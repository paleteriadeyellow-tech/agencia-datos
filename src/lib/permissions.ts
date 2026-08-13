/** Rutas que un manager sí puede ver (el admin ve todo). */
export const MANAGER_ALLOWED_PATHS = [
  "/dashboard",
  "/creadores",
  "/control-diamantes",
  "/metricas",
  "/envio-kpi",
  "/mensajes-wa",
  "/tareas",
  "/campanas",
] as const;

export const ADMIN_ONLY_PATHS = [
  "/finanzas",
  "/bonos",
  "/contratos",
  "/managers",
] as const;

export function isAdmin(role?: string | null) {
  return role === "admin";
}

export function isManager(role?: string | null) {
  return role === "manager";
}

/** ¿Puede el rol entrar a esta ruta de página? */
export function canAccessPath(role: string | null | undefined, pathname: string) {
  if (isAdmin(role)) return true;
  return MANAGER_ALLOWED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/** Ítems de nav visibles según rol */
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
