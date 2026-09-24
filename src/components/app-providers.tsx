"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SWRConfig } from "swr";
import { QuickCreateProvider } from "@/components/quick-create";
import {
  PANEL_SWR_DEFAULTS,
  bindPanelAgency,
  hydratePanelCacheFromStorage,
  panelWarmUrls,
} from "@/lib/swr";
import { ViewAsProvider } from "@/components/view-as";
import { PanelWarmup } from "@/components/panel-warmup";
import { useAgency } from "@/lib/use-agency";
import { prefetchPanelFast } from "@/lib/nav-prefetch";

const PREFETCH_ROUTES = [
  "/dashboard",
  "/creadores",
  "/control-diamantes",
  "/metricas",
  "/envio-kpi",
  "/mensajes-wa",
  "/tareas",
  "/campanas",
  "/calendario",
  "/reclutamiento",
  "/programacion",
  "/control-usuarios",
  "/llamadas",
  "/graduacion-batallas",
  "/sugerencia-video",
  "/batallas-oficiales",
  "/finanzas",
  "/bonos",
  "/contratos",
  "/managers",
];

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { slug, path } = useAgency();
  bindPanelAgency(slug);

  useEffect(() => {
    PREFETCH_ROUTES.forEach((href) => router.prefetch(path(href)));
  }, [router, path, pathname]);

  useEffect(() => {
    bindPanelAgency(slug);
    // 1) Pintar al instante desde disco  2) Precargar el resto en idle
    hydratePanelCacheFromStorage(panelWarmUrls());
    const t = window.setTimeout(() => prefetchPanelFast(), 150);
    return () => window.clearTimeout(t);
  }, [slug]);

  return (
    <SWRConfig value={PANEL_SWR_DEFAULTS}>
      <ViewAsProvider>
        <QuickCreateProvider>
          <PanelWarmup />
          {children}
        </QuickCreateProvider>
      </ViewAsProvider>
    </SWRConfig>
  );
}
