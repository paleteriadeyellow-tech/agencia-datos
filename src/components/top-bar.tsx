"use client";

import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";
import { useAgency } from "@/lib/use-agency";
import { isAdmin } from "@/lib/permissions";
import { ViewAsSelect } from "@/components/view-as";
import { writeViewAsCookie } from "@/lib/view-as";

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { data } = useSession();
  const { name, path } = useAgency();
  const roleLabel = isAdmin(data?.user?.role) ? "Admin" : "Manager";

  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-border-soft pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="pl-12 lg:pl-0">
        <p className="mb-1 text-xs uppercase tracking-[0.2em] text-cyan">
          {name}
        </p>
        <h1 className="font-[family-name:var(--font-syne)] text-3xl font-bold tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ViewAsSelect />
        <div className="rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm">
          <span className="text-text-muted">Hola, </span>
          <span className="font-medium">{data?.user?.name ?? "Manager"}</span>
          <span className="ml-2 rounded border border-border-soft px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
            {roleLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            writeViewAsCookie(null);
            void signOut({ callbackUrl: path("/login") });
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-text-muted transition hover:border-accent hover:text-accent"
        >
          <LogOut className="h-4 w-4" />
          Salir
        </button>
      </div>
    </header>
  );
}
