import { existsSync } from "node:fs";
import { Suspense, type ReactNode } from "react";
import { join } from "node:path";
import Link from "next/link";
import { connection } from "next/server";
import { all } from "@/lib/stats/db";
import { shortName, teamName } from "@/lib/stats/groups";
import { Card, Empty, PageLoading, PageTitle, Spinner, Tip } from "../ui";
import { AutoRefresh } from "./auto-refresh";

type Progress = {
  key: string; season: string; shard: string; leagues_done: number; leagues_total: number; league: string;
  matches_new: number; errors: number; state: string; started_at: string; updated_at: string;
};
type SeasonRow = { season_id: number; name: string; matches: number; full: number; with_events: number; with_zones: number; failed: number };
type Stored = { id: number; date: string; home: string; away: string; home_goals: number | null; away_goals: number | null; competition: string; season: string };

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
const span = (s: number) => (s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const clock = (iso: string) => new Date(iso).toLocaleString("sl-SI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

/** Time left for one crawler, from its pace so far. */
function eta(p: Progress): string | null {
  const elapsed = (now() - new Date(p.started_at).getTime()) / 1000;
  if (!p.leagues_done || elapsed <= 0 || p.leagues_done >= p.leagues_total) return null;
  return span(((p.leagues_total - p.leagues_done) * elapsed) / p.leagues_done);
}

type SeasonState = { id: number; name: string; state: "done" | "running" | "waiting"; part: number; current: boolean };

/**
 * Every season RZS lists (crawl_seasons, written by crawl.py) with how far it is.
 * Done = crawler-loop.sh left crawl-<id>.done in the data folder; the current season is
 * re-crawled every run, so it counts as done once it has matches and isn't running.
 */
function seasonStates(running: Progress[], stored: SeasonRow[]): SeasonState[] {
  const list = safe<{ id: number; name: string; pos: number }>("SELECT id, name, pos FROM crawl_seasons ORDER BY pos");
  const dir = process.env.STATS_DATA_DIR ?? "./data";
  return list.map((x) => {
    const current = x.pos === 0;
    const live = running.filter((p) => p.season === x.name);
    if (live.length) {
      const done = live.reduce((a, p) => a + p.leagues_done, 0);
      const total = live.reduce((a, p) => a + p.leagues_total, 0);
      return { id: x.id, name: x.name, state: "running", part: total ? done / total : 0, current };
    }
    const finished = existsSync(join(dir, `crawl-${x.id}.done`)) || (current && stored.some((r) => r.season_id === x.id && r.matches > 0));
    return { id: x.id, name: x.name, state: finished ? "done" : "waiting", part: finished ? 1 : 0, current };
  });
}

const shortSeason = (name: string) => name.replace(/^20(\d\d)\/20(\d\d)$/, "$1/$2");

/** Label + value lines inside a tooltip. */
function TipRows({ title, rows, note }: { title: ReactNode; rows: [string, ReactNode][]; note?: ReactNode }) {
  return (
    <>
      <div className="mb-1 font-semibold text-white">{title}</div>
      <dl className="grid grid-cols-[auto_auto] gap-x-4 tabular-nums">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>{k}</dt>
            <dd className="text-right font-semibold text-white">{v}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-1.5 border-t border-white/10 pt-1.5 text-white/60">{note}</p>}
    </>
  );
}

function SeasonTip({ x, row }: { x: SeasonState; row?: SeasonRow }) {
  const status =
    x.state === "running" ? `Crawling now, ${Math.round(x.part * 100)}%` : x.state === "done" ? "Done" : "Waiting its turn";
  return (
    <TipRows
      title={`Season ${x.name}`}
      rows={[
        ["Status", status],
        ["Matches", row?.matches ? row.matches.toLocaleString("sl-SI") : "–"],
        ["Full detail", row?.matches ? `${Math.round((100 * row.full) / row.matches)}%` : "–"],
        ["Play-by-play", row?.with_events || "–"],
        ["Goal zones", row?.with_zones || "–"],
        ["To retry", row?.failed || "–"],
      ]}
      note={x.current ? "Current season: checked again on every run for new results." : x.state === "waiting" ? "Seasons are crawled newest first." : undefined}
    />
  );
}

function Stat({ label, value, tip }: { label: string; value: ReactNode; tip: ReactNode }) {
  return (
    <Tip tip={tip} align="end" className="cursor-help">
      <dt className="text-xs text-muted underline decoration-line decoration-dotted underline-offset-4">{label}</dt>
      <dd className="font-display text-xl font-bold text-slate tabular-nums">{value}</dd>
    </Tip>
  );
}

function Overall({ states, running, seasons, total }: { states: SeasonState[]; running: Progress[]; seasons: SeasonRow[]; total: number }) {
  // Before the first crawl that writes crawl_seasons, show this run only.
  const runDone = running.reduce((a, p) => a + p.leagues_done, 0);
  const runTotal = running.reduce((a, p) => a + p.leagues_total, 0);
  const runNew = running.reduce((a, p) => a + p.matches_new, 0);
  const share = states.length ? states.reduce((a, x) => a + x.part, 0) / states.length : runTotal ? runDone / runTotal : 0;
  const pct = Math.floor(share * 100);
  const doneCount = states.filter((x) => x.state === "done").length;
  const active = states.find((x) => x.state === "running");
  const byId = new Map(seasons.map((s) => [s.season_id, s]));
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
          <Stat
            label="Seasons done"
            value={states.length ? `${doneCount}/${states.length}` : "–"}
            tip="Seasons fully stored. Older seasons are crawled once; the current one again on every run."
          />
          <Stat
            label="Competitions this run"
            value={runTotal ? `${runDone}/${runTotal}` : "–"}
            tip={`Leagues and cups the running crawlers have gone through, out of all in the season${runNew ? `. ${runNew} new matches found so far.` : "."}`}
          />
          <Stat
            label="Matches stored"
            value={total.toLocaleString("sl-SI")}
            tip="Played matches in the database, every season together. Grows while the crawler runs."
          />
        </dl>
      </div>
      <Tip
        className="mt-4"
        tip={`${pct}% of all seasons. Each season counts the same; the running one counts by competitions done.`}
      >
        <div className="h-3 overflow-hidden rounded-full bg-floor" role="progressbar" aria-label="Crawled" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`h-full rounded-full bg-gradient-to-r from-sky to-court transition-[width] duration-700 ${active ? "bar-shine" : ""}`}
            style={{ width: `${Math.max(pct, 1)}%` }}
          />
        </div>
      </Tip>
      <p className="mt-2 flex items-center gap-2 text-sm text-muted">
        {active || running.length ? <Spinner className="size-3.5 text-court" /> : null}
        <span>
          {active
            ? active.current
              ? `Checking ${active.name} for new results (${Math.round(active.part * 100)}%)`
              : `Filling in ${active.name} (${Math.round(active.part * 100)}%)`
            : running.length
              ? "Crawling"
              : "Idle until the next run"}
          {states.length ? ` · newest first, back to ${states[states.length - 1].name}` : ""}
        </span>
      </p>
      {states.length > 0 && (
        <ol className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-1.5" aria-label="Seasons">
          {states.map((x) => (
            <li key={x.id}>
              <Tip tip={<SeasonTip x={x} row={byId.get(x.id)} />}>
                <div
                  className={`relative overflow-hidden rounded-lg px-2 py-1.5 text-center text-[0.7rem] font-semibold tabular-nums transition ${
                    x.state === "done"
                      ? "bg-sky text-white hover:bg-sky-dark"
                      : x.state === "running"
                        ? "bg-floor text-slate ring-2 ring-court"
                        : "bg-floor text-muted hover:bg-line"
                  }`}
                >
                  {x.state === "running" && (
                    <span className="bar-live absolute inset-y-0 left-0 bg-court/50 transition-[width] duration-700" style={{ width: `${x.part * 100}%` }} aria-hidden />
                  )}
                  <span className="relative inline-flex items-center gap-1">
                    {x.state === "running" && <Spinner className="size-2.5" />}
                    {shortSeason(x.name)}
                  </span>
                </div>
              </Tip>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function CrawlerRow({ p, live, current }: { p: Progress; live: boolean; current: boolean }) {
  const pct = p.leagues_total ? Math.round((100 * p.leagues_done) / p.leagues_total) : 0;
  const left = live ? eta(p) : null;
  const took = (new Date(p.updated_at).getTime() - new Date(p.started_at).getTime()) / 1000;
  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-semibold text-ink">
          <span className={`mr-2 inline-block size-2 rounded-full ${live ? "bg-court motion-safe:animate-pulse" : p.state === "done" ? "bg-sky" : "bg-foul"}`} />
          Season {p.season} · part {p.shard}
          {live && (
            <span className="ml-2 rounded-full bg-court/15 px-2 py-0.5 text-[0.7rem] font-semibold text-[#5d7a12]">
              {current ? "new results" : "history"}
            </span>
          )}
        </span>
        <span className="text-muted tabular-nums">
          {p.leagues_done}/{p.leagues_total} competitions · {p.matches_new} new matches
          {p.errors ? <span className="text-foul"> · {p.errors} errors</span> : null} · updated {ago(p.updated_at)}
        </span>
      </div>
      <Tip
        className="mt-1.5"
        tip={
          <TipRows
            title={`Part ${p.shard} · ${pct}%`}
            rows={[
              ["Started", clock(p.started_at)],
              [live ? "Running for" : "Took", span(live ? (now() - new Date(p.started_at).getTime()) / 1000 : took)],
              ...(left ? ([["Time left", `about ${left}`]] as [string, ReactNode][]) : []),
              ["New matches", p.matches_new],
              ["Errors", p.errors || "–"],
            ]}
            note="The season is split into parts that each take their own competitions and run side by side."
          />
        }
      >
        <div className="h-2.5 overflow-hidden rounded-full bg-floor">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ${live ? "bar-live bg-court" : "bg-sky/60"}`}
            style={{ width: `${Math.max(pct, live ? 2 : 0)}%` }}
          />
        </div>
      </Tip>
      <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted">
        {live && <Spinner className="size-3 text-court" />}
        <span className="truncate">
          {live
            ? `${p.league ? `Reading ${p.league}` : "Starting"}${left ? ` · about ${left} left` : ""}`
            : p.state === "done"
              ? `Finished in ${span(took)}, started ${ago(p.started_at)}`
              : `Stopped ${ago(p.updated_at)}`}
        </span>
      </div>
    </li>
  );
}

function JustStored({ rows, live }: { rows: Stored[]; live: boolean }) {
  return (
    <Card
      title="Just stored"
      aside={
        live ? (
          <span className="flex items-center gap-1.5 font-semibold text-[#5d7a12]">
            <span className="live-dot size-1.5 rounded-full bg-court" /> live
          </span>
        ) : (
          "latest saved"
        )
      }
    >
      {rows.length ? (
        <ul className="divide-y divide-line text-sm">
          {rows.map((m) => (
            <li key={m.id} className="row-in -mx-2 rounded-lg px-2">
              <Link href={`/stats/matches/${m.id}`} className="flex items-baseline justify-between gap-3 py-1.5 hover:text-sky-dark">
                <span className="min-w-0 truncate">
                  <span className="text-ink">{teamName(m.home)}</span>
                  <span className="text-muted"> – </span>
                  <span className="text-ink">{teamName(m.away)}</span>
                  <span className="block truncate text-xs text-muted">
                    {shortName(m.competition)} · {m.season} · {m.date}
                  </span>
                </span>
                <span className="shrink-0 font-display font-bold text-slate tabular-nums">
                  {m.home_goals ?? "–"}:{m.away_goals ?? "–"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nothing stored yet.</Empty>
      )}
      {live && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <span className="typing inline-flex gap-0.5" aria-hidden>
            <span className="size-1 rounded-full bg-muted" />
            <span className="size-1 rounded-full bg-muted" />
            <span className="size-1 rounded-full bg-muted" />
          </span>
          New matches show up here as they are saved.
        </p>
      )}
    </Card>
  );
}

export default function CrawlPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CrawlPageBody />
    </Suspense>
  );
}

async function CrawlPageBody() {
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
  // INSERT OR REPLACE gives a re-saved match a new rowid, so this is "last written".
  const stored = safe<Stored>(
    `SELECT m.id, m.date, m.home, m.away, m.home_goals, m.away_goals, c.name AS competition, s.name AS season
     FROM matches m JOIN competitions c ON c.id = m.competition_id JOIN seasons s ON s.id = m.season_id
     WHERE m.status = 1 ORDER BY m.rowid DESC LIMIT 8`,
  );
  const running = progress.filter(isLive);
  const total = seasons.reduce((a, s) => a + s.matches, 0);
  const states = seasonStates(running, seasons);
  const currentName = states.find((x) => x.current)?.name;

  return (
    <>
      <PageTitle
        eyebrow="Data collection"
        title="Crawler"
        action={<AutoRefresh seconds={15} />}
        sub={
          running.length ? (
            <span className="flex items-center gap-2">
              <span className="live-dot size-2 rounded-full bg-court" aria-hidden />
              {running.length} crawler{running.length > 1 ? "s" : ""} running · reading RZS for new results and older seasons ·{" "}
              {total.toLocaleString("sl-SI")} matches stored
            </span>
          ) : (
            `Idle · ${total.toLocaleString("sl-SI")} matches stored · the crawler checks for new results every 6 hours`
          )
        }
      />

      <Overall states={states} running={running} seasons={seasons} total={total} />

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card title="Crawlers" aside="one row per process">
          {progress.length ? (
            <ul className="flex flex-col gap-4">
              {progress.map((p) => (
                <CrawlerRow key={p.key} p={p} live={running.includes(p)} current={p.season === currentName} />
              ))}
            </ul>
          ) : (
            <Empty>No crawl has run yet. The crawler container starts one right after a deploy.</Empty>
          )}
        </Card>

        <JustStored rows={stored} live={running.length > 0} />
      </div>

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
