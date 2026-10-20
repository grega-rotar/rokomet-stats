// Shot types per player (7m / 6m / wing / 9m) from the PDF player table (table player_shot_types).
// Pure functions, no database: the same rules are in scripts/players.py.
// The PDF is a separate record from the JSON, so goals and shots stay with player_match; the PDF only
// gives the split by type, and each type's % is goals/shots of that PDF column.

export const SHOT_TYPES = [
  { key: "7m", label: "7m penalties" },
  { key: "6m", label: "6m, close range" },
  { key: "wing", label: "Wing" },
  { key: "9m", label: "9m, long range" },
] as const;
export type ShotTypeKey = (typeof SHOT_TYPES)[number]["key"];

/** A weak spot by type needs TYPE_MIN attempts of that type and TYPE_GAP points below the position average. */
export const TYPE_MIN = 15;
export const TYPE_GAP = 10;
/** Rankings: each player's type % is pulled toward the average by TYPE_K attempts (TYPE_MIN+ attempts). */
export const TYPE_K = 15;

export type GoalsShots = { goals: number; shots: number };
export type ShotTypeTotals = Record<ShotTypeKey, GoalsShots> & { misses: number; matches: number };
export type ShotTypeRow = { key: ShotTypeKey; label: string; goals: number; shots: number; pct: number | null; avg: number | null; share: number };
export type WeakSpot = { title: string; detail: string };

/** One SQL row of summed player_shot_types columns into totals. */
export function toTotals(r: {
  matches: number; goals_7m: number; shots_7m: number; goals_6m: number; shots_6m: number;
  goals_wing: number; shots_wing: number; goals_9m: number; shots_9m: number; misses: number;
}): ShotTypeTotals {
  return {
    "7m": { goals: r.goals_7m, shots: r.shots_7m },
    "6m": { goals: r.goals_6m, shots: r.shots_6m },
    wing: { goals: r.goals_wing, shots: r.shots_wing },
    "9m": { goals: r.goals_9m, shots: r.shots_9m },
    misses: r.misses,
    matches: r.matches,
  };
}

const pct = (g: number, s: number) => (s ? (100 * g) / s : null);

export function shotTypeRows(me: ShotTypeTotals, avg: ShotTypeTotals | null): ShotTypeRow[] {
  const typed = SHOT_TYPES.reduce((a, t) => a + me[t.key].shots, 0);
  return SHOT_TYPES.map((t) => ({
    key: t.key,
    label: t.label,
    ...me[t.key],
    pct: pct(me[t.key].goals, me[t.key].shots),
    avg: avg ? pct(avg[t.key].goals, avg[t.key].shots) : null,
    share: typed ? (100 * me[t.key].shots) / typed : 0,
  }));
}

/** 6m, wing and 9m only: 7m already has its own weak-spot rule on the JSON numbers. */
export function shotTypeWeakSpots(rows: ShotTypeRow[], position: string): WeakSpot[] {
  return rows
    .filter((r) => r.key !== "7m" && r.shots >= TYPE_MIN && r.pct !== null && r.avg !== null && r.pct < r.avg - TYPE_GAP)
    .map((r) => ({
      title: `${r.key === "wing" ? "Wing" : r.key} shots`,
      detail: `${r.goals}/${r.shots} from ${r.key === "wing" ? "the wing" : r.key} (${r.pct!.toFixed(0)}%), the average ${position.toLowerCase()} scores ${r.avg!.toFixed(0)}% (match PDFs).`,
    }));
}

/** Shrunk type % for rankings, or null below the minimum. avg is a fraction (0-1). */
export function shrunkTypePct(t: GoalsShots, avg: number): number | null {
  return t.shots >= TYPE_MIN ? (t.goals + TYPE_K * avg) / (t.shots + TYPE_K) : null;
}
