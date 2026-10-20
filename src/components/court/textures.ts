// Small procedural textures for the 3D court, drawn on a canvas once (no image files).

import * as THREE from "three";

let wood: THREE.CanvasTexture | null = null;
let soft: THREE.CanvasTexture | null = null;
let tiled: [THREE.Texture, THREE.Texture, THREE.Texture] | null = null;

const PLANK_TILE_M = 5; // one texture tile covers 5 m: 16 planks of ~31 cm

/** The plank texture tiled for [court plane (0..1 UVs over 20 m), goal-area shape (UVs in metres), run-off (40 m)]. */
export function floorTextures(): [THREE.Texture, THREE.Texture, THREE.Texture] {
  if (tiled) return tiled;
  const base = floorTexture();
  const tile = (r: number) => {
    const t = base.clone();
    t.repeat.set(r, r);
    return t;
  };
  tiled = [tile(20 / PLANK_TILE_M), tile(1 / PLANK_TILE_M), tile(40 / PLANK_TILE_M)];
  return tiled;
}

/** Sports-floor planks, near-white so the material colour sets the tone. Planks run along the court (world Z). */
export function floorTexture(): THREE.CanvasTexture {
  if (wood) return wood;
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = "#f4f4f4";
  g.fillRect(0, 0, size, size);
  const planks = 16;
  const pw = size / planks;
  for (let i = 0; i < planks; i++) {
    let y = -rnd() * 200;
    while (y < size) {
      const len = 140 + rnd() * 220;
      const tone = 232 + Math.round(rnd() * 23);
      g.fillStyle = `rgb(${tone},${tone},${tone})`;
      g.fillRect(i * pw, y, pw, len);
      // grain
      for (let k = 0; k < 7; k++) {
        g.strokeStyle = `rgba(0,0,0,${0.025 + rnd() * 0.035})`;
        g.lineWidth = 0.6 + rnd();
        const x = i * pw + 2 + rnd() * (pw - 4);
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(x + rnd() * 3 - 1.5, y + len / 3, x + rnd() * 3 - 1.5, y + (2 * len) / 3, x, y + len);
        g.stroke();
      }
      // joint
      g.fillStyle = "rgba(0,0,0,0.10)";
      g.fillRect(i * pw, y, pw, 1);
      y += len;
    }
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(i * pw, 0, 1, size);
  }
  wood = new THREE.CanvasTexture(c);
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.colorSpace = THREE.SRGBColorSpace;
  wood.anisotropy = 4;
  return wood;
}

/** Radial falloff for contact shadows under players, the ball and the goal. */
export function softShadowTexture(): THREE.CanvasTexture {
  if (soft) return soft;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(20,30,40,0.55)");
  grad.addColorStop(0.45, "rgba(20,30,40,0.28)");
  grad.addColorStop(1, "rgba(20,30,40,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  soft = new THREE.CanvasTexture(c);
  return soft;
}
