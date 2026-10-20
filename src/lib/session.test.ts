import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_S, signSession, verifySession } from "./session";

const key = "test-secret-at-least-16";

describe("session cookie", () => {
  it("round-trips the user id", async () => {
    expect(await verifySession(await signSession(7, Date.now(), key), Date.now(), key)).toBe(7);
  });

  it("rejects a tampered, foreign or expired cookie", async () => {
    const now = Date.now();
    const cookie = await signSession(7, now, key);
    expect(await verifySession(cookie.replace(/^7\./, "8."), now, key)).toBeNull();
    expect(await verifySession(cookie, now, "another-secret-xxxxx")).toBeNull();
    expect(await verifySession(cookie, now + SESSION_MAX_AGE_S * 1000 + 1, key)).toBeNull();
    expect(await verifySession(undefined, now, key)).toBeNull();
  });
});
