import { normalizeHeaderKey } from "@/lib/bonos";

export type RecruitmentColType = "text" | "date" | "core";

export type RecruitmentCol = {
  key: string;
  label: string;
  aliases: string[];
  group: string;
  type: RecruitmentColType;
  avoid?: string[];
  sticky?: boolean;
  width: string;
};

export const RECRUITMENT_GROUPS = [
  { id: "pipeline", label: "Solicitud", className: "bg-success/15 text-success" },
  { id: "contacto", label: "Contacto e integración", className: "bg-cyan/15 text-cyan" },
  { id: "onboarding", label: "Bienvenida", className: "bg-cyan/10 text-cyan" },
  { id: "formacion", label: "Capacitación", className: "bg-warning/15 text-warning" },
  { id: "eventos", label: "Eventos y batallas", className: "bg-accent-soft text-accent" },
  { id: "extra", label: "Batallas extra", className: "bg-accent-soft text-accent" },
] as const;

export const RECRUITMENT_COLUMNS: RecruitmentCol[] = [
  {
    key: "recruiter",
    label: "Reclutador",
    aliases: ["reclutador", "recruiter", "manager", "gerente"],
    group: "pipeline",
    type: "core",
    sticky: true,
    width: "w-[8.5rem]",
  },
  {
    key: "requestDate",
    label: "Solicitud",
    aliases: ["solicitud", "fecha solicitud", "fecha de solicitud", "application"],
    group: "pipeline",
    type: "date",
    width: "w-[8.2rem]",
  },
  {
    key: "creatorName",
    label: "Creador",
    aliases: ["creador", "creator", "usuario", "tiktok", "username"],
    group: "pipeline",
    type: "core",
    sticky: true,
    width: "w-[10rem]",
  },
  {
    key: "situation",
    label: "Situación",
    aliases: ["situacion", "status", "estado"],
    group: "pipeline",
    type: "core",
    width: "w-[12rem]",
  },
  {
    key: "mensaje",
    label: "Mensaje",
    aliases: ["mensaje"],
    avoid: ["aceptacion", "imagen"],
    group: "pipeline",
    type: "text",
    width: "w-[7.5rem]",
  },
  {
    key: "comment",
    label: "Comentario",
    aliases: ["comentario"],
    group: "pipeline",
    type: "core",
    width: "w-[8.5rem]",
  },
  {
    key: "phone",
    label: "Teléfono",
    aliases: ["telefono", "phone", "whatsapp", "celular"],
    group: "pipeline",
    type: "core",
    width: "w-[8.5rem]",
  },
  {
    key: "visitarLive",
    label: "Visitarlo en LIVE",
    aliases: ["visitarlo en live", "visitar live", "visitarlo"],
    group: "contacto",
    type: "text",
    width: "w-[8.5rem]",
  },
  {
    key: "integracion",
    label: "Integración",
    aliases: ["integracion"],
    avoid: ["mensaje"],
    group: "contacto",
    type: "text",
    width: "w-[8.5rem]",
  },
  {
    key: "mensajeAceptacion",
    label: "Mensaje aceptación",
    aliases: ["mensaje aceptacion", "aceptacion"],
    group: "contacto",
    type: "text",
    width: "w-[8.5rem]",
  },
  {
    key: "mensajeImagen",
    label: "Mensaje imagen",
    aliases: ["mensaje imagen"],
    group: "contacto",
    type: "text",
    width: "w-[8rem]",
  },
  {
    key: "comment2",
    label: "Comentario 2",
    aliases: ["comentario"],
    group: "contacto",
    type: "core",
    width: "w-[8.5rem]",
  },
  {
    key: "recontact",
    label: "Volver a contactar",
    aliases: [
      "volver a contactar en caso de haber entrado",
      "volver a contactar",
    ],
    group: "contacto",
    type: "core",
    width: "w-[9rem]",
  },
  {
    key: "integrationDate",
    label: "Fecha integración",
    aliases: ["integracion"],
    group: "onboarding",
    type: "date",
    width: "w-[8.2rem]",
  },
  {
    key: "followAgencia",
    label: "Follow de la agencia",
    aliases: ["follow de la agencia", "follow agencia"],
    group: "onboarding",
    type: "text",
    width: "w-[8.5rem]",
  },
  {
    key: "historiaBienvenida",
    label: "Historia de bienvenida",
    aliases: ["historia de bienvenida", "historia bienvenida"],
    group: "onboarding",
    type: "text",
    width: "w-[9rem]",
  },
  {
    key: "presentacionGerente",
    label: "Presentación gerente",
    aliases: ["presentacion gerente"],
    group: "onboarding",
    type: "text",
    width: "w-[9rem]",
  },
  {
    key: "kitBienvenida",
    label: "Kit bienvenida",
    aliases: ["kit bienvenida", "kit de bienvenida"],
    group: "onboarding",
    type: "text",
    width: "w-[7.5rem]",
  },
  {
    key: "grupos",
    label: "Grupos",
    aliases: ["grupos"],
    group: "onboarding",
    type: "text",
    width: "w-[6.5rem]",
  },
  {
    key: "paginaHost",
    label: "Página [host]",
    aliases: ["pagina [host]", "pagina host", "pagina"],
    avoid: ["programacion"],
    group: "onboarding",
    type: "text",
    width: "w-[7.5rem]",
  },
  {
    key: "accesoApp",
    label: "Acceso a la app",
    aliases: [
      "acceso a la app [programacion]",
      "acceso a la app",
      "programacion",
    ],
    group: "onboarding",
    type: "text",
    width: "w-[8.5rem]",
  },
  {
    key: "encuestaCaptura",
    label: "Captura / encuesta",
    aliases: [
      "pedirles captura o resultado de encuesta",
      "resultado de encuesta",
      "captura",
    ],
    group: "onboarding",
    type: "text",
    width: "w-[9rem]",
  },
  {
    key: "liveNovatos",
    label: "LIVE novatos (lun 8pm)",
    aliases: [
      "live presentacion novatos lunes 8pm",
      "live presentacion novatos",
      "presentacion novatos",
    ],
    group: "formacion",
    type: "text",
    width: "w-[9.5rem]",
  },
  {
    key: "capacitacionCeo",
    label: "Capacitación CEO (vie 8pm)",
    aliases: [
      "capacitacion en live por ceo (viernes 8pm)",
      "capacitacion en live por ceo",
      "capacitacion ceo",
    ],
    group: "formacion",
    type: "text",
    width: "w-[10rem]",
  },
  {
    key: "examenTeorica",
    label: "Examen capacitación",
    aliases: ["examen de capacitacion teorica", "examen de capacitacion", "examen"],
    group: "formacion",
    type: "text",
    width: "w-[8.5rem]",
  },
  {
    key: "carrusel",
    label: "Carrusel (sábados)",
    aliases: ["carrusel de presentacion (sabados)", "carrusel de presentacion", "carrusel"],
    group: "formacion",
    type: "text",
    width: "w-[8.5rem]",
  },
  {
    key: "presentacionCeo",
    label: "Presentación CEO",
    aliases: ["presentacion ceo"],
    avoid: ["novatos"],
    group: "formacion",
    type: "text",
    width: "w-[8.5rem]",
  },
  {
    key: "agendarLlamada",
    label: "Agendar llamada",
    aliases: ["agendar llamada"],
    group: "formacion",
    type: "text",
    width: "w-[8rem]",
  },
  {
    key: "llamada",
    label: "Llamada",
    aliases: ["llamada"],
    avoid: ["agendar"],
    group: "formacion",
    type: "text",
    width: "w-[7rem]",
  },
  {
    key: "agendarLives",
    label: "Agendar LIVEs",
    aliases: ["agendar lives"],
    group: "formacion",
    type: "text",
    width: "w-[8rem]",
  },
  {
    key: "estrategiaBasica",
    label: "Estrategia básica",
    aliases: ["estrategia basica"],
    avoid: ["encuesta"],
    group: "formacion",
    type: "text",
    width: "w-[8.5rem]",
  },
  {
    key: "encuestaEstrategia",
    label: "Encuesta estrategia",
    aliases: ["encuesta sobre estrategia basica", "encuesta estrategia"],
    group: "formacion",
    type: "text",
    width: "w-[9rem]",
  },
  {
    key: "sugerenciaSetup",
    label: "Sugerencia de setup",
    aliases: ["sugerencia de mejora de setup", "sugerencia de setup"],
    group: "formacion",
    type: "text",
    width: "w-[9rem]",
  },
  {
    key: "supervisionSetup",
    label: "Supervisión de setup",
    aliases: ["supervicion de setup", "supervision de setup"],
    group: "formacion",
    type: "text",
    width: "w-[9rem]",
  },
  {
    key: "creacionEvento",
    label: "Creación de evento",
    aliases: ["creacion de un evento (evidencia, hora)", "creacion de un evento", "creacion de evento"],
    group: "eventos",
    type: "text",
    width: "w-[9.5rem]",
  },
  {
    key: "compartirEvento",
    label: "Compartir evento",
    aliases: ["compartir al grupo su evento", "compartir al grupo"],
    group: "eventos",
    type: "text",
    width: "w-[8.5rem]",
  },
  {
    key: "registrarEvento",
    label: "Registrar y asistir",
    aliases: [
      "registrarnos a su evento (live) y asistir",
      "registrarnos a su evento",
    ],
    group: "eventos",
    type: "text",
    width: "w-[9.5rem]",
  },
  {
    key: "exitoMision",
    label: "Éxito misión",
    aliases: ["recibir exito mision", "exito mision"],
    group: "eventos",
    type: "text",
    width: "w-[8rem]",
  },
  {
    key: "interactivos",
    label: "Interactivos (+15 días)",
    aliases: ["interactivos (despues de 15 dias)", "interactivos"],
    group: "eventos",
    type: "text",
    width: "w-[9.5rem]",
  },
  {
    key: "batallasEllos",
    label: "Hacer batallas",
    aliases: ["hacer batallas con ellos", "hacer batallas"],
    group: "eventos",
    type: "text",
    width: "w-[8.5rem]",
  },
  {
    key: "batallaNovat",
    label: "Batalla novato",
    aliases: ["batalla novat", "batalla novato"],
    group: "eventos",
    type: "text",
    width: "w-[8rem]",
  },
  {
    key: "batallaInterna",
    label: "Batalla interna",
    aliases: ["batalla interna"],
    group: "extra",
    type: "text",
    width: "w-[8rem]",
  },
  {
    key: "batallaAgencia",
    label: "Batalla de agencia",
    aliases: ["batalla de agencia"],
    group: "extra",
    type: "text",
    width: "w-[8.5rem]",
  },
  {
    key: "batallaOficial",
    label: "Batalla oficial",
    aliases: ["batalla oficial"],
    group: "extra",
    type: "text",
    width: "w-[8rem]",
  },
  {
    key: "batallaGamer",
    label: "Batalla gamer",
    aliases: ["batalla gamer"],
    group: "extra",
    type: "text",
    width: "w-[8rem]",
  },
  {
    key: "ofrecerIa",
    label: "Ofrecer IA con %",
    aliases: ["ofrecer ia con %", "ofrecer ia"],
    group: "extra",
    type: "text",
    width: "w-[8.5rem]",
  },
];

