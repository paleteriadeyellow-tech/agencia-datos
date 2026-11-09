"use client";

import { TopBar } from "@/components/top-bar";
import { Panel } from "@/components/ui";

// Calendario base: primer domingo 15-nov-2026, cada 14 días, 8:00 p. m. (pendiente de confirmación de la dirección).
const FIRST = Date.UTC(2026, 10, 15);
const DAY = 86_400_000;

const SECTIONS = [
  "Dashboard", "Calendario", "Próxima subasta", "Registro de creadores", "Participantes", "Grupos e inducción",
  "Manual y reglamento", "Marketing y flyers", "Guion de anfitriona", "Producción en vivo", "Resultados", "Historial", "Configuración",
];

export default function SubastasPage() {
  const fmt = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const now = new Date();
  const t0 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dates = Array.from({ length: 8 }, (_, i) => FIRST + i * 14 * DAY).filter((d) => d >= t0).slice(0, 6);

  return (
    <div className="space-y-5">
      <TopBar title="Sistema de subastas" subtitle="Subasta de Creadores de El Árbol · Anfitriona: Majo" />
      <Panel className="text-sm text-text-muted">
        Módulo en construcción: por ahora solo existe esta pestaña y el calendario base. Las secciones de abajo aún no están implementadas y las fechas están pendientes de confirmación de la dirección.
      </Panel>

      <Panel className="space-y-2">
        <h2 className="font-semibold">Próximas fechas propuestas (cada 14 días, 8:00 p. m.)</h2>
        <ul className="text-sm">
          {dates.map((d, i) => (
            <li key={d} className="flex items-center justify-between border-t border-border-soft py-2 first:border-t-0">
              <span className="capitalize">{fmt.format(d)}</span>
              <span className="text-xs text-text-muted">{i === 0 ? "Próxima · por confirmar" : "Propuesta"}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="space-y-3">
        <h2 className="font-semibold">Secciones del módulo</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <div key={s} className="flex items-center justify-between rounded-lg border border-border-soft px-3 py-2 text-sm text-text-muted">
              {s}<span className="text-[11px]">Pendiente</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
