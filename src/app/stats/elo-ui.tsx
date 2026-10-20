import Link from "next/link";
import type { EloStep } from "@/lib/stats/elo";
import { teamElo, type Fixture } from "@/lib/stats/teams";
import { Card, TeamLink } from "./ui";

const CHIP = { W: "bg-court text-slate-deep", L: "bg-foul text-white", D: "bg-line text-slate" } as const;

/** The last matches as W/D/L chips, oldest first; hover shows the score. */
export function FormStrip({ steps }: { steps: EloStep[] }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Last ${steps.length}: ${steps.map((s) => s.result).join(" ")}`}>
      {steps.map((s) => (
        <span
          key={s.match_id}
          title={`${s.date} ${s.home ? "vs" : "at"} ${s.opponent} ${s.goals}:${s.against}`}
          className={`inline-block w-5 rounded-md text-center font-display text-[11px] leading-5 font-extrabold ${CHIP[s.result]}`}
        >
          {s.result}
        </span>
      ))}
    </span>
  );
}

/** Rating over the season as a small line; the end dot is green when the last five went up. */
export function Sparkline({ values, width = 96, height = 24, up }: { values: number[]; width?: number; height?: number; up: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * (width - 4), 2 + (1 - (v - min) / span) * (height - 4)]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Rating from ${min.toFixed(0)} to ${max.toFixed(0)} this season`}>
      <polyline points={pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")} fill="none" className="stroke-slate/60" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.5} className={up ? "fill-court" : "fill-foul"} />
    </svg>
  );
}

export function Change({ v }: { v: number }) {
  const r = Math.round(v);
  return <span className={r > 0 ? "text-slate" : r < 0 ? "text-foul" : "text-muted"}>{r > 0 ? `+${r}` : r === 0 ? "±0" : `−${-r}`}</span>;
}

/** Home win chance as a split bar (draws count as half a win in Elo, and are ~5% in handball). */
export function FixtureRow({ f }: { f: Fixture }) {
  const p = Math.round(f.pHome * 100);
  return (
    <li className="border-t border-line py-2.5 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">
          <TeamLink id={f.match.home_id} name={f.match.home} /> <span className="text-muted">vs</span> <TeamLink id={f.match.away_id} name={f.match.away} />
        </span>
        <span className="shrink-0 text-xs text-muted">{f.match.date}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs font-semibold tabular-nums">
        <span className="w-9 text-slate">{p}%</span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-floor" role="img" aria-label={`Home win chance ${p}%`}>
          <div className="h-full bg-court" style={{ width: `${p}%` }} />
          <div className="h-full flex-1 bg-sky/60" />
        </div>
        <span className="w-9 text-right text-slate">{100 - p}%</span>
      </div>
    </li>
  );
}

/** Rating card for the team page. */
export function TeamEloCard({ teamId, seasonId, competitionId }: { teamId: number; seasonId: number; competitionId: number }) {
  const t = teamElo(teamId, seasonId, competitionId);
  if (!t) return null;
  return (
    <Card
      title="Elo rating"
      aside={<Link href={`/stats/teams?season=${seasonId}&comp=${competitionId}`} className="hover:text-sky-dark hover:underline">all teams</Link>}
      className="mb-6"
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div>
          <div className="font-display text-3xl font-extrabold tabular-nums text-slate">{Math.round(t.rating)}</div>
          <div className="text-xs text-muted">{t.rank ? `#${t.rank} of ${t.of} in this competition` : t.pool}</div>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted">Last {t.last5.length} · <Change v={t.change5} /></div>
          <FormStrip steps={t.last5} />
        </div>
        <div className="max-sm:hidden">
          <div className="mb-1 text-xs text-muted">This season</div>
          <Sparkline values={t.spark} width={160} height={32} up={t.change5 >= 0} />
        </div>
      </div>
      {t.upcoming.length > 0 && (
        <div className="mt-4">
          <div className="text-xs text-muted">Next {t.upcoming.length === 1 ? "match" : "matches"}: home win chance from today&apos;s ratings</div>
          <ul>{t.upcoming.slice(0, 3).map((f) => <FixtureRow key={f.match.id} f={f} />)}</ul>
        </div>
      )}
    </Card>
  );
}
