import type { NextRequest } from "next/server";
import { currentUserId, unauthorized } from "@/lib/auth";
import { vapidFromEnv } from "@/lib/push/send";

/** The VAPID public key the browser subscribes with; null when push isn't set up on this server. */
export async function GET(request: NextRequest) {
  if ((await currentUserId(request)) === null) return unauthorized();
  return Response.json({ publicKey: vapidFromEnv()?.publicKey ?? null });
}
