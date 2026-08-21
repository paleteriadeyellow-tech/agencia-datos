"use client";

import { currentMonth } from "@/lib/utils";
import { PANEL, usePanelData } from "@/lib/swr";
import { mondayOf, ymd } from "@/lib/weekly-schedule";

/** Mantiene todas las APIs del panel en caché para cambiar de pestaña al instante. */
export function PanelWarmup() {
  const period = currentMonth();
  usePanelData(`${PANEL.dashboard}?period=${period}`);
  usePanelData(`${PANEL.hub}?period=${period}`);
  usePanelData(PANEL.creators);
  usePanelData(
    `${PANEL.recruitment}?year=${period.slice(0, 4)}&month=${Number(period.slice(5, 7))}`
  );
  usePanelData(`${PANEL.programming}?week=${ymd(mondayOf())}`);
  usePanelData(
    `${PANEL.onboarding}?year=${period.slice(0, 4)}&month=${Number(period.slice(5, 7))}`
  );
  usePanelData(
    `${PANEL.calls}?year=${period.slice(0, 4)}&month=${Number(period.slice(5, 7))}`
  );
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
