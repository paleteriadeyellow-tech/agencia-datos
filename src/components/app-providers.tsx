"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { NavigationProgress } from "@/components/navigation-progress";
import { QuickCreateProvider } from "@/components/quick-create";
import { prefetchPanel } from "@/lib/swr";
import { ViewAsProvider } from "@/components/view-as";

type NavCtx = {
  pending: boolean;
  startNav: () => void;
};

const Ctx = createContext<NavCtx>({ pending: false, startNav: () => {} });

export function useNavPending() {
  return useContext(Ctx);
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [pathname]);

  useEffect(() => {
    const t = window.setTimeout(() => prefetchPanel(), 800);
    return () => window.clearTimeout(t);
  }, []);

  const startNav = useCallback(() => {
    setPending(true);
  }, []);

  const value = useMemo(() => ({ pending, startNav }), [pending, startNav]);

  return (
    <Ctx.Provider value={value}>
      <ViewAsProvider>
        <QuickCreateProvider>
          <NavigationProgress pending={pending} />
          {children}
        </QuickCreateProvider>
      </ViewAsProvider>
    </Ctx.Provider>
  );
}
