"use client";

import { Button, Panel } from "@/components/ui";

export function PanelLoadError({
  message = "No se pudo cargar esta página.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Panel className="border-danger/30 py-10 text-center">
      <p className="text-sm text-danger">{message}</p>
      {onRetry && (
        <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </Panel>
  );
}
