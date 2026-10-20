import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Wordmark } from "../wordmark";
import { freshness } from "@/lib/stats/queries";
import "./stats.css";

const NAV = [
  { href: "/stats", label: "Overview" },
  { href: "/stats/rankings", label: "Rankings" },
  { href: "/stats/teams", label: "Teams" },
  { href: "/stats/near", label: "Near you" },
  { href: "/", label: "Chat" },
] as const;

async function Freshness() {
  await connection();
  const f = freshness();
  if (!f) return null;
  return (
    <span className="hidden text-xs text-white/55 md:inline">
      {f.matches.toLocaleString("sl-SI")} matches · latest {f.latest}
    </span>
  );
}

function Loading() {
  return <div className="h-40 animate-pulse rounded-2xl bg-white/60 ring-1 ring-line motion-reduce:animate-none" />;
}

export default function StatsLayout({ children }: LayoutProps<"/stats">) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 bg-slate-deep px-3 md:gap-5 md:px-5">
        <Link href="/stats" aria-label="Stats overview">
          <Wordmark />
        </Link>
        <nav className="flex flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg px-2.5 py-1.5 text-sm font-semibold whitespace-nowrap text-white/75 hover:bg-white/10 hover:text-white"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <Suspense fallback={null}>
          <Freshness />
        </Suspense>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-8">
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </main>
    </div>
  );
}
