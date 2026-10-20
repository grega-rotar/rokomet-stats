import { connection } from "next/server";
import { competitions, K, MIN_SHOTS, positions, RANK_METRICS, rankings, seasons, TYPE_METRICS, type RankMetric } from "@/lib/stats/queries";
import { TYPE_K, TYPE_MIN } from "@/lib/stats/shot-types";
import { Card, Empty, PageTitle, PlayerLink } from "../ui";

const NOTES: Record<RankMetric, string> = {
  goals: "Total goals, 7m included.",
  shooting: `Players with ${MIN_SHOTS}+ shots. Each player's % is pulled toward the average by ${K} shots, so a 3/3 start doesn't top the table.`,
  sevens: "Players with 5+ penalties, pulled toward the average by 5 attempts.",
  gpm: "Players with 3+ matches.",
  two_min: "Most two-minute suspensions.",
  nine: typeNote("9m"),
  six: typeNote("6m"),
  wing: typeNote("wing"),
};

function typeNote(type: string) {
  return `Goals/shots from ${type === "wing" ? "the wing" : type} on the match stats sheets (top senior competitions only). Players with ${TYPE_MIN}+ attempts, pulled toward the average by ${TYPE_K} attempts.`;
}

export default async function RankingsPage({ searchParams }: PageProps<"/stats/rankings">) {
  await connection(); // stats.db changes under us: never prerender
  const sp = await searchParams;
  const allSeasons = seasons();
  const seasonId = Number(sp.season) || allSeasons[0]?.id;
  if (!seasonId) return <PageTitle title="No data yet" sub="The crawler hasn't filled the stats database yet." />;
  const metric = (Object.keys(RANK_METRICS).includes(String(sp.metric)) ? sp.metric : "goals") as RankMetric;
  const comps = competitions(seasonId);
  const compId = Number(sp.comp) || undefined;
  const position = typeof sp.position === "string" && sp.position ? sp.position : undefined;
  const { rows, average } = rankings(metric, { seasonId, competitionId: compId, position });
  const typeKey = TYPE_METRICS[metric];
  const isPct = metric === "shooting" || metric === "sevens" || !!typeKey;
  const show = (r: (typeof rows)[number]) => (isPct ? `${(r.score * 100).toFixed(0)}%` : metric === "gpm" ? r.score.toFixed(1) : r.score);
  const avgPct = metric === "shooting" ? average.shooting : metric === "sevens" ? average.sevens : typeKey ? average.type : null;

  return (
    <>
      <PageTitle eyebrow={`Season ${allSeasons.find((s) => s.id === seasonId)?.name ?? ""}`} title="Rankings" />
      <form action="/stats/rankings" className="mb-6 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input type="hidden" name="season" value={seasonId} />
        <select name="metric" defaultValue={metric} aria-label="Rank by" className="rounded-xl border border-line bg-white px-3 py-2 text-sm shadow-sm">
          {Object.entries(RANK_METRICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="comp" defaultValue={compId ?? ""} aria-label="Competition" className="rounded-xl border border-line bg-white px-3 py-2 text-sm shadow-sm">
          <option value="">All competitions</option>
          {comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="position" defaultValue={position ?? ""} aria-label="Position" className="rounded-xl border border-line bg-white px-3 py-2 text-sm shadow-sm">
          <option value="">All positions</option>
          {positions(seasonId).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="bg-sky rounded-xl px-4 py-2 text-sm font-semibold shadow-sm text-white hover:bg-sky-dark">Rank</button>
      </form>

      <Card
        title={RANK_METRICS[metric]}
        aside={avgPct !== null ? `average ${avgPct.toFixed(0)}%` : undefined}
      >
        <p className="mb-3 text-xs text-muted">{NOTES[metric]}</p>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2">#</th><th>Player</th><th className="max-sm:hidden">Team</th>
                  <th className="px-2 text-right max-sm:hidden">M</th><th className="px-2 text-right whitespace-nowrap">Goals/shots</th><th className={`px-2 text-right ${typeKey ? "" : "max-sm:hidden"}`}>{typeKey ?? "7m"}</th>
                  <th className="pl-3 text-right">{RANK_METRICS[metric]}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.player_id} className="border-t border-line">
                    <td className="py-1.5 pr-2 text-muted">{i + 1}</td>
                    <td><PlayerLink id={r.player_id} name={r.name} /> <span className="text-xs text-muted">{r.position}</span></td>
                    <td className="text-muted max-sm:hidden">{r.team}</td>
                    <td className="px-2 text-right max-sm:hidden">{r.matches}</td>
                    <td className="px-2 text-right">{r.goals}/{r.shots}</td>
                    {typeKey ? (
                      <td className="px-2 text-right">{r.typed?.goals}/{r.typed?.shots}</td>
                    ) : (
                      <td className="px-2 text-right max-sm:hidden">{r.goals_7m}/{r.shots_7m}</td>
                    )}
                    <td className="pl-3 text-right font-display font-extrabold text-slate">{show(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No players meet the minimum for this ranking yet. Try all competitions or another position.</Empty>
        )}
      </Card>
    </>
  );
}
