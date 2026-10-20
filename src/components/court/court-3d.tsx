"use client";

// The 3D half court. Loaded only through next/dynamic (ssr: false) from court-scene.tsx so three.js stays in its own chunk.

import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import { Canvas, invalidate, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Actor, Scene } from "@/lib/drills/plan";
import { GOAL, arcLine, clamp, courtSegments, fitView, toWorld, type Pt } from "./geometry";
import { beatStarts, frameAt, netHitAt, pathsFor, roleOf, type Path } from "./timeline";
import { floorTextures, softShadowTexture } from "./textures";
import { COLORS, type CourtView, type Playback } from "./playback";

export type Court3DProps = {
  scene: Scene;
  playback: Playback;
  playing: boolean;
  view: CourtView;
  viewNonce: number; // bump to reset the camera to the current view
  tick: number; // bump after moving the playhead while paused
  beat: number;
  onBeat: (beat: number) => void;
  onReady?: () => void;
  interactive?: boolean;
  reducedMotion?: boolean;
  onInteract?: () => void; // first drag / zoom, to hide the hint
};

const LINE_H = 0.012;
const FOV = 38;
const w = (p: Pt, h = LINE_H) => new THREE.Vector3(...toWorld(p[0], p[1], h));

/** Player labels are plain DOM over the canvas, moved every frame: crisp text, no extra React roots. */
class LabelLayer {
  private els = new Map<string, HTMLElement>();
  attach(id: string, el: HTMLElement | null) {
    if (el) this.els.set(id, el);
    else this.els.delete(id);
  }
  place(id: string, x: number, y: number, visible: boolean) {
    const el = this.els.get(id);
    if (el) el.style.transform = visible ? `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)` : "translate(-9999px, 0)";
  }
}

export default function Court3D(props: Court3DProps) {
  const { playing, onReady, scene } = props;
  const [labels] = useState(() => new LabelLayer());
  const [picked, setPicked] = useState<string | null>(null);
  const net = useRef<THREE.LineSegments>(null);
  return (
    <div className="relative h-full w-full">
      <Canvas
        flat
        dpr={[1, 2]}
        frameloop={playing ? "always" : "demand"}
        camera={{ fov: FOV, near: 0.5, far: 200, position: [4, 14, 30] }}
        gl={{ antialias: true, powerPreference: "low-power" }}
        onCreated={() => onReady?.()}
        onPointerMissed={() => setPicked(null)}
      >
        <color attach="background" args={[COLORS.sky]} />
        <fog attach="fog" args={[COLORS.sky, 30, 75]} />
        <hemisphereLight args={["#ffffff", "#b9c4cf", 1.5]} />
        <directionalLight position={[-6, 14, 10]} intensity={1.3} />
        <Floor />
        <Goal net={net} />
        <Players {...props} labels={labels} net={net} picked={picked} onPick={setPicked} />
        <CameraRig {...props} />
      </Canvas>
      <div className="court-vignette pointer-events-none absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {scene.actors.map((a) => (
          <span
            key={a.id}
            ref={(el) => labels.attach(a.id, el)}
            className={`absolute top-0 left-0 flex flex-col items-center gap-1 will-change-transform ${picked === a.id ? "z-10" : ""}`}
            style={{ transform: "translate(-9999px, 0)" }}
          >
            {picked === a.id && (
              <span className="court-tip">
                <strong>{roleOf(a)}</strong>
                {a.focus ? " · focus player" : ""}
              </span>
            )}
            {(a.label || a.focus || picked === a.id) && (
              <span className={`court-label court-label-${a.team}${a.focus ? " court-label-focus" : ""}`}>{a.label ?? "YOU"}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- court ---------- */

const GOAL_AREA = new THREE.Shape(arcLine(6).map(([x, y]) => new THREE.Vector2(y, -x)));
const COURT_W = 20;
const SIX = arcLine(6).map((p) => w(p));
const NINE = arcLine(9).map((p) => w(p));

// Floor layers sit millimetres apart, which z-fights (flickers) while the camera moves. They don't write depth and
// draw first in this fixed order instead; everything standing on the floor still hides them normally.
const FLOOR = { hall: -4, runoff: -3, court: -2, area: -1 };

function Floor() {
  const seg = courtSegments();
  const [court, area, runoff] = floorTextures();
  return (
    <group>
      {/* run-off around the court, fading into the hall */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 10]} renderOrder={FLOOR.runoff}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={COLORS.runoff} map={runoff} roughness={0.85} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 10]} renderOrder={FLOOR.hall}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial color={COLORS.hall} depthWrite={false} />
      </mesh>
      {/* playing surface: 20 x 20 m half court */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 10]} renderOrder={FLOOR.court}>
        <planeGeometry args={[COURT_W, COURT_W]} />
        <meshStandardMaterial color={COLORS.surface} map={court} roughness={0.7} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, 0]} renderOrder={FLOOR.area}>
        <shapeGeometry args={[GOAL_AREA, 48]} />
        <meshStandardMaterial color={COLORS.goalArea} map={area} roughness={0.7} depthWrite={false} />
      </mesh>
      <Line points={[w(seg.goalLine[0]), w(seg.goalLine[1])]} color={COLORS.courtLine} lineWidth={2.4} />
      <Line points={[w(seg.centre[0]), w(seg.centre[1])]} color={COLORS.courtLine} lineWidth={2.2} />
      {seg.sidelines.map((s, i) => <Line key={i} points={[w(s[0]), w(s[1])]} color={COLORS.courtLine} lineWidth={2.2} />)}
      <Line points={SIX} color={COLORS.courtLine} lineWidth={2.2} />
      <Line points={NINE} color={COLORS.courtLine} lineWidth={2} dashed dashSize={0.3} gapSize={0.3} />
      <Line points={[w(seg.seven[0]), w(seg.seven[1])]} color={COLORS.courtLine} lineWidth={2.4} />
      <Line points={[w(seg.four[0]), w(seg.four[1])]} color={COLORS.courtLine} lineWidth={2.4} />
      {/* centre circle hint: the 3 m arc of the centre line's throw-off area is not marked in handball, so nothing else here */}
    </group>
  );
}

