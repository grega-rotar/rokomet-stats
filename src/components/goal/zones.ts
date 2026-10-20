// Goal zones as team_zones stores them: 9 zones, shooter's view, on-target non-7m shots. Shared by the 3D and 2D goal.

export const ROWS = ["top", "mid", "bottom"] as const;
export const COLS = ["left", "center", "right"] as const;
export const ZONE_KEYS = ROWS.flatMap((r) => COLS.map((c) => `${r}_${c}` as const));
export type ZoneKey = (typeof ZONE_KEYS)[number];

export type ZoneCount = { zone: string; goals: number; shots: number };
export type Miss = { over: number; left: number; right: number };
export type GoalMode = "scored" | "conceded";
export type GoalData = {
  mode: GoalMode;
  zones: ZoneCount[];
  miss?: Miss;
  avg?: ZoneCount[]; // league totals per zone, compared by share of goals
};

export type Cell = {
  zone: ZoneKey;
  row: number;
  col: number;
  goals: number;
  shots: number;
  share: number; // of all goals with a zone
  rate: number | null; // goals / shots on target
  heat: number; // 0..1, share relative to the busiest zone
  avgShare: number | null;
};

export function cells(d: GoalData): { cells: Cell[]; total: number; shots: number } {
  const by = new Map(d.zones.map((z) => [z.zone, z]));
  const avg = d.avg?.length ? new Map(d.avg.map((z) => [z.zone, z])) : null;
  const avgTotal = d.avg?.reduce((a, z) => a + z.goals, 0) ?? 0;
  const total = d.zones.reduce((a, z) => a + z.goals, 0);
  const shots = d.zones.reduce((a, z) => a + z.shots, 0);
  const maxShare = Math.max(1e-9, ...d.zones.map((z) => z.goals / Math.max(1, total)));
  return {
    total,
    shots,
    cells: ZONE_KEYS.map((zone, i) => {
      const z = by.get(zone);
      const goals = z?.goals ?? 0;
      const s = z?.shots ?? 0;
      const share = total ? goals / total : 0;
      return {
        zone,
        row: Math.floor(i / 3),
        col: i % 3,
        goals,
        shots: s,
        share,
        rate: s ? goals / s : null,
        heat: total ? share / maxShare : 0,
        avgShare: avg && avgTotal ? (avg.get(zone)?.goals ?? 0) / avgTotal : null,
      };
    }),
  };
}

export const zoneName = (z: ZoneKey) => z.replace("_", " ").replace("mid", "middle");
export const pct = (v: number) => `${Math.round(v * 100)}%`;

// Heat scale in the app palette: floor white to court green (scored) or foul red (conceded).
const SCALE: Record<GoalMode, [string, string, string]> = {
  scored: ["#f3f6ec", "#94c11e", "#4f7410"],
  conceded: ["#fbf0f0", "#e07a7a", "#a92f2f"],
};

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hex(a), hex(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
};

export function heatColor(mode: GoalMode, t: number): string {
  const [lo, mid, hi] = SCALE[mode];
  return t < 0.6 ? mix(lo, mid, t / 0.6) : mix(mid, hi, (t - 0.6) / 0.4);
}

/** Dark tiles get white text. */
export const heatInk = (t: number) => (t > 0.7 ? "#ffffff" : "#1e2b38");

export const ACCENT: Record<GoalMode, string> = { scored: "#94c11e", conceded: "#d64545" };
