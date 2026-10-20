"use client";

// A finished drill plan: headline + focus numbers, the week, the drills, and the selected drill on court.

import { useEffect, useState, type ReactNode } from "react";
import type { Drill, DrillPlan } from "@/lib/drills/plan";
import { CourtScene, useReducedMotion } from "@/components/court/court-scene";

type Metric = Drill["metric"];
const METRIC: Record<Metric, { label: string; dot: string; chip: string; text: string; ring: string }> = {
  field: { label: "Field shots", dot: "bg-sky", chip: "bg-sky/12 text-sky-dark", text: "text-sky-dark", ring: "ring-sky/45" },
  sevens: { label: "7m", dot: "bg-court", chip: "bg-court/18 text-[#5b7a10]", text: "text-[#5b7a10]", ring: "ring-court/55" },
  gpm: { label: "Goals / match", dot: "bg-slate", chip: "bg-slate/10 text-slate", text: "text-slate", ring: "ring-slate/35" },
  two: { label: "2 min", dot: "bg-foul", chip: "bg-foul/10 text-foul", text: "text-foul", ring: "ring-foul/40" },
  general: { label: "General", dot: "bg-muted", chip: "bg-muted/12 text-muted", text: "text-muted", ring: "ring-muted/40" },
};
// rows fill the full width for 1-4 items
const COLS: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function PlanView({ plan, generatedAt, action }: { plan: DrillPlan; generatedAt: number; action: ReactNode }) {
  const [selected, setSelected] = useState(plan.drills[0].id);
  const index = Math.max(0, plan.drills.findIndex((d) => d.id === selected));
  const drill = plan.drills[index];
  const number = (id: string) => plan.drills.findIndex((d) => d.id === id) + 1;

  return (
    <div className="rise-in flex flex-col gap-5">
      {/* header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <p className="min-w-0 font-display text-base font-semibold leading-snug text-slate sm:text-lg">{plan.headline}</p>
          <div className="flex shrink-0 items-center gap-3 sm:-mt-1.5">
            <Ago at={generatedAt} />
            {action}
          </div>
        </div>
        {plan.smallSample && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <span className="inline-block size-1.5 rounded-full bg-muted" aria-hidden />
            Small sample: a general plan for the position, not a proven weakness.
          </p>
        )}
        <ul className={`grid gap-3 ${COLS[plan.focus.length] ?? COLS[3]}`}>
          {plan.focus.map((f, i) => <FocusChip key={i} f={f} delay={i * 120} />)}
        </ul>
      </div>

      {/* week */}
      <section aria-label="Week">
        <ol className="grid grid-cols-7 gap-1 sm:gap-3">
          {DAYS.map((day) => {
            const ids = plan.week.find((w) => w.day === day)?.drills ?? [];
            return (
              <li
                key={day}
                className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl py-2 ring-1 sm:min-h-[4.5rem] ${ids.length ? "bg-floor ring-line" : "bg-floor/40 ring-line/50"}`}
              >
                <span className={`text-[10px] font-semibold uppercase tracking-wide sm:text-[11px] ${ids.length ? "text-slate" : "text-muted/60"}`}>{day}</span>
                <span className="flex min-h-6 flex-wrap items-center justify-center gap-1 sm:gap-2">
                  {ids.length ? (
                    ids.map((id) => {
                      const d = plan.drills.find((x) => x.id === id);
                      if (!d) return null;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSelected(id)}
                          aria-label={`${day}: drill ${number(id)}, ${d.title}`}
                          aria-pressed={id === selected}
                          className={`grid size-5 place-items-center rounded-full font-display text-[10px] font-bold transition sm:size-6 sm:text-[11px] ${
                            id === selected
                              ? `${METRIC[d.metric].dot} text-white ring-2 ring-offset-1 ring-offset-floor ${METRIC[d.metric].ring}`
                              : `bg-white ring-1 ring-line ${METRIC[d.metric].text} hover:ring-2 ${METRIC[d.metric].ring}`
                          }`}
                        >
                          {number(id)}
                        </button>
                      );
                    })
                  ) : (
                    <span className="h-0.5 w-3 rounded-full bg-line" aria-label="Rest" />
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* drills */}
      <div role="tablist" aria-label="Drills" className={`grid gap-3 ${COLS[plan.drills.length] ?? COLS[4]}`}>
        {plan.drills.map((d, i) => {
          const on = d.id === drill.id;
          return (
            <button
              key={d.id}
              type="button"
              role="tab"
              id={`tab-${d.id}`}
              aria-selected={on}
              aria-controls="drill-panel"
              onClick={() => setSelected(d.id)}
              className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${on ? "bg-slate text-white shadow-md" : "bg-white ring-1 ring-line hover:ring-sky"}`}
            >
              <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full font-display text-xs font-bold text-white ${METRIC[d.metric].dot}`}>{i + 1}</span>
              <span className="min-w-0">
                <span className={`block text-sm font-semibold leading-tight ${on ? "text-white" : "text-ink"}`}>{d.title}</span>
                <span className={`mt-0.5 block text-xs tabular-nums ${on ? "text-white/70" : "text-muted"}`}>{d.minutes} min · {d.reps}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div id="drill-panel" role="tabpanel" aria-labelledby={`tab-${drill.id}`} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <CourtScene scene={drill.scene} label={`${drill.title}: animated court diagram. The steps are listed next to it.`} />
        <DrillDetail key={drill.id} drill={drill} n={index + 1} />
      </div>
    </div>
  );
}

function DrillDetail({ drill, n }: { drill: Drill; n: number }) {
  const m = METRIC[drill.metric];
  return (
    <div className="rise-in flex min-w-0 flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.chip}`}>{m.label}</span>
          <span className="text-xs text-muted">Drill {n}</span>
        </div>
        <h3 className="mt-1.5 font-display text-lg font-bold leading-tight text-slate">{drill.title}</h3>
      </div>

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-line ring-1 ring-line">
        <Meta label="Time" icon={<path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />}>{drill.minutes} min</Meta>
        <Meta label="Reps" icon={<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />}>{drill.reps}</Meta>
        <Meta label="Players" icon={<path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18.5 14a6.5 6.5 0 0 1 3 6" />}>{drill.players}</Meta>
      </dl>

      <ol className="flex flex-col gap-2">
        {drill.steps.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-snug text-ink">
            <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-floor font-display text-[11px] font-bold text-slate ring-1 ring-line">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>

      {drill.cues.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Coaching cues">
          {drill.cues.map((c) => (
            <li key={c} className="rounded-full bg-sky/10 px-2.5 py-1 text-xs font-semibold text-sky-dark">{c}</li>
          ))}
        </ul>
      )}

      {drill.equipment.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="font-semibold text-slate">Kit</span>
          {drill.equipment.map((e, i) => <span key={i}>{i ? "· " : ""}{e}</span>)}
        </p>
      )}

      <div className="rounded-xl border-l-4 border-court bg-court/10 px-3.5 py-2.5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[#5b7a10]">Measure</div>
        <p className="mt-0.5 text-sm font-medium leading-snug text-slate">{drill.measure}</p>
      </div>
    </div>
  );
}

function Meta({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-white px-2.5 py-2">
      <dt className="flex items-center gap-1 text-[11px] font-medium text-muted">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{icon}</svg>
        {label}
      </dt>
      <dd className="text-sm leading-tight font-semibold tabular-nums text-slate">{children}</dd>
    </div>
  );
}

/* ---------- focus chips: now → target, numbers count up ---------- */

type Stat = { big: string; rest: string; value: number | null; pct: number | null };

/** "41/98 · 42%" → big "42%", rest "41/98"; "≥ 48% in 4 weeks" → big "≥ 48%", rest "in 4 weeks". */
export function parseStat(s: string): Stat {
  const pctMatch = s.match(/([≥≤<>~]\s*)?(\d+(?:[.,]\d+)?)\s*%/);
  const numMatch = pctMatch ?? s.match(/([≥≤<>~]\s*)?(\d+(?:[.,]\d+)?(?:\/\d+)?)/);
  if (!numMatch) return { big: s, rest: "", value: null, pct: null };
  const big = numMatch[0].trim();
  const rest = s.replace(numMatch[0], "").replace(/^[\s·,]+|[\s·,]+$/g, "").replace(/\s*·\s*·\s*/g, " · ");
  const value = /\//.test(numMatch[2]) ? null : Number(numMatch[2].replace(",", "."));
  return { big, rest, value, pct: pctMatch ? Number(pctMatch[2].replace(",", ".")) : null };
}

function FocusChip({ f, delay }: { f: DrillPlan["focus"][number]; delay: number }) {
  const m = METRIC[f.metric];
  const now = parseStat(f.now);
  const target = parseStat(f.target);
  const reduced = useReducedMotion();
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 150 + delay);
    return () => clearTimeout(t);
  }, [delay]);
  const shown = on || reduced;
  const bar = now.pct !== null && target.pct !== null;
  return (
    <li className="rise-in flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3 ring-1 ring-line" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-1.5">
        <span className={`size-2 rounded-full ${m.dot}`} aria-hidden />
        <span className="truncate text-xs font-semibold text-slate">{f.label}</span>
      </div>
      <div className="flex items-end gap-2.5">
        <div className="min-w-0">
          <div className="font-display text-2xl font-extrabold leading-none tabular-nums text-slate">
            <CountUp text={now.big} value={now.value} run={shown} animate={!reduced} />
          </div>
          <div className="mt-1 truncate text-[11px] text-muted">{now.rest ? `now · ${now.rest}` : "now"}</div>
        </div>
        <svg viewBox="0 0 24 12" className={`mb-4 h-3 w-6 shrink-0 text-muted transition duration-700 ${shown ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="to">
          <path d="M2 6h18M15 1.5 20 6l-5 4.5" />
        </svg>
        <div className={`min-w-0 transition duration-700 ${shown ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"}`} style={{ transitionDelay: reduced ? "0ms" : "250ms" }}>
          <div className={`font-display text-2xl font-extrabold leading-none tabular-nums ${m.text}`}>{target.big}</div>
          <div className="mt-1 truncate text-[11px] text-muted">{target.rest ? `target · ${target.rest}` : "target"}</div>
        </div>
      </div>
      {bar && (
        <div className="relative h-1.5 rounded-full bg-floor ring-1 ring-line" aria-hidden>
          <div className={`absolute inset-y-0 left-0 rounded-full ${m.dot} transition-[width] duration-1000 ease-out`} style={{ width: `${shown ? Math.min(100, now.pct!) : 0}%` }} />
          <div className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-slate" style={{ left: `${Math.min(100, target.pct!)}%` }} />
        </div>
      )}
    </li>
  );
}

/** Counts the number inside `text` up from 0 once `run` turns true (or shows it as is when `animate` is off). */
function CountUp({ text, value, run, animate }: { text: string; value: number | null; run: boolean; animate: boolean }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (!run || !animate || value === null) return;
    const t0 = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const p = Math.min(1, (t - t0) / 800);
      setK(1 - (1 - p) ** 3);
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [run, animate, value]);
  if (!animate || value === null) return <>{text}</>;
  const decimals = String(value).split(".")[1]?.length ?? 0;
  return <>{text.replace(/\d+(?:[.,]\d+)?/, (value * k).toFixed(decimals))}</>;
}

function Ago({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(at).getTime();
  return (
    <time dateTime={new Date(ms).toISOString()} title={new Date(ms).toLocaleString()} className="whitespace-nowrap text-xs text-muted">
      {timeAgo(now - ms)}
    </time>
  );
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function timeAgo(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 45) return "just now";
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["minute", 60], ["hour", 3600], ["day", 86400], ["week", 604800], ["month", 2592000], ["year", 31536000]];
  let unit: [Intl.RelativeTimeFormatUnit, number] = steps[0];
  for (const st of steps) if (s >= st[1]) unit = st;
  return rtf.format(-Math.round(s / unit[1]), unit[0]);
}
