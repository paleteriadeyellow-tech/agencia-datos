/**
 * Sistema de niveles y bonos para creadores LIVE (E, D, C, B, A).
 * Sale de las infografías de la agencia; los montos y metas están aquí para cambiarlos en un solo lugar.
 *
 * Reglas que implementa:
 * - Una categoría de bono se alcanza solo cumpliendo a la vez días, horas y diamantes mínimos.
 * - El nivel decide qué bonos aplican: E = bonos de incorporación, D = bono por horas, C/B/A = horas + diamantes.
 * - Nivel C: más de 30,000 diamantes en un mes, o 90 días dentro de la agencia (si ya pasó de E).
 *   Nivel B: más de 100,000 diamantes en un mes. Nivel A: más de 300,000 diamantes en un mes (solo por diamantes).
 * - E → D: al cumplir las métricas del Bono de incorporación #2 (nivel Básico); aplica desde el mes siguiente.
 * - El nivel nunca baja: se conserva el más alto alcanzado en los meses anteriores.
 */
export type Level = "E" | "D" | "C" | "B" | "A";
export const LEVELS: Level[] = ["E", "D", "C", "B", "A"];

export const LEVEL_LABEL: Record<Level, string> = {
  E: "Bienvenida",
  D: "Bono por horas",
  C: "Horas + diamantes",
  B: "Opción TikTok Shop",
  A: "Creador consolidado",
};

export type BonusKind = "horas" | "diamantes" | "incorporacion2";

export type Tier = { name: string; days: number; hours: number; diamonds: number; coins: number; usd: number | null; advisory?: boolean };

/** Bono por horas (niveles D, C, B, A). */
export const HOURS_TIERS: Tier[] = [
  { name: "Bajo", days: 10, hours: 40, diamonds: 1_000, coins: 0, usd: null, advisory: true },
  { name: "Expectativa", days: 15, hours: 50, diamonds: 5_000, coins: 400, usd: 5 },
  { name: "Normal", days: 20, hours: 60, diamonds: 10_000, coins: 800, usd: 10 },
  { name: "Sobresaliente", days: 25, hours: 80, diamonds: 10_000, coins: 1_200, usd: 15 },
  { name: "Pro", days: 30, hours: 90, diamonds: 15_000, coins: 1_600, usd: 20 },
];

/** Bono por diamantes (niveles C, B, A). */
export const DIAMOND_TIERS: Tier[] = [
  { name: "Básico", days: 20, hours: 60, diamonds: 15_000, coins: 400, usd: 5 },
  { name: "Normal", days: 20, hours: 60, diamonds: 30_000, coins: 800, usd: 10 },
  { name: "Sobresaliente", days: 20, hours: 60, diamonds: 100_000, coins: 1_600, usd: 20 },
  { name: "Alto", days: 20, hours: 80, diamonds: 250_000, coins: 2_800, usd: 35 },
  { name: "Pro", days: 20, hours: 80, diamonds: 500_000, coins: 6_000, usd: 75 },
  { name: "Influencer", days: 25, hours: 90, diamonds: 1_000_000, coins: 12_000, usd: 150 },
];

/** Bono de incorporación #2 (nivel E): bono por las primeras métricas. */
export const INCORP2_TIERS: Tier[] = [
  { name: "Básico", days: 15, hours: 50, diamonds: 5_000, coins: 500, usd: null },
  { name: "Superior", days: 20, hours: 60, diamonds: 10_000, coins: 1_000, usd: null },
];

export const LEVEL_DIAMONDS = { C: 30_000, B: 100_000, A: 300_000 } as const;
export const LEVEL_C_DAYS_IN_AGENCY = 90;

export type Metrics = { diamonds: number; days: number; hours: number };
export type MonthMetrics = Metrics & { period: string };

export const KIND_LABEL: Record<BonusKind, string> = {
  horas: "Bono por horas",
  diamantes: "Bono por diamantes",
  incorporacion2: "Bono de incorporación #2",
};

/** Mejor categoría alcanzada: la más alta que cumple días, horas y diamantes a la vez. */
export function bestTier(tiers: Tier[], m: Metrics): Tier | null {
  for (let i = tiers.length - 1; i >= 0; i--) {
    const t = tiers[i];
    if (m.days >= t.days && m.hours >= t.hours && m.diamonds >= t.diamonds) return t;
  }
  return null;
}

const rank = (l: Level) => LEVELS.indexOf(l);
const maxLevel = (a: Level, b: Level): Level => (rank(a) >= rank(b) ? a : b);

