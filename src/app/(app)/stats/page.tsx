import { connection } from "next/server";
import Link from "next/link";
import { competitionGroup, describeCompetition, shortName, teamName } from "@/lib/stats/groups";
import { competitions, results, seasons, standings, topScorers } from "@/lib/stats/queries";
import { CompetitionPicker } from "./competition-picker";
import { MatchRow } from "./match-row";
import { Card, Empty, PageTitle, PlayerLink, ShowMore, TeamLink } from "./ui";

const RESULTS_STEP = 8;

export default async function StatsHome({ searchParams }: PageProps<"/stats">) {
  await connection(); // stats.db changes under us: never prerender
  const sp = await searchParams;
  const allSeasons = seasons();
  if (!allSeasons.length) {
    return (
      <PageTitle
        title="No data yet"
        sub="The crawler hasn't filled the stats database yet. It runs every 6 hours; the first run takes about an hour per season."
      />
    );
  }
  const seasonId = Number(sp.season) || allSeasons[0].id;
  const comps = competitions(seasonId);
  const compId = Number(sp.comp) || comps[0]?.id;
  const comp = comps.find((c) => c.id === compId);
  const table = comp ? standings(comp.id, seasonId) : [];
  const shownResults = Math.max(RESULTS_STEP, Number(sp.results) || RESULTS_STEP);
  // One extra row tells whether "Show more" has anything to show.
  const latest = comp ? results(comp.id, seasonId, shownResults + 1) : [];
  // As many scorers as teams, so the two cards side by side end at the same line.
  const scorers = comp ? topScorers(comp.id, seasonId, Math.max(10, table.length)) : [];
  const goals = table.reduce((a, t) => a + t.gf, 0);
  const query = (extra: Record<string, string | number>) =>
    `/stats?${new URLSearchParams({ season: String(seasonId), ...(compId ? { comp: String(compId) } : {}), ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) })}`;

  return (
    <>
      <CompetitionPicker
        competitions={comps.map((c) => ({
          id: c.id,
          name: c.name,
          short: shortName(c.name),
          matches: c.matches,
          top: c.category === "top",
          group: competitionGroup(c.name),
        }))}
        seasons={allSeasons}
        seasonId={seasonId}
        compId={compId}
        description={comp ? describeCompetition(comp.name) : undefined}
        facts={
          comp
            ? [
                { label: "Matches", value: comp.matches.toLocaleString("sl-SI") },
                { label: "Teams", value: String(table.length) },
                { label: "Goals per match", value: comp.matches ? (goals / comp.matches).toFixed(1) : "–" },
                ...(latest[0] ? [{ label: "Latest", value: latest[0].date }] : []),
              ]
            : []
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card title="Standings" aside="2 points for a win, 1 for a draw">
          {table.length ? (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="w-8 py-1.5 pl-1 font-semibold">#</th>
                    <th className="py-1.5 font-semibold">Team</th>
                    <th className="px-2 text-right font-semibold">P</th>
                    <th className="px-2 text-right font-semibold">W</th>
                    <th className="px-2 text-right font-semibold">D</th>
                    <th className="px-2 text-right font-semibold">L</th>
                    <th className="px-2 text-right font-semibold max-sm:hidden">Goals</th>
                    <th className="pl-2 pr-1 text-right font-semibold">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((t, i) => (
                    <tr key={t.team_id} className="border-t border-line">
                      <td className="py-2 pl-1">
                        <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${i === 0 ? "bg-court text-slate-deep" : "text-muted"}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-2 font-medium text-ink">
                        <TeamLink id={t.team_id} name={t.team} />
                      </td>
                      <td className="px-2 text-right text-muted">{t.p}</td>
                      <td className="px-2 text-right">{t.w}</td>
                      <td className="px-2 text-right">{t.d}</td>
                      <td className="px-2 text-right">{t.l}</td>
                      <td className="px-2 text-right whitespace-nowrap text-muted max-sm:hidden">
                        {t.gf}:{t.ga}
                      </td>
                      <td className="pl-2 pr-1 text-right font-display font-extrabold text-slate">{t.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No finished matches in this competition yet.</Empty>
          )}
        </Card>

        <Card
          title="Top scorers"
          aside={
            <Link href={`/stats/rankings?season=${seasonId}&comp=${compId}`} className="font-semibold text-sky-dark hover:underline">
              All rankings
            </Link>
          }
        >
          {scorers.length ? (
            <ol className="text-sm">
              {scorers.map((p, i) => (
                <li key={p.player_id} className="flex h-[41px] items-center gap-3 border-t border-line first:h-10 first:border-t-0">
                  <span className="w-6 shrink-0 text-center text-xs text-muted tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <PlayerLink id={p.player_id} name={p.name} />
                    <span className="text-muted"> · {teamName(p.team)}</span>
                  </span>
                  <span className="font-display font-extrabold text-slate tabular-nums">{p.goals}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>No player stats yet.</Empty>
          )}
        </Card>
      </div>

      <Card title="Latest results" aside="click a match for the details" className="mt-5">
        {latest.length ? (
          <>
            <div className="grid gap-x-8 sm:grid-cols-2">
              {latest.slice(0, shownResults).map((m) => (
                <div key={m.id} className="border-t border-line first:border-t-0 sm:[&:nth-child(2)]:border-t-0">
                  <MatchRow m={m} />
                </div>
              ))}
            </div>
            {latest.length > shownResults && <ShowMore href={query({ results: shownResults + RESULTS_STEP })}>Show more results</ShowMore>}
          </>
        ) : (
          <Empty>No results yet.</Empty>
        )}
      </Card>
    </>
  );
}
