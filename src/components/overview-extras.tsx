"use client";

import Link from "next/link";
import {
  CalendarDays,
  Crown,
  Download,
  Flag,
  Globe2,
  MessageCircle,
  Plus,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { Panel } from "@/components/ui";
import { formatNumber, cn } from "@/lib/utils";
import { fillWaTemplate } from "@/lib/wa-template";
import { whatsappUrl } from "@/lib/phone";
import { PANEL } from "@/lib/swr";
import { useAgency } from "@/lib/use-agency";
import { useViewAs } from "@/components/view-as";

export type HubData = {
  trend: {
    diamonds: number;
    hours: number;
    prevDiamonds: number;
    prevHours: number;
    diamondsPct: number;
    hoursPct: number;
  };
  projection: {
    dayElapsed: number;
    daysInMonth: number;
    daysLeft: number;
    dailyPace: number;
    projected: number;
    target: number;
    needPerDay: number;
  };
  podium: {
    id: string;
    name: string;
    tiktokUser: string | null;
    diamonds: number;
    hours: number;
    days: number;
  }[];
  checkin: {
    atRisk: { id: string; name: string; diamonds: number; days: number }[];
    top: { id: string; name: string; diamonds: number }[];
  };
  alerts: {
    id: string;
    creatorId: string;
    name: string;
    phone: string;
    country: string | null;
    type: string;
    label: string;
    severity: "warning" | "danger" | "cyan";
    diamonds?: number;
    days?: number;
    hours?: number;
    managerId?: string | null;
  }[];
  managers: {
    id: string;
    name: string;
    diamonds: number;
    hours: number;
    active: number;
  }[];
  niches: { name: string; diamonds: number }[];
  countries: { name: string; diamonds: number }[];
  goals: {
    id: string;
    name: string;
    diamonds: number;
    hours: number;
    targetDiamonds: number;
    targetHours: number;
    tiktokUser: string | null;
    managerId?: string | null;
  }[];
  calendar: {
    id: string;
    startAt: string;
    durationMin: number;
    creatorName: string;
    status: string;
    creatorId?: string;
    managerId?: string | null;
  }[];
  roster?: {
    id: string;
    name: string;
    phone: string;
    niche: string | null;
    country: string | null;
    tiktokUser: string | null;
    managerId: string | null;
    diamonds: number;
    hours: number;
    days: number;
    prevDiamonds: number;
    prevHours: number;
    targetDiamonds: number;
    targetHours: number;
  }[];
};

function Delta({ value }: { value: number }) {
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold",
        up ? "text-success" : "text-danger"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {up ? "+" : ""}
      {value.toFixed(1)}% vs mes anterior
    </span>
  );
}

