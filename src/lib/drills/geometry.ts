import type { DrillPlan } from "./plan";

// Claude sometimes puts a court player a few centimetres inside the 6m area. Rather than fail the whole plan,
// push those points out to just past the line before storing.

const POST = 1.5;
const LINE = 6;
const OUT = 6.2;

/** True when (x, y) is inside the 6m goal area: within 6 m of the nearer post, or x < 6 between the posts. */
export function inGoalArea(x: number, y: number): boolean {
  const off = Math.abs(y) - POST;
  return off <= 0 ? x < LINE : Math.hypot(x, off) < LINE;
}

export function outOfGoalArea([x, y]: [number, number]): [number, number] {
  if (!inGoalArea(x, y)) return [x, y];
  const off = Math.abs(y) - POST;
  if (off <= 0) return [OUT, y];
  const d = Math.hypot(x, off) || 1;
  const r = (n: number) => Math.round(n * 10) / 10;
  return [r((x / d) * OUT), r(Math.sign(y) * (POST + (off / d) * OUT))];
}

/** Moves court players (attack, defence) and their runs out of the 6m area. Keepers and coaches are left alone. */
export function fixGoalArea(plan: DrillPlan): DrillPlan {
  for (const d of plan.drills) {
    const court = new Set(d.scene.actors.filter((a) => a.team === "attack" || a.team === "defence").map((a) => a.id));
    for (const a of d.scene.actors) if (court.has(a.id)) [a.x, a.y] = outOfGoalArea([a.x, a.y]);
    for (const m of d.scene.beats.flat()) if ((m.type === "run" || m.type === "dribble") && court.has(m.actor)) m.to = outOfGoalArea(m.to);
  }
  return plan;
}
