"use client";

import dynamic from "next/dynamic";

const BonosPage = dynamic(() => import("@/components/pages/bonos-client"), {
  ssr: false,
  loading: () => (
    <div className="space-y-4 pt-2">
      <div className="h-8 w-40 rounded bg-bg-hover" />
      <div className="glass-panel h-72 animate-pulse rounded-xl" />
    </div>
  ),
});

export default function Page() {
  return <BonosPage />;
}
