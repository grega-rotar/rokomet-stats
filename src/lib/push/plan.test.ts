import { describe, expect, it } from "vitest";
import { planPushes, playerText, windowStart, type NewMatch, type PushDevice } from "./plan";

const match = (id: number, over: Partial<NewMatch> = {}): NewMatch => ({
  id,
  season_id: 73,
  competition_id: 10,
  competition: "1. NLB liga",
  category: "top",
  round: "7",
  home: "RK KRIM",
  away: "ŽRK IZOLA",
  home_team_id: 4042,
  away_team_id: 4060,
  home_goals: 31,
  away_goals: 28,
  ...over,
});

const device = (id: string, over: Partial<PushDevice> = {}): PushDevice => ({ id, allTop: false, follows: [], ...over });

describe("planPushes", () => {
  it("sends to all-top devices and team followers, not to others", () => {
    const pushes = planPushes(
      [match(1)],
      [],
      [device("A", { allTop: true }), device("B", { follows: [{ kind: "team", refId: 4042 }] }), device("C", { follows: [{ kind: "team", refId: 9999 }] })],
    );
    expect(pushes.map((p) => p.deviceId)).toEqual(["A", "B"]);
    expect(pushes[0].payload).toEqual({
      title: "RK KRIM 31:28 ŽRK IZOLA",
      body: "1. NLB liga · round 7",
      url: "/stats?season=73&comp=10",
      tag: "match-1",
    });
    expect(pushes[1].payload.url).toBe("/stats/teams/4042");
  });

  it("all-top devices skip matches outside the top leagues", () => {
    expect(planPushes([match(1, { category: "youth" })], [], [device("A", { allTop: true })])).toEqual([]);
  });

  it("follows the away team too", () => {
    const pushes = planPushes([match(1)], [], [device("B", { follows: [{ kind: "team", refId: 4060 }] })]);
    expect(pushes[0].payload.url).toBe("/stats/teams/4060");
  });

  it("names a followed player's line and links to the player", () => {
    const pushes = planPushes(
      [match(1, { category: "senior" })],
      [{ match_id: 1, player_id: 77, name: "Ana Novak", goals: 9, shots: 12 }],
      [device("P", { follows: [{ kind: "player", refId: 77 }] })],
    );
    expect(pushes).toHaveLength(1);
    expect(pushes[0].payload.body).toContain("Ana Novak: 9 goals (9/12)");
    expect(pushes[0].payload.url).toBe("/stats/players/77");
  });

  it("ignores a followed player's line from another match", () => {
    const pushes = planPushes(
      [match(1, { category: "senior" })],
      [{ match_id: 2, player_id: 77, name: "Ana Novak", goals: 9, shots: 12 }],
      [device("P", { follows: [{ kind: "player", refId: 77 }] })],
    );
    expect(pushes).toEqual([]);
  });

  it("bundles more than 3 results for one device into one summary", () => {
    const pushes = planPushes([1, 2, 3, 4, 5].map((id) => match(id)), [], [device("A", { allTop: true })]);
    expect(pushes).toHaveLength(1);
    expect(pushes[0].payload.title).toBe("5 new results");
    expect(pushes[0].payload.body.split("\n")).toEqual(["RK KRIM 31:28 ŽRK IZOLA", "RK KRIM 31:28 ŽRK IZOLA", "RK KRIM 31:28 ŽRK IZOLA", "+2 more"]);
  });

  it("keeps 3 results as separate pushes", () => {
    expect(planPushes([1, 2, 3].map((id) => match(id)), [], [device("A", { allTop: true })])).toHaveLength(3);
  });
});

describe("helpers", () => {
  it("writes a player's line", () => {
    expect(playerText({ match_id: 1, player_id: 1, name: "X", goals: 1, shots: 3 })).toBe("X: 1 goal (1/3)");
    expect(playerText({ match_id: 1, player_id: 1, name: "X", goals: 0, shots: 0 })).toBe("X: no shots");
    expect(playerText({ match_id: 1, player_id: 1, name: "X", goals: 4, shots: 0 })).toBe("X: 4 goals");
  });

  it("windowStart counts back whole local days", () => {
    expect(windowStart(new Date(2026, 9, 20, 23, 59), 3)).toBe("2026-10-17");
    expect(windowStart(new Date(2026, 2, 2, 0, 5), 3)).toBe("2026-02-27");
  });
});
