"use client";

import { useState } from "react";
import { GoalView } from "./goal-view";
import { ACCENT, cells, heatColor, type GoalMode, type Miss, type ZoneCount } from "./zones";

type Side = { zones: ZoneCount[]; miss: Miss };

/** Team page: where a team scores and concedes, one goal with a toggle, compared with the league. */
export function TeamGoal({ attack, defence, league }: { attack: Side; defence: Side; league: ZoneCount[] }) {
  const [mode, setMode] = useState<GoalMode>("scored");
  const side = mode === "scored" ? attack : defence;
  const data = { mode, zones: side.zones, miss: side.miss, avg: league };
  const { total, shots } = cells(data);
  const missed = side.miss.over + side.miss.left + side.miss.right;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full bg-floor p-1 text-sm font-semibold" role="tablist">
          {(["scored", "conceded"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 transition ${mode === m ? "bg-white text-slate shadow-sm" : "text-muted hover:text-slate"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: ACCENT[m] }} />
              {m === "scored" ? "Scored" : "Conceded"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>fewer</span>
          <span
            className="h-2 w-24 rounded-full"
            style={{ background: `linear-gradient(90deg, ${[0, 0.3, 0.6, 0.8, 1].map((t) => heatColor(mode, t)).join(",")})` }}
          />
          <span>more goals</span>
        </div>
      </div>
      <div className="mt-3">
        <GoalView data={data} height={360} />
      </div>
      <p className="mt-2 text-center text-xs text-muted">
        <span className="tabular-nums">
          {total} goals from {shots} shots on target with a zone · {missed} missed
        </span>{" "}
        · shooter&apos;s view · 7m not included · hover or tap a zone to compare with the league
      </p>
    </div>
  );
}
