import { connection } from "next/server";
import { notFound } from "next/navigation";
import { MIN_SHOTS, playerProfile, similarPlayers } from "@/lib/stats/queries";
import { TYPE_GAP, TYPE_MIN } from "@/lib/stats/shot-types";
import { Card, Empty, MetricBar, PageTitle, PlayerLink, TeamLink } from "../../ui";
import { Drills } from "./drills";

export default async function PlayerPage({ params }: PageProps<"/stats/players/[id]">) {
  await connection(); // stats.db changes under us: never prerender
  const id = Number((await params).id);
  const prof = Number.isFinite(id) ? playerProfile(id) : null;
  if (!prof) notFound();
  const { player: p } = prof;
  const similar = similarPlayers(id);
  const maxGoals = Math.max(1, ...prof.games.map((g) => g.shots));

  return (
    <>
      <PageTitle
        eyebrow={p.position}
        title={p.name}
        sub={<><TeamLink id={p.team_id} name={p.team} /> · {prof.competitions.join(", ")}</>}
      />

      <dl className="mb-6 grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-line shadow-sm ring-1 ring-line sm:grid-cols-6">
        {[
          ["Matches", p.matches],
          ["Goals", p.goals],
          ["Shots", p.shots],
          ["7m", `${p.goals_7m}/${p.shots_7m}`],
          ["2 min", p.two_min],
          ["Cards", p.yellow + p.red],
        ].map(([k, v]) => (
          <div key={k} className="bg-white px-3 py-2.5">
            <dt className="text-xs font-medium text-muted">{k}</dt>
            <dd className="font-display text-xl font-extrabold tabular-nums text-slate">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Compared with ${prof.peers} other ${p.position.toLowerCase()} players`} aside="tick = average">
          <div className="flex flex-col gap-4">
            {prof.metrics.map((m) => <MetricBar key={m.key} m={m} />)}
          </div>
        </Card>

        <Card title="Weak spots">
          {prof.weakSpots.length ? (
            <ul className="flex flex-col gap-3">
              {prof.weakSpots.map((w) => (
                <li key={w.title} className="border-l-2 border-foul pl-3">
                  <div className="font-semibold text-ink">{w.title}</div>
                  <div className="text-sm text-muted">{w.detail}</div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              {prof.enoughData
                ? "Nothing stands out below the position average."
                : `Not enough data yet: a weak spot needs ${MIN_SHOTS}+ field shots or 4+ matches.`}
            </Empty>
          )}
          <div className="mt-5 border-t border-line pt-4">
            <Drills playerId={id} name={p.name} />
          </div>
        </Card>
      </div>

      <Card
        title="Shot types"
        className="mt-6"
        aside={prof.shotTypes ? `${prof.shotTypes.matches} matches with a stats sheet · tick = average` : undefined}
      >
        {prof.shotTypes ? (
          <>
            <div className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
              {prof.shotTypes.rows.map((r) => (
                <MetricBar
                  key={r.key}
                  m={{ key: r.key, label: r.label, me: r.pct, avg: r.avg, unit: "%", better: "high" }}
                  note={r.shots ? `${r.goals}/${r.shots}` : "no shots"}
                  flag={r.shots >= TYPE_MIN && r.pct !== null && r.avg !== null && r.pct < r.avg - TYPE_GAP}
                />
              ))}
            </div>
            <p className="mt-4 text-xs text-muted">
              Shot mix {prof.shotTypes.rows.map((r) => `${r.key} ${r.share.toFixed(0)}%`).join(" · ")}
              {" · "}{prof.shotTypes.misses} missed the goal. From the match stats sheets, which can differ slightly
              from the totals above; under {TYPE_MIN} attempts of a type is a small sample.
            </p>
          </>
        ) : (
          <Empty>Shot types (7m, 6m, wing, 9m) exist only for the top senior competitions, so there are none for this player.</Empty>
        )}
      </Card>

      <Card title="Match by match" className="mt-6" aside="goals of shots">
        {prof.games.length ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {prof.games.map((g) => (
              <li key={g.match_id} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3 sm:grid-cols-[5.5rem_14rem_1fr_4.5rem]">
                <span className="text-xs text-muted">{g.date}</span>
                <span className="truncate max-sm:hidden">vs {g.opponent} <span className="text-muted">{g.result}</span></span>
                <span className="relative h-3 bg-floor" aria-hidden>
                  <span className="absolute inset-y-0 left-0 bg-line" style={{ width: `${(g.shots / maxGoals) * 100}%` }} />
                  <span className="absolute inset-y-0 left-0 bg-court" style={{ width: `${(g.goals / maxGoals) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums"><strong className="text-slate">{g.goals}</strong>/{g.shots}{g.two_min ? <span className="text-foul"> · {g.two_min}×2′</span> : null}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No matches.</Empty>
        )}
      </Card>

      <Card title="Plays like" className="mt-6" aside={`same season, ${MIN_SHOTS}+ shots, closest first`}>
        {similar.length ? (
          <ul className="divide-y divide-line text-sm">
            {similar.map((s) => (
              <li key={s.player_id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                <span><PlayerLink id={s.player_id} name={s.name} /> <span className="text-muted">· {s.position} · {s.team}</span></span>
                <span className="tabular-nums text-muted">{s.goals}/{s.shots} in {s.matches} · 7m {s.goals_7m}/{s.shots_7m}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Not enough players with {MIN_SHOTS}+ shots this season to compare yet.</Empty>
        )}
      </Card>
    </>
  );
}
