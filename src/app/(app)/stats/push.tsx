"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

// Web push on this device (specs/notifications.md): the service worker, the subscription and its settings.

export type FollowKind = "team" | "player";
export type DeviceFollow = { kind: FollowKind; refId: number; label: string };
export type Device = { id: string; allTop: boolean; follows: DeviceFollow[] };
export type PushStatus = "loading" | "unsupported" | "ios-install" | "unconfigured" | "denied" | "off" | "on";

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status}).`);
  return res.status === 204 ? (undefined as T) : res.json();
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function keyBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function sameKey(sub: PushSubscription, key: Uint8Array) {
  const k = sub.options.applicationServerKey;
  if (!k) return true; // the browser doesn't tell; trust it
  const a = new Uint8Array(k);
  return a.length === key.length && a.every((v, i) => v === key[i]);
}

/**
 * Chromium browsers throw "Registration failed - push service error" (AbortError) when they can't reach
 * their push service: Brave has it off by default, and VPNs or blockers can block fcm.googleapis.com.
 */
async function subscribe(reg: ServiceWorkerRegistration, key: Uint8Array<ArrayBuffer>) {
  try {
    return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch (e) {
    if (!(e instanceof DOMException) || e.name !== "AbortError") throw e;
    const brave = "brave" in navigator;
    throw new Error(
      brave
        ? "Brave has push notifications turned off. Turn on “Use Google services for push messaging” in brave://settings/privacy, restart Brave and try again."
        : "Your browser couldn't reach its push service. A VPN, ad blocker or firewall may be blocking it, or push is turned off in this browser. Try Chrome, Edge or Firefox.",
    );
  }
}

async function register(sub: PushSubscription) {
  return (await call<{ device: Device }>("/api/push/devices", "POST", { subscription: sub.toJSON() })).device;
}

export function usePush() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [device, setDevice] = useState<Device | null>(null);
  const [key, setKey] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) return setStatus(isIos() && !isStandalone() ? "ios-install" : "unsupported");
      const { publicKey } = await call<{ publicKey: string | null }>("/api/push");
      if (!publicKey) return setStatus("unconfigured");
      const k = keyBytes(publicKey);
      const reg = await navigator.serviceWorker.register("/sw.js");
      let sub = await reg.pushManager.getSubscription();
      if (Notification.permission === "denied") return setStatus("denied");
      // The server's key changed: the old subscription can't receive anything, so make a new one.
      if (sub && !sameKey(sub, k) && Notification.permission === "granted") {
        await sub.unsubscribe();
        sub = await subscribe(reg, k);
      }
      const d = sub ? await register(sub) : null;
      if (!live) return;
      setKey(k);
      setDevice(d);
      setStatus(d ? "on" : "off");
    })().catch((e: unknown) => {
      if (!live) return;
      setError(e instanceof Error ? e.message : String(e));
      setStatus("off");
    });
    return () => {
      live = false;
    };
  }, []);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  /** Asks for permission (must run from a click) and subscribes. Returns the device, or null. */
  const enable = useCallback(
    () =>
      run(async () => {
        if (!key) return null;
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setStatus(perm === "denied" ? "denied" : "off");
          return null;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await subscribe(reg, key));
        const d = await register(sub);
        setDevice(d);
        setStatus("on");
        return d;
      }).then((d) => d ?? null),
    [key, run],
  );

  const disable = useCallback(
    () =>
      run(async () => {
        if (device) await call(`/api/push/devices/${device.id}`, "DELETE").catch(() => undefined);
        const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
        await sub?.unsubscribe();
        setDevice(null);
        setStatus("off");
      }),
    [device, run],
  );

  const setAllTop = useCallback(
    (allTop: boolean) =>
      run(async () => device && setDevice((await call<{ device: Device }>(`/api/push/devices/${device.id}`, "PATCH", { allTop })).device)),
    [device, run],
  );

  /** Follows or unfollows; turns push on first when needed. */
  const toggleFollow = useCallback(
    async (f: DeviceFollow, on: boolean) => {
      const d = device ?? (on ? await enable() : null);
      if (!d) return;
      await run(async () =>
        setDevice((await call<{ device: Device }>(`/api/push/devices/${d.id}/follows`, on ? "PUT" : "DELETE", f)).device),
      );
    },
    [device, enable, run],
  );

  const test = useCallback(() => run(async () => device && (await call(`/api/push/devices/${device.id}/test`, "POST"), true)), [device, run]);

  return { status, device, busy, error, enable, disable, setAllTop, toggleFollow, test };
}

function BellIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

const pill = "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold shadow-sm transition";

/** Follow / Following next to a team or player name. */
export function FollowButton({ kind, refId, label }: { kind: FollowKind; refId: number; label: string }) {
  const push = usePush();
  const following = !!push.device?.follows.some((f) => f.kind === kind && f.refId === refId);
  const hint = `Get a notification when ${label} has a new result`;

  if (push.status === "unconfigured") return null;
  if (push.status === "loading") {
    return <span className={`${pill} bg-white text-transparent ring-1 ring-line`} aria-hidden><BellIcon filled={false} />Follow</span>;
  }
  if (push.status === "unsupported" || push.status === "ios-install" || push.status === "denied") {
    // These need an explanation, which lives on the alerts page.
    return (
      <Link href="/stats/alerts" title={hint} className={`${pill} bg-white text-slate ring-1 ring-line hover:ring-sky`}>
        <BellIcon filled={false} />
        Follow
      </Link>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={() => push.toggleFollow({ kind, refId, label }, !following)}
        disabled={push.busy}
        aria-pressed={following}
        title={following ? `Stop notifications for ${label}` : hint}
        className={`${pill} disabled:opacity-60 ${following ? "bg-sky text-white hover:bg-sky-dark" : "bg-white text-slate ring-1 ring-line hover:ring-sky"}`}
      >
        <BellIcon filled={following} />
        {following ? "Following" : "Follow"}
      </button>
      {push.error && <span className="text-xs text-foul">{push.error}</span>}
    </span>
  );
}
