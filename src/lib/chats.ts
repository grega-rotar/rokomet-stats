import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { chats, messages } = schema;

export const NEW_CHAT_TITLE = "New chat";

export function listChats(userId: number) {
  return getDb()
    .select({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt })
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.updatedAt))
    .all();
}

export function createChat(userId: number) {
  return getDb()
    .insert(chats)
    .values({ id: randomUUID(), userId, title: NEW_CHAT_TITLE })
    .returning({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt })
    .get();
}

/** The chat if it belongs to the user, else undefined. */
export function getChat(userId: number, chatId: string) {
  return getDb()
    .select()
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .get();
}

export function deleteChat(userId: number, chatId: string) {
  getDb()
    .delete(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .run();
}

export function listMessages(chatId: string) {
  return getDb()
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      costUsd: messages.costUsd,
      durationMs: messages.durationMs,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.id))
    .all();
}

export function addMessage(
  chatId: string,
  msg: { role: "user" | "assistant" | "error"; content: string; costUsd?: number | null; durationMs?: number | null },
) {
  const db = getDb();
  const row = db
    .insert(messages)
    .values({ chatId, ...msg })
    .returning()
    .get();
  db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId)).run();
  return row;
}

export function updateChat(chatId: string, values: { title?: string; claudeSessionId?: string }) {
  getDb().update(chats).set(values).where(eq(chats.id, chatId)).run();
}

export function titleFrom(text: string) {
  const line = text.trim().split("\n")[0];
  return line.length > 60 ? `${line.slice(0, 57)}…` : line || NEW_CHAT_TITLE;
}