/* ---------- goal: striped posts, crossbar, net ---------- */

const POST = 0.08;

function Goal({ net: netRef }: { net: RefObject<THREE.LineSegments | null> }) {
  const stripes = useMemo(() => {
    const out: { pos: [number, number, number]; size: [number, number, number]; red: boolean }[] = [];
    const n = 10; // 20 cm stripes on 2 m posts
    for (const side of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        out.push({ pos: [side * (GOAL.halfWidth + POST / 2), (i + 0.5) * (GOAL.height / n), -POST / 2], size: [POST, GOAL.height / n, POST], red: i % 2 === 0 });
      }
    }
    const m = 16;
    const span = 2 * GOAL.halfWidth + 2 * POST;
    for (let i = 0; i < m; i++) {
      out.push({ pos: [-span / 2 + (i + 0.5) * (span / m), GOAL.height + POST / 2, -POST / 2], size: [span / m, POST, POST], red: i % 2 === 0 });
    }
    return out;
  }, []);
  const net = useMemo(() => netGeometry(), []);
  return (
    <group>
      {stripes.map((s, i) => (
        <mesh key={i} position={s.pos}>
          <boxGeometry args={s.size} />
          <meshStandardMaterial color={s.red ? COLORS.post : "#ffffff"} roughness={0.5} />
        </mesh>
      ))}
      <lineSegments ref={netRef} geometry={net}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.75} />
      </lineSegments>
      <SoftShadow position={[0, 0.006, -0.45]} size={[4.2, 1.8]} opacity={0.7} />
    </group>
  );
}

