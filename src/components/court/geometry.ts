// Court geometry shared by the 3D court and the 2D (SVG) fallback. Pure functions, no three.js here.
//
// Court coordinates (src/lib/drills/plan.ts): metres on the attacked half, seen from above.
//   x = distance from the goal line (0 = goal line, 20 = centre line)
//   y = across the court, -10 = left touchline from the attacker's view, +10 = right; posts at y = ±1.5
//
// World (three.js, Y up): X = y, Z = x, so the goal sits at Z = 0 and the attack comes from +Z.
// A camera behind the attack looking at the goal sees -y on the left, like the attacker does.
// SVG (top view, coach's board): goal at the top, svgX = y + 10, svgY = x + GOAL_DEPTH.

import type { GOAL_ZONES } from "@/lib/drills/plan";

export type Zone = (typeof GOAL_ZONES)[number];
export type Pt = readonly [x: number, y: number];

export const COURT = { length: 20, width: 20, half: 10 } as const;
export const GOAL = { halfWidth: 1.5, height: 2, depth: 1 } as const;
export const POSTS: readonly Pt[] = [
  [0, -GOAL.halfWidth],
  [0, GOAL.halfWidth],
];

/** World position [X, Y, Z] of a court point at height h. */
export function toWorld(x: number, y: number, h = 0): [number, number, number] {
  return [y, h, x];
}

/** SVG viewBox for the top view: 20 wide, the half court plus room for the goal behind the line. */
export const SVG_PAD = 1.4;
export const SVG_VIEW = { x: -SVG_PAD, y: -SVG_PAD, w: COURT.width + 2 * SVG_PAD, h: COURT.length + 2 * SVG_PAD } as const;
export function toSvg(x: number, y: number): [number, number] {
  return [y + COURT.half, x];
}

/**
 * Centre of a goal zone, shooter's view: "tl" = the shooter's top left. The shooter faces the goal (-x), so their
 * left is -y. Rows split the 2 m height in thirds, columns the 3 m width in thirds.
 */
export function zonePoint(zone: Zone): { y: number; h: number } {
  const col = { l: -1, c: 0, r: 1 }[zone[1] as "l" | "c" | "r"];
  const row = { t: 2, m: 1, b: 0 }[zone[0] as "t" | "m" | "b"];
  const cell = (2 * GOAL.halfWidth) / 3;
  return { y: col * cell, h: (row + 0.5) * (GOAL.height / 3) };
}

/**
 * The goal-area line (radius 6) or the free-throw line (radius 9): quarter circles of that radius around each post,
 * joined by a straight line at x = radius between the posts, clipped to the touchlines. Ordered from -y to +y.
 */
export function arcLine(radius: number, segments = 24): Pt[] {
  const reach = COURT.half - GOAL.halfWidth; // how far past a post the court goes
  const max = Math.asin(Math.min(1, reach / radius)); // angle from +x where the arc meets the touchline
  const out: Pt[] = [];
  // left post: from the touchline side (angle max) round to straight ahead (angle 0)
  for (let i = 0; i <= segments; i++) {
    const a = max * (1 - i / segments);
    out.push([radius * Math.cos(a), -GOAL.halfWidth - radius * Math.sin(a)]);
  }
  for (let i = 0; i <= segments; i++) {
    const a = max * (i / segments);
    out.push([radius * Math.cos(a), GOAL.halfWidth + radius * Math.sin(a)]);
  }
  return out.map(([x, y]) => [clean(x), clean(y)] as const);
}

/** The other court markings as straight segments [from, to]. */
export function courtSegments(): { goalLine: [Pt, Pt]; centre: [Pt, Pt]; sidelines: [Pt, Pt][]; seven: [Pt, Pt]; four: [Pt, Pt] } {
  return {
    goalLine: [[0, -COURT.half], [0, COURT.half]],
    centre: [[COURT.length, -COURT.half], [COURT.length, COURT.half]],
    sidelines: [
      [[0, -COURT.half], [COURT.length, -COURT.half]],
      [[0, COURT.half], [COURT.length, COURT.half]],
    ],
    seven: [[7, -0.5], [7, 0.5]], // 1 m line
    four: [[4, -0.075], [4, 0.075]], // keeper's restraining line, 15 cm
  };
}

const clean = (n: number) => Math.round(n * 1e6) / 1e6 + 0;

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): [number, number, number] => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Smallest camera distance (along `dir` from `target`) at which every world point is inside a perspective view of
 * vertical field of view `fovDeg` and the given aspect ratio, with `margin` (0.9 = 10% padding) on each side.
 */
export function fitDistance(points: readonly V3[], target: V3, dir: V3, fovDeg: number, aspect: number, margin = 0.88): number {
  const d = norm(dir);
  const f: V3 = [-d[0], -d[1], -d[2]];
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const tanV = Math.tan(((fovDeg / 2) * Math.PI) / 180) * margin;
  const tanH = tanV * aspect;
  const fits = (dist: number) => {
    const cam: V3 = [target[0] + d[0] * dist, target[1] + d[1] * dist, target[2] + d[2] * dist];
    return points.every((p) => {
      const v = sub(p, cam);
      const z = dot(v, f);
      return z > 0.1 && Math.abs(dot(v, r)) <= z * tanH && Math.abs(dot(v, u)) <= z * tanV;
    });
  };
  let lo = 2;
  let hi = 200;
  if (!fits(hi)) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Like fitDistance, but also slides the target so the points sit in the middle of the frame (perspective makes the
 * near side look bigger, so the box centre isn't the frame centre). Returns the new target and distance.
 */
export function fitView(points: readonly V3[], target: V3, dir: V3, fovDeg: number, aspect: number, margin = 0.88): { target: V3; distance: number } {
  const d = norm(dir);
  const f: V3 = [-d[0], -d[1], -d[2]];
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const tanV = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const tanH = tanV * aspect;
  let t: V3 = target;
  let dist = fitDistance(points, t, d, fovDeg, aspect, margin);
  for (let i = 0; i < 4; i++) {
    const cam: V3 = [t[0] + d[0] * dist, t[1] + d[1] * dist, t[2] + d[2] * dist];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      const v = sub(p, cam);
      const z = dot(v, f);
      const x = dot(v, r) / (z * tanH);
      const y = dot(v, u) / (z * tanV);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const cx = ((minX + maxX) / 2) * dist * tanH;
    const cy = ((minY + maxY) / 2) * dist * tanV;
    t = [t[0] + r[0] * cx + u[0] * cy, t[1] + r[1] * cx + u[1] * cy, t[2] + r[2] * cx + u[2] * cy];
    dist = fitDistance(points, t, d, fovDeg, aspect, margin);
  }
  return { target: t, distance: dist };
}
