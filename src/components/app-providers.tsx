"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SWRConfig } from "swr";
import { QuickCreateProvider } from "@/components/quick-create";
import { PANEL_SWR_DEFAULTS, bindPanelAgency, prefetchPanel } from "@/lib/swr";
import { ViewAsProvider } from "@/components/view-as";
import { PanelWarmup } from "@/components/panel-warmup";
import { useAgency } from "@/lib/use-agency";

const PREFETCH_ROUTES = [
  "/dashboard",
  "/creadores",
  "/control-diamantes",
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
    const t = window.setTimeout(() => prefetchPanel(), 400);
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
