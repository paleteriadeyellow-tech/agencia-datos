"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { inputClass } from "@/components/ui";

export function CreatorsFilters({
  niches,
  groups,
  current,
}: {
  niches: string[];
  groups: string[];
  current: { q?: string; niche?: string; status?: string; group?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(current.q ?? "");

  function push(next: {
    q?: string;
    niche?: string;
    status?: string;
    group?: string;
  }) {
    const params = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          push({ ...current, q });
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nombre / teléfono…"
          className={`${inputClass} w-56`}
        />
      </form>
      <select
        className={`${inputClass} w-36`}
        value={current.niche ?? ""}
        onChange={(e) => push({ ...current, niche: e.target.value || undefined })}
      >
        <option value="">Todos los nichos</option>
        {niches.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <select
        className={`${inputClass} w-36`}
        value={current.status ?? ""}
        onChange={(e) =>
          push({ ...current, status: e.target.value || undefined })
        }
      >
        <option value="">Todos los estados</option>
        <option value="activo">Activo</option>
        <option value="pausado">Pausado</option>
        <option value="baja">Baja</option>
      </select>
      <select
        className={`${inputClass} w-36`}
        value={current.group ?? ""}
        onChange={(e) =>
          push({ ...current, group: e.target.value || undefined })
        }
      >
        <option value="">Todos los grupos</option>
        {groups.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </div>
  );
}
