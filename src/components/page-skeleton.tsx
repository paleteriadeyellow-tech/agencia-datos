export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6 pt-2">
      <div className="space-y-3 border-b border-border-soft pb-5">
        <div className="h-3 w-40 rounded bg-bg-hover" />
        <div className="h-9 w-64 rounded-lg bg-bg-hover" />
        <div className="h-4 w-80 rounded bg-bg-hover/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-panel h-28 rounded-2xl p-5">
            <div className="mb-4 h-3 w-24 rounded bg-bg-hover" />
            <div className="h-8 w-20 rounded bg-bg-hover" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="glass-panel h-72 rounded-2xl" />
        <div className="glass-panel h-72 rounded-2xl" />
      </div>
    </div>
  );
}
