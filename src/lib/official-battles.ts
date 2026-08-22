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
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
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
