// Top-down coach's board in SVG: the fallback when WebGL is missing. Static: start positions plus every path,
// numbered by beat. Same coordinates as the 3D court (geometry.ts), goal at the top.

import type { Scene } from "@/lib/drills/plan";
import { GOAL, SVG_PAD, SVG_VIEW, arcLine, courtSegments, toSvg, type Pt } from "./geometry";
import { pathsFor, type Path } from "./timeline";
import { COLORS } from "./playback";

const pt = (p: Pt) => toSvg(p[0], p[1]).map((n) => n.toFixed(3)).join(",");
const line = (pts: readonly Pt[]) => pts.map(pt).join(" ");

export function Court2D({ scene, label, className = "" }: { scene: Scene; label: string; className?: string }) {
  const seg = courtSegments();
  const paths = pathsFor(scene);
  const holder = scene.actors.find((a) => a.id === scene.ball);
  const [gx0] = toSvg(0, -GOAL.halfWidth);
  // crop to where the action is (at least the 9m line), so the board isn't half empty
  const far = Math.max(...scene.actors.map((a) => a.x), ...scene.beats.flat().map((m) => (m.type === "run" || m.type === "dribble" ? m.to[0] : 0)));
  const h = Math.min(SVG_VIEW.h, Math.max(13, far + 2.5) + SVG_PAD);
  return (
    <svg viewBox={`${SVG_VIEW.x} ${SVG_VIEW.y} ${SVG_VIEW.w} ${h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label} className={`block h-full w-full overflow-hidden ${className}`}>
      <defs>
        {(["line", "pass", "shot"] as const).map((k) => (
          <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={COLORS[k]} />
          </marker>
        ))}
      </defs>
      <rect x={SVG_VIEW.x} y={SVG_VIEW.y} width={SVG_VIEW.w} height={SVG_VIEW.h} fill={COLORS.runoff} />
      <rect x={0} y={0} width={20} height={20} fill={COLORS.surface} />
      <polygon points={line(arcLine(6))} fill={COLORS.goalArea} />
      <g fill="none" stroke={COLORS.courtLine} strokeWidth={0.08} strokeLinecap="round">
        <polyline points={line(seg.goalLine)} strokeWidth={0.1} />
        <polyline points={line(seg.centre)} />
        {seg.sidelines.map((s, i) => <polyline key={i} points={line(s)} />)}
        <polyline points={line(arcLine(6))} />
        <polyline points={line(arcLine(9))} strokeDasharray="0.3 0.3" strokeWidth={0.07} />
        <polyline points={line(seg.seven)} strokeWidth={0.1} />
        <polyline points={line(seg.four)} strokeWidth={0.1} />
      </g>
      {/* goal behind the line */}
      <rect x={gx0} y={-GOAL.depth} width={GOAL.halfWidth * 2} height={GOAL.depth} fill="#ffffff" opacity={0.25} />
      <rect x={gx0 - 0.08} y={-0.08} width={GOAL.halfWidth * 2 + 0.16} height={0.08} fill={COLORS.post} />

      {scene.cones.map((c, i) => {
        const [x, y] = toSvg(c[0], c[1]);
        return <path key={i} d={`M${x},${y - 0.22} L${x + 0.2},${y + 0.16} L${x - 0.2},${y + 0.16} z`} fill={COLORS.cone} />;
      })}
      {paths.map((p, i) => <PathLine key={i} p={p} />)}
      {scene.actors.map((a) => {
        const [x, y] = toSvg(a.x, a.y);
        const fill = a.team === "attack" ? COLORS.attack : a.team === "defence" ? COLORS.defence : a.team === "keeper" ? COLORS.keeper : COLORS.coach;
        return (
          <g key={a.id}>
            {a.focus && <circle cx={x} cy={y} r={0.62} fill="none" stroke={COLORS.focus} strokeWidth={0.14} />}
            <circle cx={x} cy={y} r={0.42} fill={fill} stroke="#fff" strokeWidth={0.07} />
            {a.label && (
              <text x={x} y={y} dy="0.14" textAnchor="middle" fontSize={0.42} fontWeight={700} fill={a.team === "keeper" ? COLORS.line : "#fff"} style={{ fontFamily: "var(--font-display)" }}>
                {a.label}
              </text>
            )}
          </g>
        );
      })}
      {holder && (() => {
        const [x, y] = toSvg(holder.x, holder.y);
        return <circle cx={x + 0.42} cy={y - 0.32} r={0.18} fill={COLORS.ball} stroke={COLORS.shot} strokeWidth={0.04} />;
      })()}
    </svg>
  );
}

function PathLine({ p }: { p: Path }) {
  const [x0, y0] = toSvg(p.from[0], p.from[1]);
  const [x1, y1] = toSvg(p.to[0], p.to[1]);
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const s = p.kind === "shot" ? 0.1 : 0.55;
  const a = [x0 + ux * 0.5, y0 + uy * 0.5];
  const b = [x1 - ux * s, y1 - uy * s];
  const kind = p.kind === "pass" ? "pass" : p.kind === "shot" ? "shot" : "line";
  let d = `M${a[0]},${a[1]} L${b[0]},${b[1]}`;
  if (p.kind === "dribble") {
    const n = Math.max(6, Math.round(len * 3));
    d = `M${a[0]},${a[1]}`;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const wig = i < n ? (i % 2 ? 0.14 : -0.14) : 0;
      d += ` L${a[0] + (b[0] - a[0]) * t - uy * wig},${a[1] + (b[1] - a[1]) * t + ux * wig}`;
    }
  }
  const mx = (a[0] + b[0]) / 2 - uy * 0.45;
  const my = (a[1] + b[1]) / 2 + ux * 0.45;
  return (
    <g>
      <path d={d} fill="none" stroke={COLORS[kind]} strokeWidth={0.09} strokeDasharray={p.kind === "pass" ? "0.35 0.22" : undefined} markerEnd={`url(#arrow-${kind})`} />
      <circle cx={mx} cy={my} r={0.3} fill="#fff" stroke={COLORS[kind]} strokeWidth={0.05} />
      <text x={mx} y={my} dy="0.12" textAnchor="middle" fontSize={0.34} fontWeight={700} fill={COLORS[kind]}>{p.beat + 1}</text>
    </g>
  );
}
