import "server-only";
import { all, one } from "./db";
import {
  shotTypeRows, shotTypeWeakSpots, shrunkTypePct, toTotals,
  type GoalsShots, type ShotTypeKey, type ShotTypeRow, type ShotTypeTotals, type WeakSpot,
} from "./shot-types";

export type { WeakSpot } from "./shot-types";

// Same rules as scripts/players.py: shooting % is shrunk toward the average by K shots,
// and a weak spot needs enough attempts to mean anything.
export const K = 20;
export const MIN_SHOTS = 15;

export type Competition = { id: number; season_id: number; name: string; category: string; matches: number };
export type Season = { id: number; name: string };

export function seasons(): Season[] {
  return all<Season>("SELECT id, name FROM seasons ORDER BY id DESC");
}

export function competitions(seasonId: number): Competition[] {
  return all<Competition>(
    `SELECT c.id, c.season_id, c.name, c.category, count(m.id) AS matches
     FROM competitions c JOIN matches m ON m.competition_id = c.id AND m.season_id = c.season_id AND m.status = 1
     WHERE c.season_id = ? GROUP BY c.id
     ORDER BY CASE c.category WHEN 'top' THEN 0 WHEN 'senior' THEN 1 ELSE 2 END, matches DESC, c.name`,
    seasonId,
  );
}

export type Match = {
  id: number; date: string; time: string; round: string; home: string; away: string;
  home_team_id: number; away_team_id: number; home_goals: number; away_goals: number;
  home_goals_ht: number | null; away_goals_ht: number | null; hall: string; attendance: number | null;
};

export function results(competitionId: number, seasonId: number, limit = 12): Match[] {
  return all<Match>(
    `SELECT * FROM matches WHERE competition_id = ? AND season_id = ? AND status = 1
     ORDER BY substr(date,7,4)||substr(date,4,2)||substr(date,1,2) DESC, time DESC LIMIT ?`,
    competitionId, seasonId, limit,
  );
}

export type Standing = { team_id: number; team: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number };

export function standings(competitionId: number, seasonId: number): Standing[] {
  return all<Standing>(
    `WITH r AS (
       SELECT home_team_id AS team_id, home AS team, home_goals AS gf, away_goals AS ga FROM matches
         WHERE competition_id = ? AND season_id = ? AND status = 1
       UNION ALL
       SELECT away_team_id, away, away_goals, home_goals FROM matches
         WHERE competition_id = ? AND season_id = ? AND status = 1)
     SELECT team_id, max(team) AS team, count(*) AS p,
            sum(gf > ga) AS w, sum(gf = ga) AS d, sum(gf < ga) AS l,
            sum(gf) AS gf, sum(ga) AS ga, 2 * sum(gf > ga) + sum(gf = ga) AS pts
     FROM r GROUP BY team_id ORDER BY pts DESC, gf - ga DESC, gf DESC`,
    competitionId, seasonId, competitionId, seasonId,
  );
}

export type PlayerSeason = {
  player_id: number; name: string; position: string; team: string; team_id: number;
  matches: number; goals: number; shots: number; goals_7m: number; shots_7m: number;
  two_min: number; yellow: number; red: number;
};

function playerSeasons(where: string, ...params: unknown[]): PlayerSeason[] {
  return all<PlayerSeason>(
    `SELECT p.player_id, max(p.first_name || ' ' || p.last_name) AS name, max(p.position) AS position,
            max(CASE p.side WHEN 'home' THEN m.home ELSE m.away END) AS team, max(p.team_id) AS team_id,
            count(*) AS matches, sum(p.goals) AS goals, sum(coalesce(p.shots, 0)) AS shots,
            sum(coalesce(p.goals_7m, 0)) AS goals_7m, sum(coalesce(p.shots_7m, 0)) AS shots_7m,
            sum(coalesce(p.two_min, 0)) AS two_min, sum(coalesce(p.yellow, 0)) AS yellow, sum(coalesce(p.red, 0)) AS red
     FROM player_match p JOIN matches m ON m.id = p.match_id
     WHERE p.is_goalkeeper = 0 ${where}
     GROUP BY p.player_id`,
    ...params,
  );
}

