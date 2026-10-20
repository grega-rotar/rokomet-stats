import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { beforeAll, describe, expect, it } from "vitest";
import type { Payload } from "./plan";
import type { SendResult, Target } from "./send";

// Real migrations on a temp app.db, a small stats.db shaped like the crawler's, and a fake push service.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "push-test-"));
process.env.DATABASE_PATH = path.join(dir, "app.db");
process.env.STATS_DB_PATH = path.join(dir, "stats.db");

const stats = new Database(process.env.STATS_DB_PATH);
stats.exec(`
  CREATE TABLE competitions (id INTEGER, season_id INTEGER, name TEXT, category TEXT, PRIMARY KEY (id, season_id));
  CREATE TABLE matches (id INTEGER PRIMARY KEY, season_id INTEGER, competition_id INTEGER, round TEXT, date TEXT, time TEXT,
    status INTEGER, home_team_id INTEGER, away_team_id INTEGER, home TEXT, away TEXT, home_goals INTEGER, away_goals INTEGER);
  CREATE TABLE player_match (match_id INTEGER, team_id INTEGER, side TEXT, player_id INTEGER, first_name TEXT, last_name TEXT,
    goals INTEGER, shots INTEGER);
  INSERT INTO competitions VALUES (10, 73, '1. NLB liga', 'top'), (10, 72, '1. NLB liga', 'top');
`);

function rzsDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function addMatch(id: number, season: number, daysAgo: number) {
  stats
    .prepare("INSERT INTO matches VALUES (?, ?, 10, '7', ?, '18:00', 1, 4042, 4060, 'RK KRIM', 'ŽRK IZOLA', 31, 28)")
    .run(id, season, rzsDate(daysAgo));
}

const sub = (n: number) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: `key${n}`, auth: `auth${n}` } });

let store: typeof import("./store");
let notifier: typeof import("./notifier");

function fakeSender(answer: (to: Target) => SendResult = () => "ok") {
  const sent: { endpoint: string; payload: Payload }[] = [];
  const send = async (to: Target, payload: Payload) => {
    sent.push({ endpoint: to.endpoint, payload });
    return answer(to);
  };
  return { sent, send };
}

beforeAll(async () => {
  const db = await import("@/db");
  db.runMigrations();
  store = await import("./store");
  notifier = await import("./notifier");
});

describe("device store", () => {
  it("saving the same endpoint twice keeps one device with the same id", () => {
    const a = store.saveDevice(sub(1), "ua");
    const b = store.saveDevice({ ...sub(1), keys: { p256dh: "new", auth: "new" } }, "ua");
    expect(b.id).toBe(a.id);
    expect(store.getDevice(a.id)?.p256dh).toBe("new");
    expect(store.allDevices().filter((d) => d.row.endpoint === sub(1).endpoint)).toHaveLength(1);
    store.deleteDevice(a.id);
  });

  it("following twice keeps one row; deleting the device removes its follows", () => {
    const d = store.saveDevice(sub(2), null);
    store.follow(d.id, { kind: "team", refId: 4042 }, "RK KRIM");
    store.follow(d.id, { kind: "team", refId: 4042 }, "RK KRIM");
    expect(store.deviceState(d.id)?.follows).toEqual([{ kind: "team", refId: 4042, label: "RK KRIM" }]);
    store.unfollow(d.id, { kind: "team", refId: 4042 });
    expect(store.deviceState(d.id)?.follows).toEqual([]);
    store.follow(d.id, { kind: "player", refId: 77 }, "Ana Novak");
    store.deleteDevice(d.id);
    expect(store.deviceState(d.id)).toBeNull();
    expect(store.allDevices().flatMap((x) => x.follows)).toEqual([]);
  });

  it("validates subscriptions and follows", () => {
    expect(store.parseSubscription(sub(3))).toEqual(sub(3));
    expect(store.parseSubscription({ endpoint: "https://push.example/x" })).toBeNull();
    expect(store.parseSubscription({ ...sub(3), endpoint: "http://insecure" })).toBeNull();
    expect(store.parseFollow({ kind: "club", refId: 1 })).toBeNull();
    expect(store.parseFollow({ kind: "team", refId: "1" })).toBeNull();
    expect(store.parseFollow({ kind: "player", refId: 77, label: " Ana " })).toEqual({ kind: "player", refId: 77, label: "Ana" });
  });
});

describe("notifier", () => {
  it("pushes a new result once, to the right devices only", async () => {
    addMatch(1, 73, 0); // new, newest season: announced
    addMatch(2, 73, 5); // outside the 3-day window
    addMatch(3, 72, 0); // older season (the history crawl)
    stats.prepare("INSERT INTO player_match VALUES (1, 4042, 'home', 77, 'Ana', 'Novak', 9, 12)").run();

    const a = store.saveDevice(sub(10), null);
    store.setAllTop(a.id, true);
    const b = store.saveDevice(sub(11), null);
    store.follow(b.id, { kind: "team", refId: 4042 }, "RK KRIM");
    const c = store.saveDevice(sub(12), null);
    store.follow(c.id, { kind: "team", refId: 9999 }, "Other");
    const p = store.saveDevice(sub(13), null);
    store.follow(p.id, { kind: "player", refId: 77 }, "Ana Novak");

    const { sent, send } = fakeSender();
    expect(await notifier.runOnce(send)).toEqual({ matches: 1, pushes: 3 });
    expect(sent.map((s) => s.endpoint).sort()).toEqual([sub(10).endpoint, sub(11).endpoint, sub(13).endpoint]);
    const toPlayer = sent.find((s) => s.endpoint === sub(13).endpoint)!.payload;
    expect(toPlayer.body).toContain("Ana Novak: 9 goals (9/12)");
    expect(toPlayer.url).toBe("/stats/players/77");
    expect(store.getDevice(a.id)?.lastSentAt).toBeInstanceOf(Date);

    const again = fakeSender();
    expect(await notifier.runOnce(again.send)).toEqual({ matches: 0, pushes: 0 });
    expect(again.sent).toEqual([]);
    for (const d of [a, b, c, p]) store.deleteDevice(d.id);
  });

  it("marks matches sent even with nobody subscribed, so a later subscriber gets no old results", async () => {
    addMatch(4, 73, 1);
    const first = fakeSender();
    expect(await notifier.runOnce(first.send)).toEqual({ matches: 1, pushes: 0 });
    const d = store.saveDevice(sub(20), null);
    store.setAllTop(d.id, true);
    const later = fakeSender();
    await notifier.runOnce(later.send);
    expect(later.sent).toEqual([]);
    store.deleteDevice(d.id);
  });

  it("deletes a device the push service says is gone, counts other failures", async () => {
    const gone = store.saveDevice(sub(30), null);
    store.setAllTop(gone.id, true);
    const flaky = store.saveDevice(sub(31), null);
    store.setAllTop(flaky.id, true);
    addMatch(5, 73, 0);
    const { send } = fakeSender((to) => (to.endpoint === sub(30).endpoint ? "gone" : "error"));
    await notifier.runOnce(send);
    expect(store.getDevice(gone.id)).toBeUndefined();
    expect(store.getDevice(flaky.id)?.failures).toBe(1);

    for (let i = 1; i < store.MAX_FAILURES; i++) store.recordResult(flaky.id, "error");
    expect(store.getDevice(flaky.id)).toBeUndefined();
  });
});
