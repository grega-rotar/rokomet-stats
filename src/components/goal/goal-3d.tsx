"use client";

import { Line, OrbitControls, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { arcLine, toWorld } from "@/components/court/geometry";
import { COLORS } from "@/components/court/playback";
import { floorTexture, softShadowTexture } from "@/components/court/textures";
import { cells, heatColor, heatInk, pct, zoneName, type Cell, type GoalData } from "./zones";

// The goal in 3D, seen from the shooter: 3 × 2 m opening, striped posts, a net, the nine zones as heat tiles on the
// goal plane. World units are metres, Y up, goal line at Z = 0, the shooter at +Z (as src/components/court/geometry.ts).
// The court module draws its own goal (court-3d.tsx, not exported); this one adds tiles, labels, hover and misses.
// The floor reuses the court's colours and textures but is built here: court-3d.tsx doesn't export its Floor.
// Labels are plain DOM over the canvas, moved each frame by projecting their 3D anchor (no drei <Html> roots).

const W = 3;
const H = 2;
const POST = 0.08;
const DEPTH = 0.9;
const TILE_W = W / 3;
const TILE_H = H / 3;
const FOV = 36;
const TARGET = new THREE.Vector3(0, 1.05, 0);
const MISS_X = W / 2 + 0.55;
const MISS_Y = H + 0.4;
const AZIMUTH = -0.15; // from the shooter's front-left
const ELEVATION = 0.17;
const PLANK_M = 5;
const GOAL_AREA = new THREE.Shape(arcLine(6).map(([x, y]) => new THREE.Vector2(y, -x)));
const SIX = arcLine(6).map(([x, y]) => new THREE.Vector3(...toWorld(x, y, 0.006)));
const BACKDROP = `linear-gradient(180deg, #f6f8fa 0%, #e3e9ef 52%, ${COLORS.hall} 100%)`;

const orbit = (az: number, el: number, dist: number) =>
  new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist).add(TARGET);

/** Camera position that fits the goal plus the miss labels at this aspect ratio. */
function home(aspect: number): THREE.Vector3 {
  const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
  const dist = 1.06 * Math.max(3.3 / 2 / tan, (MISS_X + 0.45) / (tan * aspect));
  return orbit(AZIMUTH, ELEVATION, dist);
}

const tileCentre = (c: Cell) => new THREE.Vector3((c.col - 1) * TILE_W, H - (c.row + 0.5) * TILE_H, 0.05);