// player_shot_types tied to player_match (for the position) and matches (for the filters), summed per player.
function shotTypeTotals(where: string, ...params: unknown[]): Map<number, ShotTypeTotals> {
  // Until the crawler has run once with the new schema, stats.db has no player_shot_types table.
  if (!one("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'player_shot_types'")) return new Map();
  const rows = all<Parameters<typeof toTotals>[0] & { player_id: number }>(
    `SELECT t.player_id, count(*) AS matches,
            sum(t.goals_7m) AS goals_7m, sum(t.shots_7m) AS shots_7m, sum(t.goals_6m) AS goals_6m, sum(t.shots_6m) AS shots_6m,
            sum(t.goals_wing) AS goals_wing, sum(t.shots_wing) AS shots_wing, sum(t.goals_9m) AS goals_9m, sum(t.shots_9m) AS shots_9m,
            sum(t.misses) AS misses
     FROM player_shot_types t
     JOIN player_match p ON p.match_id = t.match_id AND p.side = t.side AND p.player_id = t.player_id
     JOIN matches m ON m.id = t.match_id
     WHERE p.is_goalkeeper = 0 ${where}
     GROUP BY t.player_id`,
    ...params,
  );
  return new Map(rows.map((r) => [r.player_id, toTotals(r)]));
}

function sumTotals(list: Iterable<ShotTypeTotals>): ShotTypeTotals | null {
  let out: ShotTypeTotals | null = null;
  for (const t of list) {
    out ??= toTotals({ matches: 0, goals_7m: 0, shots_7m: 0, goals_6m: 0, shots_6m: 0, goals_wing: 0, shots_wing: 0, goals_9m: 0, shots_9m: 0, misses: 0 });
    for (const k of ["7m", "6m", "wing", "9m"] as const) {
      out[k].goals += t[k].goals;
      out[k].shots += t[k].shots;
    }
    out.misses += t.misses;
    out.matches += t.matches;
  }
  return out;
}

export function topScorers(competitionId: number, seasonId: number, limit = 10): PlayerSeason[] {
  return playerSeasons("AND m.competition_id = ? AND m.season_id = ?", competitionId, seasonId)
    .sort((a, b) => b.goals - a.goals || a.shots - b.shots)
    .slice(0, limit);
}

export function searchPlayers(q: string, limit = 20): PlayerSeason[] {
  return playerSeasons("AND (p.first_name || ' ' || p.last_name) LIKE ?", `%${q}%`)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, limit);
}

const pct = (g: number, s: number) => (s ? (100 * g) / s : null);

export type Metric = { key: string; label: string; me: number | null; avg: number | null; unit: "%" | ""; better: "high" | "low" };
export type PlayerProfile = {
  player: PlayerSeason;
  competitions: string[];
  peers: number;
  metrics: Metric[];
  weakSpots: WeakSpot[];
  enoughData: boolean;
  /** Shot types from the match PDFs (top senior competitions only); null when there is no PDF data. */
  shotTypes: { rows: ShotTypeRow[]; misses: number; matches: number } | null;
  games: { match_id: number; date: string; opponent: string; goals: number; shots: number; two_min: number; result: string }[];
};

/** The player's latest season with matches, or the one asked for. Profiles never mix seasons. */
export function playerSeasonIds(playerId: number): { id: number; name: string }[] {
  return all<{ id: number; name: string }>(
    `SELECT DISTINCT s.id, s.name FROM player_match p JOIN matches m ON m.id = p.match_id JOIN seasons s ON s.id = m.season_id
     WHERE p.player_id = ? ORDER BY s.name DESC`,
    playerId,
  );
}

