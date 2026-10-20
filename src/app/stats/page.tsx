import { connection } from "next/server";
import Link from "next/link";
import { competitions, results, searchPlayers, seasons, standings, topScorers } from "@/lib/stats/queries";
import { Card, Empty, PageTitle, PlayerLink, TeamLink } from "./ui";

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
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const found = q.length >= 2 ? searchPlayers(q) : [];
  const table = comp ? standings(comp.id, seasonId) : [];
  const latest = comp ? results(comp.id, seasonId) : [];
  const scorers = comp ? topScorers(comp.id, seasonId) : [];
  const season = allSeasons.find((s) => s.id === seasonId);

  return (
    <>
      <PageTitle eyebrow={`Season ${season?.name ?? ""}`} title={comp?.name ?? "Competitions"} sub={`${comp?.matches ?? 0} matches played`} />

      <form className="mb-6 flex flex-wrap gap-2" action="/stats">
        <input type="hidden" name="season" value={seasonId} />
        <select name="comp" defaultValue={compId} className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm shadow-sm">
          {["top", "senior", "youth"].map((cat) => (
            <optgroup key={cat} label={{ top: "Top leagues", senior: "Senior", youth: "Youth" }[cat]}>
              {comps.filter((c) => c.category === cat).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.matches})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button className="bg-sky rounded-xl px-4 py-2 text-sm font-semibold shadow-sm text-white hover:bg-sky-dark">
          Show
        </button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Standings" aside="2 points for a win, 1 for a draw">
          {table.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1 pr-2">#</th>
                    <th className="py-1">Team</th>
                    <th className="px-1.5 text-right">P</th>
                    <th className="px-1.5 text-right">W</th>
                    <th className="px-1.5 text-right">D</th>
                    <th className="px-1.5 text-right">L</th>
                    <th className="px-1.5 text-right">Goals</th>
                    <th className="pl-1.5 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((t, i) => (
                    <tr key={t.team_id} className="border-t border-line">
                      <td className="py-1.5 pr-2 text-muted">{i + 1}</td>
                      <td className="py-1.5"><TeamLink id={t.team_id} name={t.team} /></td>
                      <td className="px-1.5 text-right">{t.p}</td>
                      <td className="px-1.5 text-right">{t.w}</td>
                      <td className="px-1.5 text-right">{t.d}</td>
                      <td className="px-1.5 text-right">{t.l}</td>
                      <td className="px-1.5 text-right whitespace-nowrap">{t.gf}:{t.ga}</td>
                      <td className="pl-1.5 text-right font-display font-extrabold text-slate">{t.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No finished matches in this competition yet.</Empty>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Find a player">
            <form action="/stats" className="flex gap-2">
              <input type="hidden" name="season" value={seasonId} />
              {compId && <input type="hidden" name="comp" value={compId} />}
              <input
                name="q"
                defaultValue={q}
                placeholder="Name, e.g. Jesenko"
                className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm"
                aria-label="Player name"
              />
              <button className="bg-slate rounded-xl px-4 py-2 text-sm font-semibold shadow-sm text-white hover:bg-slate-deep">
                Search
              </button>
            </form>
            {q.length >= 2 && (
              <ul className="mt-3 divide-y divide-line text-sm">
                {found.length ? (
                  found.map((p) => (
                    <li key={p.player_id} className="flex justify-between gap-2 py-1.5">
                      <span><PlayerLink id={p.player_id} name={p.name} /> <span className="text-muted">· {p.position}</span></span>
                      <span className="text-right text-muted">{p.team}</span>
                    </li>
                  ))
                ) : (
                  <li className="py-1.5 text-muted">No player called &ldquo;{q}&rdquo;. Check the spelling, with č, š, ž.</li>
                )}
              </ul>
            )}
          </Card>

          <Card title="Top scorers" aside={<Link href={`/stats/rankings?comp=${compId}`} className="text-sky-dark hover:underline">All rankings</Link>}>
            {scorers.length ? (
              <ol className="divide-y divide-line text-sm">
                {scorers.map((p, i) => (
                  <li key={p.player_id} className="flex items-baseline gap-3 py-1.5">
                    <span className="w-5 text-muted tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate"><PlayerLink id={p.player_id} name={p.name} /> <span className="text-muted">· {p.team}</span></span>
                    <span className="font-display font-extrabold text-slate tabular-nums">{p.goals}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>No player stats yet.</Empty>
            )}
          </Card>
        </div>
      </div>

      <Card title="Latest results" className="mt-6">
        {latest.length ? (
          <ul className="grid gap-x-8 text-sm sm:grid-cols-2">
            {latest.map((m) => (
              <li key={m.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0 sm:[&:nth-child(2)]:border-t-0">
                <span className="w-20 shrink-0 text-xs text-muted">{m.date}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate"><TeamLink id={m.home_team_id} name={m.home} /></span>
                  <span className="block truncate"><TeamLink id={m.away_team_id} name={m.away} /></span>
                </span>
                <span className="text-right font-display font-extrabold tabular-nums text-slate">
                  <span className="block">{m.home_goals}</span>
                  <span className="block">{m.away_goals}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No results yet.</Empty>
        )}
      </Card>
    </>
  );
}
