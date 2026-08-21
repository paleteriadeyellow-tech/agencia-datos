export const WEEK_DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

/** Inicio de cada bloque, 9:00 a 21:00 (9pm–10pm). */
export const SHIFT_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

export const SHIFT_LABELS = [
  "CAPACITACION",
  "EVENTO",
  "PRESENTACION",
  "LIVE COINS",
  "E.DONADORES",
  "SUBASTA",
  "SALUD MENTAL",
  "SECUESTRO",
  "TORNEO",
  "FREE",
] as const;

const PALETTE = [
  "bg-emerald-500/30 text-emerald-200 border-emerald-400/40",
  "bg-pink-500/30 text-pink-200 border-pink-400/40",
  "bg-violet-500/30 text-violet-200 border-violet-400/40",
  "bg-rose-500/30 text-rose-200 border-rose-400/40",
  "bg-sky-500/30 text-sky-200 border-sky-400/40",
  "bg-amber-400/35 text-amber-100 border-amber-300/50",
  "bg-cyan/20 text-cyan border-cyan/40",
  "bg-orange-500/30 text-orange-200 border-orange-400/40",
];

export function hourLabel(hour: number) {
  const fmt = (h: number) => {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:00`;
  };
  return `${fmt(hour)} A ${fmt(hour + 1)}`;
}

export function managerColor(name: string) {
  if (!name.trim() || name.toUpperCase() === "FREE") {
    return "bg-amber-300/40 text-amber-50 border-amber-200/50";
  }
  let hash = 0;
  for (const ch of name.toUpperCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

export function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function mondayOf(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function formatWeekRange(weekStart: string) {
  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const end = addDays(start, 6);
  const f = (dt: Date) =>
    `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
  return `${f(start)} – ${f(end)} ${end.getFullYear()}`;
}

export function slotKey(day: number, hour: number) {
  return `${day}-${hour}`;
}
