import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  activo: "bg-success/15 text-success",
  pausado: "bg-warning/15 text-warning",
  baja: "bg-danger/15 text-danger",
  pendiente: "bg-warning/15 text-warning",
  en_progreso: "bg-cyan/15 text-cyan",
  hecha: "bg-success/15 text-success",
  planeado: "bg-cyan/15 text-cyan",
  cumplido: "bg-success/15 text-success",
  "faltó": "bg-danger/15 text-danger",
  cancelado: "bg-text-muted/15 text-text-muted",
  activa: "bg-accent/15 text-accent",
  finalizada: "bg-text-muted/15 text-text-muted",
  borrador: "bg-warning/15 text-warning",
  pagado: "bg-success/15 text-success",
  vencido: "bg-danger/15 text-danger",
  alta: "bg-danger/15 text-danger",
  media: "bg-warning/15 text-warning",
  baja_prio: "bg-text-muted/15 text-text-muted",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = status === "baja" && className?.includes("prio") ? "baja_prio" : status;
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize",
        styles[key] ?? "bg-bg-hover text-text-muted",
        className
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}
