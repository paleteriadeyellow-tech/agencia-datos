/**
 * Seguimiento del reclutamiento: qué casillas le faltan a cada creador hasta que su fila queda completa con la INTEGRACIÓN.
 * El mensaje y el comentario se hacen en la app de TikTok; la hoja es solo el REGISTRO que revisa la dirección cada semana,
 * así que aquí se ve lo que falta registrar y quién lo dejó pendiente.
 */
export type FollowRow = {
  id: string;
  creatorName: string;
  recruiter: string;
  requestDate: string | null;
  situation: string;
  phone: string;
  comment: string;
  comment2: string;
  recontact: string;
  integrationDate: string | null;
  steps: Record<string, string>;
  extra: Record<string, string>;
};

export type FollowSettings = {
  expiryMode: "fixed" | "column" | "off";
  validityDays: number;
  soonDays: number;
  /** Llaves de las casillas obligatorias, en el orden en que se muestran las faltantes. */
  requiredKeys: string[];
};

export const DEFAULT_REQUIRED_KEYS = [
  "atendio",
  "situation",
  "seEnvioInvitacion",
  "mensaje",
  "comment",
  "phone",
  "visitarLive",
  "integracion",
  "mensajeAceptacion",
  "mensajeImagen",
  "comment2",
  "integrationDate",
];

export const DEFAULT_FOLLOW_SETTINGS: FollowSettings = { expiryMode: "fixed", validityDays: 7, soonDays: 2, requiredKeys: DEFAULT_REQUIRED_KEYS };

const CORE = new Set(["recruiter", "requestDate", "creatorName", "situation", "phone", "comment", "comment2", "recontact", "integrationDate"]);

export function valueOf(row: FollowRow, key: string): string {
  if (CORE.has(key)) {
    const v = (row as unknown as Record<string, unknown>)[key];
    return v == null ? "" : String(v);
  }
  return row.steps[key] ?? row.extra[key] ?? "";
}

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Una casilla cuenta como llena si tiene algo y no dice que NO se hizo. */
export function isDone(value: string): boolean {
  const v = norm(value);
  if (!v) return false;
  return !["no", "n", "0", "-", "—", "pendiente", "falta", "faltan", "sin", "nada", "no se envio", "no enviado", "no se comento"].includes(v);
}

/** Cerrado sin integrarse: ya no se persigue (otra agencia, sin permiso de datos, no apto). */
export function isClosed(row: FollowRow): boolean {
  const s = norm(row.situation);
  return s.includes("otra agencia") || s.includes("permiso") || s.includes("no apto");
}

/** Ya integrado (fila en verde). */
export function isIntegrated(row: FollowRow): boolean {
  return !!row.integrationDate;
}

/** 1 = urgente, 2 = alta, 3 = pendiente, 4 = al día (solo con vencimientos) */
export type Severity = 1 | 2 | 3;
export const SEVERITY_LABEL: Record<Severity, string> = { 1: "Urgente", 2: "Vencida", 3: "Por completar" };

export type Expiry = { text: string; severity: 1 | 2 | 3 };

export type MissingCell = { key: string; label: string };

export type FollowItem = {
  row: FollowRow;
  daysLeft: number | null;
  expiry: Expiry | null;
  missing: MissingCell[];
  required: number;
  filled: number;
  severity: Severity;
};

const DAY = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);

export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Días que le quedan a la solicitud (negativo = ya venció). null = no aplica. */
export function daysLeft(row: FollowRow, s: FollowSettings, today: string): number | null {
  if (s.expiryMode === "off") return null;
  if (s.expiryMode === "column") {
    const raw = String(row.extra["diasVenceInvitacion"] ?? "").trim();
    const n = Number(raw.replace(",", "."));
    return raw !== "" && Number.isFinite(n) ? Math.round(n) : null;
  }
  if (!row.requestDate) return null;
  return dayNumber(row.requestDate) + s.validityDays - dayNumber(today);
}

/**
 * Filas todavía sin integrar, con las casillas que les faltan (en el orden de las columnas) y su vencimiento.
 * `columns` = columnas visibles de la hoja en orden (de ahí salen los nombres de las casillas).
 */
export function computeFollowUp(rows: FollowRow[], settings: FollowSettings, columns: MissingCell[], today = todayKey()): FollowItem[] {
  const required = columns.filter((c) => settings.requiredKeys.includes(c.key));
  const items: FollowItem[] = [];
  for (const row of rows) {
    if (!row.creatorName.trim() || isIntegrated(row) || isClosed(row)) continue;

    const missing = required.filter((c) => !isDone(valueOf(row, c.key)));
    const left = daysLeft(row, settings, today);
    const expiredFlag = norm(valueOf(row, "solicitudVencida")).startsWith("si");

    let expiry: Expiry | null = null;
    if ((left !== null && left < 0) || expiredFlag) {
      expiry = { text: left !== null && left < 0 ? `Venció hace ${-left} ${-left === 1 ? "día" : "días"}` : "Marcada como vencida", severity: 2 };
    } else if (left !== null && left <= settings.soonDays) {
      expiry = { text: left === 0 ? "Vence hoy" : `Vence en ${left} ${left === 1 ? "día" : "días"}`, severity: 1 };
    } else if (left !== null && left <= settings.soonDays + 3) {
      expiry = { text: `Vence en ${left} días`, severity: 3 };
    }

    if (!missing.length && !expiry) continue;
    items.push({
      row,
      daysLeft: left,
      expiry,
      missing,
      required: required.length,
      filled: required.length - missing.length,
      severity: expiry && expiry.severity < 3 ? expiry.severity : 3,
    });
  }
  items.sort(
    (a, b) =>
      a.severity - b.severity ||
      (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) ||
      (a.row.requestDate ?? "").localeCompare(b.row.requestDate ?? "")
  );
  return items;
}

export type RecruiterStat = {
  recruiter: string;
  total: number; // solicitudes en seguimiento (sin contar cerradas)
  integrated: number;
  pending: number; // con casillas por llenar
  missingCells: number;
  urgentes: number;
  vencidas: number;
};

/** Resumen por reclutador: sirve para ver quién completa sus filas y quién deja casillas pendientes. */
export function statsByRecruiter(rows: FollowRow[], items: FollowItem[]): RecruiterStat[] {
  const map = new Map<string, RecruiterStat>();
  const get = (name: string) => {
    const k = name.trim() || "Sin reclutador";
    if (!map.has(k)) map.set(k, { recruiter: k, total: 0, integrated: 0, pending: 0, missingCells: 0, urgentes: 0, vencidas: 0 });
    return map.get(k)!;
  };
  for (const row of rows) {
    if (!row.creatorName.trim() || isClosed(row)) continue;
    const s = get(row.recruiter);
    s.total++;
    if (isIntegrated(row)) s.integrated++;
  }
  for (const it of items) {
    const s = get(it.row.recruiter);
    s.pending++;
    s.missingCells += it.missing.length;
    if (it.severity === 1) s.urgentes++;
    if (it.expiry?.severity === 2) s.vencidas++;
  }
  return [...map.values()].sort((a, b) => b.urgentes - a.urgentes || b.missingCells - a.missingCells || b.total - a.total);
}
