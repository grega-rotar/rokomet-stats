import { NextResponse } from "next/server";
import { runClaude } from "@/lib/runner";
import { MIN_SHOTS, playerProfile } from "@/lib/stats/queries";

// One Claude run per click, no chat history. The numbers go in the prompt, so Claude only writes the plan.
export async function POST(request: Request, ctx: RouteContext<"/api/stats/players/[id]/drills">) {
  const id = Number((await ctx.params).id);
  const prof = Number.isFinite(id) ? playerProfile(id) : null;
  if (!prof) return NextResponse.json({ error: "Player not found." }, { status: 404 });
  const p = prof.player;

  const lines = [
    `Player: ${p.name}, ${p.position}, ${p.team} (${prof.competitions.join(", ")}).`,
    `Season so far: ${p.matches} matches, ${p.goals} goals from ${p.shots} shots, 7m ${p.goals_7m}/${p.shots_7m}, ${p.two_min} two-minute suspensions, ${p.yellow} yellow, ${p.red} red.`,
    ...prof.metrics.map((m) => `${m.label}: ${m.me === null ? "n/a" : m.me.toFixed(1)}${m.unit} (average for the position: ${m.avg === null ? "n/a" : m.avg.toFixed(1)}${m.unit}).`),
    prof.weakSpots.length
      ? `Weak spots found in the data: ${prof.weakSpots.map((w) => `${w.title}: ${w.detail}`).join(" ")}`
      : prof.enoughData
        ? "No metric is clearly below the position average."
        : `Small sample: fewer than ${MIN_SHOTS} field shots and fewer than 4 matches, so no weakness is proven.`,
    `Match by match (goals/shots): ${prof.games.map((g) => `${g.goals}/${g.shots}`).join(", ")}.`,
  ];
  const prompt = [
    "Write a one-week handball training plan for this player, in English, as Markdown.",
    "Use only the numbers below; don't invent other stats. Start with 2-3 bullet points naming what to work on and the numbers behind it.",
    "Then 3-4 drills, each with: goal, setup (players, equipment, court area), how it works, how to measure progress against the numbers.",
    "Drills must fit the player's position. If the sample is small, say so and give a general plan for the position instead.",
    "Do not use any tools.",
    "",
    ...lines,
  ].join("\n");

  const result = await runClaude({
    chatId: `drills-${id}-${Date.now()}`,
    prompt,
    resumeSessionId: null,
    signal: request.signal,
    hooks: {},
  });
  if (!result.ok) return NextResponse.json({ error: result.error ?? "Claude couldn't write the plan. Try again." }, { status: 502 });
  return NextResponse.json({ text: result.text });
}
