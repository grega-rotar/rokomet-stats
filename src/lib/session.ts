// Signed session cookie: "<userId>.<expiresAtMs>.<hmac>". Uses Web Crypto so it also runs in the proxy.

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_S = 30 * 24 * 3600;

const enc = new TextEncoder();

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET is missing or too short");
  return s;
}

async function hmac(data: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
  return Buffer.from(sig).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(userId: number, now = Date.now(), key = secret()): Promise<string> {
  const payload = `${userId}.${now + SESSION_MAX_AGE_S * 1000}`;
  return `${payload}.${await hmac(payload, key)}`;
}

/** Returns the user id, or null if the cookie is missing, forged or expired. */
export async function verifySession(
  value: string | undefined,
  now = Date.now(),
  key = secret(),
): Promise<number | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, sig] = parts;
  if (!safeEqual(sig, await hmac(`${userId}.${expires}`, key))) return null;
  if (Number(expires) < now) return null;
  const id = Number(userId);
  return Number.isInteger(id) ? id : null;
}
