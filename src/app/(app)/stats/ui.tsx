import Link from "next/link";
import type { ReactNode } from "react";
import { Goal2D } from "@/components/goal/goal-2d";
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
  action,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  facts?: Fact[];
  action?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow && <div className="text-sm font-semibold text-sky-dark">{eyebrow}</div>}
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate md:text-3xl">{title}</h1>
          {sub && <div className="mt-1 text-muted">{sub}</div>}
        </div>
        {action && <div className="flex shrink-0 gap-2">{action}</div>}
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

/**
 * A metric as a court line: the bar is the player, the slate tick is the position average.
 * note: small text after the label (e.g. "11/32"); flag overrides when the value is shown as worse.
 */
export function MetricBar({ m, note, flag }: { m: Metric; note?: ReactNode; flag?: boolean }) {
  const max = m.unit === "%" ? 100 : Math.max(m.me ?? 0, m.avg ?? 0) * 1.4 || 1;
  const w = (v: number | null) => `${Math.min(100, ((v ?? 0) / max) * 100)}%`;
  const worse = flag ?? (m.me !== null && m.avg !== null && (m.better === "high" ? m.me < m.avg : m.me > m.avg));
  const fmt = (v: number | null) => (v === null ? "–" : m.unit === "%" ? `${v.toFixed(0)}%` : v.toFixed(m.key === "two" ? 2 : 1));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span>{m.label}{note && <span className="ml-1.5 text-xs text-muted tabular-nums">{note}</span>}</span>
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

/** The goal as the RZS sheet draws it, seen from the shooter: nine zones filled by share of all goals. Flat, no WebGL. */
export function GoalFrame({ zones, label, mode = "scored" }: { zones: Zone[]; label: string; mode?: "scored" | "conceded" }) {
  const total = zones.reduce((a, z) => a + z.goals, 0);
  return (
    <figure>
      <Goal2D data={{ mode, zones }} />
      <figcaption className="mt-3 text-center text-xs text-muted">
        {label} · {total} goals with a zone · shooter&apos;s view · 7m not included
      </figcaption>
    </figure>
  );
}

/** Placeholder while a page reads stats.db. */
export function PageLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-64 animate-pulse rounded-xl bg-white/70 motion-reduce:animate-none" />
      <div className="h-40 animate-pulse rounded-2xl bg-white/60 ring-1 ring-line motion-reduce:animate-none" />
      <div className="h-64 animate-pulse rounded-2xl bg-white/60 ring-1 ring-line motion-reduce:animate-none" />
    </div>
  );
}

/**
 * A hover / focus bubble in place of the browser's title tooltip. CSS only, so it works in
 * server components. The trigger is focusable, so keyboard and touch can open it too.
 */
export function Tip({
  tip,
  children,
  className = "",
  align = "center",
}: {
  tip: ReactNode;
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const side = align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <div tabIndex={0} className={`no-ring group/tip relative outline-none hover:z-30 focus:z-30 ${className}`}>
      {children}
      <div
        role="tooltip"
        className={`pointer-events-none invisible absolute bottom-full z-30 mb-2 w-max max-w-64 translate-y-1 rounded-xl bg-slate-deep px-3 py-2 text-left text-xs font-normal leading-relaxed text-white/80 opacity-0 shadow-lg transition duration-150 group-hover/tip:visible group-hover/tip:translate-y-0 group-hover/tip:opacity-100 group-focus/tip:visible group-focus/tip:translate-y-0 group-focus/tip:opacity-100 ${side}`}
      >
        {tip}
      </div>
    </div>
  );
}

/** A small turning ring for "working on it". */
export function Spinner({ className = "size-3.5" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none ${className}`}
    />
  );
}
