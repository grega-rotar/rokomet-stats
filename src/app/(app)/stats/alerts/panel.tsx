"use client";

import Link from "next/link";
import { useState } from "react";
import { usePush, type PushStatus } from "../push";
import { Card, Empty } from "../ui";

const STATUS: Record<PushStatus, { text: string; tone: string }> = {
  loading: { text: "Checking…", tone: "bg-line text-slate" },
  unsupported: { text: "Not available", tone: "bg-line text-slate" },
  "ios-install": { text: "Needs home screen", tone: "bg-line text-slate" },
  unconfigured: { text: "Not set up", tone: "bg-line text-slate" },
  denied: { text: "Blocked", tone: "bg-foul text-white" },
  off: { text: "Off", tone: "bg-line text-slate" },
  on: { text: "On", tone: "bg-court text-slate-deep" },
};

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${checked ? "bg-sky" : "bg-line"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

const primary = "rounded-xl bg-court px-4 py-2 text-sm font-semibold text-slate-deep shadow-sm hover:brightness-95 disabled:opacity-60";
const secondary = "rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate shadow-sm ring-1 ring-line hover:ring-sky disabled:opacity-60";

export function AlertsPanel({ topLeagues }: { topLeagues: string[] }) {
  const push = usePush();
  const [tested, setTested] = useState(false);
  const s = STATUS[push.status];

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <Card title="Notifications on this device" aside={<span className={`rounded-full px-2.5 py-0.5 font-semibold ${s.tone}`}>{s.text}</span>}>
        {push.status === "loading" && <div className="h-16 animate-pulse rounded-xl bg-floor motion-reduce:animate-none" />}

        {push.status === "unsupported" && (
          <Empty>This browser can&apos;t show push notifications. Chrome, Edge, Firefox and Safari can.</Empty>
        )}

        {push.status === "ios-install" && (
          <div className="text-sm">
            <p className="font-semibold text-ink">Add Rokomet stats to your home screen first</p>
            <p className="mt-1 text-muted">On iPhone and iPad, notifications only work for sites added to the home screen (iOS 16.4 or newer).</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-ink">
              <li>Tap the Share button in Safari.</li>
              <li>Choose <strong>Add to Home Screen</strong>.</li>
              <li>Open Rokomet from the home screen and come back to Alerts.</li>
            </ol>
          </div>
        )}

        {push.status === "unconfigured" && <Empty>Push isn&apos;t set up on this server yet.</Empty>}

        {push.status === "denied" && (
          <div className="text-sm">
            <p className="font-semibold text-ink">Notifications are blocked for this site</p>
            <p className="mt-1 text-muted">Allow notifications for this site in your browser&apos;s settings, then reload this page.</p>
          </div>
        )}

        {push.status === "off" && (
          <div>
            <button onClick={push.enable} disabled={push.busy} className={primary}>
              {push.busy ? "Turning on…" : "Turn on notifications"}
            </button>
            <p className="mt-2 text-xs text-muted">Your browser asks for permission. You choose below which results you get.</p>
          </div>
        )}

        {push.status === "on" && push.device && (
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div className="text-sm">
                <div className="font-semibold text-ink">All top-league results</div>
                <div className="text-muted">
                  {topLeagues.length ? `Every result in ${topLeagues.join(" and ")}.` : "Every result in the top leagues."} Off: only teams and players you follow.
                </div>
              </div>
              <Switch checked={push.device.allTop} onChange={push.setAllTop} disabled={push.busy} label="All top-league results" />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <button onClick={async () => setTested(!!(await push.test()))} disabled={push.busy} className={secondary}>
                Send test notification
              </button>
              <button onClick={push.disable} disabled={push.busy} className={secondary}>
                Turn off on this device
              </button>
            </div>
            {tested && !push.error && <p className="-mt-2 text-xs text-muted">Sent. It should show up in a few seconds.</p>}
          </div>
        )}

        {push.error && <p className="mt-3 text-sm text-foul">{push.error}</p>}
        <p className="mt-5 text-xs text-muted">
          A push comes when the stats update, every few hours, so it can arrive a while after the final whistle.
        </p>
      </Card>

      {push.status === "on" && push.device && (
        <Card title="Following" aside={push.device.follows.length ? `${push.device.follows.length}` : undefined}>
          {push.device.follows.length ? (
            <ul className="text-sm">
              {push.device.follows.map((f) => (
                <li key={`${f.kind}-${f.refId}`} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
                  <span className="w-14 rounded-md bg-floor py-0.5 text-center text-xs font-semibold text-slate">{f.kind === "team" ? "Team" : "Player"}</span>
                  <Link href={`/stats/${f.kind === "team" ? "teams" : "players"}/${f.refId}`} className="min-w-0 flex-1 truncate font-semibold text-ink hover:text-sky-dark hover:underline">
                    {f.label}
                  </Link>
                  <button
                    onClick={() => push.toggleFollow(f, false)}
                    disabled={push.busy}
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted hover:bg-floor hover:text-foul disabled:opacity-60"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing yet. Use the Follow button on a team or player page.</Empty>
          )}
        </Card>
      )}
    </div>
  );
}
