/**
 * Metas por nivel. Para alcanzar un nivel se necesitan las TRES cosas a la vez: diamantes, días LIVE y horas LIVE.
 * Los datos salen de Control de diamantes (el último archivo importado de cada mes).
 */
export type GoalLevel = { level: number; diamonds: number; days: number; hours: number };

export type GoalTableId = "bonos" | "empleados";

export const GOAL_TABLES: Record<GoalTableId, { label: string; hint: string; levels: GoalLevel[] }> = {
  bonos: {
    label: "Bonos (Nivel 1–10)",
    hint: "Cada nivel pide diamantes, 20 horas y 10 días.",
    levels: [
      { level: 1, diamonds: 50_000, hours: 20, days: 10 },
      { level: 2, diamonds: 50_000, hours: 20, days: 10 },
      { level: 3, diamonds: 100_000, hours: 20, days: 10 },
      { level: 4, diamonds: 200_000, hours: 20, days: 10 },
      { level: 5, diamonds: 400_000, hours: 20, days: 10 },
      { level: 6, diamonds: 600_000, hours: 20, days: 10 },
      { level: 7, diamonds: 900_000, hours: 20, days: 10 },
      { level: 8, diamonds: 1_300_000, hours: 20, days: 10 },
      { level: 9, diamonds: 1_700_000, hours: 20, days: 10 },
      { level: 10, diamonds: 3_000_000, hours: 20, days: 10 },
    ],
  },
  empleados: {
    label: "App de empleados (Nivel 1–5)",
    hint: "Cada nivel pide más días y horas con 1,000 diamantes.",
    levels: [
      { level: 1, diamonds: 1_000, days: 10, hours: 25 },
      { level: 2, diamonds: 1_000, days: 12, hours: 40 },
      { level: 3, diamonds: 1_000, days: 15, hours: 55 },
      { level: 4, diamonds: 1_000, days: 18, hours: 75 },
      { level: 5, diamonds: 1_000, days: 22, hours: 90 },
    ],
  },
};

export type Stats = { diamonds: number; days: number; hours: number };

export type Progress = {
  /** Nivel más alto cumplido en las tres metas (0 = todavía ninguno). */
  level: number;
  /** Siguiente meta (null si ya está en el nivel máximo). */
  next: GoalLevel | null;
  /** Cuánto falta para la siguiente meta, por cada medida (0 = ya la cumple). */
  missing: Stats;
  /** Avance hacia la siguiente meta, de 0 a 1, por cada medida. */
  ratio: Stats;
  /** Avance combinado (el de la medida más atrasada): sirve para ordenar. */
  overall: number;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function progressFor(levels: GoalLevel[], s: Stats): Progress {
  let level = 0;
  for (const l of levels) {
    if (s.diamonds >= l.diamonds && s.days >= l.days && s.hours >= l.hours) level = l.level;
  }
  const next = levels.find((l) => l.level === level + 1) ?? null;
  const target = next ?? levels[levels.length - 1];
  const need = (have: number, want: number) => (next ? Math.max(0, want - have) : 0);
  const ratio = (have: number, want: number) => (want > 0 ? clamp01(have / want) : 1);

  const r = { diamonds: ratio(s.diamonds, target.diamonds), days: ratio(s.days, target.days), hours: ratio(s.hours, target.hours) };
  return {
    level,
    next,
    missing: { diamonds: need(s.diamonds, target.diamonds), days: need(s.days, target.days), hours: need(s.hours, target.hours) },
    ratio: r,
    overall: next ? Math.min(r.diamonds, r.days, r.hours) : 1,
  };
}

/** 50.13 → "50h 8m" */
export function fmtHours(h: number) {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}
