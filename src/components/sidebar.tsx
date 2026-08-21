"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Megaphone,
  Wallet,
  FileText,
  Gift,
  UserCog,
  Gem,
  Smartphone,
  Send,
  MessageCircle,
  Radio,
  CalendarDays,
  Menu,
  X,
  ArrowLeftRight,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { filterNavByRole } from "@/lib/permissions";
import { useNavPending } from "@/components/app-providers";
import { useAgency } from "@/lib/use-agency";
import { useViewAs } from "@/components/view-as";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/creadores", label: "Creadores", icon: Users },
  { href: "/control-diamantes", label: "Control de diamantes", icon: Gem },
  { href: "/metricas", label: "App livecoins", icon: Smartphone },
  { href: "/envio-kpi", label: "Envío de KPI", icon: Send },
  { href: "/mensajes-wa", label: "Mensajes WhatsApp", icon: MessageCircle },
  { href: "/tareas", label: "Tareas", icon: CheckSquare },
  { href: "/campanas", label: "Campañas", icon: Megaphone },
  { href: "/calendario", label: "Calendario LIVE", icon: CalendarDays },
  { href: "/finanzas", label: "Finanzas", icon: Wallet },
  { href: "/bonos", label: "Bonos", icon: Gift },
  { href: "/contratos", label: "Contratos", icon: FileText },
  { href: "/managers", label: "Managers", icon: UserCog },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { pending, startNav } = useNavPending();
  const { slug, shortName, path } = useAgency();
  const { viewAsName } = useViewAs();
  const [open, setOpen] = useState(false);

  const role = session?.user?.role;
  const visibleNav = useMemo(() => filterNavByRole(nav, role), [role]);

  useEffect(() => {
    ["/dashboard", "/creadores", "/metricas"].forEach((href) =>
      router.prefetch(path(href))
    );
  }, [router, path]);

  const content = (
    <aside className="flex h-full w-64 flex-col border-r border-border-soft bg-bg-elevated">
      <div className="flex items-center gap-3 border-b border-border-soft px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
          <Radio className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-[family-name:var(--font-syne)] text-lg font-bold leading-none tracking-tight">
            {shortName}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {pending
              ? "Cargando…"
              : viewAsName
                ? `Vista · ${viewAsName}`
                : role === "admin"
                  ? "Admin · Backstage"
                  : role === "manager"
                    ? "Manager · Backstage"
                    : "Backstage"}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visibleNav.map((item) => {
          const href = path(item.href);
          const active =
            pathname === href || pathname.startsWith(href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={href}
              prefetch
              onClick={(e) => {
                if (active) {
                  e.preventDefault();
                  return;
                }
                startNav();
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                active
                  ? "bg-accent-soft text-white"
                  : "text-text-muted hover:bg-bg-hover hover:text-text",
                pending && !active && "opacity-70"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  active ? "text-accent" : "text-text-muted"
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-border-soft p-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs text-text-muted transition hover:text-accent"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          Cambiar agencia
        </Link>
        <p className="text-[10px] text-text-muted/70">Agencia: {slug}</p>
      </div>
    </aside>
  );

  return (
    <>
      <button
        type="button"
        className="fixed left-4 top-4 z-50 rounded-lg border border-border bg-bg-panel p-2 lg:hidden"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menú"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block">
        {content}
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0">{content}</div>
        </div>
      )}
    </>
  );
}
