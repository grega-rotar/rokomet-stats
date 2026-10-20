import type { NextRequest } from "next/server";
import { currentUserId, unauthorized } from "@/lib/auth";
import { deleteChat, getChat, listMessages, updateChat } from "@/lib/chats";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/chats/[id]">) {
  const userId = await currentUserId(request);
  if (userId === null) return unauthorized();
  const { id } = await ctx.params;
  const chat = getChat(userId, id);
  if (!chat) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({
    chat: { id: chat.id, title: chat.title, updatedAt: chat.updatedAt },
    messages: listMessages(chat.id),
  });
}

/** Renames the chat: `{ title }`, 1-100 characters after trimming. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/chats/[id]">) {
  const userId = await currentUserId(request);
  if (userId === null) return unauthorized();
  const { id } = await ctx.params;
  if (!getChat(userId, id)) return Response.json({ error: "not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 100) return Response.json({ error: "title must be 1-100 characters" }, { status: 400 });
  updateChat(id, { title });
  return new Response(null, { status: 204 });
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/chats/[id]">) {
  const userId = await currentUserId(request);
  if (userId === null) return unauthorized();
  const { id } = await ctx.params;
  deleteChat(userId, id);
  return new Response(null, { status: 204 });
}
