import { describe, expect, it } from "vitest";
import { fixGoalArea, inGoalArea, outOfGoalArea } from "./geometry";
import { DrillPlan } from "./plan";
import sample from "./fixtures/sample-plan.json";

describe("goal area", () => {
  it("knows the 6m line", () => {
    expect(inGoalArea(5.9, 0)).toBe(true);
    expect(inGoalArea(6.1, 0)).toBe(false);
    expect(inGoalArea(3, 6.5)).toBe(true); // 5.8 m from the post
    expect(inGoalArea(1, 8.5)).toBe(false); // wing corner
    expect(inGoalArea(9, -4)).toBe(false);
  });

  it("pushes points out to just past the line and leaves others alone", () => {
    expect(outOfGoalArea([5, 0.5])).toEqual([6.2, 0.5]);
    const [x, y] = outOfGoalArea([3, -6.5]);
    expect(inGoalArea(x, y)).toBe(false);
    expect(y).toBeLessThan(0);
    expect(outOfGoalArea([10, 3])).toEqual([10, 3]);
  });

  it("moves court players but not the keeper", () => {
    const plan = DrillPlan.parse(structuredClone(sample));
    const s = plan.drills[0].scene;
    const keeper = s.actors.find((a) => a.team === "keeper")!;
    const court = s.actors.find((a) => a.team === "attack")!;
    court.x = 4;
    court.y = 0;
    s.beats[0].push({ type: "run", actor: court.id, to: [2, 3] });
    fixGoalArea(plan);
    expect([court.x, court.y]).toEqual([6.2, 0]);
    expect(inGoalArea(...(s.beats[0].at(-1) as { to: [number, number] }).to)).toBe(false);
    expect([keeper.x, keeper.y]).toEqual([0.5, 0]);
  });
});
