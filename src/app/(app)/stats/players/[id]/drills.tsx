"use client";

// The player's training plan: loads the stored plan, starts a new run on request and polls while it runs.
// Spec: specs/drills.md. The plan itself is drawn by plan-view.tsx.

import { useCallback, useEffect, useState } from "react";
import type { DrillsResponse, StoredPlan } from "@/lib/drills/types";
import { CourtSkeleton } from "@/components/court/court-scene";
import { PlanView } from "./plan-view";

const POLL_MS = 3000;
const TYPICAL_RUN_S = 90;

type Load = { status: "loading" } | { status: "ready"; data: DrillsResponse } | { status: "failed"; message: string };

export function Drills({ playerId, seasonId, name }: { playerId: number; seasonId: number; name: string }) {
  const url = `/api/stats/players/${playerId}/drills?season=${seasonId}`;
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const fetchPlan = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(url, { signal, cache: "no-store" });
      if (!res.ok) throw new Error(await errorText(res));
      setLoad({ status: "ready", data: (await res.json()) as DrillsResponse });
    } catch (e) {
      if (signal?.aborted) return;
      setLoad((l) => (l.status === "ready" ? l : { status: "failed", message: (e as Error).message || "Couldn't load the plan." }));
    }
  }, [url]);

  useEffect(() => {
    const ac = new AbortController();
    void fetchPlan(ac.signal);
    return () => ac.abort();
  }, [fetchPlan]);

  const newest = load.status === "ready" ? load.data.plan : null;
  const running = newest?.status === "running";

  // poll while a run is going
  useEffect(() => {
    if (!running) return;
    const ac = new AbortController();
    const t = setTimeout(() => void fetchPlan(ac.signal), POLL_MS);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [running, load, fetchPlan]);

  async function generate() {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error(await errorText(res));
      const body = (await res.json()) as { plan: StoredPlan };
      setLoad((l) => {
        const prev = l.status === "ready" ? l.data : { plan: null };
        const lastDone = prev.plan?.status === "done" ? prev.plan : prev.previous;
        return { status: "ready", data: { plan: body.plan, previous: lastDone } };
      });
    } catch (e) {
      setStartError((e as Error).message || "Couldn't start a new plan.");
    } finally {
      setStarting(false);
    }
  }

  if (load.status === "loading") return <LoadingPlan />;
  if (load.status === "failed")
    return (
      <Notice tone="error" action={<Button onClick={() => { setLoad({ status: "loading" }); void fetchPlan(); }}>Retry</Button>}>
        {load.message}
      </Notice>
    );

  const { previous } = load.data;
  const shown = newest?.status === "done" ? newest : previous?.plan ? previous : null;

  if (!newest)
    return (
      <div className="rise-in flex flex-col items-start gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">A one-week plan for {name}, built from the numbers on this page, with every drill drawn on court.</p>
        <Button primary busy={starting} onClick={generate}>Generate plan</Button>
        {startError && <p className="text-sm text-foul">{startError}</p>}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      {running && <Running since={newest.createdAt} hasPrevious={!!shown} />}
      {newest.status === "error" && (
        <Notice tone="error" action={<Button busy={starting} onClick={generate}>Try again</Button>}>
          Couldn&apos;t write the plan{newest.error ? `: ${newest.error}` : "."}
        </Notice>
      )}
      {startError && <Notice tone="error">{startError}</Notice>}
      {shown?.plan && (
        <div className={`transition-opacity duration-500 ${running ? "opacity-55 saturate-50" : ""}`} aria-busy={running}>
          <PlanView
            key={shown.id}
            plan={shown.plan}
            generatedAt={shown.finishedAt ?? shown.createdAt}
            action={
              <Button busy={starting} disabled={running} onClick={generate} title={running ? "A new plan is being written" : undefined}>
                <RefreshIcon /> Regenerate
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}

async function errorText(res: Response) {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {}
  return `Request failed (${res.status}).`;
}

/* ---------- states ---------- */

function LoadingPlan() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading the training plan">
      <div className="court-shimmer h-6 w-2/3 rounded-lg" />
      <div className="flex gap-3">
        <div className="court-shimmer h-16 flex-1 rounded-xl" />
        <div className="court-shimmer h-16 flex-1 rounded-xl" />
      </div>
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl sm:aspect-[16/10]">
        <CourtSkeleton />
      </div>
    </div>
  );
}

function Running({ since, hasPrevious }: { since: number; hasPrevious: boolean }) {
  const start = new Date(since).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.round((now - start) / 1000));
  const pct = Math.min(95, (secs / TYPICAL_RUN_S) * 100);
  return (
    <div className="rise-in flex items-center gap-4 rounded-xl bg-floor px-4 py-3 ring-1 ring-line" role="status" aria-live="polite">
      <svg viewBox="0 0 48 30" className="h-9 w-14 shrink-0" fill="none" aria-hidden>
        <path d="M2 2h44" stroke="#c5ced8" strokeWidth="1.5" />
        <path d="M6 2a12 12 0 0 0 12 12h12A12 12 0 0 0 42 2" stroke="#c5ced8" strokeWidth="1.5" />
        <path className="arc-draw" d="M6 2a12 12 0 0 0 12 12h12A12 12 0 0 0 42 2" stroke="var(--color-court)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="24" cy="22" r="2" fill="var(--color-sky)" />
      </svg>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-slate">Writing a new plan…</span>
          <span className="text-xs tabular-nums text-muted">{secs}s</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-court transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted">Usually 1–2 minutes.{hasPrevious ? " The current plan stays below until then." : ""}</p>
      </div>
    </div>
  );
}

function Notice({ tone, children, action }: { tone: "error"; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={`rise-in flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ring-1 ${tone === "error" ? "bg-foul/5 text-foul ring-foul/20" : ""}`} role="alert">
      <span className="min-w-0">{children}</span>
      {action}
    </div>
  );
}

export function Button({ children, onClick, primary, busy, disabled, title }: { children: React.ReactNode; onClick: () => void; primary?: boolean; busy?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      title={title}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${primary ? "bg-court text-slate-deep hover:brightness-95" : "bg-white text-slate ring-1 ring-line hover:ring-sky"}`}
    >
      {children}
    </button>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4" />
    </svg>
  );
}
