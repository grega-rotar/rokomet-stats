// Turns a Scene (actors + beats of simultaneous moves) into positions at any time. Pure, so the 3D court, the SVG
// board and the tests all agree. Time t is measured in beats: t = 1.5 is halfway through the second beat.

import type { Move, Scene } from "@/lib/drills/plan";
import { GOAL, clamp, easeInOut, lerp, zonePoint, type Pt } from "./geometry";

export type ActorFrame = { x: number; y: number; lift: number };
export type BallFrame = { x: number; y: number; h: number; holder: string | null };
export type Frame = { actors: Record<string, ActorFrame>; ball: BallFrame; beat: number };
export type PathKind = "run" | "dribble" | "pass" | "shot";
export type Path = { kind: PathKind; beat: number; from: Pt; to: Pt };

type BeatStart = { pos: Record<string, Pt>; holder: string | null; rest: { x: number; y: number; h: number } };

export const HAND_H = 1.15;
const KEEPER_HAND_H = 1.3;
const BALL_R = 0.12; // a bit larger than a real ball (0.095) so it reads on a phone
const IN_NET_X = -0.55;
export const RELEASE = [0.35, 0.8] as const; // part of a shot beat when the ball is in the air

/** Where the ball sits in a player's hand: a little to the right of the body. */
export function handOf(p: Pt, lift = 0, keeper = false): { x: number; y: number; h: number } {
  return { x: p[0] - 0.1, y: p[1] + 0.32, h: (keeper ? KEEPER_HAND_H : HAND_H) + lift };
}

/** The keeper's spot after a save: across towards the ball, staying on the line. */
function savePoint(keeper: Pt, zoneY: number): Pt {
  return [Math.min(keeper[0], 0.6), clamp(zoneY, -GOAL.halfWidth + 0.35, GOAL.halfWidth - 0.35)];
}

function shotIn(beat: Move[]) {
  return beat.find((m): m is Extract<Move, { type: "shot" }> => m.type === "shot");
}

/** Where each actor stands and who has the ball at the start of every beat, plus the state after the last one. */
export function beatStarts(scene: Scene): BeatStart[] {
  const pos: Record<string, Pt> = Object.fromEntries(scene.actors.map((a) => [a.id, [a.x, a.y] as Pt]));
  let holder: string | null = scene.ball;
  let rest = { x: 0, y: 0, h: BALL_R };
  const out: BeatStart[] = [{ pos: { ...pos }, holder, rest }];
  for (const beat of scene.beats) {
    const shot = shotIn(beat);
    for (const m of beat) {
      if (m.type === "run" || m.type === "dribble") pos[m.actor] = m.to;
      if (m.type === "save" && shot) pos[m.actor] = savePoint(pos[m.actor], zonePoint(shot.zone).y);
    }
    for (const m of beat) {
      if (m.type === "pass") holder = m.target;
      if (m.type === "shot") {
        holder = null;
        const z = zonePoint(m.zone);
        const saver = beat.find((s) => s.type === "save");
        rest = saver ? { x: 0.9, y: pos[saver.actor][1], h: BALL_R } : { x: IN_NET_X, y: z.y, h: BALL_R };
      }
    }
    out.push({ pos: { ...pos }, holder, rest });
  }
  return out;
}

const isKeeper = (scene: Scene, id: string) => scene.actors.find((a) => a.id === id)?.team === "keeper";

/** Everything at time t (beats). t past the last beat holds the final state. */
export function frameAt(scene: Scene, t: number, starts = beatStarts(scene)): Frame {
  const n = scene.beats.length;
  if (t >= n) return still(scene, starts[n], n);
  const b = Math.max(0, Math.floor(t));
  const raw = clamp(t - b);
  const p = easeInOut(raw);
  const s = starts[b];
  const e = starts[b + 1];
  const beat = scene.beats[b];
  const shot = shotIn(beat);
  const save = beat.find((m) => m.type === "save");

  const actors: Record<string, ActorFrame> = {};
  for (const a of scene.actors) {
    const [x0, y0] = s.pos[a.id];
    const [x1, y1] = e.pos[a.id];
    // the keeper reacts only once the ball is in the air
    const k = save?.actor === a.id && shot ? easeInOut(clamp((raw - RELEASE[0]) / (RELEASE[1] - RELEASE[0]))) : p;
    let lift = 0;
    if (shot?.actor === a.id && shot.jump) lift = 0.55 * Math.sin(Math.PI * clamp(raw / 0.75));
    if (save?.actor === a.id && shot) lift = 0.25 * Math.sin(Math.PI * k) * (zonePoint(shot.zone).h > 1 ? 1 : 0.3);
    actors[a.id] = { x: lerp(x0, x1, k), y: lerp(y0, y1, k), lift };
  }
  const at = (id: string): Pt => [actors[id].x, actors[id].y];
  const hand = (id: string) => handOf(at(id), actors[id].lift, isKeeper(scene, id));

  let ball: BallFrame;
  const pass = beat.find((m): m is Extract<Move, { type: "pass" }> => m.type === "pass");
  if (shot) {
    const f = hand(shot.actor);
    const z = zonePoint(shot.zone);
    const end = save ? { x: 0.75, y: e.pos[save.actor][1], h: z.h } : { x: -0.25, y: z.y, h: z.h };
    const q = clamp((raw - RELEASE[0]) / (RELEASE[1] - RELEASE[0]));
    if (raw < RELEASE[0]) ball = { ...f, holder: shot.actor };
    else if (raw <= RELEASE[1]) ball = { x: lerp(f.x, end.x, q), y: lerp(f.y, end.y, q), h: lerp(f.h, end.h, q) + 0.25 * Math.sin(Math.PI * q), holder: null };
    else {
      // after the goal or the save, the ball drops to the floor
      const d = clamp((raw - RELEASE[1]) / (1 - RELEASE[1]));
      const fx = save ? lerp(end.x, e.rest.x, d) : lerp(end.x, IN_NET_X, d);
      ball = { x: fx, y: end.y, h: lerp(end.h, BALL_R, d * d), holder: null };
    }
  } else if (pass) {
    const f = hand(pass.actor);
    const to = hand(pass.target);
    const dist = Math.hypot(to.x - f.x, to.y - f.y);
    ball = { x: lerp(f.x, to.x, p), y: lerp(f.y, to.y, p), h: lerp(f.h, to.h, p) + Math.sin(Math.PI * p) * Math.min(1.2, 0.08 * dist), holder: null };
  } else if (s.holder) {
    const f = hand(s.holder);
    const dribbling = beat.some((m) => m.type === "dribble" && m.actor === s.holder);
    const h = dribbling ? BALL_R + (f.h - 0.25 - BALL_R) * Math.abs(Math.cos(Math.PI * 3 * raw)) : f.h;
    ball = { ...f, h, holder: s.holder };
  } else {
    ball = { ...s.rest, holder: null };
  }
  return { actors, ball, beat: b };
}

