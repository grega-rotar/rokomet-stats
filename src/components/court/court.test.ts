import { describe, expect, it } from "vitest";
import type { Scene } from "@/lib/drills/plan";
import { arcLine, courtSegments, fitDistance, fitView, toSvg, toWorld, zonePoint } from "./geometry";
import { beatStarts, describeBeat, frameAt, handOf, netHitAt, pathsFor, roleOf } from "./timeline";

const dist = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("coordinates", () => {
  it("maps court x/y to world X = y, Z = x", () => {
    expect(toWorld(7, -3, 1)).toEqual([-3, 1, 7]);
  });
  it("puts the attacker's left on the left of the top view", () => {
    expect(toSvg(0, -10)).toEqual([0, 0]);
    expect(toSvg(20, 10)).toEqual([20, 20]);
  });
});

describe("goal zones (shooter's view)", () => {
  it("tl is the shooter's top left: -y, top third", () => {
    const p = zonePoint("tl");
    expect(p.y).toBe(-1);
    expect(p.h).toBeCloseTo(5 / 3);
  });
  it("br is bottom right: +y, bottom third", () => {
    const p = zonePoint("br");
    expect(p.y).toBe(1);
    expect(p.h).toBeCloseTo(1 / 3);
  });
  it("mc is the middle of the goal", () => {
    expect(zonePoint("mc")).toEqual({ y: 0, h: 1 });
  });
  it("every zone is inside the 3 x 2 m goal", () => {
    for (const z of ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"] as const) {
      const p = zonePoint(z);
      expect(Math.abs(p.y)).toBeLessThan(1.5);
      expect(p.h).toBeGreaterThan(0);
      expect(p.h).toBeLessThan(2);
    }
  });
});

describe("6m and 9m lines", () => {
  it("6m line: quarter circles round the posts joined at x = 6, reaching the goal line at y = ±7.5", () => {
    const pts = arcLine(6);
    expect(pts[0]).toEqual([0, -7.5]);
    expect(pts.at(-1)).toEqual([0, 7.5]);
    expect(pts).toContainEqual([6, -1.5]);
    expect(pts).toContainEqual([6, 1.5]);
    for (const p of pts) {
      const post: [number, number] = [0, p[1] < 0 ? -1.5 : 1.5];
      if (Math.abs(p[1]) >= 1.5) expect(dist(p, post)).toBeCloseTo(6, 6);
      else expect(p[0]).toBe(6);
    }
  });
  it("9m line is clipped to the touchlines", () => {
    const pts = arcLine(9);
    expect(pts[0][1]).toBe(-10);
    expect(pts[0][0]).toBeCloseTo(Math.sqrt(81 - 8.5 ** 2), 6); // ~2.958 m out from the goal line
    expect(pts.at(-1)![1]).toBe(10);
    for (const p of pts) expect(Math.abs(p[1])).toBeLessThanOrEqual(10);
    expect(pts).toContainEqual([9, 1.5]);
  });
  it("7m and 4m marks", () => {
    const s = courtSegments();
    expect(s.seven).toEqual([[7, -0.5], [7, 0.5]]);
    expect(dist(s.four[0], s.four[1])).toBeCloseTo(0.15);
  });
});

const scene: Scene = {
  actors: [
    { id: "lb", team: "attack", x: 11, y: -4, focus: true },
    { id: "cb", team: "attack", x: 11, y: 0 },
    { id: "gk", team: "keeper", x: 0.5, y: 0 },
  ],
  cones: [],
  ball: "cb",
  beats: [
    [{ type: "pass", actor: "cb", target: "lb" }, { type: "run", actor: "lb", to: [10, -3.5] }],
    [{ type: "dribble", actor: "lb", to: [9, -3] }],
    [{ type: "shot", actor: "lb", zone: "tr", jump: true }],
  ],
};

describe("timeline", () => {
  it("passes change the holder, shots free the ball", () => {
    const s = beatStarts(scene);
    expect(s.map((b) => b.holder)).toEqual(["cb", "lb", "lb", null]);
    expect(s[3].pos.lb).toEqual([9, -3]);
  });
  it("runs ease from start to end", () => {
    expect(frameAt(scene, 0).actors.lb).toMatchObject({ x: 11, y: -4 });
    expect(frameAt(scene, 0.5).actors.lb.x).toBeCloseTo(10.5);
    expect(frameAt(scene, 0.999).actors.lb.x).toBeCloseTo(10, 1);
  });
  it("the ball is in the passer's hand at the start of a pass and lands in the net after the shot", () => {
    const start = frameAt(scene, 0);
    expect(start.ball.x).toBeCloseTo(handOf([11, 0]).x);
    expect(start.ball.y).toBeCloseTo(handOf([11, 0]).y);
    const end = frameAt(scene, 3).ball;
    expect(end.holder).toBeNull();
    expect(end.x).toBeLessThan(0);
    expect(end.y).toBe(1);
  });
  it("a jump shot lifts the shooter", () => {
    expect(frameAt(scene, 2.35).actors.lb.lift).toBeGreaterThan(0.3);
  });
  it("draws a solid run, a dashed pass and a shot arrow into the right zone", () => {
    const paths = pathsFor(scene);
    expect(paths.map((p) => p.kind)).toEqual(["pass", "run", "dribble", "shot"]);
    expect(paths[0].to).toEqual([10, -3.5]); // pass goes to where the receiver catches it
    expect(paths[3].to).toEqual([0, 1]);
  });
});

describe("beat captions", () => {
  it("says who passes to whom and where the shot goes", () => {
    const s: Scene = { ...scene, actors: scene.actors.map((a) => ({ ...a, label: a.id.toUpperCase() })) };
    expect(describeBeat(s, 0)).toBe("CB → LB pass · LB runs");
    expect(describeBeat(s, 2)).toBe("LB jump shot top right");
  });
  it("bulges the net only after a goal", () => {
    expect(netHitAt(scene, 2.5)).toBe(0);
    expect(netHitAt(scene, 2.95)).toBeGreaterThan(0.5);
    expect(roleOf({ label: "rw", team: "attack" })).toBe("Right wing");
    expect(roleOf({ team: "defence" })).toBe("Defender");
  });
});

describe("camera fit", () => {
  const pts = [[-1.5, 0, 0], [1.5, 2, 0], [-6, 0, 12], [6, 2.3, 12]] as const;
  it("needs more distance on a narrow (phone) view than a wide one", () => {
    const wide = fitDistance(pts, [0, 0, 6], [0.2, 0.7, 0.7], 38, 16 / 10);
    const narrow = fitDistance(pts, [0, 0, 6], [0.2, 0.7, 0.7], 38, 6 / 5);
    expect(narrow).toBeGreaterThan(wide);
  });
  it("is the tightest distance that still fits", () => {
    const d = fitDistance(pts, [0, 0, 6], [0, 1, 1], 38, 1);
    expect(fitDistance(pts, [0, 0, 6], [0, 1, 1], 38, 1, 0.88)).toBeCloseTo(d, 3);
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(60);
  });
});

describe("view fit", () => {
  it("centres the points and gets no farther than the plain fit", () => {
    const pts = [[-1.5, 0, 0], [1.5, 2, 0], [-6, 0, 12], [6, 2.3, 12]] as const;
    const plain = fitDistance(pts, [0, 1, 6], [0.2, 0.7, 0.7], 38, 1.6);
    const v = fitView(pts, [0, 1, 6], [0.2, 0.7, 0.7], 38, 1.6);
    expect(v.distance).toBeLessThanOrEqual(plain + 1e-6);
  });
});
