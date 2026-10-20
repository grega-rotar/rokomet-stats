import { NextResponse, type NextRequest } from "next/server";
import { all } from "@/lib/stats/db";

export type SearchHit = { kind: "player" | "team"; id: number; name: string; meta: string };

// Instant search for the stats header: players and teams, latest season first. The name match ignores
// č/š/ž (see fold() in src/lib/stats/groups.ts) by comparing against an ASCII-folded copy built in SQL.
const FOLD = (col: string) =>
  `lower(replace(replace(replace(replace(replace(replace(replace(replace(${col},'č','c'),'Č','c'),'š','s'),'Š','s'),'ž','z'),'Ž','z'),'ć','c'),'Ć','c'))`;

export async function GET(request: NextRequest) {
  const raw = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const q = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (q.length < 2) return NextResponse.json({ hits: [] satisfies SearchHit[] });
  const like = `%${q.replace(/[%_]/g, "")}%`;

  const players = all<{ id: number; name: string; position: string; team: string; season: string; goals: number }>(
    `SELECT p.player_id AS id, max(p.first_name || ' ' || p.last_name) AS name, max(p.position) AS position,
            max(CASE p.side WHEN 'home' THEN m.home ELSE m.away END) AS team, max(s.name) AS season, sum(p.goals) AS goals
     FROM player_match p JOIN matches m ON m.id = p.match_id JOIN seasons s ON s.id = m.season_id
     WHERE ${FOLD("p.first_name || ' ' || p.last_name")} LIKE ?1 OR ${FOLD("p.last_name || ' ' || p.first_name")} LIKE ?1
     GROUP BY p.player_id ORDER BY max(s.name) DESC, sum(p.goals) DESC LIMIT 8`.replaceAll("?1", "?"),
    like, like,
  );
  const teams = all<{ id: number; name: string; competition: string; season: string }>(
    `SELECT t.id, t.name, c.name AS competition, s.name AS season FROM (
       SELECT home_team_id AS id, home AS name, competition_id, season_id FROM matches WHERE status = 1
       UNION SELECT away_team_id, away, competition_id, season_id FROM matches WHERE status = 1) t
     JOIN competitions c ON c.id = t.competition_id AND c.season_id = t.season_id JOIN seasons s ON s.id = t.season_id
     WHERE ${FOLD("t.name")} LIKE ? GROUP BY t.id ORDER BY s.name DESC, t.name LIMIT 5`,
    like,
  );

  const hits: SearchHit[] = [
    ...teams.map((t) => ({ kind: "team" as const, id: t.id, name: t.name, meta: `${t.competition} · ${t.season}` })),
    ...players.map((p) => ({ kind: "player" as const, id: p.id, name: p.name, meta: `${p.position || "Player"} · ${p.team} · ${p.season}` })),
  ];
  return NextResponse.json({ hits });
}
