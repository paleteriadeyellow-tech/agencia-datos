"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SWRConfig } from "swr";
import { QuickCreateProvider } from "@/components/quick-create";
import { PANEL_SWR_DEFAULTS } from "@/lib/swr";
import { ViewAsProvider } from "@/components/view-as";
import { PanelWarmup } from "@/components/panel-warmup";
import { useAgency } from "@/lib/use-agency";

const ALL_ROUTES = [
  "/dashboard",
  "/creadores",
  "/control-diamantes",
  "/metricas",
  "/envio-kpi",
  "/mensajes-wa",
  "/tareas",
  "/campanas",
  "/calendario",
  "/finanzas",
  "/bonos",
  "/contratos",
  "/managers",
];

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { path } = useAgency();

  useEffect(() => {
    ALL_ROUTES.forEach((href) => router.prefetch(path(href)));
  }, [router, path, pathname]);

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
