// RTS-2 — grid pathfinding. Pure & deterministic; imports NO Phaser, so it is unit-tested by
// asserting the returned tile lists directly. The movement system (movement.ts) routes units
// with these paths; the Phaser scene only renders the result.
//
// Algorithm: A* on an 8-CONNECTED grid. Cardinal steps cost 1, diagonal steps cost √2 (true
// Euclidean length), so the shortest path travels DIAGONALLY across open ground instead of
// stairstepping N/E/S/W (RTS-8way). A diagonal step is only allowed when BOTH shared orthogonal
// tiles are walkable — the "don't clip a building corner / don't squeeze between two buildings"
// rule — so 8-way movement never cuts through solid geometry. Deterministic: the A* open set is a
// binary min-heap ordered by (f, then g, then gx, then gy), a TOTAL order over distinct tiles, so
// the same (start, goal, grid) always yields the byte-identical path. The mover (advanceUnit) already
// travels toward each waypoint by Euclidean distance, so a diagonal waypoint is walked as a true
// diagonal at the correct √2 travel time — no mover change is needed.

import type { GridPos } from './iso';
import { tileNeighbors8, tileEquals } from './iso';

/** Cost of a diagonal step relative to a cardinal step (its true Euclidean length). */
export const DIAGONAL_COST = Math.SQRT2;

/** A walkability model: a bounded grid plus a blocked-tile test. */
export interface NavGrid {
  cols: number;
  rows: number;
  /** True if a tile cannot be entered (a building, water, an enemy wall, …). */
  isBlocked(gx: number, gy: number): boolean;
}

function key(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

/**
 * Build a NavGrid of the given size whose blocked tiles are exactly `blocked`. Coordinates
 * are snapped to integers. Out-of-bounds tiles are implicitly un-enterable (see findPath).
 */
export function makeGrid(cols: number, rows: number, blocked: Iterable<GridPos> = []): NavGrid {
  const wall = new Set<string>();
  for (const b of blocked) wall.add(key(Math.round(b.gx), Math.round(b.gy)));
  return {
    cols,
    rows,
    isBlocked: (gx, gy) => wall.has(key(gx, gy)),
  };
}

function walkable(grid: NavGrid, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= grid.cols || gy >= grid.rows) return false;
  return !grid.isBlocked(gx, gy);
}

/**
 * Whether a step from (gx,gy) to (nx,ny) is legal. Cardinal steps just need the destination
 * walkable. A DIAGONAL step additionally requires BOTH shared orthogonal tiles to be walkable, so a
 * unit can never clip a building corner or squeeze diagonally between two buildings. `start` may be
 * blocked (a unit standing on / leaving an un-enterable tile), so the destination check — not the
 * origin — is what gates a step; the corner rule reads the two shoulder tiles either way.
 */
export function canStep(grid: NavGrid, gx: number, gy: number, nx: number, ny: number): boolean {
  if (!walkable(grid, nx, ny)) return false;
  const dx = nx - gx, dy = ny - gy;
  if (dx !== 0 && dy !== 0) {
    // diagonal — both shoulders must be open (no corner cut).
    if (!walkable(grid, gx + dx, gy) || !walkable(grid, gx, gy + dy)) return false;
  }
  return true;
}

/** Step cost from a tile to an adjacent tile: 1 cardinal, √2 diagonal. */
function stepCost(gx: number, gy: number, nx: number, ny: number): number {
  return gx !== nx && gy !== ny ? DIAGONAL_COST : 1;
}

/** Octile heuristic — the cost of the cheapest UNOBSTRUCTED 8-move path (admissible + consistent
 * for the 1 / √2 step costs), so A* returns an optimal path and never over-expands. */
function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  const dmin = Math.min(dx, dy), dmax = Math.max(dx, dy);
  return dmax - dmin + DIAGONAL_COST * dmin;
}

// ── deterministic binary min-heap over A* nodes ─────────────────────────────────────────────────
interface Node { gx: number; gy: number; g: number; f: number; }

/** Total order: lower f first; ties → lower g (closer to goal); then gx, then gy. Over DISTINCT
 * tiles this is a strict total order, which is what makes the search deterministic. */
