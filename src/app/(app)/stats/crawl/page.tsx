import { existsSync } from "node:fs";
import { join } from "node:path";
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

type SeasonState = { id: number; name: string; state: "done" | "running" | "waiting"; part: number };

/**
 * Every season RZS lists (crawl_seasons, written by crawl.py) with how far it is.
 * Done = crawler-loop.sh left crawl-<id>.done in the data folder; the current season is
 * re-crawled every run, so it counts as done once it has matches and isn't running.
 */
function seasonStates(running: Progress[], stored: SeasonRow[]): SeasonState[] {
  const list = safe<{ id: number; name: string; pos: number }>("SELECT id, name, pos FROM crawl_seasons ORDER BY pos");
  const dir = process.env.STATS_DATA_DIR ?? "./data";
  return list.map((x) => {
    const live = running.filter((p) => p.season === x.name);
    if (live.length) {
      const done = live.reduce((a, p) => a + p.leagues_done, 0);
      const total = live.reduce((a, p) => a + p.leagues_total, 0);
      return { id: x.id, name: x.name, state: "running", part: total ? done / total : 0 };
    }
    const finished =
      existsSync(join(dir, `crawl-${x.id}.done`)) || (x.pos === 0 && stored.some((r) => r.season_id === x.id && r.matches > 0));
    return { id: x.id, name: x.name, state: finished ? "done" : "waiting", part: finished ? 1 : 0 };
  });
}

const shortSeason = (name: string) => name.replace(/^20(\d\d)\/20(\d\d)$/, "$1/$2");

function Overall({ states, running, total }: { states: SeasonState[]; running: Progress[]; total: number }) {
  // Before the first crawl that writes crawl_seasons, show this run only.
  const runDone = running.reduce((a, p) => a + p.leagues_done, 0);
  const runTotal = running.reduce((a, p) => a + p.leagues_total, 0);
  const share = states.length ? states.reduce((a, x) => a + x.part, 0) / states.length : runTotal ? runDone / runTotal : 0;
  const pct = Math.floor(share * 100);
  const doneCount = states.filter((x) => x.state === "done").length;
  const now = states.find((x) => x.state === "running");
  return (
    <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-line md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <div className="text-sm font-semibold text-sky-dark">{states.length ? "All seasons" : "This run"}</div>
          <div className="font-display text-5xl font-extrabold tracking-tight text-slate tabular-nums">
            {pct}
            <span className="text-2xl text-muted">%</span>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-x-6 text-right">
          <div>
            <dt className="text-xs text-muted">Seasons done</dt>
            <dd className="font-display text-xl font-bold text-slate tabular-nums">{states.length ? `${doneCount}/${states.length}` : "–"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Competitions this run</dt>
            <dd className="font-display text-xl font-bold text-slate tabular-nums">{runTotal ? `${runDone}/${runTotal}` : "–"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Matches stored</dt>
            <dd className="font-display text-xl font-bold text-slate tabular-nums">{total.toLocaleString("sl-SI")}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-floor" role="progressbar" aria-label="Crawled" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-sky to-court transition-[width] duration-700" style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">
        {now ? `Now crawling ${now.name} (${Math.round(now.part * 100)}%)` : running.length ? "Crawling" : "Idle until the next run"}
        {states.length ? ` · newest first, back to ${states[states.length - 1].name}` : ""}
      </p>
      {states.length > 0 && (
        <ol className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-1.5" aria-label="Seasons">
          {states.map((x) => (
            <li
              key={x.id}
              title={`${x.name}: ${x.state === "running" ? `${Math.round(x.part * 100)}% done` : x.state}`}
              className={`relative overflow-hidden rounded-lg px-2 py-1.5 text-center text-[0.7rem] font-semibold tabular-nums ${
                x.state === "done" ? "bg-sky text-white" : x.state === "running" ? "bg-floor text-slate ring-2 ring-court" : "bg-floor text-muted"
              }`}
            >
              {x.state === "running" && <span className="absolute inset-y-0 left-0 bg-court/40" style={{ width: `${x.part * 100}%` }} aria-hidden />}
              <span className="relative">{shortSeason(x.name)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

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
  const states = seasonStates(running, seasons);

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

      <Overall states={states} running={running} total={total} />

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
