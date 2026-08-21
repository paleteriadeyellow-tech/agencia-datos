export const ONBOARDING_SITUATIONS = [
  "capacitación",
  "pendiente",
  "activo",
  "listo",
] as const;

export const ONBOARDING_GROUPS = [
  { id: "bienvenida", label: "Bienvenida e integración" },
  { id: "formacion", label: "Capacitación" },
  { id: "eventos", label: "Eventos y batallas" },
] as const;

export type OnboardingCheck = {
  key: string;
  label: string;
  group: (typeof ONBOARDING_GROUPS)[number]["id"];
};

export const ONBOARDING_CHECKS: OnboardingCheck[] = [
  { key: "visitarLive", label: "Visitarlo en LIVE", group: "bienvenida" },
  { key: "follow", label: "Follow", group: "bienvenida" },
  { key: "historiaBienvenida", label: "Historia de bienvenida", group: "bienvenida" },
  { key: "presentacionGerente", label: "Presentación gerente", group: "bienvenida" },
  { key: "kitBonos", label: "Kit de bonos", group: "bienvenida" },
  { key: "kitBienvenida", label: "Kit bienvenida", group: "bienvenida" },
  { key: "pagina", label: "Página", group: "bienvenida" },
  { key: "app", label: "App", group: "bienvenida" },
  { key: "grupos", label: "Grupos", group: "bienvenida" },
  { key: "videoPresentacion", label: "Video de presentación", group: "bienvenida" },
  { key: "presentacionCeo", label: "Presentación CEO", group: "bienvenida" },
  { key: "agendarLlamada", label: "Agendar llamada", group: "bienvenida" },
  { key: "llamada", label: "Llamada", group: "bienvenida" },
  { key: "historiaExito", label: "Historia de éxito", group: "bienvenida" },
  {
    key: "liveNovatos",
    label: "LIVE presentación novatos (lunes 8pm)",
    group: "formacion",
  },
  { key: "presenta", label: "Presenta", group: "formacion" },
  {
    key: "paginaEncuesta",
    label: "Página (encuestas y capacitarse)",
    group: "formacion",
  },
  {
    key: "capturaEncuesta",
    label: "Pedirles captura o resultado",
    group: "formacion",
  },
  { key: "encuesta", label: "Encuesta", group: "formacion" },
  {
    key: "examenTeorica",
    label: "Examen de capacitación teórica",
    group: "formacion",
  },
  {
    key: "capacitacionCeo",
    label: "Capacitación en LIVE por CEO",
    group: "formacion",
  },
  { key: "estrategiaBasica", label: "Estrategia básica", group: "formacion" },
  { key: "livesAgendado", label: "LIVEs agendado", group: "formacion" },
  {
    key: "encuestaEstrategia",
    label: "Encuesta sobre estrategia básica",
    group: "formacion",
  },
  { key: "evidenciaEventos", label: "Evidencia de sus eventos", group: "eventos" },
  {
    key: "compartirEvento",
    label: "Compartir al grupo su evento",
    group: "eventos",
  },
  {
    key: "registrarEvento",
    label: "Registrarnos a su evento (LIVE) y asistir",
    group: "eventos",
  },
  { key: "accesoApp", label: "Acceso a la app", group: "eventos" },
  { key: "interactivos", label: "Interactivos", group: "eventos" },
  { key: "batallasEllos", label: "Hacer batallas con ellos", group: "eventos" },
  { key: "batallaNovato", label: "Batalla novato", group: "eventos" },
  { key: "batallaGamer", label: "Batalla gamer", group: "eventos" },
  { key: "batallaInterna", label: "Batalla interna", group: "eventos" },
  { key: "batallaAgencia", label: "Batalla de agencia", group: "eventos" },
  { key: "batallaOficial", label: "Batalla oficial", group: "eventos" },
  { key: "ofrecerIa", label: "Ofrecer IA", group: "eventos" },
];

export const CHECK_KEYS = ONBOARDING_CHECKS.map((c) => c.key);

export function emptyChecks(): Record<string, boolean> {
  return {};
}

export function asChecks(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!CHECK_KEYS.includes(k)) continue;
    const s = String(v).trim().toLowerCase();
    if (v === true || s === "si" || s === "sí" || s === "ya" || s === "listo" || s === "1") {
      out[k] = true;
    }
  }
  return out;
}

export function checkedCount(checks: Record<string, boolean>) {
  return CHECK_KEYS.filter((k) => checks[k]).length;
}
