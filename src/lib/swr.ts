"use client";

import { useMemo } from "react";
import useSWR, { mutate, useSWRConfig, type SWRConfiguration } from "swr";
import { currentMonth } from "@/lib/utils";
import { mondayOf, ymd } from "@/lib/weekly-schedule";
import { useAgency } from "@/lib/use-agency";

const CACHE_PREFIX = "panel-cache-v3:";
/** Mostrar datos guardados hasta 24h; se refrescan en segundo plano. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let boundAgency = "";

export function bindPanelAgency(slug: string) {
  boundAgency = slug;
}

export function panelSWRKey(url: string, agency = boundAgency) {
  return [agency || "x", url] as const;
}

function storageKey(url: string) {
  return `${CACHE_PREFIX}${boundAgency || "x"}:${url}`;
}

type CacheEntry = { t: number; d: unknown };

function readCache(url: string): { data: unknown; age: number } | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw =
      localStorage.getItem(storageKey(url)) ??
      sessionStorage.getItem(`panel-swr-v2:${boundAgency || "x"}:${url}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CacheEntry | unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "t" in parsed &&
      "d" in parsed &&
      typeof (parsed as CacheEntry).t === "number"
    ) {
      const entry = parsed as CacheEntry;
      const age = Date.now() - entry.t;
      if (age > CACHE_TTL_MS) return undefined;
      return { data: entry.d, age };
    }
    // formato viejo (solo JSON del payload)
    return { data: parsed, age: 0 };
  } catch {
    return undefined;
  }
}

function writeCache(url: string, data: unknown) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({ t: Date.now(), d: data } satisfies CacheEntry);
  try {
    localStorage.setItem(storageKey(url), payload);
  } catch {
    try {
      // cuota llena: limpiar cachés viejas del panel
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(CACHE_PREFIX) || k?.startsWith("panel-swr-")) {
          keys.push(k);
        }
      }
      keys.slice(0, Math.ceil(keys.length / 2)).forEach((k) => {
        localStorage.removeItem(k);
      });
      localStorage.setItem(storageKey(url), payload);
    } catch {
      try {
        sessionStorage.setItem(storageKey(url), payload);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function panelFetcher(url: string) {
  const res = await fetch(url, {
    headers: { "x-skip-view-as": "1" },
    // Permite caché HTTP del navegador / Electron cuando el server lo autoriza
    cache: "default",
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
  writeCache(url, json);
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
  revalidateIfStale: true,
  keepPreviousData: true,
  dedupingInterval: 60_000,
  errorRetryCount: 2,
  errorRetryInterval: 1200,
  focusThrottleInterval: 60_000,
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
  const cached = useMemo(() => {
    if (!url || memory != null) return undefined;
    return readCache(url);
  }, [url, memory, slug]);

  const fallbackData = memory ?? cached?.data;
  // Con caché: pintar YA y refrescar en segundo plano si tiene > 45s
  const shouldRevalidate =
    memory == null &&
    (cached == null || (cached.age ?? 0) > 45_000);

  return useSWR(key, () => panelFetcher(url!), {
    ...PANEL_SWR_DEFAULTS,
    fallbackData,
    revalidateOnMount: shouldRevalidate || fallbackData == null,
    ...options,
  });
}

export function persistPanelCache(url: string, data: unknown) {
  writeCache(url, data);
}

/** Hidrata la memoria SWR desde localStorage (arranque instantáneo). */
export function hydratePanelCacheFromStorage(urls: string[]) {
  if (typeof window === "undefined") return;
  for (const url of urls) {
    const hit = readCache(url);
    if (!hit) continue;
    void mutate(panelSWRKey(url), hit.data, { revalidate: false });
  }
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

export function clearPanelDiskCache() {
  if (typeof window === "undefined") return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(CACHE_PREFIX) || k?.startsWith("panel-swr-")) {
      toRemove.push(k);
    }
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
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
  hydratePanelCacheFromStorage(urls);
  window.setTimeout(() => {
    urls.slice(0, 8).forEach((url, i) => {
      window.setTimeout(() => warm(url), i * 200);
    });
  }, 400);
}
