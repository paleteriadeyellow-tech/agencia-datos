"use client";

import { ExternalLink } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { ContractForm } from "@/components/contract-form";
import { StatusBadge } from "@/components/status-badge";
import { PanelLoadError } from "@/components/panel-load-error";
import { Panel } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { PANEL, usePanelData } from "@/lib/swr";
import { useCreatorsRoster } from "@/lib/use-creators-roster";

export default function ContractsClient() {
  const { creators: roster } = useCreatorsRoster();
  const { data, error, mutate } = usePanelData(PANEL.ops) as {
    data?: {
      creators: { id: string; name: string }[];
      contracts: {
        id: string;
        title: string;
        creatorName: string;
        status: string;
        startDate: string | null;
        endDate: string | null;
        fileUrl: string | null;
      }[];
    };
    error?: Error;
    mutate: () => void;
  };

  const formCreators = roster.length
    ? roster.map((c) => ({ id: c.id, name: c.name }))
    : data?.creators ?? [];

  if (error) {
    return (
      <div>
        <TopBar
          title="Contratos"
          subtitle="Documentos y vigencia de acuerdos con creadores"
        />
        <PanelLoadError onRetry={() => mutate()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <TopBar
          title="Contratos"
          subtitle="Documentos y vigencia de acuerdos con creadores"
        />
        <div className="glass-panel h-64 animate-pulse rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title="Contratos"
        subtitle="Documentos y vigencia de acuerdos con creadores"
      />
      <div className="mb-6">
        <ContractForm creators={formCreators} onSaved={() => mutate()} />
      </div>
      <Panel className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border-soft text-xs uppercase text-text-muted">
            <tr>
              <th className="px-5 py-4 font-medium">Título</th>
              <th className="px-5 py-4 font-medium">Creador</th>
              <th className="px-5 py-4 font-medium">Vigencia</th>
              <th className="px-5 py-4 font-medium">Estado</th>
              <th className="px-5 py-4 font-medium">Archivo</th>
            </tr>
          </thead>
          <tbody>
            {data.contracts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-text-muted">
                  Sin contratos registrados.
                </td>
              </tr>
            )}
            {data.contracts.map((c) => (
              <tr key={c.id} className="border-b border-border-soft/60">
                <td className="px-5 py-3 font-medium">{c.title}</td>
                <td className="px-5 py-3">{c.creatorName}</td>
                <td className="px-5 py-3 text-text-muted">
                  {c.startDate ? formatDate(c.startDate) : "—"} →{" "}
                  {c.endDate ? formatDate(c.endDate) : "—"}
                </td>
                <td className="px-5 py-3"><StatusBadge status={c.status} /></td>
                <td className="px-5 py-3">
                  {c.fileUrl ? (
                    <a
                      href={c.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      Ver <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
