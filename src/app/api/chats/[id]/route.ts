import type { NextRequest } from "next/server";
import { currentUserId, unauthorized } from "@/lib/auth";
import { deleteChat, getChat, listMessages } from "@/lib/chats";

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

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/chats/[id]">) {
  const userId = await currentUserId(request);
  if (userId === null) return unauthorized();
  const { id } = await ctx.params;
  deleteChat(userId, id);
  return new Response(null, { status: 204 });
}
