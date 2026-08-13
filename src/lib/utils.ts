import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("es-MX").format(n);
}

export function formatCurrency(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

export const NICHES = [
  "Gaming",
  "Bailes",
  "Lifestyle",
  "Comedia",
  "Música",
  "Belleza",
  "Deportes",
  "ASMR",
  "Chat",
  "Otros",
] as const;

export const CREATOR_STATUSES = ["activo", "pausado", "baja"] as const;
export const TASK_STATUSES = ["pendiente", "en_progreso", "hecha"] as const;
export const TASK_PRIORITIES = ["baja", "media", "alta"] as const;
export const SCHEDULE_STATUSES = ["planeado", "cumplido", "faltó", "cancelado"] as const;
export const SETTLEMENT_STATUSES = ["pendiente", "pagado"] as const;
export const CONTRACT_STATUSES = ["borrador", "activo", "vencido", "cancelado"] as const;
