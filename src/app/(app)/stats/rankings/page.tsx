import { connection } from "next/server";
import { competitions, K, MIN_SHOTS, positions, RANK_METRICS, rankings, seasons, type RankMetric } from "@/lib/stats/queries";
import { competitionGroup, describeCompetition, positionLabel, shortName, teamName } from "@/lib/stats/groups";
import { ParamSelect, type Option } from "../select";
import { Card, Empty, PageTitle, PlayerLink, ShowMore } from "../ui";

const STEP = 30;

const NOTES: Record<RankMetric, string> = {
  goals: "Total goals, 7m included.",
  shooting: `Players with ${MIN_SHOTS}+ shots. Each player's % is pulled toward the average by ${K} shots, so a 3/3 start doesn't top the table.`,
  sevens: "Players with 5+ penalties, pulled toward the average by 5 attempts.",
  gpm: "Players with 3+ matches.",
  two_min: "Most two-minute suspensions.",
};

const HINTS: Record<RankMetric, string> = {
  goals: "Total goals, 7m included",
  shooting: `Goals per shot, ${MIN_SHOTS}+ shots`,
  sevens: "7m penalties scored, 5+ taken",
  gpm: "Average per match, 3+ matches",
  two_min: "Most two-minute suspensions",
};

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
  const shown = Math.max(STEP, Number(sp.show) || STEP);
  // One extra row says whether "Show more" has anything left.
  const { rows: ranked, average } = rankings(metric, { seasonId, competitionId: compId, position }, shown + 1);
  const rows = ranked.slice(0, shown);
  const more = new URLSearchParams(
    Object.entries({ season: String(seasonId), metric, comp: compId ? String(compId) : "", position: position ?? "", show: String(shown + STEP) }).filter(([, v]) => v),
  );
  const select = {
    path: "/stats/rankings",
    params: { season: String(seasonId), metric, comp: compId ? String(compId) : undefined, position },
  };
  const metricOptions: Option[] = (Object.keys(RANK_METRICS) as RankMetric[]).map((k) => ({ value: k, label: RANK_METRICS[k], hint: HINTS[k] }));
  const compOptions: Option[] = [
    { value: "", label: "All competitions", hint: "Every league and cup this season" },
    ...[...comps]
      .sort((a, b) => competitionGroup(a.name).order - competitionGroup(b.name).order || a.name.localeCompare(b.name, "sl", { numeric: true }))
      .map((c) => ({ value: String(c.id), label: shortName(c.name), hint: describeCompetition(c.name), group: competitionGroup(c.name).label })),
  ];
  const positionOptions: Option[] = [
    { value: "", label: "All positions" },
    ...positions(seasonId).map((p) => ({ value: p, label: positionLabel(p), hint: p })),
  ];
  const show = (r: (typeof rows)[number]) =>
    metric === "shooting" ? `${(r.score * 100).toFixed(0)}%` : metric === "sevens" ? `${(r.score * 100).toFixed(0)}%` : metric === "gpm" ? r.score.toFixed(1) : r.score;

  return (
    <>
      <PageTitle eyebrow={`Season ${allSeasons.find((s) => s.id === seasonId)?.name ?? ""}`} title="Rankings" />
      <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,0.7fr)_1fr_1.4fr_1fr]">
        <ParamSelect {...select} param="season" reset={["comp"]} label="Season" value={String(seasonId)} options={allSeasons.map((x) => ({ value: String(x.id), label: x.name }))} />
        <ParamSelect {...select} param="metric" label="Rank by" value={metric} options={metricOptions} />
        <ParamSelect {...select} param="comp" label="Competition" value={compId ? String(compId) : ""} options={compOptions} searchable />
        <ParamSelect {...select} param="position" label="Position" value={position ?? ""} options={positionOptions} />
      </div>

      <Card
        title={RANK_METRICS[metric]}
        aside={metric === "shooting" ? `average ${average.shooting.toFixed(0)}%` : metric === "sevens" ? `average ${average.sevens.toFixed(0)}%` : undefined}
      >
        <p className="mb-3 text-xs text-muted">{NOTES[metric]}</p>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2">#</th><th>Player</th><th className="max-sm:hidden">Team</th>
                  <th className="px-2 text-right max-sm:hidden">M</th><th className="px-2 text-right whitespace-nowrap">Goals/shots</th><th className="px-2 text-right max-sm:hidden">7m</th>
                  <th className="pl-3 text-right">{RANK_METRICS[metric]}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.player_id} className="border-t border-line">
                    <td className="py-1.5 pr-2 text-muted">{i + 1}</td>
                    <td><PlayerLink id={r.player_id} name={r.name} /> <span className="text-xs text-muted">{positionLabel(r.position)}</span></td>
                    <td className="text-muted max-sm:hidden">{teamName(r.team)}</td>
                    <td className="px-2 text-right max-sm:hidden">{r.matches}</td>
                    <td className="px-2 text-right">{r.goals}/{r.shots}</td>
                    <td className="px-2 text-right max-sm:hidden">{r.goals_7m}/{r.shots_7m}</td>
                    <td className="pl-3 text-right font-display font-extrabold text-slate">{show(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {ranked.length > shown && <ShowMore href={`/stats/rankings?${more}`}>Show {STEP} more players</ShowMore>}
        {rows.length ? null : (
          <Empty>No players meet the minimum for this ranking yet. Try all competitions or another position.</Empty>
        )}
      </Card>
    </>
  );
}
