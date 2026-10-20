import "server-only";
import { and, desc, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { DrillPlanRow } from "@/db/schema";
import { runClaude } from "@/lib/runner";
import type { PlayerProfile } from "@/lib/stats/queries";
import { fixGoalArea } from "./geometry";
import { parsePlan, type DrillPlan } from "./plan";
import { drillsPrompt, fixPrompt, planJsonSchema } from "./prompt";
import type { DrillsResponse, StoredPlan } from "./types";

// Drill plans run as background jobs, not tied to the request: the browser polls GET. Spec: specs/drills.md.

const RUN_TIMEOUT_MS = 10 * 60_000; // both attempts together
const STALE_MS = RUN_TIMEOUT_MS + 60_000; // a running row older than this was cut off by a restart

const t = schema.drillPlans;

function toStored(r: DrillPlanRow): StoredPlan {
  return {
    id: r.id,
    seasonId: r.seasonId,
    status: r.status,
    createdAt: r.createdAt.getTime(),
    finishedAt: r.finishedAt?.getTime() ?? null,
    plan: r.planJson ? (JSON.parse(r.planJson) as DrillPlan) : null,
    error: r.error,
  };
}

function markStale(playerId: number, seasonId: number) {
  getDb()
    .update(t)
    .set({ status: "error", error: "Interrupted, try again.", finishedAt: new Date() })
    .where(and(eq(t.playerId, playerId), eq(t.seasonId, seasonId), eq(t.status, "running"), lt(t.createdAt, new Date(Date.now() - STALE_MS))))
    .run();
}

const newest = (playerId: number, seasonId: number) =>
  getDb().select().from(t).where(and(eq(t.playerId, playerId), eq(t.seasonId, seasonId))).orderBy(desc(t.id)).limit(1).get();

/** The newest plan, plus the newest done one while the newest is running or failed. */
export function latestPlan(playerId: number, seasonId: number): DrillsResponse {
  markStale(playerId, seasonId);
  const row = newest(playerId, seasonId);
  if (!row) return { plan: null };
  if (row.status === "done") return { plan: toStored(row) };
  const done = getDb()
    .select()
    .from(t)
    .where(and(eq(t.playerId, playerId), eq(t.seasonId, seasonId), eq(t.status, "done")))
    .orderBy(desc(t.id))
    .limit(1)
    .get();
  return done ? { plan: toStored(row), previous: toStored(done) } : { plan: toStored(row) };
}

/** Starts a plan, or returns the one already running. No await between the check and the insert, so two clicks can't start two runs. */
export function startPlan(prof: PlayerProfile, seasonId: number): { plan: StoredPlan; started: boolean } {
  const playerId = prof.player.player_id;
  markStale(playerId, seasonId);
  const last = newest(playerId, seasonId);
  if (last?.status === "running") return { plan: toStored(last), started: false };
  const row = getDb().insert(t).values({ playerId, seasonId, status: "running" }).returning().get();
  void generate(row.id, prof, seasonId);
  return { plan: toStored(row), started: true };
}

async function generate(rowId: number, prof: PlayerProfile, seasonId: number) {
  const playerId = prof.player.player_id;
  const signal = AbortSignal.timeout(RUN_TIMEOUT_MS);
  const jsonSchema = planJsonSchema();
  let cost = 0;
  let duration = 0;
  const run = async (prompt: string, attempt: number) => {
    const r = await runClaude({
      chatId: `drills-${playerId}-${seasonId}-${rowId}${attempt ? `-${attempt}` : ""}`,
      prompt,
      resumeSessionId: null,
      signal,
      hooks: {},
      effort: "medium",
      jsonSchema,
    });
    cost += r.costUsd ?? 0;
    duration += r.durationMs ?? 0;
    return r;
  };
  const finish = (set: Partial<typeof t.$inferInsert>) =>
    getDb()
      .update(t)
      .set({ ...set, costUsd: cost || null, durationMs: duration || null, finishedAt: new Date() })
      .where(eq(t.id, rowId))
      .run();

  try {
    let r = await run(drillsPrompt(prof), 0);
    if (!r.ok) {
      console.error(`drills ${rowId}: run failed: ${r.error}`);
      return finish({ status: "error", error: r.aborted ? "Took too long, try again." : (r.error?.split("\n")[0] ?? "Claude couldn't write the plan.") });
    }
    let parsed = parsePlan(r.text);
    if (!parsed.ok) {
      console.error(`drills ${rowId}: invalid plan, retrying: ${parsed.error}`);
      r = await run(fixPrompt(prof, parsed.error, r.text), 1);
      parsed = r.ok ? parsePlan(r.text) : { ok: false, error: r.error ?? "run failed" };
    }
    if (!parsed.ok) {
      console.error(`drills ${rowId}: invalid plan after retry: ${parsed.error}\n${r.text.slice(0, 2000)}`);
      return finish({ status: "error", error: "The plan came back malformed, try again." });
    }
    finish({ status: "done", planJson: JSON.stringify(fixGoalArea(parsed.plan)) });
  } catch (e) {
    console.error(`drills ${rowId}:`, e);
    finish({ status: "error", error: "Something went wrong, try again." });
  }
}

