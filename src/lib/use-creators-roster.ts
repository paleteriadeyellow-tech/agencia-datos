"use client";

import { useMemo } from "react";
import type { SuggestCreator } from "@/components/creator-suggest";
import { PANEL, usePanelData } from "@/lib/swr";
import { useViewAs } from "@/components/view-as";
import { filterByManagerId, nickKey } from "@/lib/scope-view";

export type RosterCreator = {
  id: string;
  name: string;
  tiktokUser?: string | null;
  phone?: string;
  diamonds?: number;
  managerId?: string | null;
};

type CreatorsApi = {
  creators: {
    id: string;
    name: string;
    tiktokUser?: string | null;
    phone?: string;
    diamonds?: number;
    managerId?: string | null;
  }[];
};

/**
 * Roster completo de la pestaña Creadores.
 * Con vista de manager, filtra al instante sin recargar.
 */
export function useCreatorsRoster() {
  const { viewAsId } = useViewAs();
  const { data, error, mutate, isLoading } = usePanelData(PANEL.creators) as {
    data?: CreatorsApi;
    error?: Error;
    mutate: () => void;
    isLoading: boolean;
  };

  const creators: RosterCreator[] = useMemo(() => {
    const rows = filterByManagerId(data?.creators ?? [], viewAsId);
    return rows
      .map((c) => ({
        id: c.id,
        name: c.name,
        tiktokUser: c.tiktokUser,
        phone: c.phone,
        diamonds: c.diamonds ?? 0,
        managerId: c.managerId ?? null,
      }))
      .sort((a, b) => {
        const da = a.diamonds ?? 0;
        const db = b.diamonds ?? 0;
        if (db !== da) return db - da;
        return a.name.localeCompare(b.name);
      });
  }, [data?.creators, viewAsId]);

  const nickSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of creators) {
      if (c.tiktokUser) set.add(nickKey(c.tiktokUser));
      set.add(nickKey(c.name));
    }
    return set;
  }, [creators]);

  const suggestList: SuggestCreator[] = useMemo(
    () =>
      creators
        .map((c) => {
          const nick = nickKey(c.tiktokUser || c.name);
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

  return { creators, suggestList, nickSet, error, mutate, isLoading };
}
