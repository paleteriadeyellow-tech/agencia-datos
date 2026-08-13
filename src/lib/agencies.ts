export const AGENCIES = {
  streamersfederation: {
    slug: "streamersfederation",
    name: "Agencia Streamersfederation",
    shortName: "Streamersfederation",
  },
  elarbol: {
    slug: "elarbol",
    name: "Agencia El Árbol",
    shortName: "El Árbol",
  },
} as const;

export type AgencySlug = keyof typeof AGENCIES;

export function isAgencySlug(value: string): value is AgencySlug {
  return value in AGENCIES;
}

export function getAgency(slug: string) {
  if (!isAgencySlug(slug)) return null;
  return AGENCIES[slug];
}

export function agencyPath(slug: AgencySlug | string, path = "") {
  const clean = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `/a/${slug}${clean}`;
}
