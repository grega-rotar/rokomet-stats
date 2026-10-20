import { z } from "zod";

// The drill plan Claude returns as JSON, validated before it is stored or drawn. Short fields on purpose:
// the UI shows numbers and an animated court, not paragraphs. Spec: specs/drills.md.
//
// Court coordinates are metres on the half court being attacked, seen from above:
//   x = distance from the goal line (0 = goal line, 20 = centre line)
//   y = across the court (-10 = left touchline from the attacker's view, +10 = right), goal posts at y = ±1.5
// Landmarks: 6m line ~x 6, 7m mark x 7 y 0, 9m line ~x 9, wings are |y| > 7 near x 0–4.

const X = z.number().min(0).max(20);
const Y = z.number().min(-10).max(10);
const short = (max: number) => z.string().trim().min(1).max(max);
const id = z.string().regex(/^[a-z0-9]{1,8}$/);

export const METRICS = ["field", "sevens", "gpm", "two", "general"] as const;
export const GOAL_ZONES = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"] as const; // shooter's view

export const Actor = z.object({
  id,
  team: z.enum(["attack", "defence", "keeper", "coach"]),
  label: short(3).optional(), // e.g. "LB", "CB", "1"
  x: X,
  y: Y,
  focus: z.boolean().optional(), // the player the plan is for
});

export const Move = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["run", "dribble"]), actor: id, to: z.tuple([X, Y]) }),
  z.object({ type: z.literal("pass"), actor: id, target: id }),
  z.object({ type: z.literal("shot"), actor: id, zone: z.enum(GOAL_ZONES), jump: z.boolean().optional() }),
  z.object({ type: z.literal("save"), actor: id }),
]);

export const Scene = z.object({
  actors: z.array(Actor).min(1).max(12),
  cones: z.array(z.tuple([X, Y])).max(10).default([]),
  ball: id, // who holds the ball at the start
  beats: z.array(z.array(Move).min(1).max(6)).min(1).max(8), // moves in one beat play at the same time
});

export const Drill = z.object({
  id,
  title: short(48),
  metric: z.enum(METRICS),
  minutes: z.number().int().min(5).max(45),
  reps: short(32), // "4 × 8 shots"
  players: z.number().int().min(1).max(14),
  equipment: z.array(short(24)).max(4),
  steps: z.array(short(110)).min(2).max(4),
  cues: z.array(short(44)).max(3),
  measure: short(110), // how progress shows up in the numbers
  scene: Scene,
});

export const Focus = z.object({
  metric: z.enum(METRICS),
  label: short(40),
  now: short(24), // "7/18 · 39%"
  target: short(24), // "≥ 50% in 4 weeks"
});

export const DrillPlan = z.object({
  headline: short(140),
  smallSample: z.boolean(),
  focus: z.array(Focus).min(1).max(3),
  drills: z.array(Drill).min(2).max(4),
  week: z.array(z.object({ day: z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]), drills: z.array(id).min(1).max(4) })).min(1).max(5),
});

export type Actor = z.infer<typeof Actor>;
export type Move = z.infer<typeof Move>;
export type Scene = z.infer<typeof Scene>;
export type Drill = z.infer<typeof Drill>;
export type DrillPlan = z.infer<typeof DrillPlan>;

/** Checks what zod can't: ids in moves, passes and the week point at things that exist. Returns the problems found. */
export function planProblems(plan: DrillPlan): string[] {
  const out: string[] = [];
  const drillIds = new Set(plan.drills.map((d) => d.id));
  for (const d of plan.drills) {
    const actors = new Set(d.scene.actors.map((a) => a.id));
    if (actors.size !== d.scene.actors.length) out.push(`drill ${d.id}: duplicate actor ids`);
    if (!actors.has(d.scene.ball)) out.push(`drill ${d.id}: ball holder ${d.scene.ball} is not an actor`);
    for (const m of d.scene.beats.flat()) {
      if (!actors.has(m.actor)) out.push(`drill ${d.id}: move by unknown actor ${m.actor}`);
      if (m.type === "pass" && !actors.has(m.target)) out.push(`drill ${d.id}: pass to unknown actor ${m.target}`);
    }
  }
  for (const w of plan.week) for (const d of w.drills) if (!drillIds.has(d)) out.push(`week ${w.day}: unknown drill ${d}`);
  return out;
}

/** Parses Claude's reply: the first JSON object in it, validated. */
export function parsePlan(text: string): { ok: true; plan: DrillPlan } | { ok: false; error: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: "no JSON object in the reply" };
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${(e as Error).message}` };
  }
  const parsed = DrillPlan.safeParse(raw);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const problems = planProblems(parsed.data);
  return problems.length ? { ok: false, error: problems.join("; ") } : { ok: true, plan: parsed.data };
}
