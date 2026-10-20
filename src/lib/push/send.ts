import "server-only";
import webpush from "web-push";
import type { Payload } from "./plan";

export type Target = { endpoint: string; p256dh: string; auth: string };
export type SendResult = "ok" | "gone" | "error";
export type Sender = (to: Target, payload: Payload) => Promise<SendResult>;

export type Vapid = { publicKey: string; privateKey: string; subject: string };

export function vapidFromEnv(env: Record<string, string | undefined> = process.env): Vapid | null {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = env;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT || "mailto:admin@rokomet.local" };
}

/**
 * Encrypts with web-push (VAPID + aes128gcm) and posts with fetch, so one place handles timeouts and
 * the push service's answer: 404/410 means the browser dropped the subscription.
 */
export function makeSender(vapid: Vapid): Sender {
  return async (to, payload) => {
    try {
      const req = webpush.generateRequestDetails(
        { endpoint: to.endpoint, keys: { p256dh: to.p256dh, auth: to.auth } },
        JSON.stringify(payload),
        {
          vapidDetails: vapid,
          TTL: 24 * 3600,
          urgency: "normal",
          // A newer push with the same topic replaces one the phone hasn't received yet.
          topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32),
        },
      );
      const res = await fetch(req.endpoint, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.body ? new Uint8Array(req.body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 404 || res.status === 410) return "gone";
      return res.ok ? "ok" : "error";
    } catch (err) {
      console.error("push send failed", err instanceof Error ? err.message : err);
      return "error";
    }
  };
}
