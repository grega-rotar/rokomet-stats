import { connection } from "next/server";
import { Suspense } from "react";
import { MenuButton } from "../../shell";
import { freshness } from "@/lib/stats/queries";
import "./stats.css";

async function Freshness() {
  await connection();
  const f = freshness();
  if (!f) return null;
  return (
    <span className="hidden rounded-full bg-floor px-2.5 py-1 text-xs text-muted sm:inline">
      {f.matches.toLocaleString("sl-SI")} matches · latest {f.latest}
    </span>
  );
}

function Loading() {
  return <div className="h-40 animate-pulse rounded-2xl bg-white/60 ring-1 ring-line motion-reduce:animate-none" />;
}

// The pages themselves are in the sidebar (src/app/shell.tsx); this is the slim bar above them.
export default function StatsLayout({ children }: LayoutProps<"/stats">) {
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-white/80 px-3 backdrop-blur md:px-6">
        <MenuButton />
        <h1 className="min-w-0 flex-1 truncate font-display text-[0.95rem] font-semibold text-slate">Stats</h1>
        <Suspense fallback={null}>
          <Freshness />
        </Suspense>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
          <Suspense fallback={<Loading />}>{children}</Suspense>
        </div>
      </div>
    </>
  );
}
