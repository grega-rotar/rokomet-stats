import "server-only";
import { all, one } from "./db";
import { computeElo, dateKey, expected, key, poolOf, type EloMatch, type EloResult, type EloStep } from "./elo";
import { fold, km, type LatLon } from "./geo";

// Team Elo tables and "near you" for the stats pages. Elo maths: ./elo.ts; clubs: scripts/clubs.py.

let cache: { stamp: string; matches: EloMatch[]; elo: EloResult } | null = null;

/** All matches plus the Elo run over them, recomputed only when stats.db has new matches. */
export function elo(): { matches: EloMatch[]; elo: EloResult } {
  const s = one<{ n: number; mx: number | null }>("SELECT count(*) AS n, max(id) AS mx FROM matches WHERE status IN (0, 1)");
  const stamp = `${s?.n}|${s?.mx}`;
  if (cache?.stamp !== stamp) {
    const matches = all<EloMatch>(
      `SELECT m.id, m.season_id, m.date, m.time, m.status, m.home_team_id AS home_id, m.away_team_id AS away_id,
              m.home, m.away, m.home_goals AS hg, m.away_goals AS ag, c.name AS competition
       FROM matches m JOIN competitions c ON c.id = m.competition_id AND c.season_id = m.season_id
       WHERE m.status IN (0, 1) AND m.home_team_id IS NOT NULL AND m.away_team_id IS NOT NULL`,
    );
    cache = { stamp, matches, elo: computeElo(matches) };
  }
  return cache;
}

export type EloRow = {
  team_id: number; name: string; rating: number; change5: number; last5: EloStep[]; spark: number[]; matches: number;
};
export type Fixture = { match: EloMatch; pHome: number; homeRating: number; awayRating: number };

function seasonSteps(steps: EloStep[], seasonId: number) {
  return steps.filter((s) => s.season_id === seasonId);
}

function row(teamId: number, steps: EloStep[], rating: number): EloRow {
  const last5 = steps.slice(-5);
  return {
    team_id: teamId,
    name: steps[steps.length - 1]?.name ?? String(teamId),
    rating,
    change5: last5.reduce((a, s) => a + s.delta, 0),
    last5,
    spark: steps.length ? [steps[0].before, ...steps.map((s) => s.after)] : [],
    matches: steps.length,
  };
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
};

function fixtures(matches: EloMatch[], e: EloResult, filter: (m: EloMatch) => boolean): Fixture[] {
  const now = today();
  return matches
    .filter((m) => m.status === 0 && dateKey(m.date) >= now && filter(m))
    .sort((a, b) => (dateKey(a.date) < dateKey(b.date) ? -1 : 1))
    .flatMap((m) => {
      const pool = poolOf(m.competition);
      const h = e.ratings.get(key(pool, m.home_id)), a = e.ratings.get(key(pool, m.away_id));
      return h === undefined || a === undefined ? [] : [{ match: m, pHome: expected(h + e.hfa - a), homeRating: h, awayRating: a }];
    });
}

/** Elo table for the teams of one competition this season (ratings are shared across the pool). */
export function eloTable(competitionId: number, seasonId: number) {
  const { matches, elo: e } = elo();
  const comp = one<{ name: string }>("SELECT name FROM competitions WHERE id = ? AND season_id = ?", competitionId, seasonId);
  if (!comp) return null;
  const pool = poolOf(comp.name);
  const teamIds = new Set<number>();
  for (const m of all<{ home_team_id: number; away_team_id: number }>(
    "SELECT home_team_id, away_team_id FROM matches WHERE competition_id = ? AND season_id = ? AND status = 1",
    competitionId, seasonId,
  )) {
    teamIds.add(m.home_team_id);
    teamIds.add(m.away_team_id);
  }
  const rows = [...teamIds]
    .flatMap((t) => {
      const r = e.ratings.get(key(pool, t));
      return r === undefined ? [] : [row(t, seasonSteps(e.history.get(key(pool, t)) ?? [], seasonId), r)];
    })
    .sort((a, b) => b.rating - a.rating);
  const upcoming = fixtures(matches, e, (m) => m.season_id === seasonId && m.competition === comp.name);
  return { pool, hfa: e.hfa, rows, upcoming, competition: comp.name };
}

