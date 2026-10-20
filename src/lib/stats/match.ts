import "server-only";
import { all, one } from "./db";

// One match for /stats/matches/[id]: the score sheet, the players, the goalkeepers and the score flow.

export type MatchDetail = {
  id: number; season_id: number; competition_id: number; competition: string | null; season: string | null;
  round: string; date: string; time: string; home: string; away: string; home_team_id: number; away_team_id: number;
  home_goals: number; away_goals: number; home_goals_ht: number | null; away_goals_ht: number | null;
  hall: string; attendance: number | null; referee_a: string | null; referee_b: string | null;
  home_coach: string | null; away_coach: string | null;
};

export function match(id: number): MatchDetail | undefined {
  return one<MatchDetail>(
    `SELECT m.id, m.season_id, m.competition_id, c.name AS competition, s.name AS season, m.round, m.date, m.time,
            m.home, m.away, m.home_team_id, m.away_team_id, m.home_goals, m.away_goals, m.home_goals_ht, m.away_goals_ht,
            m.hall, m.attendance, m.referee_a, m.referee_b, m.home_coach, m.away_coach
     FROM matches m
     LEFT JOIN competitions c ON c.id = m.competition_id AND c.season_id = m.season_id
     LEFT JOIN seasons s ON s.id = m.season_id
     WHERE m.id = ?`,
    id,
  );
}

export type MatchPlayer = {
  side: "home" | "away"; player_id: number; name: string; number: string; position: string;
  goals: number; shots: number; goals_7m: number; shots_7m: number; yellow: number; red: number; two_min: number;
};

export function matchPlayers(id: number): MatchPlayer[] {
  return all<MatchPlayer>(
    `SELECT side, player_id, first_name || ' ' || last_name AS name, number, position,
            goals, shots, goals_7m, shots_7m, yellow, red, two_min
     FROM player_match WHERE match_id = ? AND is_goalkeeper = 0
     ORDER BY goals DESC, shots ASC, last_name`,
    id,
  );
}

export type MatchKeeper = { side: "home" | "away"; player_id: number; name: string; number: string; saves: number; faced: number; saves_7m: number; faced_7m: number };

export function matchKeepers(id: number): MatchKeeper[] {
  // raw is the API row: obrambe = saves, steviloMetov = shots faced, sedemObrambe/sedemVsi = 7m saved/faced.
  return all<MatchKeeper>(
    `SELECT side, player_id, name, coalesce(json_extract(raw, '$.stevilkaIgralec'), '') AS number,
            coalesce(json_extract(raw, '$.obrambe'), 0) AS saves, coalesce(json_extract(raw, '$.steviloMetov'), 0) AS faced,
            coalesce(json_extract(raw, '$.sedemObrambe'), 0) AS saves_7m, coalesce(json_extract(raw, '$.sedemVsi'), 0) AS faced_7m
     FROM goalkeeper_match WHERE match_id = ? ORDER BY faced DESC`,
    id,
  );
}

/** The score after every goal, in match seconds (events.second counts from the throw-off). */
export function matchFlow(id: number): { second: number; home: number; away: number }[] {
  return all<{ second: number; home: number; away: number }>(
    `SELECT second, home_score AS home, away_score AS away FROM events
     WHERE match_id = ? AND value = 1 AND type IN ('Strel na gol', '7M') ORDER BY seq`,
    id,
  );
}
