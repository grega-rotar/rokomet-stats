// Shared between the court controls (DOM) and the 3D scene (useFrame): the playhead lives in this object, not in React
// state, so the animation runs at 60 fps without re-rendering the page.

/** The playhead, in beats. Mutated through methods only, from event handlers and the render loop. */
export class Playback {
  t = 0;
  playing = false;
  speed = 1;
  configure(playing: boolean, speed: number) {
    this.playing = playing;
    this.speed = speed;
  }
  /** Moves the playhead by dt seconds when playing, looping after a short hold on the final state. */
  advance(dt: number, beats: number) {
    if (!this.playing) return;
    this.t += (Math.min(dt, 0.1) * this.speed) / BEAT_SECONDS;
    if (this.t > beats + HOLD_BEATS) this.t = 0;
  }
  seek(t: number, beats: number) {
    this.t = Math.max(0, Math.min(beats, t));
  }
}
export type CourtView = "play" | "top";

export const BEAT_SECONDS = 1.4;
export const HOLD_BEATS = 0.9; // pause on the final state before looping

export const COLORS = {
  attack: "#36a9e0",
  attackDark: "#1f8fc6",
  defence: "#2c3e50",
  keeper: "#94c11e",
  coach: "#9aa5b1",
  focus: "#94c11e",
  ball: "#ffc93c",
  cone: "#f28c28",
  line: "#2c3e50",
  pass: "#0b84d0",
  shot: "#d64545",
  surface: "#d9b07a", // maple sports floor
  goalArea: "#4fa6d9", // sky goal area
  runoff: "#4d6a80", // slate-blue run-off
  hall: "#c7d1db",
  sky: "#d3dce4",
  courtLine: "#ffffff",
  ground: "#e4e9ef",
  post: "#d64545",
} as const;
