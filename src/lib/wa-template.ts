export const DEFAULT_WA_TEMPLATES = [
  {
    name: "Seguimiento de meta",
    body: "Hola {nombre}, vas {diamantes} diamantes y {horas}h este mes. Tu meta es {meta}. Te faltan {faltan}. ¡Vamos!",
  },
  {
    name: "Sin LIVE reciente",
    body: "Hola {nombre}, no te hemos visto en LIVE. ¿Todo bien? Agenda hoy aunque sea 1 hora para no perder el mes.",
  },
  {
    name: "Felicitación",
    body: "Hola {nombre}, vas muy bien: {diamantes} diamantes y {horas}h. Sigue así para el bono 💎",
  },
];

export const WA_TEMPLATE_VARS = [
  { key: "nombre", label: "Nombre", example: "albertoreyesyt" },
  { key: "diamantes", label: "Diamantes", example: "338,968" },
  { key: "horas", label: "Horas", example: "89" },
  { key: "dias", label: "Días", example: "20" },
  { key: "meta", label: "Meta", example: "500,000" },
  { key: "faltan", label: "Faltan", example: "161,032" },
] as const;

export type WaVars = {
  nombre?: string;
  diamantes?: string | number;
  horas?: string | number;
  dias?: string | number;
  meta?: string | number;
  faltan?: string | number;
  nicho?: string;
};

export function fillWaTemplate(body: string, vars: WaVars) {
  const map: Record<string, string> = {
    nombre: String(vars.nombre ?? ""),
    diamantes: String(vars.diamantes ?? "0"),
    horas: String(vars.horas ?? "0"),
    dias: String(vars.dias ?? "0"),
    meta: String(vars.meta ?? "0"),
    faltan: String(vars.faltan ?? "0"),
    nicho: String(vars.nicho ?? ""),
  };
  return body.replace(/\{(\w+)\}/g, (_, key: string) => map[key] ?? `{${key}}`);
}
