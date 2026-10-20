"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { readSse } from "@/lib/sse";

type ChatSummary = { id: string; title: string; updatedAt: string };
type Message = {
  id: number;
  role: "user" | "assistant" | "error";
  content: string;
  costUsd?: number | null;
  durationMs?: number | null;
};
type Pending = { state: "sending" | "waiting" | "running"; text: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    // A full reload on purpose: the session is gone, so drop all client state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);
  return res.status === 204 ? (undefined as T) : res.json();
}

function chatIdFromUrl() {
  return new URLSearchParams(window.location.search).get("c");
}

function setUrlChat(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("c", id);
  else url.searchParams.delete("c");
  window.history.replaceState(null, "", url);
}

export function ChatApp() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadChats = useCallback(async () => {
    const { chats } = await api<{ chats: ChatSummary[] }>("/api/chats");
    setChats(chats);
    return chats;
  }, []);

  const openChat = useCallback(async (id: string | null) => {
    setActiveId(id);
    setUrlChat(id);
    setError("");
    if (!id) return setMessages([]);
    try {
      const data = await api<{ messages: Message[] }>(`/api/chats/${id}`);
      setMessages(data.messages);
    } catch {
      setMessages([]);
      setActiveId(null);
      setUrlChat(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { chats: list } = await api<{ chats: ChatSummary[] }>("/api/chats");
        if (cancelled) return;
        setChats(list);
        const fromUrl = chatIdFromUrl();
        await openChat(fromUrl && list.some((c) => c.id === fromUrl) ? fromUrl : (list[0]?.id ?? null));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending?.text]);

  async function send(text: string) {
    text = text.trim();
    if (!text || pending) return;
    setError("");
    let chatId = activeId;
    if (!chatId) {
      const { chat } = await api<{ chat: ChatSummary }>("/api/chats", { method: "POST" });
      chatId = chat.id;
      setActiveId(chat.id);
      setUrlChat(chat.id);
      setMessages([]);
    }
    setDraft("");
    setPending({ state: "sending", text: "" });
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        const msg = (await res.json().catch(() => null))?.error ?? res.statusText;
        throw new Error(msg);
      }
      for await (const { event, data } of readSse(res.body)) {
        const payload = JSON.parse(data);
        if (event === "user") setMessages((m) => [...m, payload.message]);
        else if (event === "status") setPending((p) => p && { ...p, state: payload.state });
        else if (event === "delta") setPending((p) => p && { ...p, state: "running", text: p.text + payload.text });
        else if (event === "done") {
          setPending(null);
          setMessages((m) => [...m, payload.message]);
        }
      }
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      // After a stop the server saves what was written; reload to show it.
      await openChat(chatId);
    } finally {
      abortRef.current = null;
      setPending(null);
      loadChats().catch(() => {});
    }
  }

  async function removeChat(id: string) {
    if (!confirm("Delete this chat?")) return;
    await api(`/api/chats/${id}`, { method: "DELETE" });
    const list = await loadChats();
    if (id === activeId) openChat(list[0]?.id ?? null);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }

  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.content;

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-black/10 dark:border-white/10">
        <div className="p-3">
          <button
            onClick={() => openChat(null)}
            disabled={!!pending}
            className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
          >
            + New chat
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2">
          {chats.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center rounded-lg text-sm ${
                c.id === activeId ? "bg-black/10 dark:bg-white/15" : "hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              <button
                onClick={() => !pending && openChat(c.id)}
                className="flex-1 truncate px-3 py-2 text-left"
                title={c.title}
              >
                {c.title}
              </button>
              <button
                onClick={() => removeChat(c.id)}
                className="px-2 opacity-0 group-hover:opacity-60 hover:opacity-100"
                aria-label="Delete chat"
              >
                ×
              </button>
            </div>
          ))}
        </nav>
        <button onClick={logout} className="m-3 text-left text-sm opacity-60 hover:opacity-100">
          Log out
        </button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-4 p-4">
            {messages.length === 0 && !pending && (
              <p className="pt-24 text-center opacity-50">Ask anything about Slovenian handball stats.</p>
            )}
            {messages.map((m, i) => (
              <MessageBubble
                key={m.id}
                message={m}
                onRetry={i === messages.length - 1 && lastUserText && !pending ? () => send(lastUserText) : undefined}
              />
            ))}
            {pending && (
              <div className="whitespace-pre-wrap">
                {pending.text || (
                  <span className="opacity-50">{pending.state === "waiting" ? "Waiting for a free slot…" : "Thinking…"}</span>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="mx-auto w-full max-w-3xl p-4"
        >
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <div className="flex items-end gap-2 rounded-xl border border-black/15 p-2 dark:border-white/20">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={1}
              placeholder="Message…"
              className="max-h-48 flex-1 resize-none bg-transparent px-2 py-1 outline-none"
            />
            {pending ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="rounded-lg bg-black/80 px-3 py-1.5 text-sm text-white dark:bg-white/80 dark:text-black"
              >
                Stop
              </button>
            ) : (
              <button
                disabled={!draft.trim()}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
              >
                Send
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}

function MessageBubble({ message, onRetry }: { message: Message; onRetry?: () => void }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-black/5 px-4 py-2 dark:bg-white/10">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.role === "error") {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-2 text-sm text-red-700 dark:text-red-400">
        <p className="whitespace-pre-wrap">{message.content}</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-1 underline">
            Retry
          </button>
        )}
      </div>
    );
  }
  return <div className="whitespace-pre-wrap">{message.content}</div>;
}
