import { createECDH, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSender, vapidFromEnv } from "./send";

// A local HTTP server stands in for the browser's push service.

let status = 201;
const received: { headers: http.IncomingHttpHeaders; body: Buffer }[] = [];
const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    received.push({ headers: req.headers, body: Buffer.concat(chunks) });
    res.writeHead(status).end();
  });
});
let endpoint = "";

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/push/abc`;
});
afterAll(() => server.close());

const browser = createECDH("prime256v1");
browser.generateKeys();
const target = () => ({ endpoint, p256dh: browser.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") });
const payload = { title: "RK KRIM 31:28 ŽRK IZOLA", body: "1. NLB liga", url: "/stats/teams/4042", tag: "match-1" };
const keys = webpush.generateVAPIDKeys();
const send = makeSender({ ...keys, subject: "mailto:test@example.com" });

describe("makeSender", () => {
  it("posts an encrypted, VAPID-signed push", async () => {
    status = 201;
    expect(await send(target(), payload)).toBe("ok");
    const r = received.at(-1)!;
    expect(r.headers["content-encoding"]).toBe("aes128gcm");
    expect(r.headers.authorization).toMatch(/^vapid t=.+, k=/);
    expect(r.headers.ttl).toBe("86400");
    expect(r.headers.topic).toBe("match-1");
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body.includes(Buffer.from("RK KRIM"))).toBe(false); // encrypted, not plain text
  });

  it("410 means the subscription is gone", async () => {
    status = 410;
    expect(await send(target(), payload)).toBe("gone");
  });

  it("500 is a plain failure", async () => {
    status = 500;
    expect(await send(target(), payload)).toBe("error");
  });

  it("an unreachable push service is a failure, not a crash", async () => {
    expect(await send({ ...target(), endpoint: "http://127.0.0.1:1/x" }, payload)).toBe("error");
  });
});

describe("vapidFromEnv", () => {
  it("needs both keys", () => {
    expect(vapidFromEnv({ VAPID_PUBLIC_KEY: "a" })).toBeNull();
    expect(vapidFromEnv({ VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b" })).toEqual({ publicKey: "a", privateKey: "b", subject: "mailto:admin@rokomet.local" });
  });
});
