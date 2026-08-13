"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { SuggestCreator } from "@/components/creator-suggest";
import { PANEL } from "@/lib/swr";

export type RosterCreator = {
  id: string;
  name: string;
  tiktokUser?: string | null;
  phone?: string;
  diamonds?: number;
};

type CreatorsApi = {
  creators: {
    id: string;
    name: string;
    tiktokUser?: string | null;
    phone?: string;
    diamonds?: number;
  }[];
};

async function fetchCreators(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Error al cargar creadores");
  return res.json() as Promise<CreatorsApi>;
}

/**
 * Roster completo de la pestaña Creadores.
 * Se refresca al enfocar la ventana y al invalidar PANEL.creators.
 */
export function useCreatorsRoster() {
  const { data, error, mutate, isLoading } = useSWR(
    PANEL.creators,
    fetchCreators,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 3000,
      errorRetryCount: 1,
      keepPreviousData: true,
    }
  );

  const creators: RosterCreator[] = useMemo(() => {
    const rows = data?.creators ?? [];
    return rows
      .map((c) => ({
        id: c.id,
        name: c.name,
        tiktokUser: c.tiktokUser,
        phone: c.phone,
        diamonds: c.diamonds ?? 0,
      }))
      .sort((a, b) => {
        const da = a.diamonds ?? 0;
        const db = b.diamonds ?? 0;
        if (db !== da) return db - da;
        return a.name.localeCompare(b.name);
      });
  }, [data?.creators]);

  const suggestList: SuggestCreator[] = useMemo(
    () =>
      creators
        .map((c) => {
          const nick = (c.tiktokUser || c.name)
            .replace(/^@/, "")
            .trim()
            .toLowerCase();
          if (!nick) return null;
          return {
            id: c.id,
            nick,
            name: c.name,
            diamonds: c.diamonds ?? 0,
          };
        })
        .filter(Boolean) as SuggestCreator[],
    [creators]
  );

  return { creators, suggestList, error, mutate, isLoading };
}