/** Días completos dentro de la agencia al final del mes `period` (YYYY-MM). */
export function daysInAgencyAt(join: Date | null, period: string) {
  if (!join) return 0;
  const [y, m] = period.split("-").map(Number);
  const end = Date.UTC(y, m, 0); // último día del mes
  return Math.max(0, Math.floor((end - join.getTime()) / 86_400_000));
}

/**
 * Nivel del creador en el mes `target`, a partir de sus meses con datos (hasta ese mes).
 * `join` = fecha de ingreso (null si el usuario aún no está vinculado a un creador).
 */
export function levelFor(history: MonthMetrics[], target: string, join: Date | null): Level {
  const months = history.filter((h) => h.period <= target).sort((a, b) => a.period.localeCompare(b.period));
  let level: Level = "E";
  let reachedD = false; // cumplió el Bono #2 en un mes anterior
  for (const m of months) {
    if (reachedD) level = maxLevel(level, "D");
    if (m.diamonds > LEVEL_DIAMONDS.A) level = maxLevel(level, "A");
    else if (m.diamonds > LEVEL_DIAMONDS.B) level = maxLevel(level, "B");
    else if (m.diamonds > LEVEL_DIAMONDS.C) level = maxLevel(level, "C");
    else if (rank(level) >= rank("D") && daysInAgencyAt(join, m.period) >= LEVEL_C_DAYS_IN_AGENCY) level = maxLevel(level, "C");
    // Cumplir las métricas del Bono #2 (Básico) lleva al nivel D a partir del mes siguiente
    if (!reachedD && bestTier(INCORP2_TIERS, m)) reachedD = true;
  }
  return level;
}

export type Computed = {
  kind: BonusKind;
  tier: string;
  coins: number;
  usd: number | null;
  advisory: boolean;
};

/** Bonos que le tocan en un mes según su nivel y sus métricas. */
export function awardsFor(level: Level, m: Metrics): Computed[] {
  const out: Computed[] = [];
  const pack = (kind: BonusKind, t: Tier | null) => {
    if (!t) return;
    // En los niveles B y A los premios también se expresan en dólares
    const showUsd = (level === "B" || level === "A") && t.usd != null;
    out.push({ kind, tier: t.name, coins: t.coins, usd: showUsd ? t.usd : null, advisory: !!t.advisory });
  };
  if (level === "E") pack("incorporacion2", bestTier(INCORP2_TIERS, m));
  else {
    pack("horas", bestTier(HOURS_TIERS, m));
    if (level !== "D") pack("diamantes", bestTier(DIAMOND_TIERS, m));
  }
  return out;
}

/** Cómo se paga el premio según el nivel. */
export function payoutMode(level: Level) {
  if (level === "A") return "Transferencia bancaria (dólares reales, con retenciones)";
  if (level === "B") return "Monedas o productos de TikTok Shop (mín. 20 USD)";
  return "Monedas de TikTok";
}

/** Pista de qué le falta para el siguiente nivel. */
export function nextLevelHint(level: Level, m: Metrics, join: Date | null, period: string): string | null {
  if (level === "A") return null;
  if (level === "B") return `Para el Nivel A: superar ${LEVEL_DIAMONDS.A.toLocaleString("en-US")} diamantes en el mes (faltan ${Math.max(0, LEVEL_DIAMONDS.A + 1 - m.diamonds).toLocaleString("en-US")}).`;
  if (level === "C") return `Para el Nivel B: superar ${LEVEL_DIAMONDS.B.toLocaleString("en-US")} diamantes en el mes (faltan ${Math.max(0, LEVEL_DIAMONDS.B + 1 - m.diamonds).toLocaleString("en-US")}).`;
  if (level === "D") {
    const left = Math.max(0, LEVEL_C_DAYS_IN_AGENCY - daysInAgencyAt(join, period));
    return `Para el Nivel C: superar ${LEVEL_DIAMONDS.C.toLocaleString("en-US")} diamantes (faltan ${Math.max(0, LEVEL_DIAMONDS.C + 1 - m.diamonds).toLocaleString("en-US")}) o cumplir ${LEVEL_C_DAYS_IN_AGENCY} días en la agencia${join ? ` (faltan ${left})` : ""}.`;
  }
  const t = INCORP2_TIERS[0];
  return `Para el Nivel D: cumplir el Bono #2 Básico (${t.days} días, ${t.hours} horas y ${t.diamonds.toLocaleString("en-US")} diamantes).`;
}