/** Net as a grid of line segments over five panels: back, roof, two sides, and the floor edge. */
function netGeometry() {
  const hw = GOAL.halfWidth;
  const H = GOAL.height;
  const back = -GOAL.depth;
  const backTop = -0.8;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const quads: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3, number, number][] = [
    [V(-hw, 0, back), V(hw, 0, back), V(hw, H, backTop), V(-hw, H, backTop), 20, 13], // back
    [V(-hw, H, 0), V(hw, H, 0), V(hw, H, backTop), V(-hw, H, backTop), 20, 5], // roof
    [V(-hw, 0, 0), V(-hw, 0, back), V(-hw, H, backTop), V(-hw, H, 0), 6, 13], // left
    [V(hw, 0, 0), V(hw, 0, back), V(hw, H, backTop), V(hw, H, 0), 6, 13], // right
  ];
  const pts: number[] = [];
  const at = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, u: number, v: number) =>
    a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v);
  for (const [a, b, c, d, nu, nv] of quads) {
    for (let i = 0; i <= nu; i++) {
      const p = at(a, b, c, d, i / nu, 0);
      const q = at(a, b, c, d, i / nu, 1);
      pts.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
    for (let j = 0; j <= nv; j++) {
      const p = at(a, b, c, d, 0, j / nv);
      const q = at(a, b, c, d, 1, j / nv);
      pts.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

/* ---------- players, ball, cones, paths ---------- */

function teamColor(a: Actor) {
  return a.team === "attack" ? COLORS.attack : a.team === "defence" ? COLORS.defence : a.team === "keeper" ? COLORS.keeper : COLORS.coach;
}

const tmp = new THREE.Vector3();

type PlayersProps = Court3DProps & { labels: LabelLayer; net: RefObject<THREE.LineSegments | null>; picked: string | null; onPick: (id: string | null) => void };
const TRAIL = 6;

function Players({ scene, playback, onBeat, tick, beat, reducedMotion, labels, net, picked, onPick }: PlayersProps) {
  const starts = useMemo(() => beatStarts(scene), [scene]);
  const paths = useMemo(() => pathsFor(scene, starts), [scene, starts]);
  const actorRefs = useRef<Record<string, THREE.Group | null>>({});
  const ball = useRef<THREE.Group>(null);
  const ballShadow = useRef<THREE.Mesh>(null);
  const focusRing = useRef<THREE.Mesh>(null);
  const lastBeat = useRef(-1);
  const trail = useRef<(THREE.Mesh | null)[]>([]);
  const [history] = useState(() => Array.from({ length: TRAIL + 2 }, () => new THREE.Vector3()));
  const n = scene.beats.length;

  // a new scene starts from the top
  useEffect(() => {
    playback.seek(0, scene.beats.length);
    lastBeat.current = -1;
    invalidate();
  }, [scene, playback]);
  useEffect(() => void invalidate(), [tick, beat]);

  useFrame((state, dt) => {
    playback.advance(dt, n);
    const f = frameAt(scene, Math.min(playback.t, n), starts);
    for (const a of scene.actors) {
      const g = actorRefs.current[a.id];
      const s = f.actors[a.id];
      if (g && s) g.position.set(s.y, s.lift, s.x);
      if (s) {
        tmp.set(s.y, s.lift + 2.05, s.x).project(state.camera);
        labels.place(a.id, ((tmp.x + 1) / 2) * state.size.width, ((1 - tmp.y) / 2) * state.size.height, tmp.z < 1);
      }
    }
    if (ball.current) ball.current.position.set(f.ball.y, f.ball.h, f.ball.x);
    // a short fading trail while the ball is in the air
    const last = history.pop()!;
    history.unshift(last.set(f.ball.y, f.ball.h, f.ball.x));
    const flying = f.ball.holder === null && history[0].distanceTo(history[2]) > 0.02;
    trail.current.forEach((m, i) => {
      if (!m) return;
      m.visible = flying;
      m.position.copy(history[i + 1]);
    });
    // the net gives a little when a goal goes in
    const hit = reducedMotion ? 0 : netHitAt(scene, Math.min(playback.t, n));
    net.current?.scale.set(1 + 0.04 * hit, 1, 1 + 0.3 * hit);
    if (ballShadow.current) {
      ballShadow.current.position.set(f.ball.y, 0.008, f.ball.x);
      const sc = 1 / (1 + f.ball.h * 0.6);
      ballShadow.current.scale.set(sc, sc, sc);
    }
    if (focusRing.current && !reducedMotion) {
      const k = 1 + 0.08 * Math.sin(state.clock.elapsedTime * 3);
      focusRing.current.scale.set(k, k, k);
    }
    const b = Math.min(Math.floor(playback.t), n - 1);
    if (b !== lastBeat.current) {
      lastBeat.current = b;
      onBeat(b);
    }
  });

  return (
    <group>
      {scene.cones.map(([x, y], i) => (
        <group key={i} position={toWorld(x, y)}>
          <mesh position={[0, 0.16, 0]}>
            <coneGeometry args={[0.15, 0.32, 20]} />
            <meshStandardMaterial color={COLORS.cone} roughness={0.6} />
          </mesh>
          <SoftShadow position={[0, 0.006, 0]} size={[0.5, 0.5]} opacity={0.6} />
        </group>
      ))}

      {paths.map((p, i) => <PathMark key={`${scene.beats.length}-${i}`} path={p} active={p.beat === beat} />)}

      {scene.actors.map((a) => (
        <group key={a.id} ref={(g) => void (actorRefs.current[a.id] = g)} position={toWorld(a.x, a.y)}>
          <PlayerFigure actor={a} picked={picked === a.id} onPick={() => onPick(picked === a.id ? null : a.id)} />
          {a.focus && (
            <mesh ref={focusRing} rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
              <ringGeometry args={[0.42, 0.56, 40]} />
              <meshBasicMaterial color={COLORS.focus} transparent opacity={0.9} />
            </mesh>
          )}
        </group>
      ))}

      <mesh ref={ballShadow} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.5, 0.5]} />
        <meshBasicMaterial map={softShadowTexture()} transparent depthWrite={false} />
      </mesh>
      {Array.from({ length: TRAIL }, (_, i) => (
        <mesh key={i} ref={(m) => void (trail.current[i] = m)} visible={false}>
          <sphereGeometry args={[0.15 - i * 0.015, 12, 8]} />
          <meshBasicMaterial color={COLORS.ball} transparent opacity={0.45 - i * 0.07} depthWrite={false} />
        </mesh>
      ))}
      <group ref={ball}>
        <mesh>
          <sphereGeometry args={[0.17, 24, 16]} />
          <meshStandardMaterial color={COLORS.ball} roughness={0.45} />
        </mesh>
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.171, 0.016, 6, 28]} />
          <meshStandardMaterial color={COLORS.shot} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

function SoftShadow({ position, size, opacity }: { position: [number, number, number]; size: [number, number]; opacity: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={position}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={softShadowTexture()} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

function PlayerFigure({ actor, picked, onPick }: { actor: Actor; picked: boolean; onPick: () => void }) {
  const color = teamColor(actor);
  const keeper = actor.team === "keeper";
  const r = keeper ? 0.29 : 0.25;
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta <= 4) onPick(); // a click, not the end of a drag
  };
  return (
    <group
      onClick={click}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <SoftShadow position={[0, 0.007, 0]} size={[1.1, 1.1]} opacity={0.75} />
      <mesh position={[0, 0.2 + r + 0.38, 0]}>
        <capsuleGeometry args={[r, 0.76, 6, 16]} />
        <meshStandardMaterial color={color} roughness={0.55} emissive={picked ? "#ffffff" : "#000000"} emissiveIntensity={picked ? 0.18 : 0} />
      </mesh>
      {/* shorts band */}
      <mesh position={[0, 0.2 + r + 0.02, 0]}>
        <cylinderGeometry args={[r + 0.012, r + 0.012, 0.16, 16]} />
        <meshStandardMaterial color={actor.team === "defence" ? "#1e2b38" : "#ffffff"} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.66, 0]}>
        <sphereGeometry args={[0.16, 20, 14]} />
        <meshStandardMaterial color="#f1d6c2" roughness={0.7} />
      </mesh>
    </group>
  );
}

