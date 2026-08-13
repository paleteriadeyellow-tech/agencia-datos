"use client";

import { useEffect, useMemo, useState } from "react";

export type CountdownPhase = "upcoming" | "live" | "ended";

export type CountdownParts = {
  phase: CountdownPhase;
  label: string;
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function getCountdown(
  startDate: string | Date,
  endDate: string | Date,
  now = new Date()
): CountdownParts {
  const start = startOfDay(new Date(startDate));
  const end = endOfDay(new Date(endDate));

  let phase: CountdownPhase;
  let target: Date;
  let label: string;

  if (now < start) {
    phase = "upcoming";
    target = start;
    label = "Empieza en";
  } else if (now <= end) {
    phase = "live";
    target = end;
    label = "Termina en";
  } else {
    phase = "ended";
    target = end;
    label = "Evento finalizado";
  }

  const totalMs = Math.max(0, target.getTime() - now.getTime());
  const totalSec = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  return { phase, label, totalMs, days, hours, minutes, seconds };
}

export function useEventCountdown(startDate: string, endDate: string) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(
    () => getCountdown(startDate, endDate, now),
    [startDate, endDate, now]
  );
}

function Digits({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="flex min-w-[3.25rem] flex-col items-center rounded-xl border border-border-soft bg-bg px-2 py-2 sm:min-w-[3.75rem]">
      <span className="font-[family-name:var(--font-syne)] text-xl font-bold tabular-nums sm:text-2xl">
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-0.5 text-[10px] uppercase tracking-wider text-text-muted">
        {unit}
      </span>
    </div>
  );
}

export function EventCountdown({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  const c = useEventCountdown(startDate, endDate);

  const tone =
    c.phase === "upcoming"
      ? "text-cyan"
      : c.phase === "live"
        ? "text-accent"
        : "text-text-muted";

  return (
    <div className="rounded-2xl border border-border-soft bg-bg/80 p-4">
      <p className={`mb-3 text-xs font-semibold uppercase tracking-[0.18em] ${tone}`}>
        {c.label}
      </p>
      {c.phase === "ended" ? (
        <p className="font-[family-name:var(--font-syne)] text-lg font-semibold text-text-muted">
          La campaña ya terminó
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Digits value={c.days} unit="días" />
          <Digits value={c.hours} unit="hrs" />
          <Digits value={c.minutes} unit="min" />
          <Digits value={c.seconds} unit="seg" />
        </div>
      )}
    </div>
  );
}