export const STEP_KEYS = RECRUITMENT_COLUMNS.filter((c) => c.type === "text").map(
  (c) => c.key
);

export const SITUATION_OPTIONS = [
  "pendiente",
  "Apto",
  "Apto - Faltan lives",
  "Apto - Riesgo de varias cuentas",
  "No apto - sin permiso de datos",
  "No apto - Esta en otra agencia",
];

export type RecruitmentParsedRow = {
  recruiter: string;
  requestDate: string | null;
  creatorName: string;
  situation: string;
  phone: string;
  comment: string;
  comment2: string;
  recontact: string;
  integrationDate: string | null;
  steps: Record<string, string>;
};

export function cellText(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDateInput(value);
  }
  if (typeof value === "object") {
    const rec = value as { t?: unknown; w?: unknown; r?: { t?: unknown }[] };
    if (typeof rec.w === "string" && rec.w.trim()) return rec.w.trim();
    if (typeof rec.t === "string" && rec.t.trim()) return rec.t.trim();
    if (Array.isArray(rec.r)) {
      return rec.r
        .map((p) => String(p?.t ?? ""))
        .join("")
        .trim();
    }
  }
  return String(value).replace(/\u00a0/g, " ").trim();
}

/** Encabezados de Google Sheets: saltos de línea, paréntesis, acentos. */
export function normalizeRecruitmentHeader(value: unknown) {
  return cellText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase()
    .replace(/[_./\\|]+/g, " ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/[^a-z0-9% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toDateInput(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseExcelDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDateInput(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const utc = Date.UTC(1899, 11, 30) + Math.round(value) * 86400000;
    const d = new Date(utc);
    if (Number.isNaN(d.getTime())) return null;
    return toDateInput(d);
  }
  const s = String(value).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    if (a > 12) return toDateInput(new Date(y, b - 1, a));
    if (b > 12) return toDateInput(new Date(y, a - 1, b));
    return toDateInput(new Date(y, a - 1, b));
  }
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateInput(parsed);
}

