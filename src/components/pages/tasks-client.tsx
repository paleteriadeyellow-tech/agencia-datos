"use client";

import { useMemo, useState } from "react";
import { TopBar } from "@/components/top-bar";
import { TaskForm, TaskBoard } from "@/components/task-forms";
import { PanelLoadError } from "@/components/panel-load-error";
import { Field, inputClass } from "@/components/ui";
import { MESES_NOMBRE, periodKey } from "@/lib/bonos";
import { PANEL, invalidatePanel, usePanelData } from "@/lib/swr";
import { useCreatorsRoster } from "@/lib/use-creators-roster";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  creator: { name: string } | null;
};

type TasksPayload = {
  period: string;
  creators: { id: string; name: string }[];
  tasks: TaskRow[];
};

export default function TasksClient() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const period = periodKey(anio, mes);
  const { creators: roster } = useCreatorsRoster();

  const years = useMemo(() => {
    const y0 = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => y0 - 4 + i);
  }, []);

  const url = `${PANEL.tasks}?period=${period}`;
  const { data, error, mutate } = usePanelData(url) as {
    data?: TasksPayload;
    error?: Error;
    mutate: (
      data?: TasksPayload | Promise<TasksPayload> | ((current?: TasksPayload) => TasksPayload | undefined),
      opts?: { revalidate?: boolean }
    ) => Promise<TasksPayload | undefined>;
  };

  const formCreators = useMemo(() => {
    if (roster.length) {
      return roster.map((c) => ({ id: c.id, name: c.name }));
    }
    return data?.creators ?? [];
  }, [roster, data?.creators]);

  async function moveTask(id: string, status: string) {
    // Optimistic: mueve al instante
    await mutate(
      (current) => {
        if (!current) return current;
        return {
          ...current,
          tasks: current.tasks.map((t) =>
            t.id === id ? { ...t, status } : t
          ),
        };
      },
      { revalidate: false }
    );

    try {
      const res = await fetch(PANEL.tasks, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error("fail");
      invalidatePanel(PANEL.dashboard);
    } catch {
      await mutate(); // rollback
    }
  }

  if (error) {
    return (
      <div>
        <TopBar
          title="Tareas"
          subtitle="Tablero por periodo"
        />
        <PanelLoadError onRetry={() => mutate()} />
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title="Tareas"
        subtitle={`${MESES_NOMBRE[mes]} ${anio} · movimiento instantáneo`}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Mes">
          <select
            className={inputClass}
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
          >
            {MESES_NOMBRE.slice(1).map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Año">
          <select
            className={inputClass}
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <p className="pb-2 text-xs text-text-muted">
          Periodo: {MESES_NOMBRE[mes]} {anio}
        </p>
      </div>

      {!data ? (
        <div className="glass-panel h-64 animate-pulse rounded-2xl" />
      ) : (
        <>
          <div className="mb-5">
            <TaskForm
              creators={formCreators}
              period={period}
              onSaved={() => {
                void mutate();
                invalidatePanel(PANEL.dashboard);
              }}
            />
          </div>
          <TaskBoard tasks={data.tasks} onMove={moveTask} />
        </>
      )}
    </div>
  );
}
