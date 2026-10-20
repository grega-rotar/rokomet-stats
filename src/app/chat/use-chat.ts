"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readSse } from "@/lib/sse";

export type ChatSummary = { id: string; title: string; updatedAt: string };
export type Message = {
  id: number;
  role: "user" | "assistant" | "error";
  content: string;
  costUsd?: number | null;
  durationMs?: number | null;
};
export type Pending = { state: "sending" | "waiting" | "running"; text: string };

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
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

/**
 * One chat: its messages, the reply being streamed, send and stop.
 * Call openChat(id) to switch chats (null = a new one, created on the first send).
 * onCreated runs when the first send creates the chat; onSettled after every reply.
 */
export function useChat({ onCreated, onSettled }: { onCreated?: (id: string) => void; onSettled?: () => void } = {}) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  // The chat that send() just created: its messages arrive through the stream, not a fetch.
  const createdRef = useRef<string | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const callbacks = useRef({ onCreated, onSettled });
  useEffect(() => {
    callbacks.current = { onCreated, onSettled };
  });

  const refresh = useCallback(async (id: string) => {
    try {
      const data = await api<{ messages: Message[] }>(`/api/chats/${id}`);
      setMessages(data.messages);
    } catch {
      setMessages([]);
      setChatId(null);
      chatIdRef.current = null;
    }
  }, []);

  const openChat = useCallback(
    (id: string | null) => {
      if (id === chatIdRef.current) return;
      chatIdRef.current = id;
      setChatId(id);
      setError("");
      if (!id) return setMessages([]);
      if (createdRef.current === id) return;
      createdRef.current = null;
      refresh(id);
    },
    [refresh],
  );

  const send = useCallback(
    async (input: string) => {
      const text = input.trim();
      if (!text || abortRef.current) return;
      setError("");
      const abort = new AbortController();
      abortRef.current = abort;
      setPending({ state: "sending", text: "" });
      let id = chatId;

      try {
        if (!id) {
          const { chat } = await api<{ chat: ChatSummary }>("/api/chats", { method: "POST" });
          id = chat.id;
          createdRef.current = id;
          chatIdRef.current = id;
          setChatId(id);
          setMessages([]);
          callbacks.current.onCreated?.(id);
        }
        const res = await fetch(`/api/chats/${id}/messages`, {
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
        if (id) await refresh(id);
      } finally {
        abortRef.current = null;
        setPending(null);
        callbacks.current.onSettled?.();
      }
    },
    [chatId, refresh],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { chatId, messages, pending, error, send, stop, openChat };
}
