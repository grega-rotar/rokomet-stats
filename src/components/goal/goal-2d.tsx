import { cells, heatColor, heatInk, pct, zoneName, type GoalData } from "./zones";

const stripes = (deg: number) => `repeating-linear-gradient(${deg}deg, #d64545 0 18px, #fff 18px 36px)`;

/** Missed shots: a count in a pill, placed over or beside the goal. */
export function MissPill({ n, label }: { n: number; label: string }) {
  return (
    <span
      className="inline-flex flex-col items-center rounded-xl bg-white px-2 py-1 text-center leading-tight shadow-sm ring-1 ring-line"
      title={`${n} shots missed ${label}`}
    >
      <span className="font-display text-sm font-extrabold tabular-nums text-slate">{n}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</span>
    </span>
  );
}

/** The goal seen from the shooter, flat: striped frame, nine heat tiles, misses around it. Works without WebGL. */
export function Goal2D({ data, className = "" }: { data: GoalData; className?: string }) {
  const { cells: cs, total } = cells(data);
  const verb = data.mode === "scored" ? "scored" : "conceded";
  return (
    <div className={`mx-auto w-full max-w-md ${className}`}>
      {data.miss && (
        <div className="mb-2 flex justify-center">
          <MissPill n={data.miss.over} label="over" />
        </div>
      )}
      <div className="flex items-center gap-2">
        {data.miss && <MissPill n={data.miss.left} label="left" />}
        <div
          className="min-w-0 flex-1 rounded-t-md p-[7px] pb-0"
          style={{
            background: `${stripes(90)} top / 100% 7px no-repeat, ${stripes(180)} left / 7px 100% no-repeat, ${stripes(180)} right / 7px 100% no-repeat`,
          }}
        >
          <div className="grid grid-cols-3 gap-1 bg-white p-1">
            {cs.map((c) => (
              <div
                key={c.zone}
                className="flex aspect-[3/2] flex-col items-center justify-center rounded-lg"
                style={{ background: heatColor(data.mode, c.heat), color: heatInk(c.heat) }}
                title={`${zoneName(c.zone)}: ${c.goals} ${verb} from ${c.shots} on target${c.rate !== null ? ` (${pct(c.rate)})` : ""}${c.avgShare !== null ? ` · ${pct(c.share)} of goals, league ${pct(c.avgShare)}` : ""}`}
              >
                <span className="font-display text-base font-extrabold tabular-nums sm:text-lg">
                  {c.goals}
                  <span className="text-xs font-semibold opacity-70">/{c.shots}</span>
                </span>
                <span className="text-[11px] font-semibold tabular-nums opacity-75">{total ? pct(c.share) : ""}</span>
              </div>
            ))}
          </div>
        </div>
        {data.miss && <MissPill n={data.miss.right} label="right" />}
      </div>
      <div className="h-1 rounded-full bg-slate" />
    </div>
  );
}
