export const CONTENT_TYPES: string[] = ["VIDEO", "LIVE", "FOTO", "CARRUSEL"];

export const CONTENT_IDEAS: string[] = [
  "COMUNIDAD / VALOR",
  "EDUCATIVO",
  "PROMOCIONALES",
  "ENTRETENIMIENTO",
  "TENDENCIA",
];

export const BOOST_OPTIONS: string[] = ["SI", "NO"];

export const REPLICATE_MODES: string[] = ["SOLO MANAGERS", "ELEGIR"];

export const CREATED_OPTIONS: string[] = ["AUN NO", "EN PROCESO", "SI"];

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
