import { connection } from "next/server";
import { Suspense } from "react";
import { PageLoading } from "../../ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { team } from "@/lib/stats/queries";
import { Card, Empty, GoalFrame, PageTitle, PlayerLink, TeamLink } from "../../ui";
import { TeamEloCard } from "../../elo-ui";
import { AskAbout } from "../../chat-panel";

export default function TeamPage(props: PageProps<"/stats/teams/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <TeamPageBody {...props} />
    </Suspense>
  );
}

async function TeamPageBody({ params }: PageProps<"/stats/teams/[id]">) {
  await connection(); // stats.db changes under us: never prerender
  const id = Number((await params).id);
  const t = Number.isFinite(id) ? team(id) : null;
  if (!t) notFound();
  const played = t.matches.filter((m) => m.home_goals !== null);
  const won = played.filter((m) => (m.home_team_id === id ? m.home_goals > m.away_goals : m.away_goals > m.home_goals)).length;
  const hasZones = t.attack.length > 0;

  return (
    <>
      <AskAbout
        label={t.name}
        prefix={`About team ${t.name} (team_id ${id}, ${t.competition}):`}
        examples={[
          { label: "Form + Elo", text: "How is the form and how has the Elo rating moved this season?" },
          { label: "Goal zones", text: "Where in the goal do they score and concede most, compared with the league?" },
          { label: "Key players", text: "Who are the key players, and where is the squad weakest?" },
          { label: "Next opponent", text: "How would they do against the top 3 teams of the league, going by Elo?" },
        ]}
      />
      <PageTitle
        eyebrow={<Link href={`/stats?season=${t.season_id}&comp=${t.competition_id}`} className="hover:underline">{t.competition}</Link>}
        title={t.name}
        sub={`${played.length} matches · ${won} won`}
      />

      <TeamEloCard teamId={id} seasonId={t.season_id} competitionId={t.competition_id} />

      {hasZones ? (
        <div className="mb-6 grid gap-6 md:grid-cols-2">
          <Card title="Where they score">
            <GoalFrame zones={t.attack} label="Their shots" />
          </Card>
          <Card title="Where they concede">
            <GoalFrame zones={t.defence} label="Opponents' shots" />
          </Card>
        </div>
      ) : (
        <Card title="Goal zones" className="mb-6">
          <Empty>
            No goal zones for this competition. RZS records them only in the top senior leagues and cups, from 2024/25.
          </Empty>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] [&>*]:min-w-0">
        <Card title="Squad" aside="field players, by goals">
          {t.squad.length ? (
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-muted">
                <tr><th className="py-1">Player</th><th className="text-right">M</th><th className="text-right">Goals</th><th className="text-right">%</th></tr>
              </thead>
              <tbody>
                {t.squad.map((p) => (
                  <tr key={p.player_id} className="border-t border-line">
                    <td className="py-1.5"><PlayerLink id={p.player_id} name={p.name} /> <span className="text-xs text-muted">{p.position}</span></td>
                    <td className="text-right">{p.matches}</td>
                    <td className="text-right font-semibold text-slate">{p.goals}</td>
                    <td className="text-right text-muted">{p.shots ? Math.round((100 * p.goals) / p.shots) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>No player stats.</Empty>
          )}
        </Card>

        <Card title="Matches">
          <ul className="text-sm">
            {t.matches.map((m) => {
              const home = m.home_team_id === id;
              const [us, them] = home ? [m.home_goals, m.away_goals] : [m.away_goals, m.home_goals];
              const res = us > them ? "W" : us < them ? "L" : "D";
              return (
                <li key={m.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
                  <span className={`w-6 rounded-md text-center font-display text-xs font-extrabold ${res === "W" ? "bg-court text-slate-deep" : res === "L" ? "bg-foul text-white" : "bg-line text-slate"}`}>{res}</span>
                  <span className="w-20 text-xs text-muted">{m.date}</span>
                  <span className="min-w-0 flex-1 truncate">{home ? "vs" : "at"} <TeamLink id={home ? m.away_team_id : m.home_team_id} name={home ? m.away : m.home} /></span>
                  <span className="font-display font-extrabold tabular-nums text-slate">{us}:{them}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
