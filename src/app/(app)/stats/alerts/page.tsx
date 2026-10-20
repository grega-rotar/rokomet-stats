import { connection } from "next/server";
import { Suspense } from "react";
import { shortName, teamName } from "@/lib/stats/groups";
import { competitions, results, seasons } from "@/lib/stats/queries";
import { PageLoading, PageTitle } from "../ui";
import { AlertsPanel, type Preview } from "./panel";

export default function AlertsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AlertsPageBody />
    </Suspense>
  );
}

async function AlertsPageBody() {
  await connection(); // stats.db changes under us: never prerender
  const season = seasons()[0];
  const top = season ? competitions(season.id).filter((c) => c.category === "top") : [];
  // The preview shows the latest real top-league result, written the way the notifier writes it.
  const latest = top
    .map((c) => ({ c, m: results(c.id, season!.id, 1)[0] }))
    .filter((x) => x.m)
    .sort((a, b) => b.m.date.split(".").reverse().join("").localeCompare(a.m.date.split(".").reverse().join("")))[0];
  const preview: Preview = latest
    ? {
        title: `${teamName(latest.m.home)} ${latest.m.home_goals}:${latest.m.away_goals} ${teamName(latest.m.away)}`,
        body: `${shortName(latest.c.name)}${latest.m.round ? ` · round ${latest.m.round}` : ""}`,
      }
    : { title: "RK Celje Pivovarna Laško 31:28 RD Riko Ribnica", body: "Liga NLB (1. SRL) · round 7" };

  return (
    <>
      <PageTitle eyebrow="Notifications" title="Alerts" sub="Results on your phone or computer, as soon as they are in the stats." />
      <AlertsPanel topLeagues={top.map((c) => shortName(c.name))} preview={preview} />
    </>
  );
}