export function playerProfile(playerId: number, seasonId?: number): PlayerProfile | null {
  const sid = seasonId ?? playerSeasonIds(playerId)[0]?.id;
  if (sid === undefined) return null;
  const me = playerSeasons("AND p.player_id = ? AND m.season_id = ?", playerId, sid)[0];
  if (!me) return null;
  const comps = all<{ competition_id: number; season_id: number; name: string }>(
    `SELECT DISTINCT m.competition_id, m.season_id, c.name FROM player_match p JOIN matches m ON m.id = p.match_id
     JOIN competitions c ON c.id = m.competition_id AND c.season_id = m.season_id WHERE p.player_id = ? AND m.season_id = ?`,
    playerId, sid,
  );
  const peers = playerSeasons(
    `AND m.season_id = ? AND m.competition_id IN (${comps.map(() => "?").join(",")}) AND p.position = ?`,
    sid, ...comps.map((c) => c.competition_id), me.position,
  );
  const sum = (f: (p: PlayerSeason) => number) => peers.reduce((a, p) => a + f(p), 0);
  const avg = {
    shooting: pct(sum((p) => p.goals), sum((p) => p.shots)),
    field: pct(sum((p) => p.goals - p.goals_7m), sum((p) => p.shots - p.shots_7m)),
    sevens: pct(sum((p) => p.goals_7m), sum((p) => p.shots_7m)),
    gpm: sum((p) => p.goals) / Math.max(1, sum((p) => p.matches)),
    two: sum((p) => p.two_min) / Math.max(1, sum((p) => p.matches)),
  };
  const fieldShots = me.shots - me.shots_7m;
  const mine = {
    shooting: pct(me.goals, me.shots),
    field: pct(me.goals - me.goals_7m, fieldShots),
    sevens: pct(me.goals_7m, me.shots_7m),
    gpm: me.goals / me.matches,
    two: me.two_min / me.matches,
  };
  const metrics: Metric[] = [
    { key: "field", label: "Field shooting (no 7m)", me: mine.field, avg: avg.field, unit: "%", better: "high" },
    { key: "sevens", label: "7m conversion", me: mine.sevens, avg: avg.sevens, unit: "%", better: "high" },
    { key: "gpm", label: "Goals per match", me: mine.gpm, avg: avg.gpm, unit: "", better: "high" },
    { key: "two", label: "2-min suspensions per match", me: mine.two, avg: avg.two, unit: "", better: "low" },
  ];

  const weakSpots: WeakSpot[] = [];
  if (fieldShots >= MIN_SHOTS && mine.field !== null && avg.field !== null && mine.field < avg.field - 8)
    weakSpots.push({
      title: "Finishing from the field",
      detail: `${me.goals - me.goals_7m}/${fieldShots} field shots (${mine.field.toFixed(0)}%), the average ${me.position.toLowerCase()} scores ${avg.field.toFixed(0)}%.`,
    });
  if (me.shots_7m >= 6 && mine.sevens !== null && avg.sevens !== null && mine.sevens < avg.sevens - 12)
    weakSpots.push({
      title: "7m penalties",
      detail: `${me.goals_7m}/${me.shots_7m} from the 7m line (${mine.sevens.toFixed(0)}%), average ${avg.sevens.toFixed(0)}%.`,
    });
  if (me.matches >= 4 && mine.two > Math.max(0.5, 2 * avg.two))
    weakSpots.push({
      title: "Discipline",
      detail: `${me.two_min} two-minute suspensions in ${me.matches} matches (${mine.two.toFixed(2)} per match), average ${avg.two.toFixed(2)}.`,
    });

  // Shot types: the player's PDF columns vs all same-position players in the same competitions.
  const myTypes = shotTypeTotals("AND p.player_id = ?", playerId).get(playerId);
  let shotTypes: PlayerProfile["shotTypes"] = null;
  if (myTypes?.matches) {
    const peerTypes = shotTypeTotals(
      `AND m.competition_id IN (${comps.map(() => "?").join(",")}) AND p.position = ?`,
      ...comps.map((c) => c.competition_id), me.position,
    );
    const rows = shotTypeRows(myTypes, sumTotals(peerTypes.values()));
    if (rows.some((r) => r.shots)) {
      shotTypes = { rows, misses: myTypes.misses, matches: myTypes.matches };
      weakSpots.push(...shotTypeWeakSpots(rows, me.position));
    }
  }

  const games = all<PlayerProfile["games"][number]>(
    `SELECT m.id AS match_id, m.date, CASE p.side WHEN 'home' THEN m.away ELSE m.home END AS opponent,
            p.goals, coalesce(p.shots, 0) AS shots, coalesce(p.two_min, 0) AS two_min,
            CASE p.side WHEN 'home' THEN m.home_goals || ':' || m.away_goals ELSE m.away_goals || ':' || m.home_goals END AS result
     FROM player_match p JOIN matches m ON m.id = p.match_id WHERE p.player_id = ? AND m.season_id = ?
     ORDER BY substr(m.date,7,4)||substr(m.date,4,2)||substr(m.date,1,2)`,
    playerId, sid,
  );
  return {
    player: me,
    competitions: [...new Set(comps.map((c) => c.name))],
    peers: peers.length,
    metrics,
    weakSpots,
    enoughData: fieldShots >= MIN_SHOTS || me.matches >= 4,
    shotTypes,
    games,
  };
}

