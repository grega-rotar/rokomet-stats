"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Drills({ playerId, name }: { playerId: number; name: string }) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; text: string }>({ status: "idle", text: "" });

  async function generate() {
    setState({ status: "loading", text: "" });
    try {
      const res = await fetch(`/api/stats/players/${playerId}/drills`, { method: "POST" });
      const body = (await res.json()) as { text?: string; error?: string };
      setState(res.ok && body.text ? { status: "done", text: body.text } : { status: "error", text: body.error ?? `Request failed (${res.status}).` });
    } catch {
      setState({ status: "error", text: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  return (
    <div>
      <button
        onClick={generate}
        disabled={state.status === "loading"}
        className="bg-court rounded-xl px-4 py-2 text-sm font-semibold shadow-sm text-slate-deep hover:brightness-95 disabled:opacity-60"
      >
        {state.status === "loading" ? "Generating drills…" : state.status === "done" ? "Generate again" : `Generate drills for ${name}`}
      </button>
      <p className="mt-2 text-xs text-muted">Claude picks the weak spots from the numbers above and writes a training plan. Takes about a minute.</p>
      {state.status === "error" && <p className="mt-3 text-sm text-foul">{state.text}</p>}
      {state.status === "done" && (
        <div className="answer mt-4 text-sm">
          <Markdown remarkPlugins={[remarkGfm]}>{state.text}</Markdown>
        </div>
      )}
    </div>
  );
}
