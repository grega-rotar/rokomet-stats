import type { ReactNode } from "react";
import { connection } from "next/server";
import { checkRates, coverage, crawlRuns, failures, latestAudit, type Coverage, type Failure } from "@/lib/stats/quality";
import { auditFieldLabel, checkGroup, checkLabel, formatStamp, kindLabel, pct } from "@/lib/stats/quality-format";
import { Card, Empty, PageTitle } from "../ui";

const SHOW = 8; // AI reviews and open failures shown before "Show more"

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-line sm:px-5 sm:py-4">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-1 font-display text-xl font-extrabold text-slate tabular-nums sm:text-2xl">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Share({ part, whole }: { part: number; whole: number }) {
  const p = pct(part, whole) ?? 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="tabular-nums">{p}%</span>
      <span className="hidden h-1.5 w-14 rounded-full bg-floor sm:block" aria-hidden>
        <span className="block h-full rounded-full bg-court" style={{ width: `${p}%` }} />
      </span>
    </div>
  );
}

function SourceBadge({ source }: { source: Failure["source"] }) {
  const style = source === "ai" ? "bg-sky/15 text-sky-dark" : source === "rule" ? "bg-slate/10 text-slate" : "bg-foul/10 text-foul";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${style}`}>{source === "ai" ? "Claude" : source ?? "open"}</span>;
}

function MatchLine({ f }: { f: Failure }) {
  if (!f.home) return <span className="text-muted">Match {f.match_id} (not loaded)</span>;
  return (
    <span>
      <span className="font-semibold text-ink">{f.home} – {f.away}</span>{" "}
      <span className="tabular-nums text-slate">{f.home_goals}:{f.away_goals}</span>
      <span className="text-muted"> · {f.date} · {f.competition}</span>
    </span>
  );
}

function FailureItem({ f }: { f: Failure }) {
  return (
    <li className="border-t border-line py-2.5 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <SourceBadge source={f.source} />
        <MatchLine f={f} />
      </div>
      <div className="mt-1 text-xs text-muted">
        {checkLabel(f.check_name)} · <code className="font-mono">{f.detail}</code>
        {f.model && <> · {f.model}</>}
      </div>
      <p className="mt-1 text-sm">{f.reason ?? "No rule explains this yet; waiting for Claude to look at the PDF."}</p>
    </li>
  );
}

function CoverageRows({ rows }: { rows: Coverage[] }) {
  return rows.map((c) => (
    <tr key={`${c.season_id}-${c.competition_id}`} className="border-t border-line">
      <td className="py-1.5 pr-2">{c.competition}</td>
      <td className="px-2 text-right tabular-nums">{c.matches}</td>
      <td className="px-2 text-right"><Share part={c.with_pbp} whole={c.matches} /></td>
      <td className="px-2 text-right"><Share part={c.with_zones} whole={c.matches} /></td>
      <td className="pl-2 text-right tabular-nums max-sm:hidden">{c.failed || ""}</td>
    </tr>
  ));
}

function CoverageTable({ rows }: { rows: Coverage[] }) {
  const youth = rows.filter((c) => c.category === "youth");
  const sum = (k: "matches" | "with_pbp" | "with_zones") => youth.reduce((a, c) => a + c[k], 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-1 pr-2">Competition</th>
            <th className="px-2 text-right">Matches</th>
            <th className="px-2 text-right whitespace-nowrap">Play-by-play</th>
            <th className="px-2 text-right">Zones</th>
            <th className="pl-2 text-right max-sm:hidden">With a failed check</th>
          </tr>
        </thead>
        <tbody>
          <CoverageRows rows={rows.filter((c) => c.category !== "youth")} />
          {youth.length > 0 && (
            <tr className="border-t border-line font-semibold">
              <td className="py-1.5 pr-2">Youth ({youth.length} competitions)</td>
              <td className="px-2 text-right tabular-nums">{sum("matches")}</td>
              <td className="px-2 text-right"><Share part={sum("with_pbp")} whole={sum("matches")} /></td>
              <td className="px-2 text-right"><Share part={sum("with_zones")} whole={sum("matches")} /></td>
              <td className="pl-2 text-right tabular-nums max-sm:hidden">{youth.reduce((a, c) => a + c.failed, 0) || ""}</td>
            </tr>
          )}
        </tbody>
      </table>
      {youth.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-sky-dark hover:underline">Show youth competitions</summary>
          <table className="mt-2 w-full">
            <tbody><CoverageRows rows={youth} /></tbody>
          </table>
        </details>
      )}
    </div>
  );
}

export default async function DataPage() {
  await connection(); // stats.db changes under us: never prerender
  const cov = coverage();
  if (!cov.length) return <PageTitle title="No data yet" sub="The crawler hasn't filled the stats database yet." />;
  const rates = checkRates();
  const fails = failures();
  const audit = latestAudit();
  const runs = crawlRuns();

  const lastBatch = runs.filter((r) => r.started_at === runs[0]?.started_at);
  // crawl.py stores `load` only when a match fails to load, so it has no pass rate of its own
  const loadErrors = rates.find((r) => r.name === "load")?.total ?? 0;
  const checked = rates.filter((r) => r.name !== "load");
  const checksTotal = checked.reduce((a, r) => a + r.total, 0);
  const checksPassed = checked.reduce((a, r) => a + r.passed, 0);
  const byRule = fails.filter((f) => f.source === "rule" && f.kind !== "unexplained");
  const byAi = fails.filter((f) => f.source === "ai");
  const open = fails.filter((f) => !f.source || f.kind === "unexplained");

  // zones home/away are one check per team: show them as one line
  const groups = new Map<string, { total: number; passed: number; explained: number }>();
  for (const r of checked) {
    const g = groups.get(checkGroup(r.name)) ?? { total: 0, passed: 0, explained: 0 };
    groups.set(checkGroup(r.name), { total: g.total + r.total, passed: g.passed + r.passed, explained: g.explained + r.explained });
  }
  const kinds = new Map<string, Failure[]>();
  for (const f of byRule) kinds.set(f.kind ?? "", [...(kinds.get(f.kind ?? "") ?? []), f]);
  const kindList = [...kinds.entries()].sort((a, b) => b[1].length - a[1].length);
  const maxKind = Math.max(1, ...kindList.map(([, v]) => v.length));

  return (
    <>
      <PageTitle
        eyebrow="Data quality"
        title="Where the numbers stand"
        sub="Code reads every number from RZS and cross-checks it. A failed check gets a reason from a rule, or from Claude reading the match PDF. Claude never writes numbers."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Last crawl"
          value={runs.length ? formatStamp(runs[0].finished_at) : "–"}
          sub={runs.length ? `${lastBatch.reduce((a, r) => a + r.matches_new, 0)} new matches · ${lastBatch.reduce((a, r) => a + r.errors, 0)} load errors` : "no crawl logged yet"}
        />
        <Tile label="Checks passed" value={`${pct(checksPassed, checksTotal) ?? 0}%`} sub={`${checksPassed.toLocaleString("sl-SI")} of ${checksTotal.toLocaleString("sl-SI")}`} />
        <Tile
          label="Failures explained"
          value={`${byRule.length + byAi.length} of ${fails.length}`}
          sub={`${byRule.length} by rules · ${byAi.length} by Claude · ${open.length} open`}
        />
        <Tile
          label="PDF audit"
          value={audit.total.fields ? `${pct(audit.total.agree, audit.total.fields)}%` : "–"}
          sub={audit.total.fields ? `${audit.total.agree} of ${audit.total.fields} numbers agree · ${audit.total.matches} matches` : "no audit yet"}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card title={`Coverage ${cov[0].season}`} aside="share of played matches">
          <CoverageTable rows={cov.filter((c) => c.season_id === cov[0].season_id)} />
          {cov.some((c) => c.season_id !== cov[0].season_id) && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-sky-dark hover:underline">Older seasons</summary>
              {[...new Set(cov.filter((c) => c.season_id !== cov[0].season_id).map((c) => c.season_id))].map((sid) => (
                <div key={sid} className="mt-3">
                  <h3 className="mb-1 font-display text-sm font-bold text-slate">{cov.find((c) => c.season_id === sid)?.season}</h3>
                  <CoverageTable rows={cov.filter((c) => c.season_id === sid)} />
                </div>
              ))}
            </details>
          )}
          <p className="mt-3 text-xs text-muted">Play-by-play and goal zones are only fetched for the top senior leagues and cups.</p>
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Checks">
            <ul className="space-y-3">
              {[...groups.entries()].map(([name, g]) => {
                const p = pct(g.passed, g.total) ?? 0;
                const failed = g.total - g.passed;
                return (
                  <li key={name}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span>{checkLabel(name)}</span>
                      <span className="font-display font-extrabold text-slate tabular-nums">{p}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-floor" role="img" aria-label={`${p}% passed`}>
                      <div className="h-full rounded-full bg-court" style={{ width: `${p}%` }} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {g.passed} of {g.total} passed{failed > 0 && ` · ${failed} failed, ${g.explained} explained`}
                    </div>
                  </li>
                );
              })}
            </ul>
            {loadErrors > 0 && (
              <p className="mt-4 text-sm">
                <span className="font-display font-extrabold text-foul tabular-nums">{loadErrors}</span> matches didn&apos;t load (RZS returned
                an error); the crawler tries them again on its next run.
              </p>
            )}
          </Card>

          <Card title="Last crawls" aside="one row per crawler process">
            {runs.length ? (
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-xs text-muted">
                  <tr><th className="py-1">Finished</th><th>Season</th><th className="text-right">New</th><th className="text-right">Errors</th></tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="py-1.5">{formatStamp(r.finished_at)}</td>
                      <td className="text-muted">{r.season}</td>
                      <td className="text-right">{r.matches_new}</td>
                      <td className={`text-right ${r.errors ? "text-foul" : ""}`}>{r.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>No crawl logged yet. The crawler writes a row here after each run.</Empty>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <Card title="Why checks fail" aside={`${byRule.length} explained by rules`}>
          {kindList.length ? (
            <ul className="space-y-1">
              {kindList.map(([kind, list]) => (
                <li key={kind}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg py-1.5 text-sm hover:bg-floor">
                      <span className="min-w-0 flex-1">{kindLabel(kind)}</span>
                      <span className="h-1.5 w-16 shrink-0 rounded-full bg-floor sm:w-24" aria-hidden>
                        <span className="block h-full rounded-full bg-slate/60" style={{ width: `${(list.length / maxKind) * 100}%` }} />
                      </span>
                      <span className="w-7 text-right font-display font-extrabold text-slate tabular-nums">{list.length}</span>
                    </summary>
                    <ul className="mb-2 rounded-xl bg-floor/60 px-3">
                      {list.map((f) => <FailureItem key={`${f.match_id}-${f.check_name}`} f={f} />)}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No rule reviews yet. scripts/review.py runs after each crawl.</Empty>
          )}
        </Card>

        <Card title="Claude's reviews and open failures" aside={`${byAi.length} reviewed · ${open.length} open`}>
          {byAi.length + open.length ? (
            <>
              <ul>
                {[...byAi, ...open].slice(0, SHOW).map((f) => <FailureItem key={`${f.match_id}-${f.check_name}`} f={f} />)}
              </ul>
              {byAi.length + open.length > SHOW && (
                <details className="text-sm">
                  <summary className="cursor-pointer border-t border-line pt-2.5 text-sky-dark hover:underline">
                    Show {byAi.length + open.length - SHOW} more
                  </summary>
                  <ul>
                    {[...byAi, ...open].slice(SHOW).map((f) => <FailureItem key={`${f.match_id}-${f.check_name}`} f={f} />)}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <Empty>Every failed check is explained by a rule.</Empty>
          )}
        </Card>
      </div>

      <Card title="PDF audit" aside={audit.matches.length ? `latest run ${formatStamp(audit.matches[0].at)}` : undefined} className="mt-6">
        <p className="mb-3 text-sm text-muted">
          Once a week Claude reads the goal-zone grids and team totals off the rendered PDF of a few random matches, and code compares them
          with what the parser stored.
        </p>
        {audit.matches.length ? (
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {audit.matches.map((a) => {
              const misses = audit.misses.filter((m) => m.match_id === a.match_id);
              return (
                <li key={a.match_id} className="border-t border-line py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="font-semibold">{a.home} – {a.away}</span>{" "}
                      <span className="text-muted tabular-nums">{a.home_goals}:{a.away_goals} · {a.date}</span>
                    </span>
                    <span className={`font-display font-extrabold tabular-nums ${a.agree === a.fields ? "text-slate" : "text-foul"}`}>
                      {a.agree}/{a.fields}
                    </span>
                  </div>
                  {misses.length > 0 && (
                    <ul className="mt-1 text-xs text-foul">
                      {misses.map((m) => (
                        <li key={m.field}>{auditFieldLabel(m.field)}: stored {m.db_value ?? "–"}, Claude read {m.ai_value ?? "nothing"}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>No audit yet.</Empty>
        )}
      </Card>
    </>
  );
}
