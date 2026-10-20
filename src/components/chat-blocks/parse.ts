import { z } from "zod";
import { Scene } from "../../lib/drills/plan";
import { ZONE_KEYS, type GoalData, type ZoneKey } from "../goal/zones";

// Fenced blocks the chat Claude can draw with: ```court (a Scene from plan.ts) and ```goal (team goal zones).
// Spec: specs/chat-blocks.md.

export const BLOCKS = ["court", "goal"] as const;
export type BlockLang = (typeof BLOCKS)[number];

const title = z.string().trim().min(1).max(60).optional();
const count = z.number().int().min(0).max(100000);

export const CourtBlock = z.object({ title, scene: Scene });
export type CourtBlock = z.infer<typeof CourtBlock>;

const pair = z.tuple([count, count]).refine(([g, s]) => g <= s, "goals can't be more than shots");
export const GoalBlock = z.object({
  title,
  zones: z.strictObject(Object.fromEntries(ZONE_KEYS.map((k) => [k, pair])) as Record<ZoneKey, typeof pair>),
  miss: z.strictObject({ over: count, left: count, right: count }).partial().optional(),
  mode: z.enum(["scored", "conceded"]).default("scored"),
});
export type GoalBlock = z.infer<typeof GoalBlock>;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** What zod can't check in a scene: ids in moves and passes point at actors that exist. */
export function sceneProblems(scene: Scene): string[] {
  const out: string[] = [];
  const actors = new Set(scene.actors.map((a) => a.id));
  if (actors.size !== scene.actors.length) out.push("duplicate actor ids");
  if (!actors.has(scene.ball)) out.push(`ball holder ${scene.ball} is not an actor`);
  for (const m of scene.beats.flat()) {
    if (!actors.has(m.actor)) out.push(`move by unknown actor ${m.actor}`);
    if (m.type === "pass" && !actors.has(m.target)) out.push(`pass to unknown actor ${m.target}`);
  }
  return out;
}

function json(text: string): Parsed<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${(e as Error).message}` };
  }
}

export function parseCourt(text: string): Parsed<CourtBlock> {
  const raw = json(text);
  if (!raw.ok) return raw;
  // A bare scene is fine too.
  const v = raw.value as Record<string, unknown> | null;
  const wrapped = v && typeof v === "object" && "actors" in v ? { scene: v } : v;
  const parsed = CourtBlock.safeParse(wrapped);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const problems = sceneProblems(parsed.data.scene);
  return problems.length ? { ok: false, error: problems.join("; ") } : { ok: true, value: parsed.data };
}

export function parseGoal(text: string): Parsed<GoalBlock> {
  const raw = json(text);
  if (!raw.ok) return raw;
  const parsed = GoalBlock.safeParse(raw.value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: z.prettifyError(parsed.error) };
}

/** A goal block in the shape the goal components draw. */
export function goalData(b: GoalBlock): GoalData {
  return {
    mode: b.mode,
    zones: ZONE_KEYS.map((zone) => ({ zone, goals: b.zones[zone][0], shots: b.zones[zone][1] })),
    miss: b.miss ? { over: b.miss.over ?? 0, left: b.miss.left ?? 0, right: b.miss.right ?? 0 } : undefined,
  };
}

/**
 * Whether the fence that starts at `start` in the Markdown source is closed. While a reply streams, the last fence
 * runs to the end of the text until its closing ``` arrives.
 */
export function fenceClosed(source: string, start: number, end: number): boolean {
  const lines = source.slice(start, end).trimEnd().split("\n");
  if (lines.length < 2) return false;
  const open = lines[0].trimStart().match(/^(`{3,}|~{3,})/)?.[1];
  const close = lines.at(-1)!.trim();
  return !!open && close.length >= open.length && close === open[0].repeat(close.length);
}
