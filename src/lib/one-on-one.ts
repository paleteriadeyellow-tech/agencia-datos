export const CALL_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

export function isCallSlot(slot: string) {
  return /^\d{2}:(00|30)$/.test(slot) && Number(slot.slice(0, 2)) <= 23;
}

export const WEEKDAYS_ES = [
  "DOMINGO",
  "LUNES",
  "MARTES",
  "MIÉRCOLES",
  "JUEVES",
  "VIERNES",
  "SÁBADO",
] as const;

export function slotLabel(slot: string) {
  const [hRaw, m] = slot.split(":");
  const h = Number(hRaw);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h12}:${m} ${ampm}`;
}

export function ymdFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysOfWeek(weekStart: string) {
  const [y, m, d] = weekStart.split("-").map(Number);
  const start = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    const year = dt.getFullYear();
    const month = dt.getMonth() + 1;
    const day = dt.getDate();
    return {
      date: ymdFromParts(year, month, day),
      day,
      weekday: WEEKDAYS_ES[dt.getDay()] ?? "",
      label: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${String(year).slice(-2)}`,
    };
  });
}

export function weekRangeYmd(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  const end = new Date(x);
  end.setDate(x.getDate() + 6);
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return { start: fmt(x), end: fmt(end) };
}

export function splitMonthByWeek<T extends { date: string }>(days: T[], today = new Date()) {
  const { start, end } = weekRangeYmd(today);
  const current: T[] = [];
  const later: T[] = [];
  const earlier: T[] = [];
  for (const d of days) {
    if (d.date >= start && d.date <= end) current.push(d);
    else if (d.date > end) later.push(d);
    else earlier.push(d);
  }
  return { current, later, earlier, weekStart: start, weekEnd: end };
}

export function callKey(date: string, slot: string) {
  return `${date}|${slot}`;
}

export function isCallEmpty(row: {
  creatorName?: string;
  top?: string;
  reason?: string;
  needF?: string;
  needO?: string;
  needD?: string;
  needA?: string;
}) {
  return ![
    row.creatorName,
    row.top,
    row.reason,
    row.needF,
    row.needO,
    row.needD,
    row.needA,
  ].some((v) => (v ?? "").trim());
}
