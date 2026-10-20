"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const REASONS: Record<number, string> = {
  1: "Location access was blocked.",
  2: "Your device couldn't find its location.",
  3: "Finding your location took too long.",
};

/** "Use my location": the browser's geolocation, rounded to ~1 km, then the page reloads with ?lat&lon. */
export function LocateButton() {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });

  function locate() {
    if (!("geolocation" in navigator)) {
      setState({ busy: false, error: "This browser can't share its location." });
      return;
    }
    setState({ busy: true });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude.toFixed(2), lon = p.coords.longitude.toFixed(2);
        router.push(`/stats/near?lat=${lat}&lon=${lon}`);
        setState({ busy: false });
      },
      (e) => setState({ busy: false, error: REASONS[e.code] ?? "Couldn't get your location." }),
      { timeout: 10000, maximumAge: 600000 },
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={locate}
        disabled={state.busy}
        className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold whitespace-nowrap text-slate shadow-sm hover:border-sky hover:text-sky-dark disabled:opacity-60"
      >
        {state.busy ? "Finding you…" : "Use my location"}
      </button>
      {state.error && (
        <p role="status" className="mt-2 text-sm text-foul">
          {state.error} Type your town or postcode instead.
        </p>
      )}
    </div>
  );
}