function before(a: Node, b: Node): boolean {
  if (a.f !== b.f) return a.f < b.f;
  if (a.g !== b.g) return a.g < b.g;
  if (a.gx !== b.gx) return a.gx < b.gx;
  return a.gy < b.gy;
}

class MinHeap {
  private h: Node[] = [];
  get size(): number { return this.h.length; }
  push(n: Node): void {
    const h = this.h;
    h.push(n);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (before(h[i], h[p])) { [h[i], h[p]] = [h[p], h[i]]; i = p; } else break;
    }
  }
  pop(): Node {
    const h = this.h;
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < h.length && before(h[l], h[m])) m = l;
        if (r < h.length && before(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]]; i = m;
      }
    }
    return top;
  }
}

/**
 * Shortest 8-connected path from `start` to `goal` (both inclusive), routing around blocked tiles
 * and never cutting a building corner (see canStep). Returns the tile list [start, …, goal], or
 * `null` if the goal is blocked, out of bounds, or unreachable. `start` itself is allowed to be
 * blocked (a unit may stand on / leave an otherwise un-enterable tile); every subsequent tile must
 * be walkable. Deterministic (see the heap order above).
 */
export function findPath(start: GridPos, goal: GridPos, grid: NavGrid): GridPos[] | null {
  const s: GridPos = { gx: Math.round(start.gx), gy: Math.round(start.gy) };
  const g: GridPos = { gx: Math.round(goal.gx), gy: Math.round(goal.gy) };

  if (!walkable(grid, g.gx, g.gy)) return null; // goal blocked / out of bounds
  if (tileEquals(s, g)) return [s];

  const cameFrom = new Map<string, GridPos>();
  const gScore = new Map<string, number>([[key(s.gx, s.gy), 0]]);
  const open = new MinHeap();
  open.push({ gx: s.gx, gy: s.gy, g: 0, f: octile(s.gx, s.gy, g.gx, g.gy) });

  while (open.size > 0) {
    const cur = open.pop();
    const ck = key(cur.gx, cur.gy);
    // lazy deletion: a stale heap entry (we already reached this tile cheaper) is skipped.
    if (cur.g > (gScore.get(ck) ?? Infinity)) continue;
    if (cur.gx === g.gx && cur.gy === g.gy) return reconstruct(cameFrom, s, g);

    for (const n of tileNeighbors8(cur.gx, cur.gy)) {
      if (!canStep(grid, cur.gx, cur.gy, n.gx, n.gy)) continue;
      const tentative = cur.g + stepCost(cur.gx, cur.gy, n.gx, n.gy);
      const nk = key(n.gx, n.gy);
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue; // not an improvement
      gScore.set(nk, tentative);
      cameFrom.set(nk, { gx: cur.gx, gy: cur.gy });
      open.push({ gx: n.gx, gy: n.gy, g: tentative, f: tentative + octile(n.gx, n.gy, g.gx, g.gy) });
    }
  }
  return null; // unreachable
}

function reconstruct(cameFrom: Map<string, GridPos>, start: GridPos, goal: GridPos): GridPos[] {
  const path: GridPos[] = [goal];
  let cur = goal;
  while (!tileEquals(cur, start)) {
    const prev = cameFrom.get(key(cur.gx, cur.gy));
    if (!prev) break; // defensive; should not happen on a found path
    path.push(prev);
    cur = prev;
  }
  path.reverse();
  return path;
}

/** Whether `path` is a contiguous, in-bounds, unblocked 8-connected walk: each step is to an
 * adjacent tile (cardinal OR diagonal) and every diagonal obeys the no-corner-cut rule. A helper
 * for callers/tests to validate an externally supplied route. `start` may be blocked. */
export function isValidPath(path: readonly GridPos[], grid: NavGrid): boolean {
  if (path.length === 0) return false;
  for (let i = 1; i < path.length; i++) {
    const p = path[i], q = path[i - 1];
    const dx = Math.abs(p.gx - q.gx), dy = Math.abs(p.gy - q.gy);
    if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) return false; // not an adjacent single step
    if (!canStep(grid, q.gx, q.gy, p.gx, p.gy)) return false;     // blocked / corner-cut
  }
  return true;
}
