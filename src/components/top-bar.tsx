"use client";

import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { data } = useSession();

  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-border-soft pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="pl-12 lg:pl-0">
        <p className="mb-1 text-xs uppercase tracking-[0.2em] text-cyan">
          Agencia Streamers
        </p>
        <h1 className="font-[family-name:var(--font-syne)] text-3xl font-bold tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm">
          <span className="text-text-muted">Hola, </span>
          <span className="font-medium">{data?.user?.name ?? "Manager"}</span>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-text-muted transition hover:border-accent hover:text-accent"
        >
          <LogOut className="h-4 w-4" />
          Salir
        </button>
      </div>
    </header>
  );
}
