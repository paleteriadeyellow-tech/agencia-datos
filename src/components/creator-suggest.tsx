"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Field, inputClass } from "@/components/ui";
import { TikTokAvatar } from "@/components/tiktok-avatar";
import { cn } from "@/lib/utils";

export type SuggestCreator = {
  id?: string;
  nick: string;
  name: string;
  diamonds?: number;
};

type MenuPos = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
};

/**
 * Desplegable Usuario: @streamer + avatar + nick.
 * Menú en portal para que no lo recorte el modal.
 */
export function CreatorSuggestInput({
  value,
  onChange,
  onPick,
  creators,
  label = "Usuario",
  placeholder = "@streamer",
  required,
  className,
  excludeNicks,
  clearOnPick = false,
  keepOpenOnPick = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onPick?: (creator: SuggestCreator) => void;
  creators: SuggestCreator[];
  label?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  excludeNicks?: Set<string>;
  clearOnPick?: boolean;
  keepOpenOnPick?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const ignoreCloseRef = useRef(false);

  useEffect(() => setMounted(true), []);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase().replace(/^@/, "");
    const filtered = creators.filter((c) => {
      if (!c.nick?.trim()) return false;
      if (excludeNicks?.has(c.nick.toLowerCase())) return false;
      if (!q) return true;
      return (
        c.nick.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      );
    });

    filtered.sort((a, b) => {
      const da = a.diamonds ?? 0;
      const db = b.diamonds ?? 0;
      if (db !== da) return db - da;
      return a.nick.localeCompare(b.nick);
    });

    // Todos los coincidentes (misma lista que Creadores)
    return filtered;
  }, [creators, value, excludeNicks]);

  const totalCreators = creators.filter((c) => c.nick?.trim()).length;

  function updatePos() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuH = 288;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < Math.min(menuH, 160) && r.top > spaceBelow;

    if (openUp) {
      setPos({
        left: r.left,
        width: r.width,
        bottom: window.innerHeight - r.top + 4,
      });
    } else {
      setPos({
        left: r.left,
        width: r.width,
        top: r.bottom + 4,
      });
    }
  }

  function openMenu() {
    setOpen(true);
    requestAnimationFrame(updatePos);
  }

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
    function onMove() {
      updatePos();
    }
    window.addEventListener("resize", onMove);
    document.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      document.removeEventListener("scroll", onMove, true);
    };
  }, [open, suggestions.length, value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ignoreCloseRef.current) return;
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    // click (no mousedown): evita cerrar en el mismo gesto de elegir
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  function pick(c: SuggestCreator) {
    ignoreCloseRef.current = true;
    onPick?.(c);
    if (clearOnPick) onChange("");
    else onChange(c.nick);

    if (keepOpenOnPick) {
      setOpen(true);
      requestAnimationFrame(() => {
        updatePos();
        inputRef.current?.focus();
        // liberar el ignore en el siguiente tick (después del click sintético/bubble)
        window.setTimeout(() => {
          ignoreCloseRef.current = false;
        }, 0);
      });
    } else {
      setOpen(false);
      window.setTimeout(() => {
        ignoreCloseRef.current = false;
      }, 0);
    }
  }

  const showMenu = open && suggestions.length > 0 && mounted && !!pos;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <Field label={label}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            openMenu();
          }}
          onFocus={openMenu}
          onClick={openMenu}
          onMouseDown={(e) => {
            // Si ya tiene foco, igual forzar menú al clic
            if (document.activeElement === e.currentTarget) {
              openMenu();
            }
          }}
          className={inputClass}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
      </Field>
      {showMenu &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[200] overflow-hidden rounded-xl border border-cyan/30 bg-bg-elevated shadow-xl"
            style={{
              left: pos!.left,
              width: pos!.width,
              top: pos!.top,
              bottom: pos!.bottom,
              maxHeight: 288,
            }}
          >
            <ul
              role="listbox"
              className="max-h-[15.5rem] overflow-y-auto py-1"
            >
              {suggestions.map((c) => (
                <li key={c.id ?? c.nick} role="option">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-cyan/10"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      pick(c);
                    }}
                  >
                    <TikTokAvatar
                      username={c.nick}
                      name={c.name}
                      size={28}
                      link={false}
                    />
                    <span className="truncate font-medium">{c.nick}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="border-t border-border-soft px-3 py-1.5 text-[10px] text-text-muted">
              {suggestions.length} de {totalCreators} · escribe para filtrar
            </p>
          </div>,
          document.body
        )}
    </div>
  );
}
