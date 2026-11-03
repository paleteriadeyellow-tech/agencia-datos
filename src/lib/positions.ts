/** Puestos de trabajo: definen qué tareas fijas le llegan a cada persona en "Mi día". */
export const POSITIONS = ["administracion", "mentor", "reclutador", "creador"] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABEL: Record<Position, string> = {
  administracion: "Administración",
  mentor: "Mentor",
  reclutador: "Reclutador",
  creador: "Creador",
};

export function isPosition(v: unknown): v is Position {
  return typeof v === "string" && (POSITIONS as readonly string[]).includes(v);
}

export const RECURRENCES = ["diaria", "semanal", "mensual"] as const;
export const WEEKDAY_LABEL = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
