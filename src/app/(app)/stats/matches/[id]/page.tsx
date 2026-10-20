import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { positionLabel, shortName, teamName } from "@/lib/stats/groups";
import { match, matchFlow, matchKeepers, matchPlayers, type MatchKeeper, type MatchPlayer } from "@/lib/stats/match";
import { Card, Empty, PageLoading, PlayerLink, TeamLink } from "../../ui";

export default function MatchPage(props: PageProps<"/stats/matches/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <MatchPageBody {...props} />
    </Suspense>
  );
}

async function MatchPageBody({ params }: PageProps<"/stats/matches/[id]">) {
  await connection(); // stats.db changes under us: never prerender
  const id = Number((await params).id);
  const m = Number.isFinite(id) ? match(id) : undefined;
  if (!m) notFound();
  const players = matchPlayers(id);
  const keepers = matchKeepers(id);
  const flow = matchFlow(id);
  const homeWon = m.home_goals > m.away_goals;
  const awayWon = m.away_goals > m.home_goals;

  return (
    <>
      <section className="mb-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-line md:p-7">
        <div className="text-center text-sm font-semibold text-sky-dark">
          {m.competition ? (
            <Link href={`/stats?season=${m.season_id}&comp=${m.competition_id}`} className="hover:underline">
              {shortName(m.competition)}
            </Link>
          ) : null}
          {m.round ? <span className="text-muted"> · {m.round}</span> : null}
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-8">
          <TeamSide id={m.home_team_id} name={m.home} won={homeWon} align="right" label="Home" />
          <div className="text-center">
            <div className="font-display text-4xl font-extrabold tracking-tight text-slate tabular-nums md:text-6xl">
              <span className={homeWon || !awayWon ? "" : "text-muted"}>{m.home_goals}</span>
              <span className="mx-1.5 text-line md:mx-3">:</span>
              <span className={awayWon || !homeWon ? "" : "text-muted"}>{m.away_goals}</span>
            </div>
            {m.home_goals_ht !== null && m.away_goals_ht !== null && (
              <div className="mt-1 text-sm text-muted tabular-nums">
                Half-time {m.home_goals_ht}:{m.away_goals_ht}
              </div>
            )}
          </div>
          <TeamSide id={m.away_team_id} name={m.away} won={awayWon} align="left" label="Away" />
        </div>
        <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1 border-t border-line pt-4 text-sm text-muted">
          <li>
            {m.date}
            {m.time ? ` · ${m.time}` : ""}
          </li>
          {m.hall && <li>{m.hall}</li>}
          {m.attendance ? <li>{m.attendance.toLocaleString("sl-SI")} spectators</li> : null}
          {(m.referee_a || m.referee_b) && <li>Referees: {[m.referee_a, m.referee_b].filter(Boolean).join(", ")}</li>}
        </ul>
      </section>

      <Card title="How the score went" aside={flow.length ? "goal difference, minute by minute" : undefined} className="mb-5">
        {flow.length ? <ScoreFlow flow={flow} home={teamName(m.home)} away={teamName(m.away)} /> : <Empty>No play-by-play for this match (RZS has it from 2019/20).</Empty>}
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {(["home", "away"] as const).map((side) => (
          <TeamSheet
            key={side}
            name={teamName(side === "home" ? m.home : m.away)}
            coach={side === "home" ? m.home_coach : m.away_coach}
            players={players.filter((p) => p.side === side)}
            keepers={keepers.filter((k) => k.side === side)}
          />
        ))}
      </div>
    </>
  );
}

