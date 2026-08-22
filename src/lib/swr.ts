"use client";

import { useMemo } from "react";
import useSWR, { mutate, useSWRConfig, type SWRConfiguration } from "swr";
import { currentMonth } from "@/lib/utils";
import { mondayOf, ymd } from "@/lib/weekly-schedule";
import { useAgency } from "@/lib/use-agency";

const SESSION_PREFIX = "panel-swr-v2:";

let boundAgency = "";

export function bindPanelAgency(slug: string) {
  boundAgency = slug;
}

export function panelSWRKey(url: string, agency = boundAgency) {
  return [agency || "x", url] as const;
}

function storageKey(url: string) {
  return `${SESSION_PREFIX}${boundAgency || "x"}:${url}`;
}

function readSession(url: string) {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(storageKey(url));
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeSession(url: string, data: unknown) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(url), JSON.stringify(data));
  } catch {
    /* quota */
  }
}

export async function panelFetcher(url: string) {
  const res = await fetch(url, {
    headers: { "x-skip-view-as": "1" },
  });
  if (!res.ok) {
    let message = "Error al cargar";
    try {
      const json = (await res.json()) as { error?: string };
      if (json?.error) message = json.error;
    } catch {
      /* html 500 */
    }
    throw new Error(message);
  }
  const json = await res.json();
  writeSession(url, json);
  return json;
}

function urlFromKey(key: unknown): string | null {
  if (typeof key === "string") return key;
  if (Array.isArray(key) && typeof key[1] === "string") return key[1];
  if (Array.isArray(key) && typeof key[0] === "string") return key[0];
  return null;
}

export const PANEL_SWR_DEFAULTS: SWRConfiguration = {
  fetcher: panelFetcher,
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  revalidateIfStale: false,
  keepPreviousData: true,
  dedupingInterval: 30_000,
  errorRetryCount: 2,
  errorRetryInterval: 1200,
};

export function usePanelData(url: string | null, options?: SWRConfiguration) {
  const { slug } = useAgency();
  bindPanelAgency(slug);
  const { cache } = useSWRConfig();
  const key = url ? panelSWRKey(url, slug) : null;
  const memory = key
    ? (cache as { get: (k: unknown) => { data?: unknown } | undefined }).get(key)
        ?.data
    : undefined;
  const fallback = useMemo(() => {
    if (!url || memory != null) return undefined;
    return readSession(url);
  }, [url, memory, slug]);

  return useSWR(key, () => panelFetcher(url!), {
    ...PANEL_SWR_DEFAULTS,
    fallbackData: memory ?? fallback,
    revalidateOnMount: memory == null && fallback == null,
    ...options,
  });
}

export function persistPanelCache(url: string, data: unknown) {
  writeSession(url, data);
}

export function mutatePanel(
  url: string,
  data?: unknown | Promise<unknown> | ((current: unknown) => unknown),
  opts?: { revalidate?: boolean }
) {
  return mutate(panelSWRKey(url), data as never, opts);
}

export function invalidatePanel(...keys: string[]) {
  for (const k of keys) {
    void mutate(
      (key) => {
        const url = urlFromKey(key);
        return Boolean(url && (url === k || url.startsWith(`${k}?`)));
      },
      undefined,
      { revalidate: true }
    );
  }
}

export function invalidateAllPanel() {
  void mutate(() => true, undefined, { revalidate: true });
}

export const PANEL = {
  dashboard: "/api/panel/dashboard",
  creators: "/api/panel/creators",
  metrics: "/api/panel/metrics",
  tasks: "/api/panel/tasks",
  ops: "/api/panel/ops",
  managers: "/api/panel/managers",
  diamonds: "/api/panel/diamonds",
  livecoins: "/api/panel/livecoins",
  bonos: "/api/panel/bonos",
  kpi: "/api/panel/kpi",
  hub: "/api/panel/hub",
  exportMes: "/api/panel/export",
  recruitment: "/api/panel/recruitment",
  programming: "/api/panel/programming",
  onboarding: "/api/panel/onboarding",
  calls: "/api/panel/calls",
  battles: "/api/panel/battles",
  videoSuggestions: "/api/panel/video-suggestions",
  officialBattles: "/api/panel/official-battles",
} as const;

export function panelWarmUrls(period = currentMonth()) {
  const year = period.slice(0, 4);
  return [
    `${PANEL.dashboard}?period=${period}`,
    `${PANEL.hub}?period=${period}`,
    PANEL.creators,
    `${PANEL.diamonds}?period=${period}`,
    `${PANEL.recruitment}?year=${year}&month=${Number(period.slice(5, 7))}`,
    `${PANEL.programming}?week=${ymd(mondayOf())}`,
    `${PANEL.onboarding}?year=${year}&month=${Number(period.slice(5, 7))}`,
    `${PANEL.calls}?week=${ymd(mondayOf())}`,
    `${PANEL.battles}?year=${year}&month=${Number(period.slice(5, 7))}`,
    `${PANEL.videoSuggestions}?year=${year}&month=${Number(period.slice(5, 7))}`,
    `${PANEL.officialBattles}?year=${year}&month=${Number(period.slice(5, 7))}`,
    PANEL.managers,
    PANEL.livecoins,
    PANEL.metrics,
    PANEL.ops,
    `${PANEL.tasks}?period=${period}`,
    `${PANEL.bonos}?period=${period}`,
    `${PANEL.kpi}?period=${period}`,
  ];
}

function warm(url: string) {
  void panelFetcher(url)
    .then((data) => {
      void mutate(panelSWRKey(url), data, { revalidate: false });
    })
    .catch(() => {
      /* no envenenar la caché */
    });
}

/** Precarga suave: no satura la base al cambiar de agencia. */
export function prefetchPanel() {
  if (typeof window === "undefined") return;

  const urls = panelWarmUrls();
  window.setTimeout(() => {
    urls.slice(2, 6).forEach((url, i) => {
      window.setTimeout(() => warm(url), i * 400);
    });
  }, 1200);
}
