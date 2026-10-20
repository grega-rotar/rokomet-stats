import { describe, expect, it } from "vitest";
import {
  CARRY, computeElo, expected, fitHomeAdvantage, K, key, levelOf, LEVEL_STEP, marginMult, poolOf, scorePredictions, START, update,
  type EloMatch,
} from "./elo";

let nextId = 1;
const match = (o: Partial<EloMatch> & Pick<EloMatch, "home_id" | "away_id" | "hg" | "ag">): EloMatch => ({
  id: nextId++, season_id: 73, date: "01.10.2026", time: "18:00", status: 1,
  home: `T${o.home_id}`, away: `T${o.away_id}`, competition: "Liga NLB (1. SRL) (Člani)", ...o,
});

describe("Elo math", () => {
  it("expected score is 50% for equal ratings and ~91% for +400", () => {
    expect(expected(0)).toBe(0.5);
    expect(expected(400)).toBeCloseTo(10 / 11, 6);
    expect(expected(-200) + expected(200)).toBeCloseTo(1, 10);
  });

  it("goal-difference multiplier: 1 for a draw, ln(gd+1) between equals, damped for a favourite", () => {
    expect(marginMult(0, 300)).toBe(1);
    expect(marginMult(5, 0)).toBeCloseTo(Math.log(6), 10);
    expect(marginMult(-5, 0)).toBeCloseTo(Math.log(6), 10);
    expect(marginMult(5, 200)).toBeLessThan(marginMult(5, 0));
    expect(marginMult(5, -200)).toBeGreaterThan(marginMult(5, 0));
  });

  it("update: the winner gains, bigger wins gain more, an expected draw moves nothing", () => {
    const win = update(1500, 1500, 30, 25, 0);
    expect(win).toBeCloseTo(K * Math.log(6) * 0.5, 10);
    expect(update(1500, 1500, 35, 25, 0)).toBeGreaterThan(win);
    expect(update(1500, 1500, 25, 30, 0)).toBeCloseTo(-win, 10);
    expect(update(1500, 1500, 28, 28, 0)).toBe(0);
    // With home advantage a home draw loses points.
    expect(update(1500, 1500, 28, 28, 50)).toBeLessThan(0);
  });

  it("home advantage fitted from the home score rate", () => {
    const ms = Array.from({ length: 100 }, (_, i) => match({ home_id: 1, away_id: 2, hg: i < 60 ? 30 : 25, ag: 27 }));
    expect(fitHomeAdvantage(ms)).toBe(Math.round(400 * Math.log10(0.6 / 0.4)));
    expect(fitHomeAdvantage(ms.slice(0, 10))).toBe(40); // too few: default
  });
});

describe("pools and levels", () => {
  it("groups competitions by the last bracket and ranks divisions", () => {
    expect(poolOf("Liga NLB (1. SRL) (Člani)")).toBe("Člani");
    expect(poolOf("POKAL SLOVENIJE - moški (Člani)")).toBe("Člani");
    expect(poolOf("M20 2. SRL CENTER (M20)")).toBe("M20");
    expect(levelOf("Liga NLB (1. SRL) (Člani)")).toBe(0);
    expect(levelOf("1. B SRL - moški (Člani)")).toBe(1);
    expect(levelOf("2. SRL - moški (Člani)")).toBe(2);
    expect(levelOf("POKAL SLOVENIJE - moški (Člani)")).toBeNull();
    expect(levelOf("M15 SRT - JUG (M15)")).toBe(0);
  });
});

describe("computeElo", () => {
  it("seeds lower divisions lower, is zero-sum per match, and keeps one rating across competitions", () => {
    const ms = [
      match({ home_id: 1, away_id: 2, hg: 30, ag: 25 }),
      match({ home_id: 3, away_id: 4, hg: 22, ag: 22, competition: "1. B SRL - moški (Člani)" }),
      match({ home_id: 3, away_id: 1, hg: 20, ag: 30, date: "05.10.2026", competition: "POKAL SLOVENIJE - moški (Člani)" }),
    ];
    const r = computeElo(ms, { hfa: 0 });
    const h3 = r.history.get(key("Člani", 3))!;
    expect(h3[0].before).toBe(START - LEVEL_STEP);
    expect(h3[0].delta).toBe(0); // equal teams drew
    expect(h3[1].competition).toMatch(/POKAL/); // same rating continues in the cup
    const sum = [1, 2, 3, 4].reduce((a, t) => a + r.ratings.get(key("Člani", t))!, 0);
    expect(sum).toBeCloseTo(2 * START + 2 * (START - LEVEL_STEP), 8);
    expect(r.predictions).toHaveLength(3);
  });

  it("orders by date, skips unplayed matches and pulls ratings toward the seed in a new season", () => {
    const ms = [
      match({ home_id: 1, away_id: 2, hg: 40, ag: 20, date: "10.10.2026" }),
      match({ home_id: 2, away_id: 1, hg: 0, ag: 0, status: 0, date: "20.10.2026" }),
      match({ home_id: 1, away_id: 2, hg: 30, ag: 30, date: "01.09.2027", season_id: 74 }),
    ];
    const r = computeElo(ms, { hfa: 0 });
    const h1 = r.history.get(key("Člani", 1))!;
    expect(h1).toHaveLength(2);
    expect(h1[1].before).toBeCloseTo(START + (h1[0].after - START) * CARRY, 8);
  });

  it("scores predictions against the home-win baseline", () => {
    const s = scorePredictions(
      [
        { match: match({ home_id: 1, away_id: 2, hg: 30, ag: 20 }), expected: 0.8, score: 1 },
        { match: match({ home_id: 1, away_id: 2, hg: 20, ag: 30 }), expected: 0.3, score: 0 },
        { match: match({ home_id: 1, away_id: 2, hg: 25, ag: 25 }), expected: 0.5, score: 0.5 },
      ],
      0.55,
    );
    expect(s.decisive).toBe(2);
    expect(s.eloAccuracy).toBe(1);
    expect(s.homeAccuracy).toBe(0.5);
    expect(s.eloBrier).toBeCloseTo((0.04 + 0.09 + 0) / 3, 10);
  });
});
