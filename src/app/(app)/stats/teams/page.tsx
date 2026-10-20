import { connection } from "next/server";
import { Suspense } from "react";
import { PageLoading } from "../ui";
import { competitions, seasons } from "@/lib/stats/queries";
import { K } from "@/lib/stats/elo";
import { eloTable, eloValidation } from "@/lib/stats/teams";
import { Change, FixtureRow, FormStrip, Sparkline } from "../elo-ui";
import { Card, Empty, PageTitle, TeamLink } from "../ui";

export default function TeamsPage(props: PageProps<"/stats/teams">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <TeamsPageBody {...props} />
    </Suspense>
  );
}

async function TeamsPageBody({ searchParams }: PageProps<"/stats/teams">) {
  await connection(); // stats.db changes under us: never prerender
  const sp = await searchParams;
  const allSeasons = seasons();
  const seasonId = Number(sp.season) || allSeasons[0]?.id;
  if (!seasonId) return <PageTitle title="No data yet" sub="The crawler hasn't filled the stats database yet." />;
  const comps = competitions(seasonId);
  const compId = Number(sp.comp) || comps[0]?.id;
  const t = compId ? eloTable(compId, seasonId) : null;
  const v = eloValidation(seasonId);

  return (
    <>
      <PageTitle
        eyebrow={`Season ${allSeasons.find((s) => s.id === seasonId)?.name ?? ""}`}
        title="Team ratings"
        sub="Elo: a team gains points for beating a stronger team, and more for a bigger win."
      />
      <form action="/stats/teams" className="mb-6 flex flex-wrap gap-2">
        <input type="hidden" name="season" value={seasonId} />
        <select name="comp" defaultValue={compId} aria-label="Competition" className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm shadow-sm">
          {["top", "senior", "youth"].map((cat) => (
            <optgroup key={cat} label={{ top: "Top leagues", senior: "Senior", youth: "Youth" }[cat]}>
              {comps.filter((c) => c.category === cat).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
        <button className="bg-sky rounded-xl px-4 py-2 text-sm font-semibold shadow-sm text-white hover:bg-sky-dark">Show</button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] [&>*]:min-w-0">
        <Card title={t?.competition ?? "Elo"} aside={t ? `${t.pool} pool · home +${t.hfa}` : undefined}>
          {t?.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1 pr-2">#</th>
                    <th>Team</th>
                    <th className="px-2 text-right">Elo</th>
                    <th className="px-2 text-right whitespace-nowrap">Last 5</th>
                    <th className="px-2 max-sm:hidden">Form</th>
                    <th className="pl-2 max-md:hidden">Season</th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r, i) => (
                    <tr key={r.team_id} className="border-t border-line">
                      <td className="py-2 pr-2 text-muted">{i + 1}</td>
                      <td className="min-w-0 py-2">
                        <TeamLink id={r.team_id} name={r.name} />
                        <div className="mt-1 sm:hidden"><FormStrip steps={r.last5} /></div>
                      </td>
                      <td className="px-2 text-right font-display font-extrabold text-slate">{Math.round(r.rating)}</td>
                      <td className="px-2 text-right"><Change v={r.change5} /></td>
                      <td className="px-2 max-sm:hidden"><FormStrip steps={r.last5} /></td>
                      <td className="pl-2 max-md:hidden"><Sparkline values={r.spark} up={r.change5 >= 0} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No played matches in this competition yet.</Empty>
          )}
        </Card>

        <div className="grid content-start gap-6 [&>*]:min-w-0">
          {t && t.upcoming.length > 0 && (
            <Card title="Upcoming" aside="home win chance">
              <ul>{t.upcoming.slice(0, 8).map((f) => <FixtureRow key={f.match.id} f={f} />)}</ul>
            </Card>
          )}
          <Card title="How the rating works">
            <ul className="list-disc space-y-1.5 pl-4 text-sm text-ink/85">
              <li>Every team starts at 1500; teams in lower divisions start 100 lower per division (1. B SRL 1400, 2. SRL 1300).</li>
              <li>After each match the winner takes points from the loser: {K} × ln(goal difference + 1) × (result − expected result). A draw moves {K} × the surprise.</li>
              <li>The home team gets +{t?.hfa ?? 40} points when the expected result is worked out, fitted from how often home teams win.</li>
              <li>One rating per team across the league, play-offs and cup of its age group ({t?.pool ?? "Člani"}), so cup games link the divisions.</li>
              <li>A new season keeps two thirds of last season&apos;s distance from the start value.</li>
            </ul>
            <p className="mt-3 text-sm text-muted">
              This season, the higher-rated team (home +{t?.hfa ?? 40}) won {Math.round(v.eloAccuracy * 100)}% of {v.decisive} matches that had a winner;
              always picking the home team gets {Math.round(v.homeAccuracy * 100)}%. Early-season ratings are still close to the start value.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
