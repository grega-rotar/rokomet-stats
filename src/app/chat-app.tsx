"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnswerSource, Pre } from "@/components/chat-blocks/blocks";
import { readSse } from "@/lib/sse";
import { BallIcon, Wordmark } from "./wordmark";

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
  { label: "Scorers", text: "Who are the top scorers in Liga NLB this season?" },
  { label: "Form", text: "How did RK Celje Pivovarna Laško do in their last 5 matches?" },
  { label: "7 metres", text: "Compare 7-metre conversion of RK Gorenje Velenje and RD LL Grosist Slovan." },
  { label: "Goalkeepers", text: "Which goalkeepers have the best save percentage in 1. SRL?" },
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

const GROUPS = ["Today", "Yesterday", "Previous 7 days", "Older"] as const;

function groupOf(iso: string): (typeof GROUPS)[number] {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const t = new Date(iso).getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfToday - 864e5) return "Yesterday";
  if (t >= startOfToday - 7 * 864e5) return "Previous 7 days";
  return "Older";
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

  async function renameChat(id: string, title: string) {
    setChats((list) => list.map((c) => (c.id === id ? { ...c, title } : c)));
    try {
      await api(`/api/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      loadChats().catch(() => {});
    }
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
  const grouped = GROUPS.map((g) => ({ name: g, chats: chats.filter((c) => groupOf(c.updatedAt) === g) })).filter(
    (g) => g.chats.length > 0,
  );

  return (
    <div className="flex h-full">
      {navOpen && <div className="fixed inset-0 z-20 bg-slate-deep/40 md:hidden" onClick={() => setNavOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 shrink-0 flex-col bg-slate-deep text-white transition-transform duration-200 md:static md:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 pb-4 pt-5">
          <Wordmark dark />
          <IconButton label="Close chat list" onClick={() => setNavOpen(false)} className="text-white/70 hover:bg-white/10 md:hidden">
            <path d="M6 6l12 12M18 6L6 18" />
          </IconButton>
        </div>
        <div className="px-3">
          <button
            onClick={newChat}
            disabled={!!pending}
            className="flex w-full items-center gap-2 rounded-xl bg-sky px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-dark disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            New chat
          </button>
          <a
            href="/stats"
            className="mt-2 flex items-center gap-2.5 rounded-lg px-3.5 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
            </svg>
            Stats
          </a>
        </div>

        <nav className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
          {chats.length === 0 && <p className="px-3 py-3 text-sm text-white/40">Your chats show up here.</p>}
          {grouped.map((g) => (
            <section key={g.name} className="mt-4 first:mt-2">
              <h2 className="px-3 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-white/35">{g.name}</h2>
              {g.chats.map((c) => (
                <ChatItem
                  key={c.id}
                  chat={c}
                  active={c.id === activeId}
                  onOpen={() => !pending && openChat(c.id)}
                  onRename={(title) => renameChat(c.id, title)}
                  onDelete={() => removeChat(c.id)}
                />
              ))}
            </section>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11" />
            </svg>
            Log out
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-white/80 px-3 backdrop-blur md:px-6">
          <IconButton label="Open chat list" onClick={() => setNavOpen(true)} className="text-slate hover:bg-floor md:hidden">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </IconButton>
          <h1 className="min-w-0 flex-1 truncate font-display text-[0.95rem] font-semibold text-slate">{activeTitle}</h1>
          {pending && <LiveBadge waiting={pending.state === "waiting"} />}
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-7 px-4 py-8 md:px-6">
            {empty && <EmptyState onPick={send} />}

            {messages.map((m, i) => (
              <MessageView
                key={m.id}
                message={m}
                onRetry={i === messages.length - 1 && lastUserText && !pending ? () => send(lastUserText) : undefined}
              />
            ))}
            {pending && (
              <AssistantRow>
                {pending.text ? (
                  <Answer text={pending.text} streaming />
                ) : pending.state === "waiting" ? (
                  <p className="pt-1 text-muted">Waiting for a free slot…</p>
                ) : (
                  <Typing />
                )}
              </AssistantRow>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="mx-auto w-full max-w-3xl px-4 pb-4 md:px-6 md:pb-6"
        >
          {error && <p className="mb-2 rounded-xl bg-foul/10 px-3.5 py-2 text-sm text-foul">{error}</p>}
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-white p-2 pl-4 shadow-lg shadow-slate/5 transition focus-within:border-sky focus-within:ring-4 focus-within:ring-sky/15">
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
              className="max-h-48 min-h-10 flex-1 resize-none bg-transparent py-2 outline-none no-ring [field-sizing:content]"
            />
            {pending ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label="Stop"
                title="Stop"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate text-white transition hover:bg-slate-deep"
              >
                <span className="h-3 w-3 rounded-[3px] bg-white" />
              </button>
            ) : (
              <button
                disabled={!draft.trim()}
                aria-label="Send"
                title="Send"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky text-white transition hover:bg-sky-dark disabled:bg-line disabled:text-muted"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            )}
          </div>
          <p className="mt-2 hidden text-center text-xs text-muted md:block">Enter to send · Shift + Enter for a new line</p>
        </form>
      </main>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  className = "",
  small = false,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid shrink-0 place-items-center rounded-lg transition ${small ? "h-7 w-7" : "h-9 w-9"} ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className={small ? "h-4 w-4" : "h-5 w-5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  );
}

const PENCIL = <path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4zM13.5 6.5l4 4" />;
const TRASH = <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />;

function ChatItem({
  chat,
  active,
  onOpen,
  onRename,
  onDelete,
}: {
  chat: ChatSummary;
  active: boolean;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(chat.title);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const outside = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  function commit() {
    setEditing(false);
    const title = value.trim();
    if (title && title !== chat.title) onRename(title);
    else setValue(chat.title);
  }

  return (
    <div
      ref={ref}
      className={`group relative flex items-center rounded-lg transition ${
        active || menu ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-court" />}
      {editing ? (
        <input
          autoFocus
          value={value}
          maxLength={100}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setValue(chat.title);
              setEditing(false);
            }
          }}
          aria-label="Chat name"
          className="mx-1 my-1 min-w-0 flex-1 rounded-md bg-slate-deep px-2 py-1 text-sm text-white outline-none no-ring ring-2 ring-sky"
        />
      ) : (
        <button
          onClick={onOpen}
          onDoubleClick={() => setEditing(true)}
          className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm"
          title={chat.title}
          aria-current={active ? "page" : undefined}
        >
          {chat.title}
        </button>
      )}
      {!editing && (
        <IconButton
          label={`Options for ${chat.title}`}
          onClick={() => setMenu((m) => !m)}
          className={`mr-1 text-white/60 hover:bg-white/10 hover:text-white focus-visible:opacity-100 ${
            menu || active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          small
        >
          <circle cx="5" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="19" cy="12" r="1" fill="currentColor" />
        </IconButton>
      )}
      {menu && (
        <div role="menu" className="absolute right-1 top-full z-40 mt-1 w-44 rounded-xl bg-white p-1 text-ink shadow-xl ring-1 ring-black/5">
          <MenuItem
            icon={PENCIL}
            onClick={() => {
              setMenu(false);
              setValue(chat.title);
              setEditing(true);
            }}
          >
            Rename
          </MenuItem>
          <MenuItem
            icon={TRASH}
            danger
            onClick={() => {
              setMenu(false);
              onDelete();
            }}
          >
            Delete
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  danger = false,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
        danger ? "text-foul hover:bg-foul/10" : "hover:bg-floor"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {icon}
      </svg>
      {children}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-white hover:text-slate"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {copied ? <path d="M5 12l5 5L20 7" /> : <path d="M9 9h10v10H9zM5 15V5h10" />}
      </svg>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function LiveBadge({ waiting }: { waiting: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        waiting ? "bg-floor text-muted" : "bg-court/15 text-[#5d7a12]"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${waiting ? "bg-muted" : "live-dot bg-court"}`} />
      {waiting ? "In queue" : "Live"}
    </span>
  );
}

function Typing() {
  return (
    <span className="typing flex h-7 items-center gap-1" aria-label="Thinking">
      <span className="h-1.5 w-1.5 rounded-full bg-muted" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted" />
    </span>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="pt-6 md:pt-14">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky text-white shadow-lg shadow-sky/30">
        <BallIcon className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-center font-display text-2xl font-bold text-slate">What do you want to know?</h2>
      <p className="mt-1.5 text-center text-muted">Results, scorers, goalkeepers and team form in Slovenian handball.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {EXAMPLES.map((q) => (
          <button
            key={q.text}
            onClick={() => onPick(q.text)}
            className="rounded-2xl border border-line bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-sky/50 hover:shadow-md"
          >
            <span className="text-xs font-semibold text-sky-dark">{q.label}</span>
            <span className="mt-1 block text-[0.95rem] leading-snug text-ink">{q.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AssistantRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate text-white">
        <BallIcon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Module-level so react-markdown keeps the same components while a reply streams: a drawn block isn't remounted per delta.
const MD_COMPONENTS: Components = {
  table: (props) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
  a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
  pre: Pre,
};

function Answer({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const source = useMemo(() => ({ text, streaming }), [text, streaming]);
  return (
    <div className="answer">
      <AnswerSource value={source}>
        <Markdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
          {text}
        </Markdown>
      </AnswerSource>
    </div>
  );
}

function MessageView({ message, onRetry }: { message: Message; onRetry?: () => void }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-sky px-4 py-2.5 text-white shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.role === "error") {
    return (
      <AssistantRow>
        <div className="rounded-xl border border-foul/20 bg-foul/5 px-4 py-3 text-sm">
          <p className="whitespace-pre-wrap text-foul">{message.content}</p>
          {onRetry && (
            <button onClick={onRetry} className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate shadow-sm hover:bg-floor">
              Try again
            </button>
          )}
        </div>
      </AssistantRow>
    );
  }
  const seconds = message.durationMs ? (message.durationMs / 1000).toFixed(1) : null;
  return (
    <AssistantRow>
      <Answer text={message.content} />
      <div className="-ml-2 mt-1.5 flex items-center gap-2">
        <CopyButton text={message.content} />
        {seconds && <span className="text-xs text-muted tabular-nums">{seconds} s</span>}
      </div>
    </AssistantRow>
  );
}
