import type { NextRequest } from "next/server";
import { currentUserId, unauthorized } from "@/lib/auth";
import { deleteDevice, deviceState, setAllTop } from "@/lib/push/store";

const notFound = () => Response.json({ error: "not found" }, { status: 404 });

/** `{ allTop }`: get every top-league result, not only followed teams and players. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/push/devices/[id]">) {
  if ((await currentUserId(request)) === null) return unauthorized();
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (typeof body?.allTop !== "boolean") return Response.json({ error: "allTop must be true or false" }, { status: 400 });
  if (!setAllTop(id, body.allTop)) return notFound();
  return Response.json({ device: deviceState(id) });
}

/** Turns push off for this device (the browser unsubscribes itself). */
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/push/devices/[id]">) {
  if ((await currentUserId(request)) === null) return unauthorized();
  const { id } = await ctx.params;
  if (!deleteDevice(id)) return notFound();
  return new Response(null, { status: 204 });
}
