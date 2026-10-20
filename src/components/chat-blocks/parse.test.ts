import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fenceClosed, goalData, parseCourt, parseGoal } from "./parse";

const scene = () => ({
  actors: [
    { id: "cb", team: "attack", label: "CB", x: 10, y: 0, focus: true },
    { id: "p", team: "attack", label: "P", x: 6.5, y: 1 },
    { id: "gk", team: "keeper", x: 0.5, y: 0 },
  ],
  ball: "cb",
  beats: [[{ type: "run", actor: "cb", to: [8.5, -1] }], [{ type: "pass", actor: "cb", target: "p" }], [{ type: "shot", actor: "p", zone: "bl" }]],
});
const court = (v: unknown) => parseCourt(JSON.stringify(v));

describe("parseCourt", () => {
  it("accepts a titled scene and fills default cones", () => {
    const r = court({ title: "Pivot block", scene: scene() });
    expect(r.ok && r.value.title).toBe("Pivot block");
    expect(r.ok && r.value.scene.cones).toEqual([]);
  });

  it("accepts a bare scene", () => {
    expect(court(scene()).ok).toBe(true);
  });

  it("rejects a pass to an unknown actor", () => {
    const s = scene();
    s.beats[1] = [{ type: "pass", actor: "cb", target: "lw" }];
    const r = court({ scene: s });
    expect(r.ok ? "" : r.error).toMatch(/pass to unknown actor lw/);
  });

  it("rejects a ball holder that isn't on court", () => {
    const r = court({ scene: { ...scene(), ball: "x" } });
    expect(r.ok ? "" : r.error).toMatch(/ball holder x/);
  });

  it("rejects off-court coordinates and bad ids", () => {
    const s = scene();
    s.actors[0] = { ...s.actors[0], x: 25 };
    expect(court({ scene: s }).ok).toBe(false);
    const t = scene();
    t.actors[1] = { ...t.actors[1], id: "Pivot" };
    expect(court({ scene: t }).ok).toBe(false);
  });

  it("rejects a half-streamed block", () => {
    const text = JSON.stringify({ scene: scene() });
    const r = parseCourt(text.slice(0, text.length / 2));
    expect(r.ok ? "" : r.error).toMatch(/invalid JSON/);
  });
});

const zones = {
  top_left: [5, 8], top_center: [1, 3], top_right: [4, 6],
  mid_left: [2, 4], mid_center: [0, 2], mid_right: [3, 5],
  bottom_left: [9, 12], bottom_center: [2, 5], bottom_right: [7, 10],
};

describe("parseGoal", () => {
  it("accepts zones, misses and mode", () => {
    const r = parseGoal(JSON.stringify({ title: "RIKO in attack", zones, miss: { over: 12, left: 7 }, mode: "conceded" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = goalData(r.value);
    expect(d.mode).toBe("conceded");
    expect(d.zones[0]).toEqual({ zone: "top_left", goals: 5, shots: 8 });
    expect(d.miss).toEqual({ over: 12, left: 7, right: 0 });
  });

  it("defaults to scored", () => {
    const r = parseGoal(JSON.stringify({ zones }));
    expect(r.ok && r.value.mode).toBe("scored");
  });

  it("rejects a missing or misspelt zone", () => {
    const { top_left, ...rest } = zones;
    expect(parseGoal(JSON.stringify({ zones: rest })).ok).toBe(false);
    expect(parseGoal(JSON.stringify({ zones: { ...rest, top_lefft: top_left } })).ok).toBe(false);
  });

  it("rejects more goals than shots and negative counts", () => {
    expect(parseGoal(JSON.stringify({ zones: { ...zones, mid_center: [3, 2] } })).ok).toBe(false);
    expect(parseGoal(JSON.stringify({ zones: { ...zones, mid_center: [-1, 2] } })).ok).toBe(false);
  });

  it("rejects text that isn't JSON", () => {
    expect(parseGoal("top left 5/8").ok).toBe(false);
  });
});

describe("examples in scripts/chat-CLAUDE.md", () => {
  const md = readFileSync(new URL("../../../scripts/chat-CLAUDE.md", import.meta.url), "utf8");
  it.each(["court", "goal"] as const)("the %s example is valid", (lang) => {
    const body = md.match(new RegExp("^```" + lang + "\\n([\\s\\S]*?)\\n```$", "m"))?.[1] ?? "";
    expect((lang === "court" ? parseCourt(body) : parseGoal(body)).ok).toBe(true);
  });
});

describe("fenceClosed", () => {
  const src = "Look:\n\n```court\n{\"a\": 1}\n```\n\nDone.";
  const start = src.indexOf("```");
  it("sees a closed fence", () => {
    expect(fenceClosed(src, start, src.indexOf("\n\nDone"))).toBe(true);
  });
  it("sees a fence still streaming", () => {
    const partial = "Look:\n\n```court\n{\"a\": 1}\n``";
    expect(fenceClosed(partial, start, partial.length)).toBe(false);
    expect(fenceClosed("```court", 0, 8)).toBe(false);
  });
});