function isAvoided(nh: string, avoid?: string[]) {
  return (avoid ?? []).some((a) => {
    const na = normalizeRecruitmentHeader(a);
    return Boolean(na && nh.includes(na));
  });
}

function headerMatches(nh: string, alias: string) {
  const na = normalizeRecruitmentHeader(alias);
  if (!nh || !na) return false;
  if (nh === na) return true;
  if (na.length >= 5 && nh.includes(na)) return true;
  if (nh.length >= 8 && na.includes(nh)) return true;
  return false;
}

function findUnusedColumn(
  headers: string[],
  aliases: string[],
  used: Set<number>,
  avoid?: string[]
) {
  const norms = headers.map((h) => normalizeRecruitmentHeader(h));
  for (const alias of aliases) {
    const i = norms.findIndex(
      (nh, idx) => !used.has(idx) && headerMatches(nh, alias) && !isAvoided(nh, avoid)
    );
    if (i >= 0) return i;
  }
  return -1;
}

export function mapRecruitmentHeaders(headers: string[]) {
  const used = new Set<number>();
  const indexes: Record<string, number> = {};
  for (const col of RECRUITMENT_COLUMNS) {
    const i = findUnusedColumn(headers, col.aliases, used, col.avoid);
    if (i >= 0) {
      indexes[col.key] = i;
      used.add(i);
    }
  }
  return indexes;
}

