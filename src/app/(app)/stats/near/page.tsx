import { connection } from "next/server";
import { Suspense } from "react";
import { PageLoading } from "../ui";
import { seasons } from "@/lib/stats/queries";
import { inSlovenia, MAP_HEIGHT, MAP_WIDTH, project, SLOVENIA_PATH, type LatLon } from "@/lib/stats/geo";
import { clubs, findPlace, hasClubs, places, type NearClub } from "@/lib/stats/teams";
import { Card, Empty, PageTitle, TeamLink } from "../ui";
import { LocateButton } from "./locate";

const SHOW = 12;

/** Slovenia with a dot per club; the nearest ones numbered like the list. Clubs at the same postcode fan out a little. */
function ClubMap({ list, from, near }: { list: NearClub[]; from?: LatLon; near: number }) {
  const seen = new Map<string, number>();
  const dots = list.map((c, i) => {
    const k = `${c.lat},${c.lon}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    const p = project(c);
    const a = n * 2.4, r = (from && i < near ? 13 : 7) * Math.sqrt(n);
    return { c, i, x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
  });
  const me = from && inSlovenia(from) ? project(from) : null;
  return (
    <svg viewBox={`-10 -10 ${MAP_WIDTH + 20} ${MAP_HEIGHT + 20}`} className="h-auto w-full" role="img" aria-label="Map of Slovenia with handball clubs">
      <path d={SLOVENIA_PATH} className="fill-floor stroke-line" strokeWidth={2} strokeLinejoin="round" />
      {dots.filter((d) => d.i >= near).map((d) => (
        <circle key={d.c.id} cx={d.x} cy={d.y} r={4} className="fill-slate/35">
          <title>{`${d.c.name}, ${d.c.town}`}</title>
        </circle>
      ))}
      {me && (
        <g aria-label="You">
          <circle cx={me.x} cy={me.y} r={14} className="fill-sky/20" />
          <circle cx={me.x} cy={me.y} r={6} className="fill-sky stroke-white" strokeWidth={2} />
        </g>
      )}
      {dots.filter((d) => d.i < near).reverse().map((d) => (
        <g key={d.c.id}>
          <title>{`${d.i + 1}. ${d.c.name}, ${d.c.town}, ${d.c.km.toFixed(0)} km`}</title>
          <circle cx={d.x} cy={d.y} r={10} className="fill-court stroke-white" strokeWidth={2} />
          <text x={d.x} y={d.y} dy="0.35em" textAnchor="middle" className="fill-slate-deep font-display text-[11px] font-extrabold">
            {d.i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function NearPage(props: PageProps<"/stats/near">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <NearPageBody {...props} />
    </Suspense>
  );
}

async function NearPageBody({ searchParams }: PageProps<"/stats/near">) {
  await connection(); // stats.db changes under us: never prerender
  const sp = await searchParams;
  const seasonId = seasons()[0]?.id;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const lat = Number(sp.lat), lon = Number(sp.lon);
  const ready = !!seasonId && hasClubs();
  const place = ready && q ? findPlace(q) : null;
  const from: LatLon | undefined = place
    ? place
    : Number.isFinite(lat) && Number.isFinite(lon) && sp.lat !== undefined && sp.lon !== undefined ? { lat, lon } : undefined;
  const list = ready ? clubs(seasonId, from) : [];
  const label = place ? `${place.postcode} ${place.place.split("/")[0]}` : from ? "your location" : null;

  return (
    <>
      <PageTitle title="Clubs near you" sub="Handball clubs by distance, with the teams they have in the leagues this season." />
      <div className="mb-6 flex flex-wrap items-start gap-2">
        <form action="/stats/near" className="flex min-w-0 flex-1 gap-2">
          <input
            name="q"
            defaultValue={q}
            list="places"
            placeholder="Town or postcode, e.g. Kranj or 4000"
            aria-label="Town or postcode"
            className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm shadow-sm"
          />
          <button className="bg-sky rounded-xl px-4 py-2 text-sm font-semibold shadow-sm text-white hover:bg-sky-dark">Find</button>
          <datalist id="places">
            {[...new Map(places().map((p) => [p.place.split("/")[0], p.postcode])).entries()].map(([name, pc]) => <option key={name} value={name}>{pc}</option>)}
          </datalist>
        </form>
        <LocateButton />
      </div>

      {!ready ? (
        <Card title="No club locations yet">
          <Empty>The club list is filled after each crawl (scripts/clubs.py). Check back after the next run.</Empty>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] [&>*]:min-w-0">
          <Card title="Map" aside={`${list.length} clubs`} className="self-start">
            <ClubMap list={list} from={from} near={from ? SHOW : 0} />
            <p className="mt-2 text-xs text-muted">
              Dots sit at the club&apos;s postcode, not the hall.
              {from && !inSlovenia(from) && " Your location is outside Slovenia, so it isn't on the map."}
            </p>
          </Card>

          <Card title={label ? `Nearest to ${label}` : "Pick a place"} aside={label ? "straight-line distance" : undefined}>
            {q && !place ? (
              <Empty>No town or postcode matches “{q}”. Try the post office name (e.g. “Novo mesto”) or a 4-digit postcode.</Empty>
            ) : !from ? (
              <Empty>Type a town or postcode, or use your location, to list the closest clubs.</Empty>
            ) : (
              <ol>
                {list.slice(0, SHOW).map((c, i) => (
                  <li key={c.id} className="flex gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-court font-display text-[11px] font-extrabold text-slate-deep">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold text-ink">{c.name}</span>
                        <span className="shrink-0 font-display text-sm font-extrabold tabular-nums text-slate">{c.km < 1 ? "<1" : c.km.toFixed(0)} km</span>
                      </div>
                      <div className="text-xs text-muted">{[c.street, `${c.postcode} ${c.town}`].filter(Boolean).join(", ")}</div>
                      <ul className="mt-1.5 flex flex-wrap gap-1">
                        {c.teams.map((t) => (
                          <li key={t.team_id} className="rounded-lg bg-floor px-2 py-0.5 text-xs">
                            {t.played ? <TeamLink id={t.team_id} name={t.competition} /> : <span className="text-muted">{t.competition}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
