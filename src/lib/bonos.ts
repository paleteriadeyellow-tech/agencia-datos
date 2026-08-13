const BONUS_TABLE_1 = [
  { days: 25, hours: 90, diamonds: 1000000, bonus: 150 },
  { days: 20, hours: 80, diamonds: 500000, bonus: 75 },
  { days: 20, hours: 80, diamonds: 250000, bonus: 35 },
  { days: 20, hours: 60, diamonds: 100000, bonus: 20 },
  { days: 20, hours: 60, diamonds: 30000, bonus: 10 },
  { days: 20, hours: 60, diamonds: 15000, bonus: 5 },
].sort((a, b) => b.diamonds - a.diamonds);

const BONUS_TABLE_2 = [
  { days: 30, hours: 90, diamonds: 20000, bonus: 20 },
  { days: 25, hours: 80, diamonds: 15000, bonus: 15 },
  { days: 20, hours: 60, diamonds: 10000, bonus: 10 },
  { days: 15, hours: 50, diamonds: 5000, bonus: 5 },
  { days: 10, hours: 40, diamonds: 1000, bonus: 0 },
].sort((a, b) => b.days - a.days);

export function calcularBonoTotal(days: number, hours: number, diamonds: number) {
  let bonus1 = 0;
  let bonus2 = 0;
  for (const tier of BONUS_TABLE_1) {
    if (days >= tier.days && hours >= tier.hours && diamonds >= tier.diamonds) {
      bonus1 = tier.bonus;
      break;
    }
  }
  for (const tier of BONUS_TABLE_2) {
    if (days >= tier.days && hours >= tier.hours && diamonds >= tier.diamonds) {
      bonus2 = tier.bonus;
      break;
    }
  }
  return bonus1 + bonus2;
}

export const MESES_NOMBRE = [
  "",
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function periodKey(anio: number, mes: number) {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

export function normalizeHeaderKey(s: unknown) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Como en Bonos: aliases en orden.
 * Si hay varios matches, prefiere el encabezado más corto y puede evitar “mes pasado”.
 */
export function findBestColumnIndex(
  headers: string[],
  aliases: string[],
  opts?: { avoidSubstrings?: string[]; _allowAvoided?: boolean }
) {
  const normHeaders = headers.map((h) => normalizeHeaderKey(h));
  const avoid = (opts?.avoidSubstrings ?? []).map((s) => normalizeHeaderKey(s));
  const filterAvoided = !opts?._allowAvoided && avoid.length > 0;

  const allowed = (i: number) =>
    !filterAvoided || !avoid.some((a) => a && normHeaders[i]!.includes(a));

  for (const a of aliases) {
    const na = normalizeHeaderKey(a);
    if (!na) continue;
    const i = normHeaders.indexOf(na);
    if (i >= 0 && allowed(i)) return i;
  }

  for (const a of aliases) {
    const na = normalizeHeaderKey(a);
    if (na.length < 8) continue;
    const matches: number[] = [];
    normHeaders.forEach((h, i) => {
      if (h.includes(na) && allowed(i)) matches.push(i);
    });
    if (!matches.length) continue;
    matches.sort(
      (x, y) => normHeaders[x]!.length - normHeaders[y]!.length || x - y
    );
    return matches[0]!;
  }

  if (filterAvoided) {
    return findBestColumnIndex(headers, aliases, {
      ...opts,
      _allowAvoided: true,
    });
  }
  return -1;
}

export function findColumnIndex(headers: string[], aliases: string[]) {
  return findBestColumnIndex(headers, aliases);
}

/** Aliases iguales a Bonos (+ inglés). */
export const TIKTOK_USER_ALIASES = [
  "nombre de usuario del creador",
  "nombre de usuario",
  "creator username",
  "creator's username",
  "creators username",
  "usuario",
  "username",
  "nombre",
  "user",
  "nick",
  "creador",
  "creator",
  "handle",
];

export const TIKTOK_DIAMONDS_ALIASES = [
  "diamantes",
  "diamonds",
  "diamante",
  "diamond",
];

export const TIKTOK_HOURS_ALIASES = [
  "duracion de live",
  "live duration",
  "duration of live",
  "duracion de emisiones live (en horas) durante el ultimo mes",
  "live streaming duration (in hours) during the last month",
  "duration of live broadcasts (in hours) during the last month",
  "duracion de emisiones live (en horas)",
  "duracion de emisiones live",
  "live streaming duration",
  "horas",
  "hours",
  "hora",
];

export const TIKTOK_DAYS_ALIASES = [
  "dias validos de emisiones live",
  "dias validos de emision live",
  "dias validos de emisiones",
  "dias validos de emision",
  "valid days of live broadcasts",
  "valid days of live streaming",
  "valid days of live",
  "valid live days",
  "dias validos",
  "valid days",
  "dias validos de emisiones live del mes pasado",
  "valid days of live broadcasts last month",
  "dias",
  "días",
  "days",
  "dia",
  "día",
];

/** Misma resolución de columnas para Bonos y Control de diamantes. */
export function resolveTikTokExportColumns(headers: string[]) {
  const iUser = findBestColumnIndex(headers, TIKTOK_USER_ALIASES);
  const iDm = findBestColumnIndex(headers, TIKTOK_DIAMONDS_ALIASES);
  const iH = findBestColumnIndex(headers, TIKTOK_HOURS_ALIASES);
  const iD = findBestColumnIndex(headers, TIKTOK_DAYS_ALIASES, {
    avoidSubstrings: ["mes pasado", "last month", "previous month"],
  });
  return { iUser, iDm, iH, iD };
}

export const USERNAME_COLUMN_ALIASES = TIKTOK_USER_ALIASES;
export const DIAMONDS_COLUMN_ALIASES = TIKTOK_DIAMONDS_ALIASES;

export function parseNumericCell(v: unknown) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const s = String(v).trim().replace(/\s/g, "").replace(/,/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Parsea "58h 1min 54s" / "58h 1m 54s" o números a horas decimales. */
export function parseLiveDurationHours(v: unknown) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const s = String(v).trim();
  if (!s) return 0;

  const tiktok = s.match(
    /^(\d+(?:[.,]\d+)?)\s*h(?:ours?|oras?)?\s*(\d+(?:[.,]\d+)?)\s*m(?:in(?:utes?|utos?)?)?\s*(\d+(?:[.,]\d+)?)\s*s(?:ec(?:onds?)?|eg(?:undos?)?)?$/i
  );
  if (tiktok) {
    return (
      parseFloat(tiktok[1].replace(",", ".")) +
      parseFloat(tiktok[2].replace(",", ".")) / 60 +
      parseFloat(tiktok[3].replace(",", ".")) / 3600
    );
  }

  const mh = s.match(/(\d+(?:[.,]\d+)?)\s*h(?:ours?|oras?)?/i);
  const mm = s.match(/(\d+(?:[.,]\d+)?)\s*m(?:in(?:utes?|utos?)?)?/i);
  const ms = s.match(
    /(\d+(?:[.,]\d+)?)\s*s(?:ec(?:onds?)?|eg(?:undos?)?)?(?:\b|$)/i
  );
  if (mh || mm || ms) {
    let h = 0;
    if (mh) h += parseFloat(mh[1].replace(",", "."));
    if (mm) h += parseFloat(mm[1].replace(",", ".")) / 60;
    if (ms) h += parseFloat(ms[1].replace(",", ".")) / 3600;
    return h;
  }

  const t = s.match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
  if (t) {
    return (
      parseInt(t[1], 10) + parseInt(t[2], 10) / 60 + parseInt(t[3], 10) / 3600
    );
  }
  return parseNumericCell(v);
}
