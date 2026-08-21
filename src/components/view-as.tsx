"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import { Eye, X } from "lucide-react";
import { isAdmin } from "@/lib/permissions";
import { PANEL, usePanelData } from "@/lib/swr";
import { inputClass } from "@/components/ui";
import {
  getViewAsId,
  subscribeViewAs,
  writeViewAsCookie,
} from "@/lib/view-as";

type ManagerOpt = { id: string; name: string; role: string };

type ViewAsCtx = {
  viewAsId: string | null;
  viewAsName: string | null;
  setViewAs: (id: string | null, name?: string | null) => void;
};

const Ctx = createContext<ViewAsCtx>({
  viewAsId: null,
  viewAsName: null,
  setViewAs: () => {},
});

export function useViewAs() {
  return useContext(Ctx);
}

export function ViewAsProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const admin = isAdmin(session?.user?.role);
  const [viewAsId, setViewAsId] = useState<string | null>(null);
  const [viewAsName, setViewAsName] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) {
      setViewAsId(null);
      setViewAsName(null);
      return;
    }
    setViewAsId(getViewAsId());
    return subscribeViewAs(() => setViewAsId(getViewAsId()));
  }, [admin]);

  const { data } = usePanelData(admin ? PANEL.managers : null) as {
    data?: { managers: ManagerOpt[] };
  };

  const managers = useMemo(
    () => (data?.managers ?? []).filter((m) => m.role === "manager"),
    [data?.managers]
  );

  const resolvedName =
    viewAsName ??
    managers.find((m) => m.id === viewAsId)?.name ??
    null;

  const setViewAs = useCallback((id: string | null, name?: string | null) => {
    writeViewAsCookie(id);
    setViewAsId(id);
    setViewAsName(id ? name ?? null : null);
  }, []);

  const value = useMemo(
    () => ({
      viewAsId: admin ? viewAsId : null,
      viewAsName: admin ? resolvedName : null,
      setViewAs,
    }),
    [admin, viewAsId, resolvedName, setViewAs]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function ViewAsSelect() {
  const { data: session } = useSession();
  const admin = isAdmin(session?.user?.role);
  const { viewAsId, setViewAs } = useViewAs();
  const { data } = usePanelData(admin ? PANEL.managers : null) as {
    data?: { managers: ManagerOpt[] };
  };

  if (!admin) return null;

  const managers = (data?.managers ?? []).filter((m) => m.role === "manager");
  if (!managers.length && !viewAsId) return null;

  return (
    <label className="flex min-w-[180px] items-center gap-2">
      <Eye className="h-3.5 w-3.5 shrink-0 text-text-muted" />
      <select
        className={`${inputClass} py-2`}
        value={viewAsId ?? ""}
        aria-label="Cambiar vista de manager"
        onChange={(e) => {
          const id = e.target.value || null;
          const name = managers.find((m) => m.id === id)?.name ?? null;
          setViewAs(id, name);
        }}
      >
        <option value="">Vista agencia</option>
        {managers.map((m) => (
          <option key={m.id} value={m.id}>
            Vista de {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ViewAsBanner() {
  const { viewAsId, viewAsName, setViewAs } = useViewAs();
  if (!viewAsId) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan/30 bg-cyan/10 px-3 py-2 text-sm">
      <p>
        Viendo el panel como{" "}
        <span className="font-semibold">{viewAsName ?? "manager"}</span>
        <span className="text-text-muted">
          {" "}
          · solo sus creadores y diamantes
        </span>
      </p>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg-panel px-2.5 py-1 text-xs text-text-muted hover:text-text"
        onClick={() => setViewAs(null)}
      >
        <X className="h-3.5 w-3.5" />
        Volver a vista agencia
      </button>
    </div>
  );
}
