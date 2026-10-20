import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const nowMs = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
});

export const chats = sqliteTable(
  "chats",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    claudeSessionId: text("claude_session_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [index("chats_user_updated").on(t.userId, t.updatedAt)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "error"] }).notNull(),
    content: text("content").notNull(),
    costUsd: real("cost_usd"),
    durationMs: integer("duration_ms"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [index("messages_chat").on(t.chatId, t.id)],
);

// Drill plans per player and season. Every generation is a new row; the UI shows the newest done one.
export const drillPlans = sqliteTable(
  "drill_plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    playerId: integer("player_id").notNull(),
    seasonId: integer("season_id").notNull(),
    status: text("status", { enum: ["running", "done", "error"] }).notNull(),
    planJson: text("plan_json"),
    error: text("error"),
    costUsd: real("cost_usd"),
    durationMs: integer("duration_ms"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("drill_plans_player_season").on(t.playerId, t.seasonId, t.id)],
);

export type Chat = typeof chats.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type DrillPlanRow = typeof drillPlans.$inferSelect;
