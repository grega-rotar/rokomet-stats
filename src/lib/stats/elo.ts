// Team Elo for handball. The Python twin is scripts/teams.py (chat uses it); keep the two in step.
// Rules and the reasons for them: specs/stats-pipeline.md, "Team Elo".

export const START = 1500; // a top-division team's first rating
export const LEVEL_STEP = 100; // each division below the top starts this much lower (1. B SRL 1400, 2. SRL 1300)
export const K = 30; // update size per match, before the goal-difference multiplier
export const CARRY = 2 / 3; // share of last season's distance from the seed kept into a new season
export const HFA_DEFAULT = 40; // home advantage in rating points when there are too few matches to fit it

export type EloMatch = {
  id: number; season_id: number; date: string; time: string | null; status: number;
  home_id: number; away_id: number; home: string; away: string;
  hg: number | null; ag: number | null; competition: string;
};

export type EloStep = {
  match_id: number; season_id: number; date: string; competition: string; name: string; opponent: string;
  opponent_id: number; home: boolean; goals: number; against: number;
  result: "W" | "D" | "L"; before: number; after: number; delta: number;
};

export type EloResult = {
  hfa: number;
  ratings: Map<string, number>;
  history: Map<string, EloStep[]>;
  predictions: { match: EloMatch; expected: number; score: number }[];
};

const CUP = /POKAL/i;

/** Rating pool: the age/gender group in the last brackets, e.g. "Liga NLB (1. SRL) (Člani)" -> "Člani". */
export function poolOf(name: string): string {
  const m = [...name.matchAll(/\(([^()]*)\)/g)];
  return m.length ? m[m.length - 1][1].trim() : name;
}

/** Division level inside a pool: 0 top, 1 "1. B", 2 "2. …", 3 "3. …"; null for cups. */
export function levelOf(name: string): number | null {
  if (CUP.test(name)) return null;
  if (/\b1\. ?B\b/.test(name)) return 1;
  const m = name.match(/\b([23])\. ?(?:B )?(?:SRL|liga)/i);
  return m ? Number(m[1]) : 0;
}

export const key = (pool: string, teamId: number) => `${pool}|${teamId}`;

/** Expected score of the side that is `diff` rating points ahead (home advantage already added). */
export function expected(diff: number): number {
  return 1 / (1 + 10 ** (-diff / 400));
}

/** ln(goal difference + 1), damped when the favourite wins (FiveThirtyEight-style); 1 for a draw. */
export function marginMult(gd: number, winnerDiff: number): number {
  if (gd === 0) return 1;
  return (Math.log(Math.abs(gd) + 1) * 2.2) / (Math.max(-1000, winnerDiff) * 0.001 + 2.2);
}

/** One match: the home side's rating change (the away side gets the negative). */
export function update(home: number, away: number, hg: number, ag: number, hfa: number, k = K): number {
  const diff = home + hfa - away;
  const score = hg > ag ? 1 : hg === ag ? 0.5 : 0;
  const gd = hg - ag;
  return k * marginMult(gd, gd > 0 ? diff : -diff) * (score - expected(diff));
}

/** Rating points that make the expected home score equal the observed one (league matches only). */
export function fitHomeAdvantage(matches: EloMatch[]): number {
  const league = matches.filter((m) => levelOf(m.competition) !== null && m.hg !== null && m.ag !== null);
  if (league.length < 50) return HFA_DEFAULT;
  let s = league.reduce((a, m) => a + (m.hg! > m.ag! ? 1 : m.hg === m.ag ? 0.5 : 0), 0) / league.length;
  s = Math.min(0.75, Math.max(0.5, s));
  return Math.round(400 * Math.log10(s / (1 - s)));
}

export const dateKey = (d: string) => (d && d.length >= 10 ? d.slice(6, 10) + d.slice(3, 5) + d.slice(0, 2) : "");

const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);