function still(scene: Scene, s: BeatStart, beat: number): Frame {
  const actors = Object.fromEntries(scene.actors.map((a) => [a.id, { x: s.pos[a.id][0], y: s.pos[a.id][1], lift: 0 }]));
  const ball = s.holder ? { ...handOf(s.pos[s.holder], 0, isKeeper(scene, s.holder)), holder: s.holder } : { ...s.rest, holder: null };
  return { actors, ball, beat };
}

/** The coach's-board arrows: runs and dribbles (solid), passes (dashed), shots (arrow into the goal). */
export function pathsFor(scene: Scene, starts = beatStarts(scene)): Path[] {
  const out: Path[] = [];
  scene.beats.forEach((beat, b) => {
    const s = starts[b].pos;
    const e = starts[b + 1].pos;
    for (const m of beat) {
      if (m.type === "run" || m.type === "dribble") {
        if (Math.hypot(m.to[0] - s[m.actor][0], m.to[1] - s[m.actor][1]) > 0.05) out.push({ kind: m.type, beat: b, from: s[m.actor], to: m.to });
      } else if (m.type === "pass") out.push({ kind: "pass", beat: b, from: s[m.actor], to: e[m.target] });
      else if (m.type === "shot") out.push({ kind: "shot", beat: b, from: s[m.actor], to: [0, zonePoint(m.zone).y] });
    }
  });
  return out;
}

/** Short plain-language summary of the scene for screen readers. */
export function describeScene(scene: Scene): string {
  const count = (t: string) => scene.actors.filter((a) => a.team === t).length;
  const parts = [count("attack") && `${count("attack")} attacking`, count("defence") && `${count("defence")} defending`, count("keeper") && "a keeper"].filter(Boolean);
  const moves = scene.beats.flat();
  const kinds = (["pass", "run", "dribble", "shot"] as const).map((k) => [k, moves.filter((m) => m.type === k).length] as const).filter(([, c]) => c);
  return `Half court with ${parts.join(", ")}; ${scene.beats.length} steps: ${kinds.map(([k, c]) => `${c} ${k}${c > 1 ? (k === "pass" ? "es" : "s") : ""}`).join(", ")}.`;
}

const ZONE_NAMES: Record<string, string> = { t: "top", m: "middle", b: "bottom", l: "left", c: "centre", r: "right" };
const zoneName = (z: string) => (z === "mc" ? "centre" : `${ZONE_NAMES[z[0]]} ${ZONE_NAMES[z[1]]}`);

/** One beat in a few words, e.g. "CB → RW pass · RW runs". */
export function describeBeat(scene: Scene, beat: number): string {
  const name = (id: string) => {
    const a = scene.actors.find((x) => x.id === id);
    return a?.label ?? (a?.team === "keeper" ? "GK" : id.toUpperCase());
  };
  return (scene.beats[beat] ?? [])
    .map((m) => {
      if (m.type === "pass") return `${name(m.actor)} → ${name(m.target)} pass`;
      if (m.type === "run") return `${name(m.actor)} runs`;
      if (m.type === "dribble") return `${name(m.actor)} dribbles`;
      if (m.type === "shot") return `${name(m.actor)} ${m.jump ? "jump shot" : "shoots"} ${zoneName(m.zone)}`;
      return `${name(m.actor)} saves`;
    })
    .join(" · ");
}

/** 0..1: how hard the net is bulging at time t (a goal just went in). */
export function netHitAt(scene: Scene, t: number): number {
  const b = Math.floor(t);
  const beat = scene.beats[b];
  if (!beat || !beat.some((m) => m.type === "shot") || beat.some((m) => m.type === "save")) return 0;
  const raw = t - b;
  if (raw < RELEASE[1] - 0.04) return 0;
  return Math.sin(Math.PI * clamp((raw - (RELEASE[1] - 0.04)) / 0.3));
}

const ROLES: Record<string, string> = {
  LW: "Left wing", RW: "Right wing", LB: "Left back", RB: "Right back", CB: "Centre back",
  PV: "Pivot", P: "Pivot", GK: "Goalkeeper", C: "Coach",
};
/** "Right wing" from a label like "RW", else the team. */
export function roleOf(a: { label?: string; team: string }): string {
  const team = { attack: "Attack", defence: "Defender", keeper: "Goalkeeper", coach: "Coach" }[a.team] ?? a.team;
  return (a.label && ROLES[a.label.toUpperCase()]) || team;
}
