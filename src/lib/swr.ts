import { useEffect, useState } from "react";
import useSWR, { mutate, type SWRConfiguration } from "swr";
import { getViewAsId, subscribeViewAs } from "@/lib/view-as";

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Error al cargar");
  return res.json();
}

function panelKey(url: string, viewAsId: string | null) {
  return [url, viewAsId ?? ""] as const;
}

function urlFromKey(key: unknown): string | null {
  if (typeof key === "string") return key;
  if (Array.isArray(key) && typeof key[0] === "string") return key[0];
  return null;
}

export function usePanelData(url: string | null, options?: SWRConfiguration) {
  const [viewAsId, setViewAsId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setViewAsId(getViewAsId());
    setReady(true);
    return subscribeViewAs(() => setViewAsId(getViewAsId()));
  }, []);

  return useSWR(
    ready && url ? panelKey(url, viewAsId) : null,
    ([u]: readonly [string, string]) => fetcher(u),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
      errorRetryCount: 1,
      keepPreviousData: true,
      ...options,
    }
  );
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
} as const;

function warm(url: string) {
  void fetcher(url)
    .then((data) => {
      void mutate(panelKey(url, getViewAsId()), data, { revalidate: false });
    })
    .catch(() => {
      /* no envenenar la caché */
    });
}

/** Prefetch ligero: primero lo crítico, el resto en idle */
export function prefetchPanel() {
  if (typeof window === "undefined") return;

  warm(PANEL.dashboard);
  warm(PANEL.creators);

  const rest = [PANEL.metrics, PANEL.tasks, PANEL.ops, PANEL.managers];
  const schedule =
    typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback
      : (cb: () => void) => window.setTimeout(cb, 900);

  schedule(() => {
    rest.forEach((url, i) => {
      window.setTimeout(() => warm(url), i * 180);
    });
  });
}
