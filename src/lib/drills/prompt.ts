import { z } from "zod";
import type { PlayerProfile } from "@/lib/stats/queries";
import { TYPE_MIN } from "@/lib/stats/shot-types";
import { DrillPlan } from "./plan";

// The prompt for one drill plan. Pure, so a script can print it. Contract: plan.ts, spec: specs/drills.md.

const MIN_SHOTS = 15; // same rule as the profile's weak spots (queries.ts)

// RZS positions (Slovenian) -> English, label, and where the player stands in our court coordinates.
const POSITIONS: Record<string, { en: string; label: string; spot: string }> = {
  "Levo krilo": { en: "left wing", label: "LW", spot: "x 0.5–3, y −9.5 to −8 (left corner)" },
  "Desno krilo": { en: "right wing", label: "RW", spot: "x 0.5–3, y 8 to 9.5 (right corner)" },
  "Levi zunanji": { en: "left back", label: "LB", spot: "x 9–11, y −6 to −3" },
  "Srednji zunanji": { en: "centre back", label: "CB", spot: "x 9–11, y −1 to 1" },
  "Desni zunanji": { en: "right back", label: "RB", spot: "x 9–11, y 3 to 6" },
  "Krožni napadalec": { en: "pivot (line player)", label: "PV", spot: "x 6–7 between defenders, y −3 to 3" },
  Vratar: { en: "goalkeeper", label: "GK", spot: "x 0.5, y 0 (in goal)" },
};

export function positionInfo(position: string) {
  return POSITIONS[position] ?? { en: "court player", label: "P", spot: "back court, x 9–11" };
}

/** JSON Schema for --json-schema, from the same zod schema parsePlan checks. */
export function planJsonSchema(): string {
  return JSON.stringify(z.toJSONSchema(DrillPlan, { io: "input", target: "draft-07" }));
}

const fmt = (v: number | null, unit: string) => (v === null ? "n/a" : `${v.toFixed(1)}${unit}`);

export function facts(prof: PlayerProfile): string[] {
  const p = prof.player;
  const pos = positionInfo(p.position);
  const field = p.shots - p.shots_7m;
  return [
    `Player: ${p.name}, ${pos.en} (${p.position}), ${p.team} (${prof.competitions.join(", ")}).`,
    `Season so far: ${p.matches} matches, ${p.goals} goals from ${p.shots} shots, field ${p.goals - p.goals_7m}/${field}, 7m ${p.goals_7m}/${p.shots_7m}, ${p.two_min} two-minute suspensions, ${p.yellow} yellow, ${p.red} red.`,
    ...prof.metrics.map((m) => `${m.label} [${m.key}]: ${fmt(m.me, m.unit)} (average for the position, ${prof.peers} players: ${fmt(m.avg, m.unit)}).`),
    prof.shotTypes
      ? `Shot types from the match stats sheets (${prof.shotTypes.matches} matches; under ${TYPE_MIN} attempts of a type is a small sample; a focus on a type uses metric [field]): ` +
        prof.shotTypes.rows
          .map((r) => `${r.key} ${r.goals}/${r.shots}${r.pct === null ? "" : ` = ${r.pct.toFixed(0)}%`} (position average ${r.avg === null ? "n/a" : `${r.avg.toFixed(0)}%`})`)
          .join(", ") + `; ${prof.shotTypes.misses} shots missed the goal.`
      : "No shot types (6m / wing / 9m) for this player: they exist only for the top senior competitions.",
    prof.weakSpots.length
      ? `Weak spots found in the data: ${prof.weakSpots.map((w) => `${w.title}: ${w.detail}`).join(" ")}`
      : prof.enoughData
        ? "No metric is clearly below the position average."
        : `Small sample: fewer than ${MIN_SHOTS} field shots and fewer than 4 matches, so no weakness is proven.`,
    `Match by match (goals/shots): ${prof.games.map((g) => `${g.goals}/${g.shots}`).join(", ")}.`,
  ];
}

const EXAMPLE_SCENE = {
  actors: [
    { id: "lb", team: "attack", label: "LB", x: 10.5, y: -4.5, focus: true },
    { id: "cb", team: "attack", label: "CB", x: 10, y: 0 },
    { id: "d1", team: "defence", label: "D", x: 6.8, y: -3 },
    { id: "gk", team: "keeper", label: "GK", x: 0.5, y: 0 },
  ],
  cones: [[9.5, -4]],
  ball: "cb",
  beats: [
    [{ type: "pass", actor: "cb", target: "lb" }, { type: "run", actor: "lb", to: [9.8, -4] }],
    [{ type: "run", actor: "lb", to: [9, -3.5] }, { type: "run", actor: "d1", to: [7.5, -3.3] }],
    [{ type: "shot", actor: "lb", zone: "tl", jump: true }],
  ],
};

