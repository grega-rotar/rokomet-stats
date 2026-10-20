// Who gets which push for a batch of new results (specs/notifications.md). Pure: no database, no network.
import { shortName, teamName } from "@/lib/stats/groups";

export type NewMatch = {
  id: number;
  season_id: number;
  competition_id: number;
  competition: string;
  category: string;
  round: string | null;
  home: string;
  away: string;
  home_team_id: number;
  away_team_id: number;
  home_goals: number;
  away_goals: number;
};

export type PlayerLine = { match_id: number; player_id: number; name: string; goals: number; shots: number };
export type Follow = { kind: "team" | "player"; refId: number };
export type PushDevice = { id: string; allTop: boolean; follows: Follow[] };
export type Payload = { title: string; body: string; url: string; tag: string };
export type Push = { deviceId: string; payload: Payload };

/** More pushes than this for one device in one run become one summary. */
export const MAX_SEPARATE = 3;

export function scoreLine(m: NewMatch): string {
  return `${teamName(m.home)} ${m.home_goals}:${m.away_goals} ${teamName(m.away)}`;
}

export function playerText(p: PlayerLine): string {
  const goals = `${p.goals} ${p.goals === 1 ? "goal" : "goals"}`;
  // Shots are missing for seasons before 2019/20 (crawl.py stores scorers only).
  if (!p.shots) return p.goals ? `${p.name}: ${goals}` : `${p.name}: no shots`;
  return `${p.name}: ${goals} (${p.goals}/${p.shots})`;
}

function matchPayload(m: NewMatch, players: PlayerLine[], url: string): Payload {
  const where = m.round ? `${shortName(m.competition)} · round ${m.round}` : shortName(m.competition);
  return { title: scoreLine(m), body: [where, ...players.map(playerText)].join("\n"), url, tag: `match-${m.id}` };
}

function summary(items: { m: NewMatch }[]): Payload {
  const lines = items.slice(0, MAX_SEPARATE).map(({ m }) => scoreLine(m));
  if (items.length > MAX_SEPARATE) lines.push(`+${items.length - MAX_SEPARATE} more`);
  return { title: `${items.length} new results`, body: lines.join("\n"), url: "/stats", tag: "results" };
}

export function planPushes(matches: NewMatch[], players: PlayerLine[], devices: PushDevice[]): Push[] {
  const pushes: Push[] = [];
  for (const d of devices) {
    const teams = new Set(d.follows.filter((f) => f.kind === "team").map((f) => f.refId));
    const followed = new Set(d.follows.filter((f) => f.kind === "player").map((f) => f.refId));
    const items: { m: NewMatch; payload: Payload }[] = [];
    for (const m of matches) {
      const mine = players.filter((p) => p.match_id === m.id && followed.has(p.player_id));
      const team = [m.home_team_id, m.away_team_id].find((t) => teams.has(t));
      // The link goes to the most specific thing the device follows.
      const url = mine.length
        ? `/stats/players/${mine[0].player_id}`
        : team !== undefined
          ? `/stats/teams/${team}`
          : d.allTop && m.category === "top"
            ? `/stats?season=${m.season_id}&comp=${m.competition_id}`
            : null;
      if (url) items.push({ m, payload: matchPayload(m, mine, url) });
    }
    if (items.length > MAX_SEPARATE) pushes.push({ deviceId: d.id, payload: summary(items) });
    else for (const i of items) pushes.push({ deviceId: d.id, payload: i.payload });
  }
  return pushes;
}

/** The first day (ISO, local time) still inside a window of `days` days ending today. */
export function windowStart(now: Date, days: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
