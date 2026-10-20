import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { competitionGroup, describeCompetition, shortName, teamName } from "@/lib/stats/groups";
import { K } from "@/lib/stats/elo";
import { competitions, seasons, standings } from "@/lib/stats/queries";
import { eloTable, eloValidation } from "@/lib/stats/teams";
import { CompetitionPicker } from "../competition-picker";
import { Change, FixtureRow, FormStrip, Sparkline } from "../elo-ui";
import { Card, Empty, PageLoading, PageTitle, TeamLink } from "../ui";

export default function TeamsPage(props: PageProps<"/stats/teams">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <TeamsPageBody {...props} />
    </Suspense>
  );
}

// Every team of one competition: its place in the table, its Elo rating and how both are moving.
async function TeamsPageBody({ searchParams }: PageProps<"/stats/teams">) {
  await connection(); // stats.db changes under us: never prerender
  const sp = await searchParams;
  const allSeasons = seasons();
  const seasonId = Number(sp.season) || allSeasons[0]?.id;
  if (!seasonId) return <PageTitle title="No data yet" sub="The crawler hasn't filled the stats database yet." />;
  const comps = competitions(seasonId);
  const compId = Number(sp.comp) || comps[0]?.id;
  const comp = comps.find((c) => c.id === compId);
  const byElo = sp.sort === "elo";

  const table = comp ? standings(comp.id, seasonId) : [];
  const elo = comp ? eloTable(comp.id, seasonId) : null;
  const eloBy = new Map((elo?.rows ?? []).map((r) => [r.team_id, r]));
  const eloRank = new Map((elo?.rows ?? []).map((r, i) => [r.team_id, i + 1]));
  const rows = table.map((t, i) => ({ ...t, place: i + 1, elo: eloBy.get(t.team_id) }));
  if (byElo) rows.sort((a, b) => (b.elo?.rating ?? 0) - (a.elo?.rating ?? 0));
  const v = eloValidation(seasonId);
  const best = elo?.rows[0];
  const sortHref = (sort?: string) =>
    `/stats/teams?${new URLSearchParams({ season: String(seasonId), ...(compId ? { comp: String(compId) } : {}), ...(sort ? { sort } : {}) })}`;

  return (
    <>
      <CompetitionPicker
        basePath="/stats/teams"
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
        description={comp ? `Teams · ${describeCompetition(comp.name)}` : undefined}
        facts={
          comp
            ? [
                { label: "Teams", value: String(table.length) },
                { label: "Matches", value: comp.matches.toLocaleString("sl-SI") },
                ...(best ? [{ label: "Highest Elo", value: `${teamName(best.name)} · ${Math.round(best.rating)}` }] : []),
              ]
            : []
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr] [&>*]:min-w-0">
        <Card
          title="Teams"
          aside={
            <span className="inline-flex rounded-lg bg-floor p-0.5 text-xs font-semibold" role="group" aria-label="Order">
              {[
                { key: undefined, label: "Table" },
                { key: "elo", label: "Elo" },
              ].map((o) => {
                const on = (o.key === "elo") === byElo;
                return (
                  <Link
                    key={o.label}
                    href={sortHref(o.key)}
                    scroll={false}
                    aria-current={on ? "true" : undefined}
                    className={`rounded-md px-2.5 py-1 transition ${on ? "bg-white text-slate shadow-sm" : "text-muted hover:text-slate"}`}
                  >
                    {o.label}
                  </Link>
                );
              })}
            </span>
          }
        >
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1 pr-2">#</th>
                    <th>Team</th>
                    <th className="px-2 text-right">Pts</th>
                    <th className="px-2 text-right whitespace-nowrap max-sm:hidden">W-D-L</th>
                    <th className="px-2 text-right max-md:hidden">Goals</th>
                    <th className="px-2 text-right">Elo</th>
                    <th className="px-2 text-right max-sm:hidden" title="Elo change over the last 5 matches">±5</th>
                    <th className="px-2 max-md:hidden">Form</th>
                    <th className="pl-2 max-lg:hidden">Elo this season</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.team_id} className="border-t border-line">
                      <td className="py-2 pr-2 text-muted">{byElo ? i + 1 : r.place}</td>
                      <td className="min-w-0 py-2">
                        <TeamLink id={r.team_id} name={teamName(r.team)} />
                        <div className="text-xs text-muted">
                          {byElo ? `${r.place}. in the table` : r.elo ? `${eloRank.get(r.team_id)}. by Elo` : ""}
                        </div>
                      </td>
                      <td className="px-2 text-right font-display font-extrabold text-slate">{r.pts}</td>
                      <td className="px-2 text-right text-muted max-sm:hidden">{r.w}-{r.d}-{r.l}</td>
                      <td className="px-2 text-right text-muted max-md:hidden whitespace-nowrap">{r.gf}:{r.ga}</td>
                      <td className="px-2 text-right font-semibold text-slate">{r.elo ? Math.round(r.elo.rating) : "–"}</td>
                      <td className="px-2 text-right max-sm:hidden">{r.elo ? <Change v={r.elo.change5} /> : null}</td>
                      <td className="px-2 max-md:hidden">{r.elo ? <FormStrip steps={r.elo.last5} /> : null}</td>
                      <td className="pl-2 max-lg:hidden">{r.elo ? <Sparkline values={r.elo.spark} up={r.elo.change5 >= 0} /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No played matches in this competition yet. Pick another one from the title.</Empty>
          )}
        </Card>

        <div className="grid content-start gap-5 [&>*]:min-w-0">
          {elo && elo.upcoming.length > 0 && (
            <Card title="Next matches" aside="home win chance">
              <ul>{elo.upcoming.slice(0, 8).map((f) => <FixtureRow key={f.match.id} f={f} />)}</ul>
            </Card>
          )}
          <Card title="Elo rating">
            <p className="text-sm text-ink/85">
              A strength score from results: beating a stronger team, or winning by more, gains more points. It predicted the winner of{" "}
              {Math.round(v.eloAccuracy * 100)}% of this season&apos;s {v.decisive} decided matches (always picking the home team: {Math.round(v.homeAccuracy * 100)}%).
            </p>
            <details className="group mt-3 text-sm">
              <summary className="cursor-pointer list-none font-semibold text-sky-dark marker:hidden">
                <span className="group-open:hidden">How the rating works</span>
                <span className="hidden group-open:inline">Hide the details</span>
              </summary>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-ink/85">
                <li>Every team starts at 1500; teams in lower divisions start 100 lower per division (1. B SRL 1400, 2. SRL 1300).</li>
                <li>After each match the winner takes points from the loser: {K} × ln(goal difference + 1) × (result − expected result). A draw moves {K} × the surprise.</li>
                <li>The home team gets +{elo?.hfa ?? 40} points when the expected result is worked out, fitted from how often home teams win.</li>
                <li>One rating per team across the league, play-offs and cup of its age group ({elo?.pool ?? "Člani"}), so cup games link the divisions.</li>
                <li>A new season keeps two thirds of last season&apos;s distance from the start value. Early in a season ratings are still close to it.</li>
              </ul>
            </details>
          </Card>
        </div>
      </div>
    </>
  );
}
