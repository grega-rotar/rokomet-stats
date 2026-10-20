import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

// Web push (specs/notifications.md). A device is one browser's push subscription; there are no user accounts.
export const pushDevices = sqliteTable("push_devices", {
  id: text("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  allTop: integer("all_top", { mode: "boolean" }).notNull().default(false),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  lastSentAt: integer("last_sent_at", { mode: "timestamp_ms" }),
  failures: integer("failures").notNull().default(0),
});

export const pushFollows = sqliteTable(
  "push_follows",
  {
    deviceId: text("device_id")
      .notNull()
      .references(() => pushDevices.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["team", "player"] }).notNull(),
    refId: integer("ref_id").notNull(),
    label: text("label").notNull(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.kind, t.refId] }), index("push_follows_ref").on(t.kind, t.refId)],
);

// Matches already announced (stats.db match id), written before sending so a crash never sends twice.
export const pushSent = sqliteTable("push_sent", {
  matchId: integer("match_id").primaryKey(),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
});

export type Chat = typeof chats.$inferSelect;
export type Message = typeof messages.$inferSelect;
