import { describe, expect, it } from "vitest";
import { Semaphore } from "./semaphore";
import { splitEvents } from "./sse";

describe("Semaphore", () => {
  it("queues over the limit and lets the next one in on release", async () => {
    const s = new Semaphore(1);
    const r1 = await s.acquire();
    expect(s.free).toBe(false);
    let second = false;
    const p = s.acquire().then((r) => ((second = true), r));
    await Promise.resolve();
    expect(second).toBe(false);
    r1();
    (await p)();
    expect(second).toBe(true);
    expect(s.free).toBe(true);
  });

  it("drops a waiter whose signal aborts", async () => {
    const s = new Semaphore(1);
    const r1 = await s.acquire();
    const ac = new AbortController();
    const p = s.acquire(ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow("aborted");
    r1();
    expect(s.free).toBe(true);
  });
});

describe("splitEvents", () => {
  it("parses events, skips pings, keeps the unfinished rest", () => {
    const { events, rest } = splitEvents(': ping\n\nevent: delta\ndata: {"text":"a"}\n\nevent: do');
    expect(events).toEqual([{ event: "delta", data: '{"text":"a"}' }]);
    expect(rest).toBe("event: do");
  });
});