function mergeHeaderRows(a: unknown[], b?: unknown[]) {
  const len = Math.max(a.length, b?.length ?? 0);
  return Array.from({ length: len }, (_, i) => {
    const top = cellText(a[i]);
    const bot = cellText(b?.[i]);
    if (
      top &&
      bot &&
      normalizeRecruitmentHeader(top) !== normalizeRecruitmentHeader(bot)
    ) {
      return `${top} ${bot}`;
    }
    return top || bot;
  });
}

function headerScore(mapped: Record<string, number>) {
  return (
    (mapped.creatorName != null ? 8 : 0) +
    (mapped.recruiter != null ? 5 : 0) +
    (mapped.situation != null ? 3 : 0) +
    (mapped.requestDate != null ? 2 : 0) +
    Object.keys(mapped).length
  );
}

export function detectHeaderRow(sheetRows: unknown[][]) {
  let best = 0;
  let bestScore = -1;
  let bestHeaders: string[] = [];
  let span = 1;
  const max = Math.min(25, sheetRows.length);
  for (let i = 0; i < max; i++) {
    const single = (sheetRows[i] ?? []).map((h) => cellText(h));
    const merged = mergeHeaderRows(sheetRows[i] ?? [], sheetRows[i + 1]);
    const singleScore = headerScore(mapRecruitmentHeaders(single));
    if (singleScore > bestScore) {
      bestScore = singleScore;
      best = i;
      bestHeaders = single;
      span = 1;
    }
    const mergedScore = headerScore(mapRecruitmentHeaders(merged));
    if (mergedScore > bestScore) {
      bestScore = mergedScore;
      best = i;
      bestHeaders = merged;
      span = 2;
    }
  }
  return { index: best, score: bestScore, headers: bestHeaders, span };
}

