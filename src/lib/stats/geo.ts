// Distances and the Slovenia outline for "near you" (/stats/near). Pure functions, no I/O.
import outline from "./slovenia.json"; // Natural Earth 1:10m admin 0 (public domain), every 2nd point

export type LatLon = { lat: number; lon: number };

/** Straight-line distance in km. */
export function km(a: LatLon, b: LatLon): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Lowercase without diacritics: "Škofja Loka" -> "skofja loka". */
export function fold(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const RING = outline.geometry.coordinates[0] as [number, number][];
const COS = Math.cos((46.1 * Math.PI) / 180);
const lons = RING.map((p) => p[0]), lats = RING.map((p) => p[1]);
const BOX = { minLon: Math.min(...lons), maxLon: Math.max(...lons), minLat: Math.min(...lats), maxLat: Math.max(...lats) };
export const MAP_WIDTH = 600;
const SCALE = MAP_WIDTH / ((BOX.maxLon - BOX.minLon) * COS);
export const MAP_HEIGHT = Math.round((BOX.maxLat - BOX.minLat) * SCALE);

/** Equirectangular projection into the map's viewBox (0 0 MAP_WIDTH MAP_HEIGHT). */
export function project(p: LatLon): { x: number; y: number } {
  return { x: (p.lon - BOX.minLon) * COS * SCALE, y: (BOX.maxLat - p.lat) * SCALE };
}

/** True when a point is inside (or within ~10 km of) Slovenia's bounding box. */
export function inSlovenia(p: LatLon): boolean {
  return p.lat > BOX.minLat - 0.1 && p.lat < BOX.maxLat + 0.1 && p.lon > BOX.minLon - 0.15 && p.lon < BOX.maxLon + 0.15;
}

export const SLOVENIA_PATH =
  RING.map(([lon, lat], i) => {
    const { x, y } = project({ lat, lon });
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join("") + "Z";
