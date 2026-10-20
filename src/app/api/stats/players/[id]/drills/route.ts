import { NextResponse } from "next/server";
import { latestPlan, startPlan } from "@/lib/drills/store";
import { playerProfile, playerSeasonIds } from "@/lib/stats/queries";

// Drill plans are stored per player and season: POST starts a background run, GET returns it (the page polls). Spec: specs/drills.md.

type Ctx = RouteContext<"/api/stats/players/[id]/drills">;

async function target(request: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return null;
  const s = new URL(request.url).searchParams.get("season");
  const seasonId = s ? Number(s) : playerSeasonIds(id)[0]?.id;
  return seasonId !== undefined && Number.isInteger(seasonId) ? { id, seasonId } : null;
}

const notFound = () => NextResponse.json({ error: "Player not found." }, { status: 404 });

export async function GET(request: Request, ctx: Ctx) {
  const t = await target(request, ctx);
  return t ? NextResponse.json(latestPlan(t.id, t.seasonId)) : notFound();
}

export async function POST(request: Request, ctx: Ctx) {
  const t = await target(request, ctx);
  const prof = t && playerProfile(t.id, t.seasonId);
  if (!t || !prof) return notFound();
  const { plan, started } = startPlan(prof, t.seasonId);
  return NextResponse.json({ plan }, { status: started ? 202 : 200 });
}
