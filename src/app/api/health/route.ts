import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export async function GET() {
  await connection();
  try {
    getDb().run(sql`select 1`);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 503 });
  }
}
