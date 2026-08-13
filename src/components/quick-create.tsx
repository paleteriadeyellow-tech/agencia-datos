"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Modal } from "@/components/modal";
import { CreatorForm } from "@/components/creator-form";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";

type QuickCreateCtx = {
  openCreateCreator: () => void;
};

const Ctx = createContext<QuickCreateCtx>({
  openCreateCreator: () => {},
});

export function useQuickCreate() {
  return useContext(Ctx);
}

export function QuickCreateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { data } = usePanelData(PANEL.creators) as {
    data?: { managers?: { id: string; name: string }[] };
  };

  const openCreateCreator = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ openCreateCreator }), [openCreateCreator]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo creador"
        subtitle="Nombre, teléfono, nicho y fecha de incorporación"
        wide
      >
        <CreatorForm
          managers={data?.managers ?? []}
          embedded
          onDone={() => {
            setOpen(false);
            invalidatePanel(
              PANEL.creators,
              PANEL.dashboard,
              PANEL.ops,
              PANEL.tasks,
              PANEL.metrics,
              PANEL.livecoins
            );
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </Ctx.Provider>
  );
}
