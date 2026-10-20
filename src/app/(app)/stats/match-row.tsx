import Link from "next/link";
import { teamName } from "@/lib/stats/groups";

// One finished match as a clickable row (opens /stats/matches/[id]); used on the overview and team pages.

type Row = {
  id: number; date: string; time?: string | null; home: string; away: string; home_goals: number; away_goals: number;
};

export function MatchRow({ m, lead }: { m: Row; lead?: React.ReactNode }) {
  const homeWon = m.home_goals > m.away_goals;
  const awayWon = m.away_goals > m.home_goals;
  return (
    <Link
      href={`/stats/matches/${m.id}`}
      className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-floor"
    >
      {lead}
      <span className="w-[4.5rem] shrink-0 text-xs leading-tight text-muted tabular-nums">
        <span className="block">{m.date}</span>
        {m.time && <span className="block">{m.time}</span>}
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className={`block truncate ${homeWon ? "font-semibold text-ink" : "text-muted"}`}>{teamName(m.home)}</span>
        <span className={`block truncate ${awayWon ? "font-semibold text-ink" : "text-muted"}`}>{teamName(m.away)}</span>
      </span>
      <span className="text-right font-display tabular-nums">
        <span className={`block ${homeWon ? "font-extrabold text-slate" : "text-muted"}`}>{m.home_goals}</span>
        <span className={`block ${awayWon ? "font-extrabold text-slate" : "text-muted"}`}>{m.away_goals}</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-line transition group-hover:translate-x-0.5 group-hover:text-sky-dark" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
