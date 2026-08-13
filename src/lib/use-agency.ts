"use client";

import { useParams } from "next/navigation";
import {
  AGENCIES,
  agencyPath,
  getAgency,
  isAgencySlug,
  type AgencySlug,
} from "@/lib/agencies";

export function useAgency(): {
  slug: AgencySlug;
  name: string;
  shortName: string;
  path: (p?: string) => string;
} {
  const params = useParams();
  const raw = String(params?.agency ?? "");
  const slug: AgencySlug = isAgencySlug(raw) ? raw : "streamersfederation";
  const agency = getAgency(slug) ?? AGENCIES.streamersfederation;
  return {
    slug,
    name: agency.name,
    shortName: agency.shortName,
    path: (p = "") => agencyPath(slug, p),
  };
}