/** Red/white bar from a to b, 20 cm stripes like a real handball goal. */
function StripedBar({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const n = Math.max(1, Math.round(len / 0.2));
  const dir = b.clone().sub(a).normalize();
  const vertical = Math.abs(dir.y) > 0.5;
  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={a.clone().add(dir.clone().multiplyScalar(((i + 0.5) * len) / n))}>
          <boxGeometry args={vertical ? [POST, len / n, POST] : [len / n, POST, POST]} />
          <meshStandardMaterial color={i % 2 ? "#ffffff" : COLORS.post} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

function Net() {
  const geo = useMemo(() => {
    const pts: number[] = [];
    const seg = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => pts.push(x1, y1, z1, x2, y2, z2);
    const step = 0.15;
    const back = (y: number) => -DEPTH - 0.1 * (1 - y / H); // a little deeper at the bottom
    for (let x = -W / 2; x <= W / 2 + 1e-6; x += step) {
      seg(x, 0, back(0), x, H, back(H));
      seg(x, H, 0, x, H, back(H));
    }
    for (let y = 0; y <= H + 1e-6; y += step) {
      seg(-W / 2, y, back(y), W / 2, y, back(y));
      for (const x of [-W / 2, W / 2]) seg(x, y, 0, x, y, back(y));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={COLORS.line} transparent opacity={0.3} />
    </lineSegments>
  );
}

/** Sports floor as the court draws it: maple court, sky goal area, slate run-off behind the goal line. */
function Floor() {
  const [court, area, runoff, shadow] = useMemo(() => {
    const base = floorTexture();
    const tile = (n: number) => {
      const t = base.clone();
      t.repeat.set(n, n);
      return t;
    };
    return [tile(20 / PLANK_M), tile(1 / PLANK_M), tile(40 / PLANK_M), softShadowTexture()];
  }, []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 10]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={COLORS.runoff} map={runoff} roughness={0.85} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 10]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color={COLORS.surface} map={court} roughness={0.7} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.003, 0]}>
        <shapeGeometry args={[GOAL_AREA, 48]} />
        <meshStandardMaterial color={COLORS.goalArea} map={area} roughness={0.7} />
      </mesh>
      <Line points={[[-10, 0.006, 0.025], [10, 0.006, 0.025]]} color={COLORS.courtLine} lineWidth={2.4} />
      <Line points={SIX} color={COLORS.courtLine} lineWidth={2.2} />
      {/* hall wall behind the goal: keeps the backdrop light instead of a field of run-off */}
      <mesh position={[0, 4, -2.2]}>
        <planeGeometry args={[60, 8]} />
        <meshBasicMaterial color="#e9eef3" />
      </mesh>
      <mesh position={[0, 0.45, -2.19]}>
        <planeGeometry args={[60, 0.9]} />
        <meshBasicMaterial color="#d3dde6" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.008, -0.4]}>
        <planeGeometry args={[4.2, 1.9]} />
        <meshBasicMaterial map={shadow} transparent opacity={0.75} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Tile({ c, mode, active, onHover, onTap }: { c: Cell; mode: GoalData["mode"]; active: boolean; onHover: (z: Cell | null) => void; onTap: (z: Cell) => void }) {
  return (
    <RoundedBox
      position={[(c.col - 1) * TILE_W, H - (c.row + 0.5) * TILE_H, active ? 0.07 : 0.02]}
      args={[TILE_W - 0.07, TILE_H - 0.07, 0.03]}
      radius={0.06}
      smoothness={3}
      onPointerOver={(e) => (e.stopPropagation(), e.nativeEvent.pointerType === "mouse" && onHover(c))}
      onPointerOut={() => onHover(null)}
      onClick={(e) => (e.stopPropagation(), onTap(c))}
    >
      <meshBasicMaterial color={heatColor(mode, c.heat)} transparent opacity={active ? 1 : 0.94} />
    </RoundedBox>
  );
}

type Anchor = { key: string; at: THREE.Vector3; tip?: { beside: THREE.Vector3; below: THREE.Vector3; side: "left" | "right" } };

/**
 * Moves the DOM labels to their anchors after every rendered frame. The tooltip goes above the goal over its tile's
 * column; when that leaves the window, beside the goal at its row, else under the goal line. Never over other tiles.
 */