function fingerprint(p: PlayerSeason): number[] {
  return [
    p.goals / p.matches,
    p.shots / p.matches,
    (p.goals - p.goals_7m) / Math.max(1, p.shots - p.shots_7m),
    p.shots_7m / Math.max(1, p.shots),
    p.two_min / p.matches,
  ];
}

export function similarPlayers(playerId: number, limit = 8): (PlayerSeason & { distance: number })[] {
  const season = one<{ season_id: number }>(
    "SELECT m.season_id FROM player_match p JOIN matches m ON m.id = p.match_id WHERE p.player_id = ? ORDER BY m.id DESC LIMIT 1",
    playerId,
  );
  if (!season) return [];
  const pool = playerSeasons("AND m.season_id = ?", season.season_id).filter((p) => p.shots >= MIN_SHOTS || p.player_id === playerId);
  const me = pool.find((p) => p.player_id === playerId);
  if (!me || pool.length < 3) return [];
  const feats = pool.map(fingerprint);
  const cols = feats[0].map((_, i) => feats.map((f) => f[i]));
  const mean = cols.map((c) => c.reduce((a, b) => a + b, 0) / c.length);
  const sd = cols.map((c, i) => Math.sqrt(c.reduce((a, x) => a + (x - mean[i]) ** 2, 0) / c.length) || 1);
  const z = (f: number[]) => f.map((x, i) => (x - mean[i]) / sd[i]);
  const mz = z(fingerprint(me));
  return pool
    .filter((p) => p.player_id !== playerId)
    .map((p) => ({
      ...p,
      distance: Math.hypot(...z(fingerprint(p)).map((x, i) => x - mz[i])) + (p.position === me.position ? 0 : 0.75),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

export const RANK_METRICS = {
  goals: "Goals",
  shooting: "Shooting %",
  sevens: "7m conversion",
  gpm: "Goals per match",
  two_min: "2-min suspensions",
  nine: "9m %",
  six: "6m %",
  wing: "Wing %",
} as const;
export type RankMetric = keyof typeof RANK_METRICS;
/** Rank metrics from the PDF shot types, and the shot type they use. */
export const TYPE_METRICS: Partial<Record<RankMetric, ShotTypeKey>> = { nine: "9m", six: "6m", wing: "wing" };

export function rankings(metric: RankMetric, opts: { seasonId: number; competitionId?: number; position?: string }, limit = 30) {
  let where = "AND m.season_id = ?";
  const params: unknown[] = [opts.seasonId];
  if (opts.competitionId) {
    where += " AND m.competition_id = ?";
    params.push(opts.competitionId);
  }
  if (opts.position) {
    where += " AND p.position = ?";
    params.push(opts.position);
  }
  const ps = playerSeasons(where, ...params);
  const tg = ps.reduce((a, p) => a + p.goals, 0), ts = ps.reduce((a, p) => a + p.shots, 0);
  const g7 = ps.reduce((a, p) => a + p.goals_7m, 0), s7 = ps.reduce((a, p) => a + p.shots_7m, 0);
  const avg = ts ? tg / ts : 0, avg7 = s7 ? g7 / s7 : 0;
  // PDF shot types: only loaded for the type metrics, averaged over the same filtered players.
  const typeKey = TYPE_METRICS[metric];
  const types = typeKey ? shotTypeTotals(where, ...params) : new Map<number, ShotTypeTotals>();
  const typeSum = typeKey ? sumTotals(types.values())?.[typeKey] : undefined;
  const avgType = typeSum?.shots ? typeSum.goals / typeSum.shots : 0;
  const byType = (p: PlayerSeason) => {
    const t = typeKey && types.get(p.player_id);
    return t ? shrunkTypePct(t[typeKey], avgType) : null;
  };
  const score: Record<RankMetric, (p: PlayerSeason) => number | null> = {
    goals: (p) => p.goals,
    shooting: (p) => (p.shots >= MIN_SHOTS ? (p.goals + K * avg) / (p.shots + K) : null),
    sevens: (p) => (p.shots_7m >= 5 ? (p.goals_7m + 5 * avg7) / (p.shots_7m + 5) : null),
    gpm: (p) => (p.matches >= 3 ? p.goals / p.matches : null),
    two_min: (p) => p.two_min,
    nine: byType,
    six: byType,
    wing: byType,
  };
  const rows = ps
    .map((p) => ({ ...p, score: score[metric](p), typed: typeKey ? types.get(p.player_id)?.[typeKey] : undefined }))
    .filter((p): p is PlayerSeason & { score: number; typed: GoalsShots | undefined } => p.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { rows, average: { shooting: avg * 100, sevens: avg7 * 100, type: avgType * 100 } };
}

export function positions(seasonId: number): string[] {
  return all<{ position: string }>(
    `SELECT DISTINCT p.position FROM player_match p JOIN matches m ON m.id = p.match_id
     WHERE m.season_id = ? AND p.is_goalkeeper = 0 AND p.position <> '' ORDER BY p.position`,
    seasonId,
  ).map((r) => r.position);
}

export type Zone = { zone: string; goals: number; shots: number };

export function team(teamId: number) {
  const info = one<{ name: string; season_id: number; competition_id: number; competition: string }>(
    `SELECT CASE WHEN m.home_team_id = ? THEN m.home ELSE m.away END AS name, m.season_id, m.competition_id, c.name AS competition
     FROM matches m JOIN competitions c ON c.id = m.competition_id AND c.season_id = m.season_id
     WHERE m.home_team_id = ? OR m.away_team_id = ?
     GROUP BY m.competition_id ORDER BY count(*) DESC LIMIT 1`,
    teamId, teamId, teamId,
  );
  if (!info) return null;
  const zones = (side: "attack" | "defence") =>
    all<Zone>(
      `SELECT z.zone, sum(z.goals) AS goals, sum(z.shots) AS shots FROM team_zones z JOIN matches m ON m.id = z.match_id
       WHERE (m.home_team_id = ? AND z.side = ?) OR (m.away_team_id = ? AND z.side = ?) GROUP BY z.zone`,
      teamId, side === "attack" ? "home" : "away", teamId, side === "attack" ? "away" : "home",
    );
  const misses = (side: "attack" | "defence") =>
    one<{ over: number; left: number; right: number }>(
      `SELECT coalesce(sum(s.miss_over), 0) AS over, coalesce(sum(s.miss_left), 0) AS left, coalesce(sum(s.miss_right), 0) AS right
       FROM team_shooting s JOIN matches m ON m.id = s.match_id
       WHERE (m.home_team_id = ? AND s.side = ?) OR (m.away_team_id = ? AND s.side = ?)`,
      teamId, side === "attack" ? "home" : "away", teamId, side === "attack" ? "away" : "home",
    )!;
  // Every zone goal in the competition is someone's attack, so one total per zone is the league average for both sides.
  const leagueZones = all<Zone>(
    `SELECT z.zone, sum(z.goals) AS goals, sum(z.shots) AS shots FROM team_zones z JOIN matches m ON m.id = z.match_id
     WHERE m.competition_id = ? AND m.season_id = ? GROUP BY z.zone`,
    info.competition_id, info.season_id,
  );
  const matches = all<Match>(
    `SELECT * FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 1
     ORDER BY substr(date,7,4)||substr(date,4,2)||substr(date,1,2) DESC`,
    teamId, teamId,
  );
  const squad = playerSeasons("AND p.team_id = ?", teamId).sort((a, b) => b.goals - a.goals);
  return {
    ...info,
    attack: zones("attack"),
    defence: zones("defence"),
    missAttack: misses("attack"),
    missDefence: misses("defence"),
    leagueZones,
    matches,
    squad,
  };
}

export function freshness() {
  return one<{ matches: number; latest: string | null; checks_failed: number }>(
    `SELECT (SELECT count(*) FROM matches WHERE status = 1) AS matches,
            (SELECT max(substr(date,7,4)||'-'||substr(date,4,2)||'-'||substr(date,1,2)) FROM matches WHERE status = 1) AS latest,
            (SELECT count(*) FROM checks WHERE ok = 0 AND name NOT LIKE 'zones_plus_7m%'
               AND name NOT IN ('pdf_player_goals_eq_json', 'pdf_shot_types')) AS checks_failed`,
  );
}
