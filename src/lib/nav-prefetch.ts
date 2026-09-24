import { currentMonth } from "@/lib/utils";
import { mondayOf, ymd } from "@/lib/weekly-schedule";
import {
  PANEL,
  panelWarmUrls,
  panelSWRKey,
  panelFetcher,
  hydratePanelCacheFromStorage,
} from "@/lib/swr";
import { mutate } from "swr";

/** APIs a calentar al pasar el mouse por cada pestaña. */
export function apisForRoute(href: string, period = currentMonth()): string[] {
  const year = period.slice(0, 4);
  const month = Number(period.slice(5, 7));
  const week = ymd(mondayOf());

  switch (href) {
    case "/dashboard":
      return [
        `${PANEL.dashboard}?period=${period}`,
        `${PANEL.hub}?period=${period}`,
      ];
    case "/creadores":
      return [PANEL.creators];
    case "/control-diamantes":
      return [`${PANEL.diamonds}?period=${period}`];
    case "/metricas":
      return [PANEL.livecoins, PANEL.metrics];
    case "/envio-kpi":
      return [`${PANEL.kpi}?period=${period}`, PANEL.creators];
    case "/mensajes-wa":
      return [PANEL.creators];
    case "/tareas":
      return [`${PANEL.tasks}?period=${period}`];
    case "/campanas":
    case "/finanzas":
    case "/contratos":
      return [PANEL.ops, PANEL.creators];
    case "/bonos":
      return [`${PANEL.bonos}?period=${period}`];
    case "/managers":
      return [PANEL.managers];
    case "/reclutamiento":
      return [`${PANEL.recruitment}?year=${year}&month=${month}`];
    case "/programacion":
      return [`${PANEL.programming}?week=${week}`];
    case "/control-usuarios":
      return [`${PANEL.onboarding}?year=${year}&month=${month}`];
    case "/llamadas":
      return [`${PANEL.calls}?week=${week}`];
    case "/graduacion-batallas":
      return [`${PANEL.battles}?year=${year}&month=${month}`];
    case "/sugerencia-video":
      return [`${PANEL.videoSuggestions}?year=${year}&month=${month}`];
    case "/batallas-oficiales":
      return [`${PANEL.officialBattles}?year=${year}&month=${month}`];
    case "/calendario":
      return [PANEL.creators, `${PANEL.diamonds}?period=${period}`];
    default:
      return [];
  }
}

const warming = new Set<string>();

export function warmApis(urls: string[]) {
  for (const url of urls) {
    if (!url || warming.has(url)) continue;
    warming.add(url);
    void panelFetcher(url)
      .then((data) => {
        void mutate(panelSWRKey(url), data, { revalidate: false });
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        warming.delete(url);
      });
  }
}

/** Precarga agresiva en idle: datos listos al cambiar de pestaña. */
export function prefetchPanelFast() {
  if (typeof window === "undefined") return;
  const urls = panelWarmUrls();
  // Primero hidratar desde disco (0 ms de red)
  hydratePanelCacheFromStorage(urls);
  const run = () => {
    urls.forEach((url, i) => {
      window.setTimeout(() => warmApis([url]), i * 100);
    });
  };
  const w = window as Window & {
    requestIdleCallback?: (
      cb: () => void,
      opts?: { timeout: number }
    ) => number;
  };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(run, { timeout: 2500 });
  } else {
    window.setTimeout(run, 600);
  }
}
