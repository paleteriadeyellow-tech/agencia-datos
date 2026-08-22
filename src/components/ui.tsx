import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen lg:pl-64">
      <main className="mx-auto w-full max-w-[1600px] px-3 py-6 sm:px-4 lg:px-5">{children}</main>
    </div>
  );
}

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("glass-panel rounded-xl p-5", className)}>{children}</div>
  );
}

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const variants = {
    primary: "bg-accent text-white hover:brightness-110",
    secondary:
      "border border-border bg-bg-panel text-text hover:bg-bg-hover",
    ghost: "text-text-muted hover:bg-bg-hover hover:text-text",
    danger: "bg-danger/20 text-danger hover:bg-danger/30",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  className,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      prefetch
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition",
        variant === "primary"
          ? "bg-accent text-white hover:brightness-110"
          : "border border-border bg-bg-panel text-text hover:bg-bg-hover",
        className
      )}
    >
      {children}
    </Link>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none transition placeholder:text-text-muted/60 focus:border-accent";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <h3 className="font-[family-name:var(--font-syne)] text-xl font-semibold">
        {title}
      </h3>
      <p className="mt-2 max-w-md text-sm text-text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
