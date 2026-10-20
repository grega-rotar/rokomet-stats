import { describe, expect, it } from "vitest";
import { parsePlan, type DrillPlan } from "./plan";
import sample from "./fixtures/sample-plan.json";

const valid = () => structuredClone(sample) as DrillPlan;
const parse = (p: unknown) => parsePlan(JSON.stringify(p));

describe("parsePlan", () => {
  it("accepts a valid plan", () => {
    const r = parse(valid());
    expect(r.ok).toBe(true);
  });

  it("finds the JSON inside prose and a code fence", () => {
    const r = parsePlan(`Here is the plan:\n\`\`\`json\n${JSON.stringify(valid())}\n\`\`\`\nGood luck!`);
    expect(r.ok).toBe(true);
  });

  it("fills in default cones", () => {
    const p = valid() as unknown as { drills: { scene: { cones?: unknown } }[] };
    delete p.drills[0].scene.cones;
    const r = parse(p);
    expect(r.ok && r.plan.drills[0].scene.cones).toEqual([]);
  });

  it("rejects a move by an unknown actor", () => {
    const p = valid();
    p.drills[0].scene.beats[0].push({ type: "run", actor: "ghost", to: [8, 0] });
    const r = parse(p);
    expect(r.ok ? "" : r.error).toMatch(/unknown actor ghost/);
  });

  it("rejects a malformed actor id", () => {
    const p = valid();
    p.drills[0].scene.actors[0].id = "Left Back";
    expect(parse(p).ok).toBe(false);
  });

  it("rejects a pass to an unknown actor and a ball holder that isn't there", () => {
    const p = valid();
    const s = p.drills[1].scene;
    s.ball = "zz";
    s.beats[0].push({ type: "pass", actor: s.actors[0].id, target: "yy" });
    const r = parse(p);
    expect(r.ok ? "" : r.error).toMatch(/ball holder zz.*pass to unknown actor yy/);
  });

  it("rejects coordinates off the half court", () => {
    for (const [x, y] of [[21, 0], [-1, 0], [5, 11], [5, -10.5]]) {
      const p = valid();
      p.drills[0].scene.actors[0].x = x;
      p.drills[0].scene.actors[0].y = y;
      expect(parse(p).ok).toBe(false);
    }
  });

  it("rejects a week day pointing at an unknown drill", () => {
    const p = valid();
    p.week[0].drills.push("nope");
    const r = parse(p);
    expect(r.ok ? "" : r.error).toMatch(/unknown drill nope/);
  });

  it("rejects text that is not JSON", () => {
    expect(parsePlan("Sorry, I can't.").ok).toBe(false);
    expect(parsePlan("{ headline: oops }").ok).toBe(false);
  });
});
