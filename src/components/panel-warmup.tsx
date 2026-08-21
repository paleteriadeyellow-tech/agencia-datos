"use client";

import { currentMonth } from "@/lib/utils";
import { PANEL, usePanelData } from "@/lib/swr";

/** Mantiene todas las APIs del panel en caché para cambiar de pestaña al instante. */
export function PanelWarmup() {
  const period = currentMonth();
  usePanelData(`${PANEL.dashboard}?period=${period}`);
  usePanelData(`${PANEL.hub}?period=${period}`);
  usePanelData(PANEL.creators);
  usePanelData(PANEL.managers);
  usePanelData(PANEL.livecoins);
  usePanelData(PANEL.metrics);
  usePanelData(PANEL.ops);
  usePanelData(`${PANEL.diamonds}?period=${period}`);
  usePanelData(`${PANEL.tasks}?period=${period}`);
  usePanelData(`${PANEL.bonos}?period=${period}`);
  usePanelData(`${PANEL.kpi}?period=${period}`);
  return null;
}
