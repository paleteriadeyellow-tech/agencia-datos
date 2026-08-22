export const BATTLE_COLUMNS = [
  { id: "noQuieren", label: "No quieren batallas" },
  { id: "novatos", label: "Novatos" },
  { id: "interna", label: "Interna" },
  { id: "agencia", label: "Agencia" },
  { id: "oficial", label: "Oficial" },
  { id: "amistosa", label: "Amistosa" },
  { id: "programada", label: "Programada por ellos" },
  { id: "cumpleanos", label: "Cumpleaños" },
  { id: "extensibles", label: "Extensibles" },
  { id: "eventos", label: "Eventos de agencia" },
] as const;

export type BattleColumnId = (typeof BATTLE_COLUMNS)[number]["id"];

export const BATTLE_COLUMN_IDS = BATTLE_COLUMNS.map((c) => c.id);

export const BATTLE_COLORS = [
  { id: "none", label: "Sin color", className: "bg-bg-panel border-border-soft" },
  { id: "yellow", label: "Amarillo", className: "bg-amber-400/25 border-amber-300/50" },
  { id: "green", label: "Verde", className: "bg-emerald-500/25 border-emerald-400/50" },
  { id: "orange", label: "Naranja", className: "bg-orange-500/30 border-orange-400/50" },
  { id: "red", label: "Rojo", className: "bg-rose-500/30 border-rose-400/50" },
  { id: "cyan", label: "Azul", className: "bg-sky-500/25 border-sky-400/50" },
  { id: "gray", label: "Gris", className: "bg-zinc-500/30 border-zinc-400/40" },
] as const;

export function battleColorClass(color: string) {
  return BATTLE_COLORS.find((c) => c.id === color)?.className ?? BATTLE_COLORS[0]!.className;
}

export function isBattleColumn(value: string): value is BattleColumnId {
  return BATTLE_COLUMN_IDS.includes(value as BattleColumnId);
}