/** A team's rating, rank in its main competition, form and upcoming fixtures. */
export function teamElo(teamId: number, seasonId: number, competitionId: number) {
  const { matches, elo: e } = elo();
  const comp = one<{ name: string }>("SELECT name FROM competitions WHERE id = ? AND season_id = ?", competitionId, seasonId);
  if (!comp) return null;
  const pool = poolOf(comp.name);
  const rating = e.ratings.get(key(pool, teamId));
  if (rating === undefined) return null;
  const table = eloTable(competitionId, seasonId);
  return {
    ...row(teamId, seasonSteps(e.history.get(key(pool, teamId)) ?? [], seasonId), rating),
    rank: (table?.rows.findIndex((r) => r.team_id === teamId) ?? -1) + 1,
    of: table?.rows.length ?? 0,
    pool,
    hfa: e.hfa,
    upcoming: fixtures(matches, e, (m) => m.home_id === teamId || m.away_id === teamId),
  };
}

/** Pre-match Elo against "home team wins" over one season (the numbers on /stats/teams). */
export function eloValidation(seasonId: number) {
  const { elo: e } = elo();
  const preds = e.predictions.filter((p) => p.match.season_id === seasonId);
  const decisive = preds.filter((p) => p.score !== 0.5);
  const n = Math.max(1, decisive.length);
  return {
    matches: preds.length,
    decisive: decisive.length,
    eloAccuracy: decisive.filter((p) => p.expected > 0.5 === (p.score === 1)).length / n,
    homeAccuracy: decisive.filter((p) => p.score === 1).length / n,
  };
}

// --- Clubs and "near you" (tables filled by scripts/clubs.py) -------------------------------------------

export type Place = { postcode: string; place: string; lat: number; lon: number };
export type NearClub = {
  id: number; name: string; street: string; postcode: string; town: string; lat: number; lon: number; km: number;
  teams: { team_id: number; name: string; competition: string; played: boolean }[];
};

export function hasClubs(): boolean {
  return !!one<{ n: number }>("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'clubs'");
}

export function places(): Place[] {
  return hasClubs() ? all<Place>("SELECT postcode, place, lat, lon FROM postcodes ORDER BY place") : [];
}

/** A town name or a postcode -> its postcode centre. Exact matches first, then a prefix. */
export function findPlace(q: string): Place | null {
  const f = fold(q);
  if (!f) return null;
  const ps = places();
  const name = (p: Place) => p.place.split("/").map(fold);
  return (
    ps.find((p) => p.postcode === f) ??
    ps.find((p) => name(p).includes(f)) ??
    ps.find((p) => name(p).some((n) => n.startsWith(f))) ??
    null
  );
}

/** Every club with coordinates and its teams this season, sorted by distance from `from` when given. */
export function clubs(seasonId: number, from?: LatLon): NearClub[] {
  if (!hasClubs()) return [];
  const teams = all<{ club_id: number; team_id: number; name: string | null; competition: string; played: number }>(
    `SELECT tc.club_id, tc.team_id, c.name AS competition,
            (SELECT CASE WHEN m.home_team_id = tc.team_id THEN m.home ELSE m.away END FROM matches m
              WHERE (m.home_team_id = tc.team_id OR m.away_team_id = tc.team_id) AND m.season_id = tc.season_id LIMIT 1) AS name,
            (SELECT count(*) FROM matches m WHERE (m.home_team_id = tc.team_id OR m.away_team_id = tc.team_id)
              AND m.season_id = tc.season_id AND m.competition_id = tc.competition_id AND m.status = 1) AS played
     FROM team_clubs tc JOIN competitions c ON c.id = tc.competition_id AND c.season_id = tc.season_id
     WHERE tc.season_id = ? ORDER BY c.name LIKE '%POKAL%', played DESC, c.id`,
    seasonId,
  );
  const byClub = new Map<number, NearClub["teams"]>();
  for (const t of teams) {
    const list = byClub.get(t.club_id) ?? [];
    // One entry per team id: the league it plays most in, not the cup. A club's second team in the same league gets "· 2".
    if (!list.some((x) => x.team_id === t.team_id)) {
      const same = list.filter((x) => x.competition.replace(/ · \d+$/, "") === t.competition).length;
      list.push({ team_id: t.team_id, name: t.name ?? "", competition: same ? `${t.competition} · ${same + 1}` : t.competition, played: t.played > 0 });
    }
    byClub.set(t.club_id, list);
  }
  return all<Omit<NearClub, "km" | "teams">>("SELECT id, name, street, postcode, town, lat, lon FROM clubs WHERE lat IS NOT NULL")
    .filter((c) => byClub.has(c.id))
    .map((c) => ({ ...c, km: from ? km(from, c) : 0, teams: byClub.get(c.id)! }))
    .sort((a, b) => a.km - b.km || a.name.localeCompare(b.name, "sl"));
}
