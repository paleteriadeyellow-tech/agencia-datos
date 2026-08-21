import useSWR, { mutate, type SWRConfiguration } from "swr";
import { currentMonth } from "@/lib/utils";

export async function panelFetcher(url: string) {
  const res = await fetch(url, {
    headers: { "x-skip-view-as": "1" },
  });
  if (!res.ok) throw new Error("Error al cargar");
  return res.json();
}

function urlFromKey(key: unknown): string | null {
  if (typeof key === "string") return key;
  if (Array.isArray(key) && typeof key[0] === "string") return key[0];
  return null;
}

export const PANEL_SWR_DEFAULTS: SWRConfiguration = {
  fetcher: panelFetcher,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
  keepPreviousData: true,
  dedupingInterval: 60_000,
  errorRetryCount: 1,
};

export function usePanelData(url: string | null, options?: SWRConfiguration) {
  return useSWR(url, panelFetcher, {
    ...PANEL_SWR_DEFAULTS,
    ...options,
  });
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
} as const;

export function panelWarmUrls(period = currentMonth()) {
  return [
    `${PANEL.dashboard}?period=${period}`,
    `${PANEL.hub}?period=${period}`,
    PANEL.creators,
    PANEL.managers,
    PANEL.livecoins,
    PANEL.metrics,
    PANEL.ops,
    `${PANEL.diamonds}?period=${period}`,
    `${PANEL.tasks}?period=${period}`,
    `${PANEL.bonos}?period=${period}`,
    `${PANEL.kpi}?period=${period}`,
  ];
}

function warm(url: string) {
  void panelFetcher(url)
    .then((data) => {
      void mutate(url, data, { revalidate: false });
    })
    .catch(() => {
      /* no envenenar la caché */
    });
}

/** Precarga las APIs del panel para que cada pestaña abra al instante. */
export function prefetchPanel() {
  if (typeof window === "undefined") return;

  const urls = panelWarmUrls();
  urls.slice(0, 3).forEach(warm);
  window.setTimeout(() => {
    urls.slice(3).forEach((url, i) => {
      window.setTimeout(() => warm(url), i * 40);
    });
  }, 40);
}