function isHeaderLike(text: string) {
  const n = normalizeRecruitmentHeader(text);
  return (
    n === "creador" ||
    n === "reclutador" ||
    n === "solicitud" ||
    n === "situacion" ||
    n === "telefono" ||
    n.includes("reclutamiento y seguimiento")
  );
}

export function parseRecruitmentSheet(sheetRows: unknown[][]) {
  if (!sheetRows.length) {
    return {
      rows: [] as RecruitmentParsedRow[],
      mapped: 0,
      headers: [] as string[],
    };
  }
  const detected = detectHeaderRow(sheetRows);
  const headers =
    detected.headers.length > 0
      ? detected.headers
      : (sheetRows[detected.index] ?? []).map((h) => cellText(h));
  const indexes = mapRecruitmentHeaders(headers);
  const mapped = Object.keys(indexes).length;
  const rows: RecruitmentParsedRow[] = [];
  let lastRecruiter = "";
  const start = detected.index + detected.span;

  for (let r = start; r < sheetRows.length; r++) {
    const raw = sheetRows[r] ?? [];
    const get = (key: string) => {
      const i = indexes[key];
      if (i == null || i < 0) return "";
      return raw[i];
    };
    const creatorName = cellText(get("creatorName")).replace(/^@/, "");
    let recruiter = cellText(get("recruiter"));
    if (recruiter) lastRecruiter = recruiter;
    else recruiter = lastRecruiter;
    if (!creatorName) continue;
    if (isHeaderLike(creatorName) || isHeaderLike(recruiter)) continue;

    const steps: Record<string, string> = {};
    for (const key of STEP_KEYS) {
      const v = cellText(get(key));
      if (v) steps[key] = v;
    }

    rows.push({
      recruiter,
      requestDate: parseExcelDate(get("requestDate")),
      creatorName,
      situation: cellText(get("situation")),
      phone: cellText(get("phone")),
      comment: cellText(get("comment")),
      comment2: cellText(get("comment2")),
      recontact: cellText(get("recontact")),
      integrationDate: parseExcelDate(get("integrationDate")),
      steps,
    });
  }

  return { rows, mapped, indexes, headers, score: detected.score };
}

export function situationTone(situation: string) {
  const s = situation.toLowerCase();
  if (s.includes("no apto")) return "bg-danger/20";
  if (s.includes("apto")) return "bg-success/10";
  if (s.includes("pendiente")) return "bg-warning/10";
  return "";
}

export function matchManagerId(
  recruiter: string,
  users: { id: string; name: string }[]
) {
  const n = normalizeHeaderKey(recruiter);
  if (!n) return null;
  const exact = users.find((u) => normalizeHeaderKey(u.name) === n);
  if (exact) return exact.id;
  const first = users.find((u) => {
    const un = normalizeHeaderKey(u.name);
    const token = un.split(" ")[0] ?? "";
    return token && (token === n || un.startsWith(n) || n.startsWith(token));
  });
  return first?.id ?? null;
}

export function dateParts(iso: string | null | undefined) {
  if (!iso) return { year: null as number | null, month: null as number | null };
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})/);
  if (!m) return { year: null, month: null };
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function templateHeaders() {
  return RECRUITMENT_COLUMNS.map((c) => c.label);
}
