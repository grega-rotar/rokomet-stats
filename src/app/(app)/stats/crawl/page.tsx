import { connection } from "next/server";
import { all } from "@/lib/stats/db";
import { Card, Empty, PageTitle } from "../ui";
import { AutoRefresh } from "./auto-refresh";

type Progress = {
  key: string; season: string; shard: string; leagues_done: number; leagues_total: number; league: string;
  matches_new: number; errors: number; state: string; started_at: string; updated_at: string;
};
type SeasonRow = { season_id: number; name: string; matches: number; full: number; with_events: number; with_zones: number; failed: number };

function safe<T>(sql: string): T[] {
  try {
    return all<T>(sql);
  } catch {
    return []; // the table appears with the first crawl
  }
}

// Outside the component: render code must stay pure (react-hooks/purity).
const now = () => Date.now();
const isLive = (p: { state: string; updated_at: string }) => p.state === "running" && now() - new Date(p.updated_at).getTime() < 15 * 60_000;

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((now() - new Date(iso).getTime()) / 1000));
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

export default async function CrawlPage() {
  await connection();
  const progress = safe<Progress>("SELECT * FROM crawl_progress ORDER BY state = 'running' DESC, updated_at DESC");
  const seasons = safe<SeasonRow>(
    `SELECT s.id AS season_id, s.name, count(m.id) AS matches, sum(m.detail = 'full') AS full,
            sum(EXISTS (SELECT 1 FROM events e WHERE e.match_id = m.id)) AS with_events,
            sum(EXISTS (SELECT 1 FROM team_zones z WHERE z.match_id = m.id)) AS with_zones,
            sum(EXISTS (SELECT 1 FROM checks k WHERE k.match_id = m.id AND k.ok = 0 AND (k.name LIKE 'fetch_%' OR k.name = 'load'))) AS failed
     FROM seasons s LEFT JOIN matches m ON m.season_id = s.id AND m.status = 1
     GROUP BY s.id ORDER BY s.name DESC`,
  );
  const errors = safe<{ match_id: number; name: string; detail: string }>(
    "SELECT match_id, name, detail FROM checks WHERE ok = 0 AND (name LIKE 'fetch_%' OR name = 'load') ORDER BY rowid DESC LIMIT 8",
  );
  const running = progress.filter(isLive);
  const total = seasons.reduce((a, s) => a + s.matches, 0);

  return (
    <>
      <AutoRefresh seconds={15} />
      <PageTitle
        eyebrow="Data collection"
        title="Crawler"
        sub={
          running.length
            ? `${running.length} crawler${running.length > 1 ? "s" : ""} running · ${total.toLocaleString("sl-SI")} matches stored · refreshes every 15 s`
            : `Idle · ${total.toLocaleString("sl-SI")} matches stored · the crawler runs every 6 hours`
        }
      />

      <Card title="Crawlers" className="mb-6" aside="one row per process">
        {progress.length ? (
          <ul className="flex flex-col gap-4">
            {progress.map((p) => {
              const pct = p.leagues_total ? Math.round((100 * p.leagues_done) / p.leagues_total) : 0;
              const live = running.includes(p);
              return (
                <li key={p.key}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="font-semibold text-ink">
                      <span className={`mr-2 inline-block size-2 rounded-full ${live ? "bg-court motion-safe:animate-pulse" : p.state === "done" ? "bg-sky" : "bg-foul"}`} />
                      Season {p.season} · part {p.shard}
                    </span>
                    <span className="text-muted tabular-nums">
                      {p.leagues_done}/{p.leagues_total} competitions · {p.matches_new} new matches
                      {p.errors ? <span className="text-foul"> · {p.errors} errors</span> : null} · updated {ago(p.updated_at)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 rounded-full bg-floor">
                    <div className={`h-full rounded-full ${live ? "bg-court" : "bg-sky/60"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 truncate text-xs text-muted">
                    {live ? `Now: ${p.league || "starting"}` : p.state === "done" ? `Finished, started ${ago(p.started_at)}` : `Stopped ${ago(p.updated_at)}`}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>No crawl has run yet. The crawler container starts one right after a deploy.</Empty>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card title="Stored per season" aside="full = shots, goalkeepers and play-by-play exist (2019/20+)">
          {seasons.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1">Season</th>
                    <th className="px-2 text-right">Matches</th>
                    <th className="px-2 text-right">Full detail</th>
                    <th className="px-2 text-right max-sm:hidden">Play-by-play</th>
                    <th className="px-2 text-right max-sm:hidden">Goal zones</th>
                    <th className="pl-2 text-right">Retry</th>
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((s) => (
                    <tr key={s.season_id} className="border-t border-line">
                      <td className="py-1.5 font-semibold text-ink">{s.name}</td>
                      <td className="px-2 text-right">{s.matches.toLocaleString("sl-SI")}</td>
                      <td className="px-2 text-right text-muted">{s.matches ? `${Math.round((100 * s.full) / s.matches)}%` : "–"}</td>
                      <td className="px-2 text-right text-muted max-sm:hidden">{s.with_events || "–"}</td>
                      <td className="px-2 text-right text-muted max-sm:hidden">{s.with_zones || "–"}</td>
                      <td className={`pl-2 text-right ${s.failed ? "text-foul" : "text-muted"}`}>{s.failed || "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Nothing stored yet.</Empty>
          )}
        </Card>

        <Card title="Latest fetch errors" aside="retried on the next run">
          {errors.length ? (
            <ul className="divide-y divide-line text-sm">
              {errors.map((e) => (
                <li key={`${e.match_id}-${e.name}`} className="flex justify-between gap-3 py-1.5">
                  <span className="text-ink">Match {e.match_id} <span className="text-muted">· {e.name.replace("fetch_", "")}</span></span>
                  <span className="text-right text-foul">{e.detail.replace(/^HTTPError: HTTP Error (\d+).*/, "HTTP $1")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No errors.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
