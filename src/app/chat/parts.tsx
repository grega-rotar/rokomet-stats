"use client";

// The pieces of a chat, shared by the chat page and any other place that shows a chat.
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BallIcon } from "../wordmark";
import type { Message, Pending } from "./use-chat";

export type Example = { label: string; text: string };

export const EXAMPLES: Example[] = [
  { label: "Scorers", text: "Who are the top scorers in Liga NLB this season?" },
  { label: "Form", text: "How did RK Celje Pivovarna Laško do in their last 5 matches?" },
  { label: "7 metres", text: "Compare 7-metre conversion of RK Gorenje Velenje and RD LL Grosist Slovan." },
  { label: "Goalkeepers", text: "Which goalkeepers have the best save percentage in 1. SRL?" },
];

export function Icon({ className = "h-5 w-5", children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconButton({
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
      <Icon className={small ? "h-4 w-4" : "h-5 w-5"}>{children}</Icon>
    </button>
  );
}

export function LiveBadge({ waiting }: { waiting: boolean }) {
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

export function EmptyState({
  onPick,
  examples = EXAMPLES,
  compact = false,
}: {
  onPick: (text: string) => void;
  examples?: Example[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? "pt-2" : "pt-6 md:pt-14"}>
      {!compact && (
        <>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky text-white shadow-lg shadow-sky/30">
            <BallIcon className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-center font-display text-2xl font-bold text-slate">What do you want to know?</h2>
          <p className="mt-1.5 text-center text-muted">Results, scorers, goalkeepers and team form in Slovenian handball.</p>
        </>
      )}
      <div className={`grid gap-3 ${compact ? "" : "mt-8 sm:grid-cols-2"}`}>
        {examples.map((q) => (
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

export function Answer({ text }: { text: string }) {
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
      <Icon className="h-3.5 w-3.5">{copied ? <path d="M5 12l5 5L20 7" /> : <path d="M9 9h10v10H9zM5 15V5h10" />}</Icon>
      {copied ? "Copied" : "Copy"}
    </button>
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
            <button
              onClick={onRetry}
              className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate shadow-sm hover:bg-floor"
            >
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

/** The messages plus the reply being streamed. Put it inside an element with `data-chat-scroll` (the scroller). */
export function MessageList({
  messages,
  pending,
  onRetry,
}: {
  messages: Message[];
  pending: Pending | null;
  onRetry?: (text: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const seen = useRef({ firstId: undefined as number | undefined, count: 0 });

  // Opening a chat jumps to its end, a new message glides there, and streamed text only
  // follows while the reader is already near the bottom (so scrolling up to read stays put).
  useEffect(() => {
    const el = bottomRef.current?.closest<HTMLElement>("[data-chat-scroll]");
    if (!el) return;
    const firstId = messages[0]?.id;
    const opened = firstId !== seen.current.firstId;
    const added = messages.length > seen.current.count;
    seen.current = { firstId, count: messages.length };
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (opened) el.scrollTo({ top: el.scrollHeight });
    else if (added) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else if (nearBottom) el.scrollTo({ top: el.scrollHeight });
  }, [messages, pending?.text]);

  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.content;
  return (
    <>
      {messages.map((m, i) => (
        <MessageView
          key={m.id}
          message={m}
          onRetry={
            onRetry && i === messages.length - 1 && lastUserText && !pending ? () => onRetry(lastUserText) : undefined
          }
        />
      ))}
      {pending && (
        <AssistantRow>
          {pending.text ? (
            <Answer text={pending.text} />
          ) : pending.state === "waiting" ? (
            <p className="pt-1 text-muted">Waiting for a free slot…</p>
          ) : (
            <Typing />
          )}
        </AssistantRow>
      )}
      <div ref={bottomRef} />
    </>
  );
}

/** The message box with send/stop. Enter sends, Shift+Enter adds a line. */
export function Composer({
  onSend,
  onStop,
  pending,
  placeholder = "Ask about a team, player or match…",
  hint = true,
  autoFocus = false,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  pending: boolean;
  placeholder?: string;
  hint?: boolean;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  function submit() {
    if (!draft.trim() || pending) return;
    onSend(draft);
    setDraft("");
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-white p-2 pl-4 shadow-lg shadow-slate/5 transition focus-within:border-sky focus-within:ring-4 focus-within:ring-sky/15">
        <textarea
          value={draft}
          autoFocus={autoFocus}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label="Message"
          className="no-ring max-h-48 min-h-10 flex-1 resize-none bg-transparent py-2 outline-none [field-sizing:content]"
        />
        {pending ? (
          <button
            type="button"
            onClick={onStop}
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
            <Icon className="h-5 w-5">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </Icon>
          </button>
        )}
      </div>
      {hint && <p className="mt-2 hidden text-center text-xs text-muted md:block">Enter to send · Shift + Enter for a new line</p>}
    </form>
  );
}
