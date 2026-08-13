import useSWR, { mutate } from "swr";

async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Error al cargar");
  return res.json();
}

export function usePanelData(url: string | null) {
  return useSWR(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000,
    errorRetryCount: 1,
    keepPreviousData: true,
  });
}

export function invalidatePanel(...keys: string[]) {
  for (const k of keys) {
    void mutate(
      (key) =>
        typeof key === "string" && (key === k || key.startsWith(`${k}?`)),
      undefined,
      { revalidate: true }
    );
  }
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
} as const;

function warm(url: string) {
  void fetcher(url)
    .then((data) => {
      void mutate(url, data, { revalidate: false });
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
