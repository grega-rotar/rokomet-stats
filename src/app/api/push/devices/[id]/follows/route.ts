import type { NextRequest } from "next/server";
import { currentUserId, unauthorized } from "@/lib/auth";
import { deviceState, follow, getDevice, parseFollow, unfollow } from "@/lib/push/store";

type Ctx = RouteContext<"/api/push/devices/[id]/follows">;

async function target(request: NextRequest, ctx: Ctx) {
  if ((await currentUserId(request)) === null) return { error: unauthorized() };
  const { id } = await ctx.params;
  if (!getDevice(id)) return { error: Response.json({ error: "not found" }, { status: 404 }) };
  const f = parseFollow(await request.json().catch(() => null));
  if (!f) return { error: Response.json({ error: "kind must be team or player, refId a number" }, { status: 400 }) };
  return { id, f };
}

/** `{ kind: "team" | "player", refId, label }`. Following twice is fine. */
export async function PUT(request: NextRequest, ctx: Ctx) {
  const t = await target(request, ctx);
  if (t.error) return t.error;
  if (!t.f.label) return Response.json({ error: "label is required" }, { status: 400 });
  follow(t.id, t.f, t.f.label);
  return Response.json({ device: deviceState(t.id) });
}

/** `{ kind, refId }`. */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const t = await target(request, ctx);
  if (t.error) return t.error;
  unfollow(t.id, t.f);
  return Response.json({ device: deviceState(t.id) });
}
