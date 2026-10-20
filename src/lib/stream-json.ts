// Turns `claude -p --output-format stream-json --verbose --include-partial-messages` lines into what the chat needs.

export type ClaudeEvent =
  | { type: "session"; sessionId: string }
  | { type: "delta"; text: string }
  | { type: "turn" }
  | {
      type: "result";
      isError: boolean;
      text: string;
      costUsd: number | null;
      durationMs: number | null;
      numTurns: number | null;
    };

type Raw = Record<string, unknown> & { type?: string };

export function parseLine(line: string): ClaudeEvent[] {
  if (!line.trim()) return [];
  let e: Raw;
  try {
    e = JSON.parse(line);
  } catch {
    return [];
  }
  const out: ClaudeEvent[] = [];
  if (e.type === "system" && e.subtype === "init" && typeof e.session_id === "string") {
    out.push({ type: "session", sessionId: e.session_id });
  }
  if (e.type === "stream_event") {
    const ev = e.event as Raw | undefined;
    if (ev?.type === "message_start") out.push({ type: "turn" });
    const delta = ev?.delta as Raw | undefined;
    if (ev?.type === "content_block_delta" && delta?.type === "text_delta" && typeof delta.text === "string") {
      out.push({ type: "delta", text: delta.text });
    }
  }
  if (e.type === "result") {
    const num = (v: unknown) => (typeof v === "number" ? v : null);
    out.push({
      type: "result",
      isError: e.is_error === true || e.subtype !== "success",
      text: typeof e.result === "string" ? e.result : "",
      costUsd: num(e.total_cost_usd),
      durationMs: num(e.duration_ms),
      numTurns: num(e.num_turns),
    });
  }
  return out;
}

/** Collects the reply text across turns: a new turn after some text starts a new paragraph. */
export class ReplyText {
  text = "";
  private pendingBreak = false;

  /** Returns the text to append to what the user already sees. */
  add(ev: ClaudeEvent): string {
    if (ev.type === "turn") {
      if (this.text) this.pendingBreak = true;
      return "";
    }
    if (ev.type !== "delta") return "";
    const chunk = (this.pendingBreak ? "\n\n" : "") + ev.text;
    this.pendingBreak = false;
    this.text += chunk;
    return chunk;
  }
}
