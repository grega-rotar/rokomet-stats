import type { NextRequest } from "next/server";
import { currentUserId, unauthorized } from "@/lib/auth";
import { createChat, listChats } from "@/lib/chats";

export async function GET(request: NextRequest) {
  const userId = await currentUserId(request);
  if (userId === null) return unauthorized();
  return Response.json({ chats: listChats(userId) });
}

export async function POST(request: NextRequest) {
  const userId = await currentUserId(request);
  if (userId === null) return unauthorized();
  return Response.json({ chat: createChat(userId) }, { status: 201 });
}
