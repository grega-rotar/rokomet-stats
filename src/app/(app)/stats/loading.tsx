// Shown while a stats page reads stats.db. Each page needs its own boundary for instant navigation
// (cacheComponents): the one in layout.tsx only covers the first load.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-64 animate-pulse rounded-xl bg-white/70 motion-reduce:animate-none" />
      <div className="h-40 animate-pulse rounded-2xl bg-white/60 ring-1 ring-line motion-reduce:animate-none" />
      <div className="h-64 animate-pulse rounded-2xl bg-white/60 ring-1 ring-line motion-reduce:animate-none" />
    </div>
  );
}
