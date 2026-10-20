import "server-only";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb, schema } from "@/db";
import { SESSION_COOKIE, verifySession } from "./session";

// Until auth is decided (specs/open-questions.md #4) everyone logs in with one shared password as one user.
const SHARED_EMAIL = "shared@rokomet.local";

export function checkPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sharedUserId(): number {
  const db = getDb();
  db.insert(schema.users).values({ email: SHARED_EMAIL }).onConflictDoNothing().run();
  const user = db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, SHARED_EMAIL)).get();
  return user!.id;
}

/** The logged-in user's id, or null. Route handlers check this themselves; the proxy is only a first gate. */
export async function currentUserId(request: NextRequest): Promise<number | null> {
  return verifySession(request.cookies.get(SESSION_COOKIE)?.value);
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