export function drillsPrompt(prof: PlayerProfile): string {
  const pos = positionInfo(prof.player.position);
  const keeper = pos.label === "GK";
  // A "Vratar" here is a keeper's own shots as a court player: no save numbers, so the plan stays general.
  const small = !prof.enoughData || keeper;
  return [
    `You are a handball coach writing a one-week training plan for one ${pos.en}. Output only one JSON object: no prose, no Markdown, no code fence. Do not use any tools other than the structured output, if offered.`,
    "",
    "DATA (the only numbers you may quote):",
    ...facts(prof),
    "",
    "JSON SHAPE (lengths are hard limits in characters):",
    `{ headline (one sentence, at most 120 characters: the main finding with its number), smallSample (bool${small ? ", must be true here" : ", false here"}),`,
    `  focus: 1–3 × { metric: field|sevens|gpm|two|general, label ≤40, now ≤24 e.g. "7/18 · 39%", target ≤24 e.g. "≥ 50% in 4 weeks" },`,
    "  drills: 2–4 × { id [a-z0-9]{1,8}, title ≤48, metric, minutes 5–45, reps ≤32 e.g. \"4 × 8 shots\", players 1–14, equipment ≤4 × ≤24,",
    "    steps 2–4 × ≤110, cues ≤3 × ≤44, measure ≤110 (how progress shows in the numbers above), scene },",
    "  week: 1–5 × { day: Mon..Sun, drills: [drill ids] } }",
    "scene = { actors: 1–12 × { id [a-z0-9]{1,8}, team: attack|defence|keeper|coach, label ≤3, x, y, focus? }, cones: [[x,y]] ≤10, ball: actor id holding the ball at start,",
    "  beats: 1–8 × [1–6 moves played at the same time] }",
    "move = { type: run|dribble, actor, to: [x,y] } | { type: pass, actor, target: actor id } | { type: shot, actor, zone: tl|tc|tr|ml|mc|mr|bl|bc|br (shooter's view: t top, b bottom, l left), jump? } | { type: save, actor (a keeper) }",
    "",
    "COURT (metres, the half being attacked, seen from above): x = distance from the goal line (0 goal line, 20 centre line); y = across, −10 left touchline to +10 right from the attacker's view, posts at y ±1.5.",
    "6m area = points within 6 m of the nearer post (x 0, y ±1.5), plus x < 6 between the posts; it meets the goal line at |y| 7.5. 7m mark x 7 y 0. 9m line = 9 m from the nearer post.",
    "Wings: x 0.5–3, |y| 8–9.5. Backs: x 9–11. Pivot: x 6.3–7 among the defenders. A 6:0 defence stands just outside the 6m area (x 6.5–7.5 in the middle, x 3–4.5 at |y| 7–8 on the edges).",
    `This player is a ${pos.label}: usual spot ${pos.spot}.`,
    "",
    "EXAMPLE scene, only to show the format (LB 9m jump shot after a pass from CB, one defender stepping out; the shot scores). Build your own scenes for this player's drills:",
    JSON.stringify(EXAMPLE_SCENE),
    "",
    "RULES:",
    "- `now` uses only numbers from DATA, as goals/shots and %. `target` is realistic for 4 weeks (a few points above now or near the position average).",
    small
      ? keeper
        ? '- DATA has no save numbers for this goalkeeper, only shots as a court player. Say so in the headline, set smallSample true, give a general goalkeeper plan (metric general, `now` "no save data").'
        : "- Small sample: say so in the headline, set smallSample true, focus on the position's basics (metric general), not on weaknesses."
      : "- Pick focus from the weak spots, else from the metrics furthest below the position average. Skip a metric with a tiny sample (7m under 6 attempts, field under 15 shots). Each drill's metric matches the focus it trains.",
    keeper
      ? "- This is a goalkeeper: the focus actor is the keeper (team keeper, x ≈ 0.5, y ≈ 0) and drills are about saves; shooters attack from realistic spots."
      : "- Drills fit the position: wings shoot from the corner and on the counter, backs from 9m and in 1-on-1, pivots catch and turn at 6m.",
    "- The focus player is in every scene with focus:true and does the key action. Any keeper actor stands at x ≈ 0.5, y ≈ 0 and may move only within x 0–1.5, |y| ≤ 1.5.",
    "- Court players (attack and defence) never stand or run inside the 6m area: check every position and every run's `to`. Shots are taken from outside it; the jump carries the shooter in after release.",
    "- Every move references actors in the scene; a pass goes from whoever holds the ball now; a shot is by the ball holder. A `save` move means the keeper stops that shot: add it only where the drill is about the save, otherwise the shot is a goal.",
    "- Scenes show one repetition of the drill, 2–6 beats, at most 6 actors.",
    "- Week uses only drill ids from drills, 3–4 training days.",
    "- English. Short, concrete coaching text. No filler, no motivation, no disclaimers.",
  ].join("\n");
}

/** Second try after an invalid reply: same task, plus what was wrong. */
export function fixPrompt(prof: PlayerProfile, error: string, bad: string): string {
  return [
    drillsPrompt(prof),
    "",
    "A previous answer was rejected. Validation error:",
    error.slice(0, 1500),
    "Previous answer (truncated):",
    bad.slice(0, 6000),
    "",
    "Return the corrected JSON object only.",
  ].join("\n");
}
