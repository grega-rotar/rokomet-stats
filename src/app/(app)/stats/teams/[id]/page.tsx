import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { describeCompetition, positionLabel, shortName, teamName } from "@/lib/stats/groups";
import { team } from "@/lib/stats/queries";
import { MatchRow } from "../../match-row";
import { FollowButton } from "../../push";
import { TeamGoal } from "@/components/goal/team-goal";
import { Card, Empty, PageTitle, PlayerLink, ResultPill } from "../../ui";

const MATCHES_STEP = 12;

export default async function TeamPage({ params, searchParams }: PageProps<"/stats/teams/[id]">) {
  await connection(); // stats.db changes under us: never prerender
  const id = Number((await params).id);
  const sp = await searchParams;
  const t = Number.isFinite(id) ? team(id) : null;
  if (!t) notFound();
  const played = t.matches.filter((m) => m.home_goals !== null);
  const result = (m: (typeof played)[number]) => {
    const [us, them] = m.home_team_id === id ? [m.home_goals, m.away_goals] : [m.away_goals, m.home_goals];
    return us > them ? "W" : us < them ? "L" : "D";
  };
  const count = (r: string) => played.filter((m) => result(m) === r).length;
  const goalsFor = played.reduce((a, m) => a + (m.home_team_id === id ? m.home_goals : m.away_goals), 0);
  const goalsAgainst = played.reduce((a, m) => a + (m.home_team_id === id ? m.away_goals : m.home_goals), 0);
  const diff = goalsFor - goalsAgainst;
  const shown = Math.max(MATCHES_STEP, Number(sp.matches) || MATCHES_STEP);
  const hasZones = t.attack.length > 0;

  return (
    <>
      <PageTitle
        eyebrow={
          <Link href={`/stats?season=${t.season_id}&comp=${t.competition_id}`} className="hover:underline">
            {shortName(t.competition)}
          </Link>
        }
        title={teamName(t.name)}
        sub={describeCompetition(t.competition)}
        action={<FollowButton kind="team" refId={id} label={teamName(t.name)} />}
        facts={[
          { label: "Matches", value: played.length },
          { label: "Won · drawn · lost", value: `${count("W")} · ${count("D")} · ${count("L")}` },
          { label: "Goals", value: `${goalsFor}:${goalsAgainst}` },
          { label: "Difference", value: `${diff > 0 ? "+" : ""}${diff}`, tone: diff > 0 ? "good" : diff < 0 ? "bad" : undefined },
          {
            label: "Form, last 5",
            value: (
              <span className="mt-1 flex gap-1">
                {played.slice(0, 5).reverse().map((m) => (
                  <ResultPill key={m.id} result={result(m)} />
                ))}
              </span>
            ),
          },
        ]}
      />

      {hasZones ? (
        <Card title="Goal zones" aside="league = all teams in the competition" className="mb-5">
          <TeamGoal
            attack={{ zones: t.attack, miss: t.missAttack }}
            defence={{ zones: t.defence, miss: t.missDefence }}
            league={t.leagueZones}
          />
        </Card>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Squad" aside="field players, by goals">
          {t.squad.length ? (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1.5 pl-1 font-semibold">Player</th>
                    <th className="px-2 text-right font-semibold" title="Matches">M</th>
                    <th className="px-2 text-right font-semibold">Goals</th>
                    <th className="pl-2 pr-1 text-right font-semibold" title="Goals per shot">%</th>
                  </tr>
                </thead>
                <tbody>
                  {t.squad.map((p) => (
                    <tr key={p.player_id} className="border-t border-line">
                      <td className="py-2 pl-1">
                        <PlayerLink id={p.player_id} name={p.name} />
                        <span className="block text-xs text-muted">{positionLabel(p.position)}</span>
                      </td>
                      <td className="px-2 text-right text-muted">{p.matches}</td>
                      <td className="px-2 text-right font-display font-extrabold text-slate">{p.goals}</td>
                      <td className="pl-2 pr-1 text-right text-muted">{p.shots ? Math.round((100 * p.goals) / p.shots) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No player stats.</Empty>
          )}
        </Card>

        <Card title="Matches" aside="newest first · click for the match">
          {played.length ? (
            <>
              <div className="divide-y divide-line">
                {played.slice(0, shown).map((m) => (
                  <MatchRow key={m.id} m={m} lead={<ResultPill result={result(m)} />} />
                ))}
              </div>
              {played.length > shown && (
                <Link
                  href={`/stats/teams/${id}?matches=${shown + MATCHES_STEP}`}
                  scroll={false}
                  className="mt-3 flex w-full items-center justify-center rounded-xl bg-floor py-2.5 text-sm font-semibold text-slate transition hover:bg-line"
                >
                  Show more matches ({played.length - shown} left)
                </Link>
              )}
            </>
          ) : (
            <Empty>No finished matches.</Empty>
          )}
        </Card>
      </div>
      {!hasZones && (
        <p className="mt-5 text-sm text-muted">
          No goal zones for this competition: RZS records them only in the top senior leagues and cups, from 2024/25.
        </p>
      )}
    </>
  );
}