function MiniBars({
  items,
  tone,
}: {
  items: { name: string; diamonds: number }[];
  tone: "cyan" | "accent" | "warning";
}) {
  const max = Math.max(1, ...items.map((i) => i.diamonds));
  const bar =
    tone === "cyan" ? "bg-cyan" : tone === "accent" ? "bg-accent" : "bg-warning";
  return (
    <ul className="space-y-2.5">
      {items.slice(0, 6).map((item) => (
        <li key={item.name}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="truncate font-medium">{item.name}</span>
            <span className="tabular-nums text-text-muted">
              {formatNumber(item.diamonds)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
            <div
              className={cn("h-full rounded-full", bar)}
              style={{ width: `${(item.diamonds / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
      {items.length === 0 && (
        <li className="text-sm text-text-muted">Sin datos aún.</li>
      )}
    </ul>
  );
}

export function OverviewExtras({
  hub,
  period,
}: {
  hub: HubData;
  period: string;
}) {
  const { path } = useAgency();
  const { setViewAs } = useViewAs();

  async function quickTask(creatorId: string, title: string) {
    await fetch(PANEL.hub, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "task", creatorId, title, period }),
    });
  }

  function openWa(alert: HubData["alerts"][0]) {
    const link = whatsappUrl(alert.phone, alert.country);
    if (!link) return;
    const text = fillWaTemplate(
      alert.type === "nodays"
        ? "Hola {nombre}, en Control de diamantes sales con 0 días transmitidos este mes. ¿Todo bien? Agenda LIVE hoy."
        : alert.type === "lowdays" || alert.type === "low"
          ? "Hola {nombre}, vas bajo este mes: {diamantes} diamantes y {dias} días LIVE. Necesitamos recuperar ritmo."
          : "Hola {nombre}, te escribimos por: {nicho}.",
      {
        nombre: alert.name,
        nicho: alert.label,
        diamantes: formatNumber(alert.diamonds ?? 0),
        dias: alert.days ?? 0,
        horas: Math.round(alert.hours ?? 0),
      }
    );
    window.open(`${link}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  const podium = hub.podium.slice(0, 3);
  const maxPodium = Math.max(1, ...podium.map((p) => p.diamonds));
  const podiumSlots = [
    { place: 2 as const, person: podium[1] },
    { place: 1 as const, person: podium[0] },
    { place: 3 as const, person: podium[2] },
  ].filter((s) => s.person);
  const maxManager = Math.max(1, ...hub.managers.map((m) => m.diamonds));

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
              Ritmo del mes
            </h2>
            <p className="mt-0.5 text-sm text-text-muted">
              Día {hub.projection.dayElapsed} de {hub.projection.daysInMonth}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`${PANEL.exportMes}?period=${period}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-bg-panel px-4 py-2 text-sm font-medium hover:bg-bg-hover"
            >
              <Download className="h-4 w-4" /> Excel
            </a>
            <Link
              href={path(`/reporte?period=${period}`)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-bg-panel px-4 py-2 text-sm font-medium hover:bg-bg-hover"
            >
              Vista PDF
            </Link>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-12">
          <Panel className="xl:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Vs mes anterior
            </p>
            <p className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-bold tabular-nums">
              {formatNumber(hub.trend.diamonds)}
            </p>
            <div className="mt-2">
              <Delta value={hub.trend.diamondsPct} />
            </div>
            <p className="mt-4 text-sm text-text-muted">
              Horas {formatNumber(Math.round(hub.trend.hours))}
            </p>
            <div className="mt-1">
              <Delta value={hub.trend.hoursPct} />
            </div>
          </Panel>

          <Panel className="xl:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Proyección de cierre
            </p>
            <p className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-bold tabular-nums">
              {formatNumber(hub.projection.projected)}
            </p>
            <p className="mt-2 text-sm text-text-muted">
              Ritmo {formatNumber(hub.projection.dailyPace)} ◆ / día
            </p>
            {hub.projection.target > 0 && (
              <p className="mt-4 text-sm">
                {hub.projection.needPerDay > 0 ? (
                  <span className="text-warning">
                    Para la meta: {formatNumber(hub.projection.needPerDay)} ◆/día
                    · {hub.projection.daysLeft} días
                  </span>
                ) : (
                  <span className="text-success">
                    Van en ritmo de meta o ya la cubrieron.
                  </span>
                )}
              </p>
            )}
          </Panel>

          <Panel className="xl:col-span-6">
            {podiumSlots.length > 0 ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <Crown className="h-4 w-4 text-warning" />
                  <h3 className="font-[family-name:var(--font-syne)] text-base font-semibold">
                    Pódium del mes
                  </h3>
                </div>
                <div className="flex items-end justify-center gap-4 sm:gap-8">
                  {podiumSlots.map(({ place, person }) => {
                    if (!person) return null;
                    const barH = 48 + Math.round((person.diamonds / maxPodium) * 96);
                    return (
                      <Link
                        key={person.id}
                        href={path(`/creadores/${person.id}`)}
                        className="flex w-24 flex-col items-center sm:w-32"
                      >
                        <TikTokAvatar
                          username={person.tiktokUser ?? person.name}
                          name={person.name}
                          size={place === 1 ? 56 : 44}
                        />
                        <p className="mt-2 w-full truncate text-center text-sm font-semibold">
                          {person.name}
                        </p>
                        <p className="text-xs tabular-nums text-text-muted">
                          {formatNumber(person.diamonds)} ◆
                        </p>
                        <div
                          className={cn(
                            "mt-3 flex w-full items-end justify-center rounded-t-2xl text-base font-bold",
                            place === 1
                              ? "bg-gradient-to-t from-warning/40 to-warning/10 text-warning"
                              : place === 2
                                ? "bg-gradient-to-t from-cyan/30 to-cyan/5 text-cyan"
                                : "bg-gradient-to-t from-accent/30 to-accent/5 text-accent"
                          )}
                          style={{ height: barH }}
                        >
                          {place}°
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                    Check-in
                  </p>
                  <Flag className="h-4 w-4 text-warning" />
                </div>
                <ul className="space-y-2">
                  {hub.checkin.atRisk.length === 0 && (
                    <li className="text-sm text-text-muted">Nadie en riesgo.</li>
                  )}
                  {hub.checkin.atRisk.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={path(`/creadores/${c.id}`)}
                        className="text-sm hover:text-accent"
                      >
                        {c.name}{" "}
                        <span className="text-text-muted">
                          · {formatNumber(c.diamonds)} ◆ · {c.days}d
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
                Alertas accionables
              </h2>
              {hub.checkin.atRisk.length > 0 && podiumSlots.length > 0 && (
                <p className="mt-0.5 text-xs text-text-muted">
                  {hub.checkin.atRisk.length} en riesgo este mes
                </p>
              )}
            </div>
            <span className="rounded-full border border-border-soft px-2.5 py-0.5 text-xs text-text-muted">
              {hub.alerts.length}
            </span>
          </div>
          <ul className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
            {hub.alerts.length === 0 && (
              <li className="py-6 text-sm text-text-muted">
                Sin alertas. El roster va bien.
              </li>
            )}
            {hub.alerts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-soft bg-bg px-3.5 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={path(`/creadores/${a.creatorId}`)}
                    className="text-sm font-medium hover:text-accent"
                  >
                    {a.name}
                  </Link>
                  <p
                    className={cn(
                      "mt-0.5 truncate text-xs",
                      a.severity === "danger"
                        ? "text-danger"
                        : a.severity === "cyan"
                          ? "text-cyan"
                          : "text-warning"
                    )}
                  >
                    {a.label}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    title="WhatsApp"
                    className="rounded-lg border border-border p-2 text-success hover:bg-success/10"
                    onClick={() => openWa(a)}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Crear tarea"
                    className="rounded-lg border border-border p-2 text-text-muted hover:text-accent"
                    onClick={() => void quickTask(a.creatorId, a.label)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="xl:col-span-5">
          <h2 className="mb-5 font-[family-name:var(--font-syne)] text-lg font-semibold">
            Ranking managers
          </h2>
          <ul className="space-y-3">
            {hub.managers.length === 0 && (
              <li className="text-sm text-text-muted">Aún no hay managers.</li>
            )}
            {hub.managers.map((m, i) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="w-full rounded-xl border border-border-soft bg-bg px-3.5 py-3 text-left hover:border-cyan/40"
                  onClick={() => setViewAs(m.id, m.name)}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      #{i + 1} {m.name}
                    </span>
                    <span className="tabular-nums text-text-muted">
                      {formatNumber(m.diamonds)} ◆
                    </span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-bg-hover">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${Math.max(4, (m.diamonds / maxManager) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-text-muted">
                    {m.active} activos · {m.hours.toFixed(0)}h
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      {hub.goals.length > 0 && (
        <section>
          <Panel>
            <h2 className="mb-5 font-[family-name:var(--font-syne)] text-lg font-semibold">
              Metas individuales
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {hub.goals.map((g) => {
                const pct =
                  g.targetDiamonds > 0
                    ? Math.min(100, (g.diamonds / g.targetDiamonds) * 100)
                    : 0;
                return (
                  <li
                    key={g.id}
                    className="rounded-xl border border-border-soft bg-bg p-4"
                  >
                    <Link
                      href={path(`/creadores/${g.id}`)}
                      className="font-medium hover:text-accent"
                    >
                      {g.name}
                    </Link>
                    <p className="mt-1.5 text-sm tabular-nums text-text-muted">
                      {formatNumber(g.diamonds)} / {formatNumber(g.targetDiamonds)}
                    </p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-hover">
                      <div
                        className="h-full rounded-full bg-cyan"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <div className="mb-5 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-accent" />
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
              Por nicho
            </h2>
          </div>
          <MiniBars items={hub.niches} tone="accent" />
        </Panel>
        <Panel>
          <div className="mb-5 flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-cyan" />
            <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
              Por país
            </h2>
          </div>
          <MiniBars items={hub.countries} tone="cyan" />
        </Panel>
      </section>

      <section>
        <Panel>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-cyan" />
              <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
                Lives de esta semana
              </h2>
            </div>
            <Link
              href={path("/calendario")}
              className="text-sm text-accent hover:underline"
            >
              Abrir calendario
            </Link>
          </div>
          {hub.calendar.length === 0 ? (
            <p className="py-4 text-sm text-text-muted">
              Aún no hay lives agendados. Ábrelos en Calendario.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {hub.calendar.slice(0, 8).map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-border-soft bg-bg px-3.5 py-3 text-sm"
                >
                  <span className="font-medium">{s.creatorName}</span>
                  <span className="mt-0.5 block text-text-muted">
                    {new Date(s.startAt).toLocaleString("es-MX", {
                      weekday: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {s.durationMin} min
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  );
}
