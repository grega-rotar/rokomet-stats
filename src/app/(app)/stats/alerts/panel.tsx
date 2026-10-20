"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BallIcon } from "../../../wordmark";
import { usePush, type DeviceFollow, type PushStatus } from "../push";

export type Preview = { title: string; body: string };

const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Svg({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON} aria-hidden>
      <path d={d} />
    </svg>
  );
}

const BELL = "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0";
const BELL_OFF = "M10.3 21a1.94 1.94 0 0 0 3.4 0M18.6 13A17 17 0 0 1 18 8M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.3-5M2 2l20 20";
const TROPHY = "M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM17 6h3v2a3 3 0 01-3 3M7 6H4v2a3 3 0 003 3";
const SEND = "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z";
const CHECK = "M20 6 9 17l-5-5";
const X = "M18 6 6 18M6 6l12 12";
const CLOCK = "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z";
const DEVICE = "M12 18h.01M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z";
const LINK = "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7";

/** "Chrome on Windows", read from the browser, so the user knows which device the settings belong to. */
function deviceName() {
  const ua = navigator.userAgent;
  const browser = "brave" in navigator ? "Brave" : /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "This browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function initials(label: string) {
  return label
    .replace(/^(RK|ŽRK|RD|MRK|ŠD|DRK|KRK|ŽRD)\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${checked ? "bg-sky" : "bg-line"}`}
    >
      <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

const primary = "inline-flex items-center gap-2 rounded-xl bg-court px-5 py-2.5 text-sm font-semibold text-slate-deep shadow-sm transition hover:brightness-95 disabled:opacity-60";
const secondary = "inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate shadow-sm ring-1 ring-line transition hover:ring-sky disabled:opacity-60";
const quiet = "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted transition hover:bg-floor hover:text-foul disabled:opacity-60";

/** The big block at the top: where this device stands, and the one thing to do next. */
function Status({ tile, title, children, actions }: { tile: ReactNode; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-line md:p-6">
      <div className="flex gap-4">
        {tile}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold text-slate">{title}</h2>
          {children && <div className="mt-1 text-sm text-muted">{children}</div>}
          {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </section>
  );
}

function Tile({ d, tone }: { d: string; tone: "on" | "off" | "bad" }) {
  const style = tone === "on" ? "bg-sky text-white" : tone === "bad" ? "bg-foul/10 text-foul" : "bg-floor text-slate";
  return (
    <span className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${style}`}>
      <Svg d={d} className="h-6 w-6" />
      {tone === "on" && <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-court ring-2 ring-white" />}
    </span>
  );
}

