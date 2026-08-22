export const BATTLE_LEVELS = [
  {
    id: "Inicial",
    label: "Inicial",
    range: "20k - 100k",
    row: "bg-slate-400/15",
    pill: "bg-slate-400/35 text-slate-100",
    bar: "bg-slate-500/30 border-slate-400/40",
  },
  {
    id: "Medio",
    label: "Medio",
    range: "100k - 300k",
    row: "bg-cyan/15",
    pill: "bg-cyan/25 text-cyan",
    bar: "bg-cyan/20 border-cyan/35",
  },
  {
    id: "Pro",
    label: "Pro",
    range: "300k+",
    row: "bg-[#a78bfa]/15",
    pill: "bg-[#a78bfa]/25 text-[#c4b5fd]",
    bar: "bg-[#a78bfa]/20 border-[#a78bfa]/35",
  },
  {
    id: "Star",
    label: "Star",
    range: "500k - 3M",
    row: "bg-warning/15",
    pill: "bg-warning/25 text-warning",
    bar: "bg-warning/20 border-warning/35",
  },
  {
    id: "Mega",
    label: "Mega",
    range: "3M+",
    row: "bg-accent/15",
    pill: "bg-accent/25 text-accent",
    bar: "bg-accent/20 border-accent/35",
  },
] as const;

export const LEVEL_LEGEND = [
  { label: "JUNIOR", range: "5k - 20k" },
  { label: "INICIAL", range: "20k - 100k" },
  { label: "MEDIUM", range: "100k - 300k" },
  { label: "PRO", range: "300k+" },
  { label: "STAR", range: "500k - 3M" },
  { label: "MEGA", range: "3M+" },
] as const;

export const BOOSTER_OPTIONS = [
  { id: "NO", label: "NO", className: "bg-rose-400/25 text-rose-200" },
  { id: "SI", label: "Sí", className: "bg-orange-400/25 text-orange-200" },
] as const;

export type BattleLevelId = (typeof BATTLE_LEVELS)[number]["id"];

export function battleLevel(id: string) {
  return BATTLE_LEVELS.find((l) => l.id === id) ?? BATTLE_LEVELS[0]!;
}

export function boosterTone(id: string) {
  return BOOSTER_OPTIONS.find((b) => b.id === id) ?? BOOSTER_OPTIONS[0]!;
}

export function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function nowTimeMexico() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function isoDate(value: Date | string | null | undefined) {
  if (!value) return todayIso();
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function dateParts(iso: string) {
  const [y, m] = iso.slice(0, 10).split("-");
  const year = Number(y);
  const month = Number(m);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  }
  return { year, month };
}

export function formatDay(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function formatTime(value: string) {
  const raw = value.trim();
  if (!raw) return "—";
  const [h, min] = raw.split(":");
  const hour = Number(h);
  if (!Number.isFinite(hour) || !min) return raw;
  const suffix = hour >= 12 ? "p. m." : "a. m.";
  const h12 = hour % 12 || 12;
  return `${h12}:${min} ${suffix}`;
}

/** Batallas oficiales se programan en GMT-6 (Ciudad de México, sin DST). */
export const MEXICO_OFFSET = "-06:00";
/** Ventana para marcar la batalla “en curso” después de la hora de inicio. */
export const BATTLE_LIVE_MS = 10 * 60 * 1000;

export function battleTimestamp(date: string, time: string): number | null {
  const day = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const match = (time || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hh = String(Number(match[1])).padStart(2, "0");
  const mm = match[2];
  const ms = new Date(`${day}T${hh}:${mm}:00${MEXICO_OFFSET}`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export type BattleCountPhase = "upcoming" | "live" | "ended" | "no-time";

export type BattleCount = {
  phase: BattleCountPhase;
  ms: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export function battleCountdown(
  date: string,
  time: string,
  nowMs: number
): BattleCount {
  const at = battleTimestamp(date, time);
  if (at == null) {
    return { phase: "no-time", ms: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  if (nowMs < at) return splitRemain(at - nowMs, "upcoming");
  if (nowMs <= at + BATTLE_LIVE_MS) {
    return { phase: "live", ms: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  return { phase: "ended", ms: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
}

function splitRemain(ms: number, phase: "upcoming"): BattleCount {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return {
    phase,
    ms,
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}
