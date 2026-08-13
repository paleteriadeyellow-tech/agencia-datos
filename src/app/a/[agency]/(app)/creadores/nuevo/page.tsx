"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuickCreate } from "@/components/quick-create";
import { useAgency } from "@/lib/use-agency";

/** Compat: /creadores/nuevo abre el modal en /creadores */
export default function NewCreatorRedirectPage() {
  const router = useRouter();
  const { openCreateCreator } = useQuickCreate();
  const { path } = useAgency();

  useEffect(() => {
    const t = window.setTimeout(() => {
      openCreateCreator();
      router.replace(path("/creadores"));
    }, 0);
    return () => window.clearTimeout(t);
  }, [openCreateCreator, router, path]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-text-muted">
      Abriendo formulario…
    </div>
  );
}