// Only the client renders the "on" state (the hook starts in "loading"), so reading navigator here is safe.
function StatusBlock({ push, onTest, tested }: { push: ReturnType<typeof usePush>; onTest: () => void; tested: boolean }) {
  const s: PushStatus = push.status;

  if (s === "loading") {
    return (
      <section className="flex gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-line md:p-6" aria-busy>
        <span className="h-12 w-12 animate-pulse rounded-2xl bg-floor motion-reduce:animate-none" />
        <div className="flex-1 space-y-2.5 pt-1">
          <div className="h-4 w-48 animate-pulse rounded bg-floor motion-reduce:animate-none" />
          <div className="h-3 w-72 max-w-full animate-pulse rounded bg-floor motion-reduce:animate-none" />
        </div>
      </section>
    );
  }
  if (s === "on") {
    return (
      <Status
        tile={<Tile d={BELL} tone="on" />}
        title="Notifications are on"
        actions={
          <>
            <button onClick={onTest} disabled={push.busy} className={secondary}>
              <Svg d={SEND} className="h-4 w-4" />
              Send a test
            </button>
            <button onClick={push.disable} disabled={push.busy} className={quiet}>
              Turn off
            </button>
            {tested && !push.error && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5d7a12]" role="status">
                <Svg d={CHECK} className="h-4 w-4" />
                Sent. Check your notifications.
              </span>
            )}
          </>
        }
      >
        {deviceName()} · the settings below are for this device only.
      </Status>
    );
  }
  if (s === "off") {
    return (
      <Status
        tile={<Tile d={BELL} tone="off" />}
        title="Get results on this device"
        actions={
          <button onClick={push.enable} disabled={push.busy} className={primary}>
            <Svg d={BELL} className="h-4 w-4" />
            {push.busy ? "Turning on…" : "Turn on notifications"}
          </button>
        }
      >
        Your browser asks for permission once. Then pick the leagues, teams and players you want.
      </Status>
    );
  }
  if (s === "denied") {
    return (
      <Status tile={<Tile d={BELL_OFF} tone="bad" />} title="Notifications are blocked">
        This browser doesn&apos;t allow notifications from this site. Click the icon left of the address, allow <strong className="text-ink">Notifications</strong>, then reload the page.
      </Status>
    );
  }
  if (s === "ios-install") {
    return (
      <Status tile={<Tile d={DEVICE} tone="off" />} title="Add Rokomet stats to your home screen first">
        <p>On iPhone and iPad, notifications only work from the home screen (iOS 16.4 or newer).</p>
        <ol className="mt-3 space-y-2 text-ink">
          {["Tap Share in Safari.", "Choose Add to Home Screen.", "Open Rokomet from the home screen and come back here."].map((t, i) => (
            <li key={t} className="flex items-center gap-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-floor font-display text-xs font-bold text-slate">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </Status>
    );
  }
  if (s === "unconfigured") {
    return <Status tile={<Tile d={BELL_OFF} tone="off" />} title="Notifications aren't set up yet">The server has no push keys yet, so nothing can be sent.</Status>;
  }
  return (
    <Status tile={<Tile d={BELL_OFF} tone="off" />} title="This browser can't show notifications">
      Chrome, Edge, Firefox and Safari can. On iPhone, use Safari and add the site to your home screen.
    </Status>
  );
}

function FollowRow({ f, onRemove, busy }: { f: DeviceFollow; onRemove: () => void; busy: boolean }) {
  const team = f.kind === "team";
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-sm font-bold ${team ? "bg-sky/10 text-sky-dark" : "bg-court/20 text-[#5d7a12]"}`} aria-hidden>
        {initials(f.label)}
      </span>
      <div className="min-w-0 flex-1">
        <Link href={`/stats/${team ? "teams" : "players"}/${f.refId}`} className="block truncate font-semibold text-ink hover:text-sky-dark hover:underline">
          {f.label}
        </Link>
        <div className="text-xs text-muted">{team ? "Team · every result" : "Player · result and their goals"}</div>
      </div>
      <button onClick={onRemove} disabled={busy} aria-label={`Stop following ${f.label}`} title="Stop following" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-floor hover:text-foul disabled:opacity-60">
        <Svg d={X} className="h-4 w-4" />
      </button>
    </li>
  );
}

function Settings({ push, topLeagues }: { push: ReturnType<typeof usePush>; topLeagues: string[] }) {
  const d = push.device!;
  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-line">
      <h2 className="px-5 pt-5 font-display text-[0.95rem] font-bold text-slate md:px-6">What you get</h2>

      <div className="flex items-center gap-4 px-5 py-4 md:px-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-floor text-slate">
          <Svg d={TROPHY} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink">All top-league results</div>
          <div className="text-sm text-muted">{topLeagues.length ? topLeagues.join(" · ") : "The top men's and women's leagues"}</div>
        </div>
        <Switch checked={d.allTop} onChange={push.setAllTop} disabled={push.busy} label="All top-league results" />
      </div>

      <div className="border-t border-line px-5 pt-4 pb-3 md:px-6">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-ink">Teams and players you follow</h3>
          {d.follows.length > 0 && <span className="text-xs text-muted">{d.follows.length}</span>}
        </div>
        {d.follows.length ? (
          <ul className="divide-y divide-line">
            {d.follows.map((f) => (
              <FollowRow key={`${f.kind}-${f.refId}`} f={f} busy={push.busy} onRemove={() => push.toggleFollow(f, false)} />
            ))}
          </ul>
        ) : (
          <div className="my-3 rounded-xl border border-dashed border-line px-4 py-6 text-center">
            <div className="text-sm font-semibold text-ink">You don&apos;t follow anyone yet</div>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Open a team or player and tap <strong className="text-ink">Follow</strong>. You get their results even with top-league results off.
            </p>
            <Link href="/stats" className={`${secondary} mt-4`}>
              Browse teams
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

/** A notification as the phone shows it, with the latest real result. */
function PreviewCard({ preview }: { preview: Preview }) {
  return (
    <section>
      <h2 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-muted">What a push looks like</h2>
      <div className="flex gap-3 rounded-2xl bg-white p-3.5 shadow-md ring-1 ring-line">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky text-white">
          <BallIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 text-sm">
          <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
            <span className="font-semibold text-slate">Rokomet stats</span>
            <span>now</span>
          </div>
          <div className="mt-0.5 font-semibold leading-snug text-ink">{preview.title}</div>
          <div className="text-muted">{preview.body}</div>
        </div>
      </div>
    </section>
  );
}

function Notes() {
  const items: [string, string][] = [
    [CLOCK, "Pushes come when the stats update, every few hours, so one can arrive a while after the final whistle."],
    [LINK, "Tap a push to open the team, player or league."],
    [DEVICE, "Settings are per device. Turn notifications on on each phone or computer."],
  ];
  return (
    <ul className="space-y-3 text-sm text-muted">
      {items.map(([d, t]) => (
        <li key={t} className="flex gap-2.5">
          <Svg d={d} className="mt-0.5 h-4 w-4 shrink-0 text-slate/60" />
          {t}
        </li>
      ))}
    </ul>
  );
}

export function AlertsPanel({ topLeagues, preview }: { topLeagues: string[]; preview: Preview }) {
  const push = usePush();
  const [tested, setTested] = useState(false);
  const on = push.status === "on" && push.device;

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <StatusBlock push={push} tested={tested} onTest={async () => setTested(!!(await push.test()))} />
        {push.error && (
          <p className="-mt-3 rounded-xl bg-foul/10 px-4 py-3 text-sm text-foul" role="alert">
            {push.error}
          </p>
        )}
        {on && <Settings push={push} topLeagues={topLeagues} />}
      </div>
      <aside className="flex flex-col gap-6 lg:sticky lg:top-6">
        <PreviewCard preview={preview} />
        <Notes />
      </aside>
    </div>
  );
}
