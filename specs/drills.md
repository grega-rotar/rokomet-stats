# Drill plans

On a player's stats page, "Generate drills" writes a one-week training plan from the player's numbers and shows each drill on an animated court. Plans are stored, so a refresh shows the last one.

## Flow
1. `POST /api/stats/players/[id]/drills?season=ID` inserts a `drill_plans` row with status `running` and starts the run in the background (not tied to the request), then answers at once: `202 { plan }`. If a run for the same player and season is already going, it returns that row with `200` instead of starting a second one.
2. The page polls `GET` (same URL) while the status is `running`. `GET` returns `{ plan: StoredPlan | null, previous?: StoredPlan }`: the newest row, plus the newest `done` row when the newest is `running` or `error`, so the old plan stays on screen while a new one is written.
3. No `season` → the player's latest season. Every regenerate adds a row; old rows are kept.

`StoredPlan` (`src/lib/drills/types.ts`, safe to import in client components): `{ id, seasonId, status: "running"|"done"|"error", createdAt, finishedAt, plan: DrillPlan | null, error }`, times in ms.

## The run (`src/lib/drills/store.ts`)
- One `runClaude` call (`src/lib/runner.ts`), chat id `drills-<player>-<season>-<row>`, no resume, effort `medium`, `--json-schema` built from the zod schema (`z.toJSONSchema`, draft-07). The CLI returns the JSON as the reply text.
- The reply is checked with `parsePlan()` (`src/lib/drills/plan.ts`: zod plus id checks). The CLI's schema check doesn't enforce string lengths, so this check still matters.
- Invalid → one fresh retry whose prompt adds the validation error and the bad reply (truncated). Still invalid → status `error`, "The plan came back malformed, try again."; details go to the server log.
- Court players a few centimetres inside the 6m area are pushed just outside it before storing (`geometry.ts`), instead of failing the plan.
- Both attempts share one 10-minute `AbortSignal.timeout`. A row still `running` after 11 minutes was cut off by a restart: `GET`/`POST` mark it `error` "Interrupted, try again." when they see it.

## The prompt (`src/lib/drills/prompt.ts`)
- DATA: the lines from `playerProfile(id, season)`: season totals, the four metrics with the position average, weak spots (or "none" / small sample), goals/shots per match. These are the only numbers Claude may quote.
- JSON shape in a compact form with the length limits, court coordinates and landmarks (6m area as distance from the posts, 7m mark, 9m, wing/back/pivot spots, where a 6:0 defence stands), the player's usual spot, and one example scene (LB 9m jump shot after a CB pass).
- Rules: `now` only from DATA, `target` realistic for 4 weeks; skip tiny samples as focus; position-specific drills; focus player in every scene with `focus: true`; keeper at x ≈ 0.5, y ≈ 0; court players never inside the 6m area; `save` only where the drill is about the save; 2–6 beats; short English text, no filler.
- Small sample (`enoughData` false): `smallSample: true` and a general plan for the position.
- Goalkeepers: `playerProfile` only reads `is_goalkeeper = 0` rows, so real keepers have no profile (404). The few court rows with position "Vratar" have shots, not saves, so they get a general goalkeeper plan with the keeper as the focus actor.

## Storage
Table `drill_plans` in the app DB (`src/db/schema.ts`, migration `drizzle/0001_drill_plans.sql`): id, player_id, season_id, status, plan_json, error, cost_usd, duration_ms, created_at, finished_at; index (player_id, season_id, id).

## Cost and time (2026-10-21, sonnet, effort medium)
Valid on the first try: ~20–35 s, $0.04–0.08 per plan. With the retry: ~55–60 s, ~$0.16.
