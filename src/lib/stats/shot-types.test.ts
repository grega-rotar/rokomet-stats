import { describe, expect, it } from "vitest";
import { shotTypeRows, shotTypeWeakSpots, shrunkTypePct, toTotals, TYPE_K, TYPE_MIN } from "./shot-types";

const totals = (o: Partial<Parameters<typeof toTotals>[0]>) =>
  toTotals({ matches: 8, goals_7m: 0, shots_7m: 0, goals_6m: 0, shots_6m: 0, goals_wing: 0, shots_wing: 0, goals_9m: 0, shots_9m: 0, misses: 0, ...o });

describe("shot types", () => {
  const me = totals({ goals_7m: 7, shots_7m: 9, goals_6m: 21, shots_6m: 28, goals_9m: 11, shots_9m: 32, goals_wing: 1, shots_wing: 3 });
  const avg = totals({ goals_7m: 76, shots_7m: 100, goals_6m: 73, shots_6m: 100, goals_9m: 58, shots_9m: 100, goals_wing: 9, shots_wing: 10 });
  const rows = shotTypeRows(me, avg);

  it("computes % per type from the PDF columns and the shot mix", () => {
    const nine = rows.find((r) => r.key === "9m")!;
    expect(nine).toMatchObject({ goals: 11, shots: 32 });
    expect(nine.pct).toBeCloseTo(34.4, 1);
    expect(nine.avg).toBeCloseTo(58, 5);
    expect(rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(100, 5);
  });

  it("flags a type only with enough attempts and a big enough gap, never 7m", () => {
    const spots = shotTypeWeakSpots(rows, "Desni zunanji");
    expect(spots.map((s) => s.title)).toEqual(["9m shots"]); // wing 1/3 is too few, 6m 75% vs 73% is fine
    expect(spots[0].detail).toContain("11/32");
    const sevens = shotTypeWeakSpots(shotTypeRows(totals({ goals_7m: 5, shots_7m: 20 }), avg), "Levo krilo");
    expect(sevens).toEqual([]);
  });

  it("shrinks rankings toward the average and needs the minimum", () => {
    expect(shrunkTypePct({ goals: 14, shots: TYPE_MIN - 1 }, 0.5)).toBeNull();
    expect(shrunkTypePct({ goals: 15, shots: 15 }, 0.5)).toBeCloseTo((15 + TYPE_K * 0.5) / (15 + TYPE_K), 10);
  });
});
