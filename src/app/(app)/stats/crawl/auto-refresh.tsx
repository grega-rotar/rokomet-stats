"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

const R = 7;
const C = 2 * Math.PI * R;

/**
 * Re-renders the server component every few seconds while the tab is visible, and shows it:
 * a ring that empties until the next update, a spinner while one loads. Click = update now.
 */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);
  const leftRef = useRef(seconds);
  const [loading, startTransition] = useTransition();

  const refresh = useCallback(() => {
    leftRef.current = seconds;
    setLeft(seconds);
    startTransition(() => router.refresh());
  }, [router, seconds]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (leftRef.current <= 1) return refresh();
      leftRef.current -= 1;
      setLeft(leftRef.current);
    }, 1000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={loading}
      aria-label={loading ? "Updating" : `Next update in ${left} seconds. Update now`}
      className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate shadow-sm ring-1 ring-line transition hover:ring-sky disabled:cursor-wait"
    >
      <svg viewBox="0 0 18 18" className={`size-4 -rotate-90 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden>
        <circle cx="9" cy="9" r={R} fill="none" strokeWidth="2.5" className="stroke-line" />
        <circle
          cx="9"
          cy="9"
          r={R}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={loading ? C * 0.7 : C * (1 - left / seconds)}
          className="stroke-sky transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className="tabular-nums">{loading ? "Updating…" : `Update in ${left}s`}</span>
    </button>
  );
}
