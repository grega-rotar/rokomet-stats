import Link from "next/link";
import type { ReactNode } from "react";
import { teamName } from "@/lib/stats/groups";
import type { Metric, Zone } from "@/lib/stats/queries";

export function Card({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white shadow-sm ring-1 ring-line ${className}`}>
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4 md:px-6 md:pt-5">
        <h2 className="font-display text-[0.95rem] font-bold text-slate">{title}</h2>
        {aside && <div className="text-xs text-muted">{aside}</div>}
      </div>
      <div className="px-5 pb-5 pt-3 md:px-6 md:pb-6">{children}</div>
    </section>
  );
}

export type Fact = { label: string; value: ReactNode; tone?: "good" | "bad" };

/** Small figures under a page title: matches, wins, goals. One look on every stats page. */
export function Facts({ items }: { items: Fact[] }) {
  if (!items.length) return null;
  return (
    <dl className="mt-4 flex flex-wrap gap-2">
      {items.map((f) => (
        <div key={f.label} className="min-w-[5.5rem] rounded-xl bg-white px-3.5 py-2 shadow-sm ring-1 ring-line">
          <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">{f.label}</dt>
          <dd
            className={`font-display text-lg font-bold tabular-nums ${
              f.tone === "good" ? "text-[#5d7a12]" : f.tone === "bad" ? "text-foul" : "text-slate"
            }`}
          >
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The header of every stats page: eyebrow (where you are), title, one plain line, figures,
 * and room on the right for a control (season, filters).
 */
export function PageTitle({
  eyebrow,
  title,
  sub,
  facts = [],
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  facts?: Fact[];
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow && <div className="text-sm font-semibold text-sky-dark">{eyebrow}</div>}
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate md:text-3xl">{title}</h1>
          {sub && <div className="mt-1 text-muted">{sub}</div>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
      <Facts items={facts} />
    </header>
  );
}

/** W / D / L as a small pill (team form, match lists). */
export function ResultPill({ result }: { result: "W" | "D" | "L" }) {
  const style = result === "W" ? "bg-court text-slate-deep" : result === "L" ? "bg-foul text-white" : "bg-line text-slate";
  return (
    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md font-display text-xs font-extrabold ${style}`} title={{ W: "Won", D: "Draw", L: "Lost" }[result]}>
      {result}
    </span>
  );
}

export function PlayerLink({ id, name }: { id: number; name: string }) {
  return (
    <Link href={`/stats/players/${id}`} className="font-semibold text-ink hover:text-sky-dark hover:underline">
      {name}
    </Link>
  );
}

export function TeamLink({ id, name }: { id: number; name: string }) {
  return (
    <Link href={`/stats/teams/${id}`} className="hover:text-sky-dark hover:underline">
      {teamName(name)}
    </Link>
  );
}

/** "Show more" at the end of a list: links to the same page with a bigger limit, keeping the scroll position. */
export function ShowMore({ href, children = "Show more" }: { href: string; children?: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-floor py-2.5 text-sm font-semibold text-slate transition hover:bg-line"
    >
      {children}
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 9l6 6 6-6" />
      </svg>
    </Link>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

/** A metric as a court line: the bar is the player, the slate tick is the position average. */
export function MetricBar({ m }: { m: Metric }) {
  const max = m.unit === "%" ? 100 : Math.max(m.me ?? 0, m.avg ?? 0) * 1.4 || 1;
  const w = (v: number | null) => `${Math.min(100, ((v ?? 0) / max) * 100)}%`;
  const worse = m.me !== null && m.avg !== null && (m.better === "high" ? m.me < m.avg : m.me > m.avg);
  const fmt = (v: number | null) => (v === null ? "–" : m.unit === "%" ? `${v.toFixed(0)}%` : v.toFixed(m.key === "two" ? 2 : 1));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span>{m.label}</span>
        <span className="tabular-nums">
          <strong className={worse ? "text-foul" : "text-slate"}>{fmt(m.me)}</strong>
          <span className="text-muted"> · avg {fmt(m.avg)}</span>
        </span>
      </div>
      <div className="relative mt-1.5 h-2.5 rounded-full bg-floor" role="img" aria-label={`${m.label}: ${fmt(m.me)}, average ${fmt(m.avg)}`}>
        <div className={`h-full rounded-full ${worse ? "bg-foul/70" : "bg-court"}`} style={{ width: w(m.me) }} />
        {m.avg !== null && <div className="absolute -top-1 h-4.5 w-1 -translate-x-1/2 rounded-full bg-slate ring-2 ring-white" style={{ left: w(m.avg) }} />}
      </div>
    </div>
  );
}

const ROWS = ["top", "mid", "bottom"] as const;
const COLS = ["left", "center", "right"] as const;

/**
 * The goal as the RZS sheet draws it, seen from the shooter: striped posts and crossbar,
 * nine zones filled by share of all goals, each with goals/shots on target.
 */
export function GoalFrame({ zones, label }: { zones: Zone[]; label: string }) {
  const byZone = new Map(zones.map((z) => [z.zone, z]));
  const total = zones.reduce((a, z) => a + z.goals, 0);
  const maxShare = Math.max(0.0001, ...zones.map((z) => z.goals / Math.max(1, total)));
  return (
    <figure>
      <div className="goal-frame mx-auto max-w-sm">
        <div className="grid grid-cols-3 grid-rows-3 overflow-hidden rounded-t-sm bg-white">
          {ROWS.flatMap((r) =>
            COLS.map((c) => {
              const z = byZone.get(`${r}_${c}`);
              const share = z && total ? z.goals / total : 0;
              return (
                <div
                  key={`${r}_${c}`}
                  className="relative flex aspect-[3/2] flex-col items-center justify-center border border-dashed border-line"
                  title={`${r} ${c}: ${z?.goals ?? 0} goals from ${z?.shots ?? 0} shots on target`}
                >
                  <div className="absolute inset-0 bg-court" style={{ opacity: (share / maxShare) * 0.85 }} aria-hidden />
                  <span className="relative font-display text-lg font-extrabold tabular-nums text-slate-deep">
                    {z?.goals ?? 0}
                    <span className="text-xs font-semibold text-slate/70">/{z?.shots ?? 0}</span>
                  </span>
                  <span className="relative text-[11px] font-semibold text-slate/70 tabular-nums">
                    {total ? `${Math.round(share * 100)}%` : ""}
                  </span>
                </div>
              );
            }),
          )}
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted">
        {label} · {total} goals with a zone · shooter&apos;s view · 7m not included
      </figcaption>
    </figure>
  );
}
