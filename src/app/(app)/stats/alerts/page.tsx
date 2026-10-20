import { connection } from "next/server";
import { shortName } from "@/lib/stats/groups";
import { competitions, seasons } from "@/lib/stats/queries";
import { PageTitle } from "../ui";
import { AlertsPanel } from "./panel";

export default async function AlertsPage() {
  await connection(); // stats.db changes under us: never prerender
  const season = seasons()[0];
  const top = season ? competitions(season.id).filter((c) => c.category === "top").map((c) => shortName(c.name)) : [];
  return (
    <>
      <PageTitle eyebrow="Notifications" title="Alerts" sub="Get a push on this device when a new result is in." />
      <AlertsPanel topLeagues={top} />
    </>
  );
}