function TeamSide({ id, name, won, align, label }: { id: number; name: string; won: boolean; align: "left" | "right"; label: string }) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-0.5 font-display text-base leading-snug md:text-xl ${won ? "font-bold text-slate" : "font-semibold text-muted"}`}>
        <TeamLink id={id} name={name} />
      </div>
    </div>
  );
}

/** Goal difference over time as a step line: above the middle the home team leads, below the away team. */
function ScoreFlow({ flow, home, away }: { flow: { second: number; home: number; away: number }[]; home: string; away: string }) {
  const W = 640, H = 180, mid = H / 2;
  const end = Math.max(3600, flow[flow.length - 1].second);
  const maxDiff = Math.max(3, ...flow.map((f) => Math.abs(f.home - f.away)));
  const x = (s: number) => (s / end) * W;
  const y = (d: number) => mid - (d / maxDiff) * (mid - 12);
  let d = `M0 ${mid}`;
  for (const f of flow) {
    d += ` H${x(f.second).toFixed(1)} V${y(f.home - f.away).toFixed(1)}`;
  }
  d += ` H${W}`;
  const area = `${d} V${mid} H0 Z`;
  const last = flow[flow.length - 1];
  const biggest = flow.reduce((a, f) => (Math.abs(f.home - f.away) > Math.abs(a.home - a.away) ? f : a), flow[0]);
  const pct = (s: number) => `${(s / end) * 100}%`;
  return (
    <figure>
      {/* Lines stretch with the card; the labels are HTML so they keep their size. */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-44 w-full md:h-52"
          role="img"
          aria-label={`Score flow: final ${last.home}:${last.away}, biggest lead ${Math.abs(biggest.home - biggest.away)} goals`}
        >
          <defs>
            <clipPath id="flow-top"><rect x="0" y="0" width={W} height={mid} /></clipPath>
            <clipPath id="flow-bottom"><rect x="0" y={mid} width={W} height={mid} /></clipPath>
          </defs>
          {[900, 1800, 2700].map((t) => (
            <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={H} stroke="var(--color-line)" strokeDasharray={t === 1800 ? undefined : "3 4"} strokeWidth={t === 1800 ? 1.5 : 1} vectorEffect="non-scaling-stroke" />
          ))}
          <line x1="0" x2={W} y1={mid} y2={mid} stroke="var(--color-line)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <path d={area} fill="var(--color-sky)" fillOpacity="0.25" clipPath="url(#flow-top)" />
          <path d={area} fill="var(--color-slate)" fillOpacity="0.15" clipPath="url(#flow-bottom)" />
          <path d={d} fill="none" stroke="var(--color-slate)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="absolute left-2 top-1 text-xs font-semibold text-sky-dark">{home} ahead</span>
        <span className="absolute bottom-1 left-2 text-xs font-semibold text-slate">{away} ahead</span>
        <span className="absolute top-1 ml-1.5 text-xs text-muted" style={{ left: pct(1800) }}>Half-time</span>
      </div>
      <figcaption className="mt-2 flex justify-between text-xs text-muted tabular-nums">
        <span>0&apos;</span>
        <span>15&apos;</span>
        <span>30&apos;</span>
        <span>45&apos;</span>
        <span>{Math.round(end / 60)}&apos;</span>
      </figcaption>
      <p className="mt-3 text-sm text-muted">
        Biggest lead: <strong className="text-slate">{Math.abs(biggest.home - biggest.away)} goals</strong> for{" "}
        {biggest.home > biggest.away ? home : away}, at {biggest.home}:{biggest.away} in minute {Math.floor(biggest.second / 60) + 1}
      </p>
    </figure>
  );
}

function TeamSheet({ name, coach, players, keepers }: { name: string; coach: string | null; players: MatchPlayer[]; keepers: MatchKeeper[] }) {
  return (
    <Card title={name} aside={coach ? `Coach ${coach}` : undefined}>
      {players.length ? (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="w-8 py-1.5 pl-1 font-semibold">#</th>
                <th className="py-1.5 font-semibold">Player</th>
                <th className="px-2 text-right font-semibold" title="Goals / shots">Goals</th>
                <th className="px-2 text-right font-semibold" title="7 m penalties scored / taken">7m</th>
                <th className="px-2 text-right font-semibold" title="Two-minute suspensions">2&apos;</th>
                <th className="pl-2 pr-1 text-right font-semibold" title="Yellow / red cards">Cards</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.player_id} className="border-t border-line">
                  <td className="py-2 pl-1 text-xs text-muted">{p.number}</td>
                  <td className="py-2">
                    <PlayerLink id={p.player_id} name={p.name} />
                    <span className="block text-xs text-muted">{positionLabel(p.position)}</span>
                  </td>
                  <td className="px-2 text-right">
                    <span className="font-display font-extrabold text-slate">{p.goals}</span>
                    <span className="text-muted">/{p.shots}</span>
                  </td>
                  <td className="px-2 text-right text-muted">{p.shots_7m ? `${p.goals_7m}/${p.shots_7m}` : "–"}</td>
                  <td className="px-2 text-right text-muted">{p.two_min || "–"}</td>
                  <td className="pl-2 pr-1 text-right">
                    <span className="inline-flex gap-1 align-middle">
                      {Array.from({ length: p.yellow }, (_, i) => (
                        <span key={`y${i}`} className="h-3.5 w-2.5 rounded-[2px] bg-[#f5c518]" title="Yellow card" />
                      ))}
                      {Array.from({ length: p.red }, (_, i) => (
                        <span key={`r${i}`} className="h-3.5 w-2.5 rounded-[2px] bg-foul" title="Red card" />
                      ))}
                      {!p.yellow && !p.red && <span className="text-muted">–</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No player stats for this match.</Empty>
      )}

      {keepers.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Goalkeepers</h3>
          <ul className="text-sm">
            {keepers.map((k) => (
              <li key={k.player_id} className="flex items-baseline gap-3 border-t border-line py-2 first:border-t-0">
                <span className="w-7 text-xs text-muted tabular-nums">{k.number}</span>
                <span className="min-w-0 flex-1 truncate">
                  <PlayerLink id={k.player_id} name={k.name} />
                </span>
                <span className="tabular-nums">
                  <span className="font-display font-extrabold text-slate">{k.saves}</span>
                  <span className="text-muted">/{k.faced} saved</span>
                  <span className="ml-2 text-muted">{k.faced ? `${Math.round((100 * k.saves) / k.faced)}%` : "–"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
