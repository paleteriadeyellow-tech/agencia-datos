/**
 * Avisos de seguimiento del reclutamiento.
 * El mensaje y el comentario de video se hacen en la app de TikTok: la hoja es solo el REGISTRO. Por eso aquí se revisa
 * qué falta registrar (o hacer) por creador y por reclutador, para evaluar cómo trabaja el personal.
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
  messageKey: string;
  videoKey: string;
};

export const DEFAULT_FOLLOW_SETTINGS: FollowSettings = { expiryMode: "fixed", validityDays: 7, soonDays: 2, messageKey: "mensaje", videoKey: "comment" };

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

/** Una celda cuenta como "hecho" si tiene algo y no dice que NO se hizo. */
export function isDone(value: string): boolean {
  const v = norm(value);
  if (!v) return false;
  return !["no", "n", "0", "-", "—", "pendiente", "falta", "faltan", "sin", "nada", "no se envio", "no enviado", "no se comento"].includes(v);
}

/** Casos que ya no se pueden o no hay que trabajar. */
function notActionable(row: FollowRow): boolean {
  const s = norm(row.situation);
  if (s.includes("otra agencia") || s.includes("permiso") || s.includes("no apto")) return true;
  if (row.integrationDate) return true;
  return isDone(row.steps["integracion"] ?? "");
}

export type AlertKind = "vencida" | "vence" | "sin_mensaje" | "sin_video" | "recontactar" | "sin_telefono";

export const ALERT_LABEL: Record<AlertKind, string> = {
  vencida: "Solicitud vencida",
  vence: "Vence pronto",
  sin_mensaje: "Sin mensaje registrado",
  sin_video: "Sin comentar su video",
  recontactar: "Volver a contactar",
  sin_telefono: "Sin teléfono",
};

/** 1 = urgente, 2 = alta, 3 = media, 4 = baja */
export type Severity = 1 | 2 | 3 | 4;
export const SEVERITY_LABEL: Record<Severity, string> = { 1: "Urgente", 2: "Alta", 3: "Media", 4: "Baja" };

export type Alert = { kind: AlertKind; severity: Severity; text: string };

export type FollowItem = {
  row: FollowRow;
  daysLeft: number | null;
  alerts: Alert[];
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
    const n = Number(String(row.extra["diasVenceInvitacion"] ?? "").replace(",", "."));
    return Number.isFinite(n) && String(row.extra["diasVenceInvitacion"] ?? "").trim() !== "" ? Math.round(n) : null;
  }
  if (!row.requestDate) return null;
  return dayNumber(row.requestDate) + s.validityDays - dayNumber(today);
}

export function computeFollowUp(rows: FollowRow[], settings: FollowSettings, today = todayKey()): FollowItem[] {
  const items: FollowItem[] = [];
  for (const row of rows) {
    if (!row.creatorName.trim() || notActionable(row)) continue;
    const alerts: Alert[] = [];
    const left = daysLeft(row, settings, today);
    const expiredFlag = norm(valueOf(row, "solicitudVencida")) .startsWith("si");

    if ((left !== null && left < 0) || expiredFlag) {
      alerts.push({ kind: "vencida", severity: 2, text: left !== null && left < 0 ? `Venció hace ${-left} ${-left === 1 ? "día" : "días"}` : "Marcada como vencida" });
    } else if (left !== null && left <= settings.soonDays) {
      alerts.push({ kind: "vence", severity: 1, text: left === 0 ? "Vence hoy" : `Vence en ${left} ${left === 1 ? "día" : "días"}` });
    } else if (left !== null && left <= settings.soonDays + 3) {
      alerts.push({ kind: "vence", severity: 3, text: `Vence en ${left} días` });
    }
    if (!isDone(valueOf(row, settings.messageKey))) alerts.push({ kind: "sin_mensaje", severity: 2, text: "No hay mensaje registrado" });
    if (!isDone(valueOf(row, settings.videoKey))) alerts.push({ kind: "sin_video", severity: 3, text: "No hay comentario de su video registrado" });
    if (row.recontact.trim() && isDone(row.recontact)) alerts.push({ kind: "recontactar", severity: 3, text: `Volver a contactar: ${row.recontact.trim()}` });
    if (!row.phone.trim()) alerts.push({ kind: "sin_telefono", severity: 4, text: "Sin teléfono" });

    if (!alerts.length) continue;
    alerts.sort((a, b) => a.severity - b.severity);
    items.push({ row, daysLeft: left, alerts, severity: alerts[0].severity });
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
  total: number;
  messageDone: number;
  videoDone: number;
  vencidas: number;
  urgentes: number;
  pendientes: number;
};

/** Resumen por reclutador: sirve para ver quién registra y quién deja pendientes. */
export function statsByRecruiter(rows: FollowRow[], items: FollowItem[], settings: FollowSettings): RecruiterStat[] {
  const map = new Map<string, RecruiterStat>();
  const get = (name: string) => {
    const k = name.trim() || "Sin reclutador";
    if (!map.has(k)) map.set(k, { recruiter: k, total: 0, messageDone: 0, videoDone: 0, vencidas: 0, urgentes: 0, pendientes: 0 });
    return map.get(k)!;
  };
  for (const row of rows) {
    if (!row.creatorName.trim() || notActionable(row)) continue;
    const s = get(row.recruiter);
    s.total++;
    if (isDone(valueOf(row, settings.messageKey))) s.messageDone++;
    if (isDone(valueOf(row, settings.videoKey))) s.videoDone++;
  }
  for (const it of items) {
    const s = get(it.row.recruiter);
    s.pendientes++;
    if (it.alerts.some((a) => a.kind === "vencida")) s.vencidas++;
    if (it.severity === 1) s.urgentes++;
  }
  return [...map.values()].sort((a, b) => b.urgentes - a.urgentes || b.pendientes - a.pendientes || b.total - a.total);
}
