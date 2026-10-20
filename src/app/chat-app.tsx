"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readSse } from "@/lib/sse";
import { Wordmark } from "./wordmark";

type ChatSummary = { id: string; title: string; updatedAt: string };
type Message = {
  id: number;
  role: "user" | "assistant" | "error";
  content: string;
  costUsd?: number | null;
  durationMs?: number | null;
};
type Pending = { state: "sending" | "waiting" | "running"; text: string };

const EXAMPLES = [
  "Who are the top scorers in Liga NLB this season?",
  "How did RK Celje Pivovarna Laško do in their last 5 matches?",
  "Compare 7-metre conversion of RK Gorenje Velenje and RD LL Grosist Slovan.",
  "Which goalkeepers have the best save percentage in 1. SRL?",
];

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

// RZS writes dates as 18.10.2026; today's chats show the time instead.
function shortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("sl-SI", { day: "numeric", month: "numeric" });
}

export function ChatApp() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadChats = useCallback(async () => {
    const { chats } = await api<{ chats: ChatSummary[] }>("/api/chats");
    setChats(chats);
    return chats;
  }, []);

  const openChat = useCallback(async (id: string | null) => {
    setActiveId(id);
    setUrlChat(id);
    setError("");
    setNavOpen(false);
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

  function newChat() {
    openChat(null);
    inputRef.current?.focus();
  }

  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.content;
  const activeTitle = chats.find((c) => c.id === activeId)?.title ?? "New chat";
  const empty = messages.length === 0 && !pending;

  return (
    <div className="flex h-full flex-col">
      <div className="h-1.5 shrink-0 bg-court" />
      <header className="flex h-14 shrink-0 items-center gap-3 bg-slate px-3 md:px-5">
        <button
          onClick={() => setNavOpen((o) => !o)}
          className="p-2 text-white md:hidden"
          aria-label={navOpen ? "Close chat list" : "Open chat list"}
          aria-expanded={navOpen}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <rect y="3" width="20" height="2.5" />
            <rect y="9" width="20" height="2.5" />
            <rect y="15" width="20" height="2.5" />
          </svg>
        </button>
        <Wordmark />
        <div className="flex-1" />
        <button
          onClick={logout}
          className="font-display text-xs font-bold uppercase tracking-wide text-white/70 hover:text-white"
        >
          Log out
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {navOpen && (
          <div className="fixed inset-0 top-[3.875rem] z-10 bg-slate-deep/50 md:hidden" onClick={() => setNavOpen(false)} />
        )}
        <aside
          className={`${
            navOpen ? "flex" : "hidden"
          } absolute inset-y-0 left-0 z-20 w-72 flex-col bg-white shadow-xl md:static md:flex md:shadow-none md:border-r md:border-line`}
        >
          <div className="p-4">
            <button
              onClick={newChat}
              disabled={!!pending}
              className="skew-panel w-full bg-sky px-4 py-2.5 text-white hover:bg-sky-dark disabled:opacity-50"
            >
              <span className="font-display text-xs font-bold uppercase tracking-wide">+ New chat</span>
            </button>
          </div>
          <h2 className="border-l-4 border-court px-4 py-1 font-display text-[0.7rem] font-bold uppercase tracking-wider text-muted">
            Chats
          </h2>
          <nav className="mt-2 flex-1 overflow-y-auto pb-4">
            {chats.length === 0 && <p className="px-4 py-2 text-sm text-muted">Your chats show up here.</p>}
            {chats.map((c) => {
              const active = c.id === activeId;
              return (
                <div
                  key={c.id}
                  className={`group flex items-center border-l-4 ${
                    active ? "border-sky bg-floor" : "border-transparent hover:bg-floor/60"
                  }`}
                >
                  <button
                    onClick={() => !pending && openChat(c.id)}
                    className="min-w-0 flex-1 px-3 py-2.5 text-left"
                    title={c.title}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className={`block truncate text-sm ${active ? "font-semibold text-slate" : "text-ink"}`}>
                      {c.title}
                    </span>
                    <span className="block text-xs text-muted tabular-nums">{shortDate(c.updatedAt)}</span>
                  </button>
                  <button
                    onClick={() => removeChat(c.id)}
                    className="px-3 py-2 text-lg leading-none text-muted opacity-0 group-hover:opacity-100 hover:text-foul focus-visible:opacity-100"
                    aria-label={`Delete chat ${c.title}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-4 px-3 py-5 md:px-6">
              <div className="flex items-center border border-line border-l-4 border-l-sky bg-white px-4 py-3">
                <h1 className="min-w-0 flex-1 truncate font-display text-sm font-bold uppercase tracking-wide text-slate">
                  {activeTitle}
                </h1>
                {pending && <LiveBadge waiting={pending.state === "waiting"} />}
              </div>

              {empty && <EmptyState onPick={send} />}

              {messages.map((m, i) => (
                <MessageView
                  key={m.id}
                  message={m}
                  onRetry={i === messages.length - 1 && lastUserText && !pending ? () => send(lastUserText) : undefined}
                />
              ))}
              {pending && (
                <AnswerCard>
                  {pending.text ? (
                    <Answer text={pending.text} />
                  ) : (
                    <p className="text-muted">
                      {pending.state === "waiting" ? "Waiting for a free slot…" : "Looking it up…"}
                    </p>
                  )}
                </AnswerCard>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="mx-auto w-full max-w-3xl px-3 pb-4 md:px-6"
          >
            {error && <p className="mb-2 border-l-4 border-foul bg-white px-3 py-2 text-sm text-foul">{error}</p>}
            <div className="flex items-end gap-2 border border-line bg-white p-2 shadow-sm focus-within:border-sky">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                rows={1}
                placeholder="Ask about a team, player or match…"
                aria-label="Message"
                className="max-h-48 flex-1 resize-none bg-transparent px-2 py-1.5 outline-none [field-sizing:content]"
              />
              {pending ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="skew-panel bg-slate px-4 py-2 text-white hover:bg-slate-deep"
                >
                  <span className="font-display text-xs font-bold uppercase tracking-wide">Stop</span>
                </button>
              ) : (
                <button
                  disabled={!draft.trim()}
                  className="skew-panel bg-sky px-4 py-2 text-white hover:bg-sky-dark disabled:opacity-40"
                >
                  <span className="font-display text-xs font-bold uppercase tracking-wide">Send</span>
                </button>
              )}
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}

function LiveBadge({ waiting }: { waiting: boolean }) {
  return (
    <span
      className={`ml-3 flex shrink-0 items-center gap-1.5 px-2 py-0.5 font-display text-[0.65rem] font-bold uppercase tracking-wider ${
        waiting ? "bg-floor text-muted" : "bg-court text-slate-deep"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${waiting ? "bg-muted" : "live-dot bg-slate-deep"}`} />
      {waiting ? "In queue" : "Live"}
    </span>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="border border-line bg-white">
      <p className="px-5 pt-5 font-display text-lg font-bold text-slate">Ask about Slovenian handball.</p>
      <p className="px-5 pb-4 text-muted">Results, scorers, goalkeepers and team form.</p>
      <ul className="border-t border-line">
        {EXAMPLES.map((q) => (
          <li key={q} className="border-b border-line last:border-b-0">
            <button
              onClick={() => onPick(q)}
              className="group flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-floor"
            >
              <span className="h-4 w-1 shrink-0 bg-sky group-hover:bg-court" />
              <span className="text-ink">{q}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnswerCard({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="border border-line border-l-4 border-l-sky bg-white">
      <div className="px-4 py-3 md:px-5">{children}</div>
      {footer}
    </div>
  );
}

function Answer({ text }: { text: string }) {
  return (
    <div className="answer">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: (props) => (
            <div className="table-wrap">
              <table {...props} />
            </div>
          ),
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

function MessageView({ message, onRetry }: { message: Message; onRetry?: () => void }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap bg-slate px-4 py-2.5 text-white">{message.content}</div>
      </div>
    );
  }
  if (message.role === "error") {
    return (
      <div className="border border-line border-l-4 border-l-foul bg-white px-4 py-3 text-sm">
        <p className="whitespace-pre-wrap text-foul">{message.content}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 font-display text-xs font-bold uppercase tracking-wide text-sky-dark hover:underline"
          >
            Try again
          </button>
        )}
      </div>
    );
  }
  const seconds = message.durationMs ? (message.durationMs / 1000).toFixed(1) : null;
  return (
    <AnswerCard
      footer={
        seconds && (
          <p className="border-t border-line px-4 py-1.5 text-xs text-muted tabular-nums md:px-5">{seconds} s</p>
        )
      }
    >
      <Answer text={message.content} />
    </AnswerCard>
  );
}
