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

export function prevPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function periodMeta(period: string, now = new Date()) {
  const [y, m] = period.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrent =
    now.getFullYear() === y && now.getMonth() + 1 === m;
  const dayElapsed = isCurrent
    ? Math.min(daysInMonth, Math.max(1, now.getDate()))
    : daysInMonth;
  const daysLeft = Math.max(0, daysInMonth - dayElapsed);
  return { y, m, daysInMonth, isCurrent, dayElapsed, daysLeft };
}

export function pctChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function weekBounds(from = new Date()) {
  const start = new Date(from);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setMilliseconds(-1);
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