function Projector({ anchors, els }: { anchors: Anchor[]; els: Map<string, HTMLElement> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  const gl = useThree((s) => s.gl);
  useFrame(({ camera, size }) => {
    const r = gl.domElement.getBoundingClientRect();
    const px = (p: THREE.Vector3) => (v.copy(p).project(camera), [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height]);
    for (const a of anchors) {
      const el = els.get(a.key);
      if (!el) continue;
      let [x, y] = px(a.at);
      let t = "translate(-50%, -50%)";
      if (a.tip) {
        const [w, h] = [el.offsetWidth, el.offsetHeight];
        const [bx, by] = px(a.tip.beside);
        let side: string = a.tip.side;
        if (r.top + y - h - 14 > 64) side = "above"; // clear of a sticky header
        else if (side === "right" ? r.left + bx + 14 + w < window.innerWidth - 8 : r.left + bx - 14 - w > 8) [x, y] = [bx, by];
        else {
          side = "below";
          [x, y] = px(a.tip.below);
        }
        el.dataset.side = side;
        t = {
          above: "translate(-50%, calc(-100% - 12px))",
          below: "translate(-50%, 12px)",
          left: "translate(calc(-100% - 12px), -50%)",
          right: "translate(12px, -50%)",
        }[side]!;
      }
      el.style.transform = `translate(${x}px, ${y}px) ${t}`;
      el.style.opacity = "1";
    }
  });
  return null;
}

/** Eases the camera in from the right once (unless reduced motion), refits on resize. */
function Rig({ still }: { still: boolean }) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const invalidate = useThree((s) => s.invalidate);
  const t = useRef(still ? 1 : 0);
  const fitted = useRef(0);
  useFrame((_, dt) => {
    const end = home(aspect);
    if (t.current < 1) {
      t.current = Math.min(1, t.current + dt / 1.8);
      const e = t.current < 0.5 ? 4 * t.current ** 3 : 1 - (-2 * t.current + 2) ** 3 / 2;
      const dist = end.distanceTo(TARGET);
      camera.position.copy(orbit(AZIMUTH + 0.9 * (1 - e), ELEVATION + 0.35 * (1 - e), dist * (1 + 0.35 * (1 - e))));
      camera.lookAt(TARGET);
      invalidate();
    } else if (fitted.current !== aspect) {
      camera.position.copy(end);
      camera.lookAt(TARGET);
      invalidate();
    }
    if (t.current >= 1) fitted.current = aspect;
  });
  return null;
}

function Tip({ c, mode }: { c: Cell; mode: GoalData["mode"] }) {
  const diff = c.avgShare === null ? null : Math.round((c.share - c.avgShare) * 100);
  const arrow = "absolute size-2.5 rotate-45 bg-slate-deep";
  return (
    <div className="relative w-56 rounded-xl bg-slate-deep px-3 py-2 text-xs leading-snug text-white shadow-lg">
      <span className={`${arrow} -bottom-1 left-1/2 -ml-1 hidden group-data-[side=above]:block`} />
      <span className={`${arrow} -top-1 left-1/2 -ml-1 hidden group-data-[side=below]:block`} />
      <span className={`${arrow} top-1/2 -right-1 -mt-1 hidden group-data-[side=left]:block`} />
      <span className={`${arrow} top-1/2 -left-1 -mt-1 hidden group-data-[side=right]:block`} />
      <div className="font-display font-bold capitalize">{zoneName(c.zone)}</div>
      <div className="mt-1 tabular-nums">
        {c.goals} {mode === "scored" ? "scored" : "conceded"} from {c.shots} on target
        {c.rate !== null && <span className="text-white/70"> · {pct(c.rate)}</span>}
      </div>
      <div className="tabular-nums text-white/70">{pct(c.share)} of their zone goals</div>
      {diff !== null && (
        <div className="mt-1 tabular-nums">
          League {pct(c.avgShare!)}{" "}
          <span className="text-white/70">
            ({diff > 0 ? "+" : ""}
            {diff} pts)
          </span>
        </div>
      )}
    </div>
  );
}

const MISSES = [
  ["over", new THREE.Vector3(0, MISS_Y, 0)],
  ["left", new THREE.Vector3(-MISS_X, H / 2, 0)],
  ["right", new THREE.Vector3(MISS_X, H / 2, 0)],
] as const;

