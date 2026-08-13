"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuickCreate } from "@/components/quick-create";

/** Compat: /creadores/nuevo abre el modal en /creadores */
export default function NewCreatorRedirectPage() {
  const router = useRouter();
  const { openCreateCreator } = useQuickCreate();

  useEffect(() => {
    const t = window.setTimeout(() => {
      openCreateCreator();
      router.replace("/creadores");
    }, 0);
    return () => window.clearTimeout(t);
  }, [openCreateCreator, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-text-muted">
      Abriendo formulario…
    </div>
  );
}
