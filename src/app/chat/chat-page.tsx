"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { MenuButton, useChats } from "../shell";
import { Composer, EmptyState, LiveBadge, MessageList } from "./parts";
import { useChat } from "./use-chat";

// The chat in ?c=<id> is the open one, so a reload reopens it; no ?c = a new chat.
function setUrlChat(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("c", id);
  else url.searchParams.delete("c");
  window.history.replaceState(null, "", url);
}

export function ChatPage() {
  const params = useSearchParams();
  const urlChat = params.get("c");
  const { chats, reload, setBusy } = useChats();
  const { chatId, messages, pending, error, send, stop, openChat } = useChat({
    onCreated: (id) => {
      setUrlChat(id);
      reload().catch(() => {});
    },
    onSettled: () => reload().catch(() => {}),
  });

  useEffect(() => openChat(urlChat), [urlChat, openChat]);
  useEffect(() => setBusy(!!pending), [pending, setBusy]);

  const title = chats.find((c) => c.id === chatId)?.title ?? "New chat";
  const empty = messages.length === 0 && !pending;

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-white/80 px-3 backdrop-blur md:px-6">
        <MenuButton />
        <h1 className="min-w-0 flex-1 truncate font-display text-[0.95rem] font-semibold text-slate">{title}</h1>
        {pending && <LiveBadge waiting={pending.state === "waiting"} />}
      </header>

      <div data-chat-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl space-y-7 px-4 py-8 md:px-6">
          {empty && <EmptyState onPick={send} />}
          <MessageList messages={messages} pending={pending} onRetry={send} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-4 md:px-6 md:pb-6">
        {error && <p className="mb-2 rounded-xl bg-foul/10 px-3.5 py-2 text-sm text-foul">{error}</p>}
        <Composer onSend={send} onStop={stop} pending={!!pending} autoFocus={!urlChat} />
      </div>
    </>
  );
}