/** Run Elo over the played matches in date order. One rating per team id and pool, carried across a season's stages. */
export function computeElo(matches: EloMatch[], opts: { k?: number; levelStep?: number; hfa?: number } = {}): EloResult {
  const k = opts.k ?? K, step = opts.levelStep ?? LEVEL_STEP;
  const played = matches
    .filter((m) => m.status === 1 && m.hg !== null && m.ag !== null)
    .sort((a, b) => cmp(a.season_id, b.season_id) || cmp(dateKey(a.date), dateKey(b.date)) || cmp(a.time ?? "", b.time ?? "") || cmp(a.id, b.id));
  const hfa = opts.hfa ?? fitHomeAdvantage(played);

  // Each team's division per season and pool (its highest league), dense-ranked within the pool.
  const levels = new Map<string, Set<number>>();
  const teamLevel = new Map<string, number>();
  for (const m of played) {
    const lv = levelOf(m.competition);
    if (lv === null) continue;
    const sp = `${m.season_id}|${poolOf(m.competition)}`;
    if (!levels.has(sp)) levels.set(sp, new Set());
    levels.get(sp)!.add(lv);
    for (const t of [m.home_id, m.away_id]) {
      const tk = `${sp}|${t}`;
      teamLevel.set(tk, Math.min(teamLevel.get(tk) ?? lv, lv));
    }
  }
  const seed = (season: number, pool: string, team: number) => {
    const sorted = [...(levels.get(`${season}|${pool}`) ?? new Set([0]))].sort((a, b) => a - b);
    const lv = teamLevel.get(`${season}|${pool}|${team}`);
    return START - step * (lv !== undefined ? sorted.indexOf(lv) : sorted.length);
  };

  const ratings = new Map<string, number>();
  const seasonOf = new Map<string, number>();
  const history = new Map<string, EloStep[]>();
  const predictions: EloResult["predictions"] = [];
  for (const m of played) {
    const pool = poolOf(m.competition);
    const pre = [m.home_id, m.away_id].map((t) => {
      const kk = key(pool, t);
      if (seasonOf.get(kk) !== m.season_id) {
        const s = seed(m.season_id, pool, t);
        const prev = ratings.get(kk);
        ratings.set(kk, prev !== undefined ? s + (prev - s) * CARRY : s);
        seasonOf.set(kk, m.season_id);
      }
      return ratings.get(kk)!;
    });
    const hg = m.hg!, ag = m.ag!;
    const delta = update(pre[0], pre[1], hg, ag, hfa, k);
    predictions.push({ match: m, expected: expected(pre[0] + hfa - pre[1]), score: hg > ag ? 1 : hg === ag ? 0.5 : 0 });
    const sides = [
      { t: m.home_id, opp: m.away_id, name: m.home, oppName: m.away, sign: 1, gf: hg, ga: ag },
      { t: m.away_id, opp: m.home_id, name: m.away, oppName: m.home, sign: -1, gf: ag, ga: hg },
    ];
    sides.forEach((s, i) => {
      const kk = key(pool, s.t);
      const after = pre[i] + s.sign * delta;
      ratings.set(kk, after);
      if (!history.has(kk)) history.set(kk, []);
      history.get(kk)!.push({
        match_id: m.id, season_id: m.season_id, date: m.date, competition: m.competition, name: s.name,
        opponent: s.oppName, opponent_id: s.opp, home: s.sign === 1, goals: s.gf, against: s.ga,
        result: s.gf === s.ga ? "D" : s.gf > s.ga ? "W" : "L", before: pre[i], after, delta: s.sign * delta,
      });
    });
  }
  return { hfa, ratings, history, predictions };
}

/** Accuracy on decisive matches and Brier score (draw = 0.5), for Elo and for a constant home-win rate. */
export function scorePredictions(preds: EloResult["predictions"], baseP: number) {
  const decisive = preds.filter((p) => p.score !== 0.5);
  const n = Math.max(1, preds.length), d = Math.max(1, decisive.length);
  return {
    matches: preds.length,
    decisive: decisive.length,
    eloAccuracy: decisive.filter((p) => p.expected > 0.5 === (p.score === 1)).length / d,
    homeAccuracy: decisive.filter((p) => p.score === 1).length / d,
    eloBrier: preds.reduce((a, p) => a + (p.expected - p.score) ** 2, 0) / n,
    homeBrier: preds.reduce((a, p) => a + (baseP - p.score) ** 2, 0) / n,
  };
}
