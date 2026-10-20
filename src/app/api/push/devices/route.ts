import type { NextRequest } from "next/server";
import { currentUserId, unauthorized } from "@/lib/auth";
import { parseSubscription, saveDevice } from "@/lib/push/store";

/** `{ subscription }` (PushSubscription.toJSON()) → this device's settings. Safe to call on every page load. */
export async function POST(request: NextRequest) {
  if ((await currentUserId(request)) === null) return unauthorized();
  const body = await request.json().catch(() => null);
  const sub = parseSubscription(body?.subscription);
  if (!sub) return Response.json({ error: "Invalid subscription." }, { status: 400 });
  const ua = request.headers.get("user-agent")?.slice(0, 300) ?? null;
  return Response.json({ device: saveDevice(sub, ua) });
}
