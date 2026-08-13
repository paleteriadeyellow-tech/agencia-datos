"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function cleanHandle(username?: string | null) {
  if (!username) return "";
  return username
    .trim()
    .replace(/^@/, "")
    .replace(/^tiktok:/i, "")
    .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "")
    .split(/[/?#]/)[0]
    .trim();
}

export function TikTokAvatar({
  username,
  name,
  size = 36,
  className,
  eager = false,
  link = true,
}: {
  username?: string | null;
  name: string;
  size?: number;
  className?: string;
  /** Cargar ya (listas desplegables). */
  eager?: boolean;
  /** Si false, no envuelve en enlace a TikTok. */
  link?: boolean;
}) {
  const handle = cleanHandle(username);
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(eager);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (eager) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager]);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [handle]);

  const initials = (name || handle || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  const src =
    handle && visible && !failed
      ? `/api/tiktok-avatar?u=${encodeURIComponent(handle)}`
      : null;

  const profileUrl = handle ? `https://www.tiktok.com/@${handle}` : null;

  const avatar = (
    <span
      ref={ref}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-hover text-[11px] font-semibold text-text-muted ring-1 ring-border-soft",
        profileUrl && link && "transition ring-offset-1 ring-offset-bg hover:ring-accent",
        className
      )}
      style={{ width: size, height: size }}
      title={handle ? `Abrir @${handle} en TikTok` : name}
    >
      {!loaded && <span className="absolute inset-0 animate-pulse bg-bg-hover" />}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          width={size}
          height={size}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className={cn(
            "relative h-full w-full object-cover transition-opacity",
            loaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true);
            setLoaded(true);
          }}
        />
      ) : null}
      {(!src || failed) && (
        <span className="relative z-[1]">{initials || "?"}</span>
      )}
    </span>
  );

  if (!link || !profileUrl) return avatar;

  return (
    <a
      href={profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0"
      onClick={(e) => e.stopPropagation()}
      aria-label={`Perfil de TikTok @${handle}`}
    >
      {avatar}
    </a>
  );
}
