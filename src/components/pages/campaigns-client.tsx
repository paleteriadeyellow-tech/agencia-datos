"use client";

import { useMemo, useState } from "react";
import {
  CalendarRange,
  Clock3,
  Gem,
  Target,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { CampaignForm, type CampaignInitial } from "@/components/campaign-form";
import { StatusBadge } from "@/components/status-badge";
import { PanelLoadError } from "@/components/panel-load-error";
import { EventCountdown, useEventCountdown } from "@/components/event-countdown";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { Modal } from "@/components/modal";
import { Button, Panel } from "@/components/ui";
import { formatDate, formatNumber, cn } from "@/lib/utils";
import { PANEL, usePanelData } from "@/lib/swr";
import { useCreatorsRoster } from "@/lib/use-creators-roster";
import { deleteCampaign } from "@/lib/actions";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  targetDiamonds: number;
  targetHours: number;
  status: string;
  assignedCreatorIds?: string[];
  creators: {
    id: string;
    name: string;
    tiktokUser?: string | null;
    progressDiamonds: number;
    progressHours: number;
  }[];
};

const PREVIEW_PARTICIPANTS = 3;

function ProgressBlock({
  label,
  icon: Icon,
  current,
  target,
  formatCurrent,
  tone,
  compact,
}: {
  label: string;
  icon: typeof Gem;
  current: number;
  target: number;
  formatCurrent: (n: number) => string;
  tone: "accent" | "cyan";
  compact?: boolean;
}) {
  const pct =
    target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const bar = tone === "accent" ? "bg-accent" : "bg-cyan";

  return (
    <div
      className={cn(
        "rounded-xl border border-border-soft bg-bg",
        compact ? "p-3" : "p-4"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2",
          compact ? "mb-1.5" : "mb-3"
        )}
      >
        <div className="flex items-center gap-2 text-xs text-text-muted sm:text-sm">
          <Icon
            className={cn(
              "h-3.5 w-3.5",
              tone === "accent" ? "text-accent" : "text-cyan"
            )}
          />
          {label}
        </div>
        <span className="font-[family-name:var(--font-syne)] text-xs font-bold sm:text-sm">
          {pct}%
        </span>
      </div>
      <p
        className={cn(
          "font-[family-name:var(--font-syne)] font-semibold tracking-tight",
          compact ? "mb-1.5 text-sm" : "mb-2 text-lg"
        )}
      >
        {formatCurrent(current)}
        <span className="text-xs font-normal text-text-muted sm:text-sm">
          {" "}
          / {formatCurrent(target)}
        </span>
      </p>
      <div
        className={cn(
          "overflow-hidden rounded-full bg-bg-hover",
          compact ? "h-1.5" : "h-2.5"
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            bar
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CampaignCard({
  campaign: c,
  onEdit,
  onDeleted,
}: {
  campaign: Campaign;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const countdown = useEventCountdown(c.startDate, c.endDate);
  const progressD = c.creators.reduce((a, x) => a + x.progressDiamonds, 0);
  const progressH = c.creators.reduce((a, x) => a + x.progressHours, 0);
  const ranked = [...c.creators].sort(
    (a, b) => b.progressDiamonds - a.progressDiamonds
  );
  const visible = expanded
    ? ranked
    : ranked.slice(0, PREVIEW_PARTICIPANTS);
  const pctD =
    c.targetDiamonds > 0
      ? Math.min(100, Math.round((progressD / c.targetDiamonds) * 100))
      : 0;
  const pctH =
    c.targetHours > 0
      ? Math.min(100, Math.round((progressH / c.targetHours) * 100))
      : 0;

  async function onDelete() {
    if (
      !confirm(
        `¿Eliminar la campaña “${c.name}”? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await deleteCampaign(c.id);
    setBusy(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    onDeleted();
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-border-soft bg-bg-panel">
      <div className="h-1 bg-gradient-to-r from-accent via-accent/70 to-cyan/60" />

      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-[family-name:var(--font-syne)] text-xl font-bold tracking-tight sm:text-2xl">
                {c.name}
              </h2>
              <StatusBadge status={c.status} />
            </div>
            {expanded && c.description && (
              <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
                {c.description}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1.5 rounded-lg border border-border-soft bg-bg px-2.5 py-1.5 text-xs text-text-muted">
              <Target className="h-3.5 w-3.5 text-accent" />
              {c.creators.length}
            </div>
            <button
              type="button"
              title="Editar campaña"
              onClick={onEdit}
              className="rounded-lg border border-border p-1.5 text-text-muted hover:border-cyan hover:text-cyan"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Eliminar campaña"
              disabled={busy}
              onClick={() => void onDelete()}
              className="rounded-lg border border-border p-1.5 text-text-muted hover:border-danger hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1">
            <CalendarRange className="h-3.5 w-3.5 text-cyan" />
            {formatDate(c.startDate)} → {formatDate(c.endDate)}
          </span>
          {countdown.phase !== "ended" ? (
            <span className="tabular-nums text-accent">
              {countdown.label}: {countdown.days}d {countdown.hours}h{" "}
              {countdown.minutes}m
            </span>
          ) : (
            <span>Finalizada</span>
          )}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border-soft bg-bg px-3 py-2">
            <div className="mb-1 flex items-center justify-between text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-1">
                <Gem className="h-3 w-3 text-accent" /> Diamantes
              </span>
              <span className="font-semibold text-text">{pctD}%</span>
            </div>
            <p className="mb-1.5 text-sm font-semibold tabular-nums">
              {formatNumber(progressD)}
              <span className="text-xs font-normal text-text-muted">
                {" "}
                / {formatNumber(c.targetDiamonds)}
              </span>
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${pctD}%` }}
              />
            </div>
          </div>
          <div className="rounded-lg border border-border-soft bg-bg px-3 py-2">
            <div className="mb-1 flex items-center justify-between text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3 w-3 text-cyan" /> Horas LIVE
              </span>
              <span className="font-semibold text-text">{pctH}%</span>
            </div>
            <p className="mb-1.5 text-sm font-semibold tabular-nums">
              {progressH.toFixed(1)}
              <span className="text-xs font-normal text-text-muted">
                {" "}
                / {c.targetHours.toFixed(1)}
              </span>
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
              <div
                className="h-full rounded-full bg-cyan"
                style={{ width: `${pctH}%` }}
              />
            </div>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-border-soft bg-bg p-3">
                  <p className="mb-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-muted">
                    <CalendarRange className="h-3 w-3 text-cyan" />
                    Inicio
                  </p>
                  <p className="font-[family-name:var(--font-syne)] text-base font-semibold">
                    {formatDate(c.startDate)}
                  </p>
                </div>
                <div className="rounded-xl border border-border-soft bg-bg p-3">
                  <p className="mb-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-muted">
                    <Clock3 className="h-3 w-3 text-accent" />
                    Fin
                  </p>
                  <p className="font-[family-name:var(--font-syne)] text-base font-semibold">
                    {formatDate(c.endDate)}
                  </p>
                </div>
              </div>
              <EventCountdown startDate={c.startDate} endDate={c.endDate} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <ProgressBlock
                label="Meta de diamantes"
                icon={Gem}
                current={progressD}
                target={c.targetDiamonds}
                formatCurrent={formatNumber}
                tone="accent"
                compact
              />
              <ProgressBlock
                label="Meta de horas LIVE"
                icon={Clock3}
                current={progressH}
                target={c.targetHours}
                formatCurrent={(n) => n.toFixed(1)}
                tone="cyan"
                compact
              />
            </div>
          </div>
        )}

        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Participantes
            {!expanded && ranked.length > PREVIEW_PARTICIPANTS && (
              <span className="ml-1 font-normal normal-case tracking-normal">
                · top {PREVIEW_PARTICIPANTS}
              </span>
            )}
          </p>
          {ranked.length === 0 ? (
            <p className="text-sm text-text-muted">
              Sin datos aún. Importa el Excel en Control de diamantes para el
              mes de esta campaña.
            </p>
          ) : (
            <ul
              className={cn(
                "grid gap-1.5",
                expanded ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-3"
              )}
            >
              {visible.map((cc, i) => (
                <li
                  key={cc.id}
                  className="flex items-center gap-2.5 rounded-lg border border-border-soft bg-bg px-2.5 py-2"
                >
                  <span className="w-4 text-center text-[10px] font-bold text-text-muted">
                    #{i + 1}
                  </span>
                  <TikTokAvatar
                    username={cc.tiktokUser}
                    name={cc.name}
                    size={expanded ? 28 : 24}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium sm:text-sm">
                      {cc.name}
                    </p>
                    <p className="text-[10px] text-text-muted sm:text-xs">
                      {formatNumber(cc.progressDiamonds)} ◆ ·{" "}
                      {cc.progressHours.toFixed(1)}h
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            variant="ghost"
            className="text-xs text-cyan hover:text-cyan"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4" /> Ver menos
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" /> Ver más
                {ranked.length > PREVIEW_PARTICIPANTS
                  ? ` (+${ranked.length - PREVIEW_PARTICIPANTS})`
                  : ""}
              </>
            )}
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function CampaignsClient() {
  const [editing, setEditing] = useState<CampaignInitial | null>(null);
  const { creators: rosterCreators } = useCreatorsRoster();
  const { data, error, mutate } = usePanelData(PANEL.ops) as {
    data?: {
      creators: {
        id: string;
        name: string;
        tiktokUser?: string | null;
        diamonds?: number;
      }[];
      campaigns: Campaign[];
    };
    error?: Error;
    mutate: () => void;
  };

  const formCreators = useMemo(() => {
    if (rosterCreators.length) {
      return rosterCreators.map((c) => ({
        id: c.id,
        name: c.name,
        tiktokUser: c.tiktokUser,
        diamonds: c.diamonds ?? 0,
      }));
    }
    return data?.creators ?? [];
  }, [rosterCreators, data?.creators]);

  if (error) {
    return (
      <div>
        <TopBar
          title="Campañas"
          subtitle="Progreso desde Control de diamantes · metas y leaderboard del roster"
        />
        <PanelLoadError onRetry={() => mutate()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <TopBar
          title="Campañas"
          subtitle="Progreso desde Control de diamantes · metas y leaderboard del roster"
        />
        <div className="glass-panel h-64 animate-pulse rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title="Campañas"
        subtitle="Progreso desde Control de diamantes · metas y leaderboard del roster"
      />
      <div className="mb-6">
        <CampaignForm creators={formCreators} onSaved={() => mutate()} />
      </div>
      <div className="space-y-4">
        {data.campaigns.length === 0 && (
          <Panel>
            <p className="text-sm text-text-muted">Aún no hay campañas.</p>
          </Panel>
        )}
        {data.campaigns.map((c) => (
          <CampaignCard
            key={c.id}
            campaign={c}
            onEdit={() =>
              setEditing({
                id: c.id,
                name: c.name,
                description: c.description,
                startDate: c.startDate,
                endDate: c.endDate,
                targetDiamonds: c.targetDiamonds,
                targetHours: c.targetHours,
                status: c.status,
                assignedCreatorIds: c.assignedCreatorIds ?? [],
              })
            }
            onDeleted={() => mutate()}
          />
        ))}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Editar campaña"
        subtitle={editing?.name}
        wide
      >
        {editing && (
          <CampaignForm
            embedded
            creators={formCreators}
            initial={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              mutate();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
