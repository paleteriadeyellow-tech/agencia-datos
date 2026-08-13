"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function NavigationProgress({ pending }: { pending: boolean }) {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pending) {
      setVisible(true);
      setWidth(18);
      const t1 = setTimeout(() => setWidth(42), 80);
      const t2 = setTimeout(() => setWidth(68), 220);
      const t3 = setTimeout(() => setWidth(82), 500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [pending]);

  useEffect(() => {
    if (!pending) {
      setWidth(100);
      const t = setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 180);
      return () => clearTimeout(t);
    }
  }, [pathname, pending]);

  if (!visible && width === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
      <div
        className="h-full bg-gradient-to-r from-accent via-cyan to-accent transition-[width] duration-200 ease-out"
        style={{ width: `${width}%`, opacity: visible ? 1 : 0 }}
      />
    </div>
  );
}