function PathMark({ path, active }: { path: Path; active: boolean }) {
  const pts = useMemo(() => pathPoints(path), [path]);
  const color = path.kind === "pass" ? COLORS.pass : path.kind === "shot" ? COLORS.shot : COLORS.line;
  const opacity = active ? 1 : 0.45;
  const end = pts[pts.length - 1];
  const prev = pts[Math.max(0, pts.length - 3)];
  const angle = Math.atan2(-(end.x - prev.x), -(end.z - prev.z));
  const arrow = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.32);
    s.lineTo(-0.17, 0);
    s.lineTo(0.17, 0);
    s.closePath();
    return s;
  }, []);
  return (
    <group>
      <Line
        points={pts}
        color={color}
        lineWidth={active ? 3 : 2}
        transparent
        opacity={opacity}
        dashed={path.kind === "pass"}
        dashSize={0.35}
        gapSize={0.25}
      />
      <group position={end} rotation-y={angle}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
          <shapeGeometry args={[arrow]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Floor points for a path, stopping short of the end so the arrowhead sits on it; dribbles zig-zag. */
function pathPoints(p: Path): THREE.Vector3[] {
  const [x0, y0] = p.from;
  const [x1, y1] = p.to;
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const trim = p.kind === "shot" ? 0.1 : 0.45; // stop before the receiver's body
  const startTrim = p.kind === "pass" || p.kind === "shot" ? 0.4 : 0.35;
  const t0 = clamp(startTrim / len, 0, 0.45);
  const t1 = clamp(1 - trim / len, 0.55, 1);
  const n = p.kind === "dribble" ? Math.max(8, Math.round(len * 4)) : 1;
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const wig = p.kind === "dribble" && i > 0 && i < n ? (i % 2 ? 0.12 : -0.12) : 0;
    out.push(w([x0 + (x1 - x0) * t + nx * wig, y0 + (y1 - y0) * t + ny * wig], 0.02));
  }
  return out;
}

/* ---------- camera ---------- */

function viewFor(scene: Scene, view: CourtView, aspect: number) {
  if (view === "top") {
    const tan = Math.tan((FOV / 2) * (Math.PI / 180));
    const halfH = 11.6;
    const height = Math.max(halfH / tan, halfH / (tan * aspect));
    return { target: new THREE.Vector3(0, 0, 9.4), position: new THREE.Vector3(0, height, 9.4 + height * 0.018) };
  }
  // fit the goal and everywhere the players go (feet to label height), from behind and above the attack
  const pts: Pt[] = [[0, -GOAL.halfWidth], [0, GOAL.halfWidth], ...scene.actors.map((a): Pt => [a.x, a.y]), ...scene.cones];
  for (const m of scene.beats.flat()) if (m.type === "run" || m.type === "dribble") pts.push(m.to);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const box = { x0: Math.min(...xs) - 0.6, x1: Math.max(...xs) + 0.8, y0: Math.min(...ys) - 0.8, y1: Math.max(...ys) + 0.8 };
  const target = new THREE.Vector3((box.y0 + box.y1) / 2, 0.8, (box.x0 + box.x1) / 2);
  const dir = new THREE.Vector3(0.18, 0.68, 0.72).normalize();
  const corners = [box.x0, box.x1].flatMap((x) => [box.y0, box.y1].flatMap((y) => [0, 2.4].map((h) => toWorld(x, y, h))));
  const fit = fitView(corners, target.toArray(), dir.toArray(), FOV, aspect);
  target.fromArray([...fit.target]);
  const dist = clamp(fit.distance, 9, 60);
  return { target, position: target.clone().addScaledVector(dir, dist) };
}

function CameraRig({ scene, view, viewNonce, playing, interactive = true, reducedMotion, onInteract }: Court3DProps) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const goal = useRef<{ target: THREE.Vector3; position: THREE.Vector3 } | null>(null);
  const first = useRef(true);
  const aspect = size.width / Math.max(1, size.height);

  useEffect(() => {
    const v = viewFor(scene, view, aspect);
    if (first.current || reducedMotion) {
      first.current = false;
      camera.position.copy(v.position);
      controls.current?.target.copy(v.target);
      camera.lookAt(v.target);
      controls.current?.update();
      goal.current = null;
    } else goal.current = v;
    invalidate();
  }, [scene, view, viewNonce, aspect, camera, reducedMotion]);

  // switching the frameloop to "demand" drops pending frames: keep an unfinished camera move going
  useEffect(() => {
    if (goal.current) invalidate();
  }, [playing]);

  useFrame((_, dt) => {
    const g = goal.current;
    const c = controls.current;
    if (!g || !c) return;
    const k = 1 - Math.exp(-dt * 4.5);
    camera.position.lerp(g.position, k);
    c.target.lerp(g.target, k);
    c.update();
    if (camera.position.distanceTo(g.position) < 0.05 && c.target.distanceTo(g.target) < 0.05) {
      // land exactly on the view, so the orbit angles match it
      camera.position.copy(g.position);
      c.target.copy(g.target);
      c.update();
      goal.current = null;
    } else invalidate();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={interactive}
      enablePan={interactive}
      enableDamping={false}
      minDistance={6}
      maxDistance={55}
      maxPolarAngle={Math.PI / 2 - 0.12}
      onStart={() => {
        goal.current = null;
        onInteract?.();
      }}
    />
  );
}
