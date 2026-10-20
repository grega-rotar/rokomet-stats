import type { NextRequest } from "next/server";
import { currentUserId, unauthorized } from "@/lib/auth";
import { makeSender, vapidFromEnv } from "@/lib/push/send";
import { getDevice, recordResult } from "@/lib/push/store";

/** Sends one push to this device, so the user sees what a result will look like. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/push/devices/[id]/test">) {
  if ((await currentUserId(request)) === null) return unauthorized();
  const { id } = await ctx.params;
  const device = getDevice(id);
  if (!device) return Response.json({ error: "not found" }, { status: 404 });
  const vapid = vapidFromEnv();
  if (!vapid) return Response.json({ error: "Push isn't set up on this server." }, { status: 503 });
  const result = await makeSender(vapid)(device, {
    title: "Notifications are on",
    body: "New results for what you follow will show up like this.",
    url: "/stats/alerts",
    tag: "test",
  });
  recordResult(id, result);
  if (result === "ok") return new Response(null, { status: 204 });
  return Response.json(
    { error: result === "gone" ? "This device's subscription expired. Turn notifications on again." : "The push service didn't accept the message. Try again later." },
    { status: 502 },
  );
}