export default function Goal3D({ data, still = false }: { data: GoalData; still?: boolean }) {
  const { cells: cs } = useMemo(() => cells(data), [data]);
  const [hover, setHover] = useState<Cell | null>(null);
  const [tapped, setTapped] = useState<Cell | null>(null);
  const active = cs.find((c) => c.zone === (hover ?? tapped)?.zone) ?? null;
  const [els] = useState(() => new Map<string, HTMLElement>()); // label elements, read by Projector
  const box = useRef<HTMLDivElement>(null);

  // a tapped tooltip closes on a tap anywhere else on the page (taps on the canvas: onPointerMissed)
  useEffect(() => {
    if (!tapped) return;
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setTapped(null);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [tapped]);

  const anchors = useMemo<Anchor[]>(() => {
    const out: Anchor[] = [
      ...cs.map((c) => ({ key: c.zone, at: tileCentre(c) })),
      ...(data.miss ? MISSES.map(([k, at]) => ({ key: k, at })) : []),
    ];
    if (active) {
      const side = active.col === 0 ? "left" : "right";
      const x = (active.col - 1) * TILE_W;
      const beside = new THREE.Vector3(side === "left" ? -W / 2 - POST - 0.05 : W / 2 + POST + 0.05, tileCentre(active).y, 0.05);
      out.push({ key: "tip", at: new THREE.Vector3(x, H + POST + 0.02, 0.05), tip: { beside, below: new THREE.Vector3(x, 0, 0.3), side } });
    }
    return out;
  }, [cs, data.miss, active]);
  const bind = (key: string) => (el: HTMLElement | null) => {
    if (el) els.set(key, el);
    else els.delete(key);
  };
  const place = "pointer-events-none absolute top-0 left-0 opacity-0 select-none";
  return (
    <div ref={box} className="relative isolate h-full" onPointerLeave={() => setHover(null)}>
      <Canvas
        frameloop="demand"
        flat
        dpr={[1, 2]}
        camera={{ position: home(2).toArray(), fov: FOV, near: 0.1, far: 80 }}
        gl={{ antialias: true, powerPreference: "low-power" }}
        onPointerMissed={() => setTapped(null)}
        style={{ cursor: hover ? "pointer" : undefined, background: BACKDROP, borderRadius: 12 }}
      >
        <fog attach="fog" args={[COLORS.hall, 9, 30]} />
        <hemisphereLight args={["#ffffff", "#c8d2dc", 1.5]} />
        <directionalLight position={[-4, 7, 6]} intensity={1.5} />
        <Floor />
        <Net />
        <StripedBar from={[-W / 2 - POST / 2, 0, 0]} to={[-W / 2 - POST / 2, H + POST, 0]} />
        <StripedBar from={[W / 2 + POST / 2, 0, 0]} to={[W / 2 + POST / 2, H + POST, 0]} />
        <StripedBar from={[-W / 2 - POST, H + POST / 2, 0]} to={[W / 2 + POST, H + POST / 2, 0]} />
        {cs.map((c) => (
          <Tile
            key={c.zone}
            c={c}
            mode={data.mode}
            active={active?.zone === c.zone}
            onHover={setHover}
            onTap={(z) => setTapped((t) => (t?.zone === z.zone ? null : z))}
          />
        ))}
        <Rig still={still} />
        <OrbitControls
          makeDefault
          target={TARGET}
          enablePan={false}
          enableZoom={false}
          minAzimuthAngle={-0.9}
          maxAzimuthAngle={0.6}
          minPolarAngle={0.95}
          maxPolarAngle={1.6}
          rotateSpeed={0.5}
        />
        <Projector anchors={anchors} els={els} />
      </Canvas>

      {cs.map((c) => (
        <div key={c.zone} ref={bind(c.zone)} className={`${place} text-center leading-none tabular-nums`} style={{ color: heatInk(c.heat) }}>
          <div className="font-display text-[15px] font-extrabold whitespace-nowrap">
            {c.goals}
            <span className="text-[11px] font-semibold opacity-70">/{c.shots}</span>
          </div>
          <div className="mt-0.5 text-[10px] font-semibold opacity-75">{pct(c.share)}</div>
        </div>
      ))}
      {data.miss &&
        MISSES.map(([k]) => (
          <div key={k} ref={bind(k)} className={place}>
            <div className="flex flex-col items-center rounded-xl bg-white/95 px-2 py-1 leading-tight shadow-sm ring-1 ring-line">
              <span className="font-display text-sm font-extrabold tabular-nums text-slate">{data.miss![k]}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-muted">{k}</span>
            </div>
          </div>
        ))}
      {active && (
        <div ref={bind("tip")} className={`${place} group z-20`} data-side="above">
          <Tip c={active} mode={data.mode} />
        </div>
      )}
    </div>
  );
}
