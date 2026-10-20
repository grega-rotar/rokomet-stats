import { describe, expect, it } from "vitest";
import { parseLine, ReplyText } from "./stream-json";

const line = (o: unknown) => JSON.stringify(o);

describe("parseLine", () => {
  it("reads the session id from the init event", () => {
    expect(parseLine(line({ type: "system", subtype: "init", session_id: "abc" }))).toEqual([
      { type: "session", sessionId: "abc" },
    ]);
  });

  it("reads text deltas and ignores other stream events", () => {
    const delta = { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } } };
    expect(parseLine(line(delta))).toEqual([{ type: "delta", text: "Hi" }]);
    expect(parseLine(line({ type: "stream_event", event: { type: "content_block_stop" } }))).toEqual([]);
  });

  it("reads the result", () => {
    const r = { type: "result", subtype: "success", is_error: false, result: "Hi", total_cost_usd: 0.01, duration_ms: 900, num_turns: 1 };
    expect(parseLine(line(r))).toEqual([
      { type: "result", isError: false, text: "Hi", costUsd: 0.01, durationMs: 900, numTurns: 1 },
    ]);
    expect(parseLine(line({ ...r, subtype: "error_max_turns" }))[0]).toMatchObject({ isError: true });
  });

  it("skips blank and broken lines", () => {
    expect(parseLine("")).toEqual([]);
    expect(parseLine("not json")).toEqual([]);
  });
});

describe("ReplyText", () => {
  it("puts a paragraph break between turns", () => {
    const r = new ReplyText();
    r.add({ type: "turn" });
    r.add({ type: "delta", text: "Let me check." });
    r.add({ type: "turn" });
    expect(r.add({ type: "delta", text: "Done" })).toBe("\n\nDone");
    expect(r.text).toBe("Let me check.\n\nDone");
  });
});
