import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Follow, PushDevice } from "./plan";

const { pushDevices, pushFollows, pushSent } = schema;

export type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export type DeviceState = { id: string; allTop: boolean; follows: (Follow & { label: string })[] };
export type DeviceRow = typeof pushDevices.$inferSelect;

/** A browser's PushSubscription.toJSON(), or null if the shape is wrong. */
export function parseSubscription(v: unknown): Subscription | null {
  const s = v as Partial<Subscription> | null;
  const ok =
    typeof s?.endpoint === "string" &&
    /^https:\/\//.test(s.endpoint) &&
    s.endpoint.length <= 2048 &&
    typeof s.keys?.p256dh === "string" &&
    typeof s.keys?.auth === "string" &&
    s.keys.p256dh.length <= 256 &&
    s.keys.auth.length <= 64;
  return ok ? { endpoint: s.endpoint!, keys: { p256dh: s.keys!.p256dh, auth: s.keys!.auth } } : null;
}

export function parseFollow(v: unknown): (Follow & { label?: string }) | null {
  const f = v as { kind?: unknown; refId?: unknown; label?: unknown } | null;
  if ((f?.kind !== "team" && f?.kind !== "player") || !Number.isSafeInteger(f.refId)) return null;
  const label = typeof f.label === "string" ? f.label.trim().slice(0, 120) : undefined;
  return { kind: f.kind, refId: f.refId as number, label };
}

/** Saves the subscription (one row per endpoint; new keys replace old ones) and returns the device. */
export function saveDevice(sub: Subscription, userAgent: string | null): DeviceState {
  const db = getDb();
  db.insert(pushDevices)
    .values({ id: randomUUID(), endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent })
    .onConflictDoUpdate({
      target: pushDevices.endpoint,
      set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent, failures: 0 },
    })
    .run();
  const row = db.select({ id: pushDevices.id }).from(pushDevices).where(eq(pushDevices.endpoint, sub.endpoint)).get();
  return deviceState(row!.id)!;
}

export function getDevice(id: string): DeviceRow | undefined {
  return getDb().select().from(pushDevices).where(eq(pushDevices.id, id)).get();
}

export function deviceState(id: string): DeviceState | null {
  const d = getDevice(id);
  if (!d) return null;
  const follows = getDb()
    .select({ kind: pushFollows.kind, refId: pushFollows.refId, label: pushFollows.label })
    .from(pushFollows)
    .where(eq(pushFollows.deviceId, id))
    .orderBy(pushFollows.kind, pushFollows.label)
    .all();
  return { id: d.id, allTop: d.allTop, follows };
}

export function setAllTop(id: string, allTop: boolean): boolean {
  return getDb().update(pushDevices).set({ allTop }).where(eq(pushDevices.id, id)).run().changes > 0;
}

export function deleteDevice(id: string): boolean {
  return getDb().delete(pushDevices).where(eq(pushDevices.id, id)).run().changes > 0;
}

export function follow(id: string, f: Follow, label: string): void {
  getDb()
    .insert(pushFollows)
    .values({ deviceId: id, kind: f.kind, refId: f.refId, label })
    .onConflictDoUpdate({ target: [pushFollows.deviceId, pushFollows.kind, pushFollows.refId], set: { label } })
    .run();
}

export function unfollow(id: string, f: Follow): void {
  getDb()
    .delete(pushFollows)
    .where(and(eq(pushFollows.deviceId, id), eq(pushFollows.kind, f.kind), eq(pushFollows.refId, f.refId)))
    .run();
}

/** Every device with what it follows, for the notifier. */
export function allDevices(): (PushDevice & { row: DeviceRow })[] {
  const db = getDb();
  const follows = db.select().from(pushFollows).all();
  return db
    .select()
    .from(pushDevices)
    .all()
    .map((row) => ({
      id: row.id,
      allTop: row.allTop,
      follows: follows.filter((f) => f.deviceId === row.id).map((f) => ({ kind: f.kind, refId: f.refId })),
      row,
    }));
}

/** Of these match ids, the ones not announced yet. */
export function unsent(matchIds: number[]): number[] {
  if (!matchIds.length) return [];
  const sent = new Set(
    getDb().select({ id: pushSent.matchId }).from(pushSent).where(inArray(pushSent.matchId, matchIds)).all().map((r) => r.id),
  );
  return matchIds.filter((id) => !sent.has(id));
}

export function markSent(matchIds: number[]): void {
  if (!matchIds.length) return;
  getDb().insert(pushSent).values(matchIds.map((matchId) => ({ matchId }))).onConflictDoNothing().run();
}

/** After a send: success resets failures; 404/410 (subscription gone) or 10 failures in a row deletes the device. */
export const MAX_FAILURES = 10;

export function recordResult(id: string, result: "ok" | "gone" | "error"): void {
  const db = getDb();
  if (result === "ok") {
    db.update(pushDevices).set({ failures: 0, lastSentAt: new Date() }).where(eq(pushDevices.id, id)).run();
  } else if (result === "gone") {
    deleteDevice(id);
  } else {
    db.update(pushDevices).set({ failures: sql`${pushDevices.failures} + 1` }).where(eq(pushDevices.id, id)).run();
    db.delete(pushDevices).where(and(eq(pushDevices.id, id), sql`${pushDevices.failures} >= ${MAX_FAILURES}`)).run();
  }
}
