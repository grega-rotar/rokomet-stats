import "server-only";
import { all } from "@/lib/stats/db";
import { planPushes, windowStart, type NewMatch, type PlayerLine } from "./plan";
import { makeSender, vapidFromEnv, type Sender } from "./send";
import { allDevices, markSent, recordResult, unsent } from "./store";

// Reads new results from stats.db and sends the pushes (specs/notifications.md). Runs in the app process.

/** Played matches of the newest season dated on or after `since` (ISO), not announced yet. */
export function newMatches(since: string): NewMatch[] {
  const rows = all<NewMatch>(
    `SELECT m.id, m.season_id, m.competition_id, coalesce(c.name, '') AS competition, coalesce(c.category, '') AS category,
            m.round, m.home, m.away, m.home_team_id, m.away_team_id, m.home_goals, m.away_goals
     FROM matches m LEFT JOIN competitions c ON c.id = m.competition_id AND c.season_id = m.season_id
     WHERE m.status = 1 AND m.home_goals IS NOT NULL
       AND m.season_id = (SELECT max(season_id) FROM matches)
       AND substr(m.date,7,4)||'-'||substr(m.date,4,2)||'-'||substr(m.date,1,2) >= ?
     ORDER BY substr(m.date,7,4)||substr(m.date,4,2)||substr(m.date,1,2), m.time, m.id`,
    since,
  );
  const fresh = new Set(unsent(rows.map((r) => r.id)));
  return rows.filter((r) => fresh.has(r.id));
}

function playerLines(matchIds: number[], playerIds: number[]): PlayerLine[] {
  if (!matchIds.length || !playerIds.length) return [];
  const q = (n: number) => Array(n).fill("?").join(",");
  return all<PlayerLine>(
    `SELECT match_id, player_id, trim(coalesce(first_name,'')||' '||coalesce(last_name,'')) AS name,
            coalesce(goals,0) AS goals, coalesce(shots,0) AS shots
     FROM player_match WHERE match_id IN (${q(matchIds.length)}) AND player_id IN (${q(playerIds.length)})`,
    ...matchIds,
    ...playerIds,
  );
}

/** One pass: find new matches, mark them sent, push to every device that wants them. Returns the counts. */
export async function runOnce(send: Sender, now = new Date(), windowDays = Number(process.env.PUSH_WINDOW_DAYS) || 3) {
  const matches = newMatches(windowStart(now, windowDays));
  if (!matches.length) return { matches: 0, pushes: 0 };
  // Mark first: if we crash halfway, a device misses a push rather than getting it on every restart.
  markSent(matches.map((m) => m.id));
  const devices = allDevices();
  const playerIds = [...new Set(devices.flatMap((d) => d.follows.filter((f) => f.kind === "player").map((f) => f.refId)))];
  const pushes = planPushes(matches, playerLines(matches.map((m) => m.id), playerIds), devices);
  const byId = new Map(devices.map((d) => [d.id, d.row]));
  // Devices in parallel, one device's pushes in order (so the phone shows them in match order).
  const perDevice = Map.groupBy(pushes, (p) => p.deviceId);
  await Promise.all(
    [...perDevice].map(async ([id, list]) => {
      for (const p of list) {
        const result = await send(byId.get(id)!, p.payload);
        recordResult(id, result);
        if (result === "gone") break;
      }
    }),
  );
  return { matches: matches.length, pushes: pushes.length };
}

const g = globalThis as unknown as { __notifier?: NodeJS.Timeout };

/** Starts the timer once per process. Does nothing without VAPID keys. */
export function startNotifier() {
  const vapid = vapidFromEnv();
  if (!vapid || g.__notifier) return;
  const send = makeSender(vapid);
  const every = (Number(process.env.PUSH_POLL_SECONDS) || 120) * 1000;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runOnce(send);
      if (r.matches) console.log(`push: ${r.matches} new matches, ${r.pushes} pushes`);
    } catch (err) {
      console.error("push notifier failed", err);
    } finally {
      running = false;
    }
  };
  g.__notifier = setInterval(tick, every);
  g.__notifier.unref();
  setTimeout(tick, 10_000).unref();
}
