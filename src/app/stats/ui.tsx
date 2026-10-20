import Link from "next/link";
import type { ReactNode } from "react";
import { Goal2D } from "@/components/goal/goal-2d";
import type { Metric, Zone } from "@/lib/stats/queries";

export function Card({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white shadow-sm ring-1 ring-line ${className}`}>
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <h2 className="font-display text-sm font-bold text-slate">{title}</h2>
        {aside && <div className="text-xs text-muted">{aside}</div>}
      </div>
      <div className="px-5 pt-3 pb-5">{children}</div>
    </section>
  );
}

export function PageTitle({ eyebrow, title, sub }: { eyebrow?: ReactNode; title: string; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      {eyebrow && <div className="text-sm font-semibold text-sky-dark">{eyebrow}</div>}
      <h1 className="font-display text-2xl font-bold tracking-tight text-slate md:text-3xl">{title}</h1>
      {sub && <div className="mt-1 text-muted">{sub}</div>}
    </div>
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
      {name}
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
