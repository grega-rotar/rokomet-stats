import type { NextRequest } from "next/server";
import { currentUserId, unauthorized } from "@/lib/auth";
import { addMessage, getChat, NEW_CHAT_TITLE, titleFrom, updateChat } from "@/lib/chats";
import { claimChat, releaseChat, runClaude } from "@/lib/runner";

const PING_MS = 20_000; // Cloudflare drops a request that sends nothing for ~100 s
const MAX_LEN = 20_000;

/**
 * Sends a message and streams the reply as server-sent events:
 * `status` {state: "waiting" | "running"}, `delta` {text}, then `done` {message} (role assistant or error).
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/chats/[id]/messages">) {
  const userId = await currentUserId(request);
  if (userId === null) return unauthorized();
  const { id } = await ctx.params;
  const chat = getChat(userId, id);
  if (!chat) return Response.json({ error: "not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });
  if (text.length > MAX_LEN) return Response.json({ error: "message too long" }, { status: 413 });

  if (!claimChat(chat.id)) {
    return Response.json({ error: "a reply is still running in this chat" }, { status: 409 });
  }

  const userMessage = addMessage(chat.id, { role: "user", content: text });
  if (chat.title === NEW_CHAT_TITLE) updateChat(chat.id, { title: titleFrom(text) });

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          open = false;
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const ping = setInterval(() => write(": ping\n\n"), PING_MS);

      send("user", { message: userMessage });
      try {
        const result = await runClaude({
          chatId: chat.id,
          prompt: text,
          resumeSessionId: chat.claudeSessionId,
          signal: abort.signal,
          hooks: {
            onWaiting: () => send("status", { state: "waiting" }),
            onStarted: () => send("status", { state: "running" }),
            onSession: (sessionId) => {
              if (sessionId !== chat.claudeSessionId) updateChat(chat.id, { claudeSessionId: sessionId });
            },
            onDelta: (t) => send("delta", { text: t }),
          },
        });

        // A stopped reply keeps what was written so far; anything else that failed becomes an error message.
        const message =
          result.ok || (result.aborted && result.text)
            ? addMessage(chat.id, {
                role: "assistant",
                content: result.text,
                costUsd: result.costUsd,
                durationMs: result.durationMs,
              })
            : addMessage(chat.id, { role: "error", content: result.error ?? "Something went wrong." });
        send("done", { message });
      } catch (err) {
        send("done", { message: addMessage(chat.id, { role: "error", content: `Server error: ${String(err)}` }) });
      } finally {
        clearInterval(ping);
        releaseChat(chat.id);
        if (open) controller.close();
        open = false;
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
