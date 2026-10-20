"use client";

// The chat next to the stats pages: docked on the right on wide screens, a bottom sheet on phones.
// A page tells it what it shows with <AskAbout>, so the first question names that player or team.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useChats } from "../../shell";
import { Composer, EmptyState, MessageList, type Example } from "../../chat/parts";
import { useChat } from "../../chat/use-chat";

export type AskContext = { label: string; prefix: string; examples: Example[] };

const STATS_EXAMPLES: Example[] = [
  { label: "Top scorers", text: "Who are the top scorers in Liga NLB this season?" },
  { label: "Best 9m", text: "Who are the best 9m shooters in Liga NLB this season?" },
  { label: "Team ratings", text: "Which teams have the highest Elo rating in Liga NLB right now?" },
  { label: "Goal zones", text: "Where in the goal does RK Celje Pivovarna Laško score most?" },
];

type Panel = { open: boolean; setOpen: (open: boolean) => void; context: AskContext | null; setContext: (c: AskContext | null) => void };
const PanelContext = createContext<Panel | null>(null);

function usePanel() {
  const p = useContext(PanelContext);
  if (!p) throw new Error("usePanel outside StatsChat");
  return p;
}

const STORE = "stats-chat-open";

export function StatsChat({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false);
  const [context, setContext] = useState<AskContext | null>(null);
  useEffect(() => {
    try {
      // Restore after mount: the server render can't know it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(STORE) === "1" && window.matchMedia("(min-width: 1024px)").matches) setOpenState(true);
    } catch {}
  }, []);
  const setOpen = (o: boolean) => {
    setOpenState(o);
    try {
      localStorage.setItem(STORE, o ? "1" : "0");
    } catch {}
  };
  return (
    <PanelContext.Provider value={{ open, setOpen, context, setContext }}>
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        {open && <ChatPanel />}
      </div>
    </PanelContext.Provider>
  );
}

/** Rendered by a page: sets what the panel's questions are about while the page is shown. */
export function AskAbout(props: AskContext) {
  const { setContext } = usePanel();
  const { label, prefix } = props;
  const examples = JSON.stringify(props.examples);
  useEffect(() => {
    setContext({ label, prefix, examples: JSON.parse(examples) as Example[] });
    return () => setContext(null);
  }, [label, prefix, examples, setContext]);
  return null;
}

/** The "Ask" toggle in the stats top bar. */
export function AskButton() {
  const { open, setOpen, context } = usePanel();
  return (
    <button
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold shadow-sm transition ${open ? "bg-slate text-white" : "bg-sky text-white hover:bg-sky-dark"}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />
      </svg>
      <span className="max-w-40 truncate">{open ? "Close chat" : context ? `Ask about ${context.label}` : "Ask"}</span>
    </button>
  );
}

function ChatPanel() {
  const { setOpen, context } = usePanel();
  const { reload } = useChats();
  const { chatId, messages, pending, error, send, stop, openChat } = useChat({ onCreated: () => reload(), onSettled: () => reload() });
  const empty = messages.length === 0 && !pending;

  // The first message of a chat carries the page context, so Claude knows which player or team ids to look up.
  const ask = (text: string) => send(empty && context ? `${context.prefix} ${text}` : text);

  return (
    <aside
      aria-label="Chat about the stats"
      className="fixed inset-x-0 bottom-0 z-30 flex h-[85dvh] flex-col rounded-t-3xl border-t border-line bg-floor shadow-2xl lg:static lg:z-auto lg:h-auto lg:w-[26rem] lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none xl:w-[30rem]"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-white/80 px-4 backdrop-blur lg:rounded-none max-lg:rounded-t-3xl">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[0.95rem] font-semibold text-slate">Ask about the stats</div>
          {context && <div className="truncate text-xs text-muted">Page: {context.label}</div>}
        </div>
        {chatId && (
          <button onClick={() => openChat(null)} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-sky-dark hover:bg-floor">
            New chat
          </button>
        )}
        <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-lg p-1.5 text-muted hover:bg-floor hover:text-slate">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div data-chat-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {empty ? (
          <div>
            <p className="text-sm text-muted">
              {context
                ? `Questions about ${context.label} are answered from the RZS data, with the numbers shown.`
                : "Ask anything about Slovenian handball results, players and teams. Answers come from the RZS data."}
            </p>
            <EmptyState compact onPick={ask} examples={context?.examples ?? STATS_EXAMPLES} />
          </div>
        ) : (
          <MessageList messages={messages} pending={pending} onRetry={send} />
        )}
        {error && <p className="mt-3 rounded-xl bg-foul/10 px-3 py-2 text-sm text-foul">{error}</p>}
      </div>
      <div className="shrink-0 px-3 pb-3">
        <Composer
          onSend={ask}
          onStop={stop}
          pending={!!pending}
          hint={false}
          placeholder={context ? `Ask about ${context.label}…` : "Ask about a team, player or match…"}
        />
      </div>
    </aside>
  );
}
