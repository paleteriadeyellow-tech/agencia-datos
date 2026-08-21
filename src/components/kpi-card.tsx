import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "accent",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "accent" | "cyan" | "success" | "warning";
}) {
  const tones = {
    accent: "text-accent",
    cyan: "text-cyan",
    success: "text-success",
    warning: "text-warning",
  };

  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-text-muted">{label}</p>
        <Icon className={cn("h-4 w-4", tones[tone])} />
      </div>
      <p className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight sm:text-3xl">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
