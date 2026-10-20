"use client";

// <CourtScene scene={...} />: an animated handball half court for any Scene (drill plans, chat code blocks, ...).
// The 3D part (three.js) loads on demand; without WebGL it falls back to a static SVG coach's board.

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Scene } from "@/lib/drills/plan";
import { Court2D } from "./court-2d";
import { describeBeat, describeScene } from "./timeline";
import { Playback, type CourtView } from "./playback";

const Court3D = dynamic(() => import("./court-3d"), { ssr: false, loading: () => null });

export type CourtSceneProps = {
  scene: Scene;
  /** Start playing on mount (default true). Ignored when the user prefers reduced motion. */
  autoplay?: boolean;
  /** CSS height of the court, e.g. 420 or "60vh". Default: a 4:3 box (16:10 from sm up). */
  height?: number | string;
  /** Show the playback and camera controls (default true). */
  controls?: boolean;
  /** Smaller controls and no orbiting: for inline use (chat). */
  compact?: boolean;
  /** Screen-reader description; defaults to a summary of the scene. */
  label?: string;
  className?: string;
};

const SPEEDS = [0.5, 1, 2] as const;

export function CourtScene({ scene, autoplay = true, height, controls = true, compact = false, label, className = "" }: CourtSceneProps) {
  const webgl = useWebGL();
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [userPlaying, setUserPlaying] = useState<boolean | null>(null);
  const playing = userPlaying ?? (autoplay && !reduced);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [beat, setBeat] = useState(0);
  const [view, setView] = useState<CourtView>("play");
  const [viewNonce, setViewNonce] = useState(0);
  const [tick, setTick] = useState(0);
  const [interacted, setInteracted] = useState(false);
  const [playback] = useState(() => new Playback());
  const n = scene.beats.length;
  const aria = label ?? describeScene(scene);

  useEffect(() => {
    playback.configure(playing, speed);
  }, [playback, playing, speed]);

  const seek = useCallback((t: number) => {
    playback.seek(t, n);
    setBeat(Math.min(Math.floor(playback.t), n - 1));
    setTick((k) => k + 1);
  }, [playback, n]);
  const step = (dir: 1 | -1) => {
    setUserPlaying(false);
    const t = playback.t;
    seek(dir === 1 ? Math.floor(t) + 1 : Number.isInteger(t) ? t - 1 : Math.floor(t));
  };

  const sizeStyle = useMemo(() => (height !== undefined ? { height } : undefined), [height]);
  const use3D = webgl === true && !failed;

  return (
    <div className={`court-scene flex flex-col gap-2 ${className}`}>
      <div
        role="img"
        aria-label={aria}
        style={sizeStyle}
        className={`relative w-full overflow-hidden rounded-2xl bg-[#d3dce4] ring-1 ring-line ${height === undefined ? (compact ? "aspect-[4/3]" : "aspect-square sm:aspect-[16/10]") : ""}`}
      >
        {webgl === false || failed ? (
          <Court2D scene={scene} label={aria} />
        ) : (
          <>
            {!ready && <CourtSkeleton />}
            {use3D && (
              <div className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${ready ? "opacity-100" : "opacity-0"}`}>
                <Boundary onError={() => setFailed(true)}>
                  <Court3D
                    scene={scene}
                    playback={playback}
                    playing={playing}
                    view={view}
                    viewNonce={viewNonce}
                    tick={tick}
                    beat={beat}
                    onBeat={setBeat}
                    onReady={() => setReady(true)}
                    interactive={!compact}
                    reducedMotion={reduced}
                    onInteract={() => setInteracted(true)}
                  />
                </Boundary>
              </div>
            )}
          </>
        )}
        {use3D && <Legend compact={compact} />}
        {use3D && ready && !compact && (
          <div
            className={`pointer-events-none absolute right-2 bottom-2 flex items-center gap-1.5 rounded-full bg-slate-deep/75 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur transition-opacity duration-700 ${interacted ? "opacity-0" : "opacity-100"}`}
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
            </svg>
            <span className="pointer-coarse:hidden">Drag to rotate · scroll to zoom</span>
            <span className="hidden pointer-coarse:inline">Drag to rotate · pinch to zoom</span>
          </div>
        )}
      </div>

      {controls && use3D && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="Playback">
          <div className="flex items-center gap-1">
            <IconButton label={playing ? "Pause" : "Play"} onClick={() => setUserPlaying(!playing)} primary>
              {playing ? <path d="M7 5h3v14H7zM14 5h3v14h-3z" /> : <path d="M8 5.5v13l11-6.5z" />}
            </IconButton>
            {!compact && (
              <>
                <IconButton label="Restart" onClick={() => { seek(0); setUserPlaying(true); }}>
                  <path d="M12 5a7 7 0 1 1-7 7h2a5 5 0 1 0 5-5v3L7.5 6 12 2z" />
                </IconButton>
                <IconButton label="Previous step" onClick={() => step(-1)}>
                  <path d="M6 5h2v14H6zM19 5v14l-10-7z" />
                </IconButton>
                <IconButton label="Next step" onClick={() => step(1)}>
                  <path d="M16 5h2v14h-2zM5 5v14l10-7z" />
                </IconButton>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5" role="group" aria-label="Steps">
            {scene.beats.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Step ${i + 1} of ${n}: ${describeBeat(scene, i)}`}
                aria-current={i === beat ? "step" : undefined}
                onClick={() => { setUserPlaying(false); seek(i); }}
                className="group relative grid h-6 place-items-center px-0.5"
              >
                <span className="court-tip pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden>
                  <strong>{i + 1}</strong> {describeBeat(scene, i)}
                </span>
                <span className={`block h-2 rounded-full transition-all duration-300 motion-reduce:transition-none ${i === beat ? "w-6 bg-sky" : i < beat ? "w-2 bg-sky/45" : "w-2 bg-line group-hover:bg-muted/50"}`} />
              </button>
            ))}
            <span className="ml-1 text-xs tabular-nums text-muted">{beat + 1}/{n}</span>
          </div>

          {!compact && (
            <div className="ml-auto flex items-center gap-2">
              <div className="flex rounded-full bg-floor p-0.5 ring-1 ring-line" role="group" aria-label="Speed">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={speed === s}
                    onClick={() => setSpeed(s)}
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors ${speed === s ? "bg-white text-slate shadow-sm" : "text-muted hover:text-slate"}`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={view === "top"}
                onClick={() => setView(view === "top" ? "play" : "top")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors ${view === "top" ? "bg-slate text-white ring-slate" : "bg-white text-slate ring-line hover:ring-sky"}`}
              >
                Top view
              </button>
              <IconButton label="Reset view" onClick={() => setViewNonce((k) => k + 1)}>
                <path d="M12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-6-6v3l4-4-4-4z" />
              </IconButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IconButton({ label, onClick, children, primary }: { label: string; onClick: () => void; children: ReactNode; primary?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-full transition-colors ${primary ? "bg-slate text-white hover:bg-slate-deep" : "text-slate hover:bg-floor"}`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>{children}</svg>
    </button>
  );
}

function Legend({ compact }: { compact: boolean }) {
  if (compact) return null;
  const items = [
    ["Run", <line key="r" x1="1" y1="5" x2="17" y2="5" stroke="#2c3e50" strokeWidth="2" />],
    ["Pass", <line key="p" x1="1" y1="5" x2="17" y2="5" stroke="#1f8fc6" strokeWidth="2" strokeDasharray="4 3" />],
    ["Shot", <line key="s" x1="1" y1="5" x2="17" y2="5" stroke="#d64545" strokeWidth="2" />],
  ] as const;
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex gap-2.5 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-slate shadow-sm backdrop-blur max-sm:hidden" aria-hidden>
      {items.map(([name, el]) => (
        <span key={name} className="flex items-center gap-1">
          <svg width="18" height="10" viewBox="0 0 18 10">{el}</svg>
          {name}
        </span>
      ))}
    </div>
  );
}

/** Loading state: the court's lines in light strokes with a shimmer, no spinner. */
export function CourtSkeleton() {
  return (
    <div className="court-shimmer absolute inset-0 grid place-items-center" aria-hidden>
      <svg viewBox="-1 -1 22 14" className="h-3/4 w-3/4 opacity-60" fill="none" stroke="#c5ced8" strokeWidth="0.12">
        <path d="M0 1h20M3 1a6 6 0 0 0 6 6h2a6 6 0 0 0 6-6M0.5 1a9 9 0 0 0 9 9h1a9 9 0 0 0 9-9" strokeDasharray="0.4 0.3" />
        <rect x="8.5" y="0" width="3" height="1" />
      </svg>
    </div>
  );
}

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.broken ? null : this.props.children;
  }
}

/* ---------- environment hooks ---------- */

let webglCache: boolean | undefined;
function hasWebGL(): boolean {
  if (webglCache === undefined) {
    try {
      const c = document.createElement("canvas");
      webglCache = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webglCache = false;
    }
  }
  return webglCache;
}
const noop = () => () => {};
/** true / false on the client, null while server rendering. */
export function useWebGL(): boolean | null {
  return useSyncExternalStore(noop, hasWebGL, () => null);
}

const REDUCED = "(prefers-reduced-motion: reduce)";
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(REDUCED);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}
