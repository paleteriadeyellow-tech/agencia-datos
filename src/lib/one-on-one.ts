export const CALL_SLOTS = [
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
  "18:30",
  "19:00",
  "19:30",
  "20:00",
] as const;

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

export function daysInMonth(year: number, month: number) {
  const last = new Date(year, month, 0).getDate();
  return Array.from({ length: last }, (_, i) => {
    const day = i + 1;
    const d = new Date(year, month - 1, day);
    return {
      date: ymdFromParts(year, month, day),
      day,
      weekday: WEEKDAYS_ES[d.getDay()] ?? "",
      label: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${String(year).slice(-2)}`,
    };
  });
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
