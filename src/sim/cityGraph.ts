// RTS-30 living-city Pass 1 — the AMBIENT MOVEMENT GRAPHS, precomputed ONCE from the drawn ground
// layer (the worldgen tile classes). Pure & Phaser-free: a SIDEWALK graph (pedestrians) + a ROAD-LANE
// graph (vehicles). Each is a per-tile 4-bit adjacency mask (which orthogonal neighbours share the kind)
// plus a flat node list (spawn candidates). No per-frame graph cost — the scene reads these directly.

import type { WorldLayout } from './worldgen';

/** Step directions in bit order N,E,S,W — bit d of an adjacency mask ⇒ STEP_DIRS[d] neighbour is same-kind. */
export const STEP_DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export interface CityGraph {
  size: number;
  /** Per-tile 4-bit mask of sidewalk neighbours (0 for non-sidewalk tiles). */
  sidewalkAdj: Uint8Array;
  /** Per-tile 4-bit mask of road (avenue/street) neighbours (0 for non-road tiles). */
  roadAdj: Uint8Array;
  /** Tile indices that are sidewalk — pedestrian spawn nodes. */
  sidewalkNodes: number[];
  /** Tile indices that are road — vehicle spawn nodes. */
  roadNodes: number[];
}

/** Build both ambient graphs from the world's tile classification. O(map), called once per map. */
export function buildCityGraph(layout: WorldLayout): CityGraph {
  const size = layout.size;
  const tiles = layout.tiles;
  const sidewalkAdj = new Uint8Array(size * size);
  const roadAdj = new Uint8Array(size * size);
  const sidewalkNodes: number[] = [];
  const roadNodes: number[] = [];
  const isSide = (gx: number, gy: number): boolean => gx >= 0 && gy >= 0 && gx < size && gy < size && tiles[gy * size + gx] === 'sidewalk';
  const isRoad = (gx: number, gy: number): boolean => {
    if (gx < 0 || gy < 0 || gx >= size || gy >= size) return false;
    const k = tiles[gy * size + gx];
    return k === 'avenue' || k === 'street';
  };
  for (let gy = 0; gy < size; gy++) for (let gx = 0; gx < size; gx++) {
    const i = gy * size + gx;
    const k = tiles[i];
    if (k === 'sidewalk') {
      sidewalkNodes.push(i);
      let m = 0;
      for (let d = 0; d < 4; d++) { const [dx, dy] = STEP_DIRS[d]; if (isSide(gx + dx, gy + dy)) m |= 1 << d; }
      sidewalkAdj[i] = m;
    } else if (k === 'avenue' || k === 'street') {
      roadNodes.push(i);
      let m = 0;
      for (let d = 0; d < 4; d++) { const [dx, dy] = STEP_DIRS[d]; if (isRoad(gx + dx, gy + dy)) m |= 1 << d; }
      roadAdj[i] = m;
    }
  }
  return { size, sidewalkAdj, roadAdj, sidewalkNodes, roadNodes };
}

/** Pick the next step direction for a wandering agent at a graph node. Prefers to CONTINUE straight
 * (keeps traffic flowing), avoids an immediate U-turn unless the node is a dead-end, and otherwise
 * turns at random. `fromDir` is the agent's incoming heading bit (−1 if none yet); `roll` ∈ [0,1).
 * Returns the chosen direction bit 0..3, or −1 if the node has no exits. Pure + deterministic. */
export function pickStep(adjMask: number, fromDir: number, roll: number): number {
  if (adjMask === 0) return -1;
  const reverse = fromDir < 0 ? -1 : (fromDir + 2) % 4;
  // continue straight 60% of the time when that exit exists and isn't a U-turn.
  if (fromDir >= 0 && fromDir !== reverse && (adjMask & (1 << fromDir)) !== 0 && roll < 0.6) return fromDir;
  // else choose uniformly among the non-reverse exits (fall back to the U-turn at a dead-end).
  let count = 0;
  for (let d = 0; d < 4; d++) if ((adjMask & (1 << d)) !== 0 && d !== reverse) count++;
  if (count === 0) return reverse >= 0 && (adjMask & (1 << reverse)) !== 0 ? reverse : firstExit(adjMask);
  let pick = Math.floor(roll * count) % count;
  for (let d = 0; d < 4; d++) {
    if ((adjMask & (1 << d)) === 0 || d === reverse) continue;
    if (pick === 0) return d;
    pick--;
  }
  return firstExit(adjMask);
}

function firstExit(adjMask: number): number {
  for (let d = 0; d < 4; d++) if ((adjMask & (1 << d)) !== 0) return d;
  return -1;
}

// ── "city liveliness" setting (Low/Med/High) — the single perf dial, default MED ───────────────
export type Liveliness = 'low' | 'med' | 'high';
export interface LifeCaps { peds: number; cars: number; }

/** On-screen moving-agent caps at CLOSE zoom, per liveliness tier. MID halves them; FAR culls all. */
export const LIVELINESS_CAPS: Record<Liveliness, LifeCaps> = {
  low: { peds: 15, cars: 4 },
  med: { peds: 30, cars: 8 },
  high: { peds: 45, cars: 12 },
};

/** Parse ?life=low|med|high from a query string (default 'med'). Pure + testable. */
export function parseLiveliness(search: string): Liveliness {
  if (!search) return 'med';
  let v: string | null = null;
  try { v = new URLSearchParams(search).get('life'); } catch { v = null; }
  return v === 'low' || v === 'high' ? v : 'med';
}
