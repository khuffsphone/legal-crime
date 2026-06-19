// RTS-2 — grid pathfinding. Pure & deterministic; imports NO Phaser, so it is unit-tested by
// asserting the returned tile lists directly. The movement system (movement.ts) routes units
// with these paths; the Phaser scene only renders the result.
//
// Algorithm: breadth-first search on a 4-connected grid (uniform step cost). BFS yields a
// shortest tile path and is fully deterministic — neighbors are always expanded in the iso
// [E, W, S, N] order, so the same start/goal/grid always produce the byte-identical path.

import type { GridPos } from './iso';
import { tileNeighbors, tileEquals } from './iso';

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
 * Shortest 4-connected path from `start` to `goal` (both inclusive), routing around blocked
 * tiles. Returns the tile list [start, …, goal], or `null` if the goal is blocked, out of
 * bounds, or unreachable. `start` itself is allowed to be blocked (a unit may stand on / leave
 * an otherwise un-enterable tile), but every subsequent tile must be walkable.
 *
 * Deterministic: the BFS frontier always expands neighbors in iso [E, W, S, N] order, so a
 * given (start, goal, grid) always yields the same path.
 */
export function findPath(start: GridPos, goal: GridPos, grid: NavGrid): GridPos[] | null {
  const s: GridPos = { gx: Math.round(start.gx), gy: Math.round(start.gy) };
  const g: GridPos = { gx: Math.round(goal.gx), gy: Math.round(goal.gy) };

  if (!walkable(grid, g.gx, g.gy)) return null; // goal blocked / out of bounds
  if (tileEquals(s, g)) return [s];

  const cameFrom = new Map<string, GridPos>();
  const visited = new Set<string>([key(s.gx, s.gy)]);
  let frontier: GridPos[] = [s];

  while (frontier.length > 0) {
    const next: GridPos[] = [];
    for (const cur of frontier) {
      for (const n of tileNeighbors(cur.gx, cur.gy)) {
        const k = key(n.gx, n.gy);
        if (visited.has(k) || !walkable(grid, n.gx, n.gy)) continue;
        visited.add(k);
        cameFrom.set(k, cur);
        if (tileEquals(n, g)) return reconstruct(cameFrom, s, g);
        next.push(n);
      }
    }
    frontier = next;
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

/** Whether `path` is a contiguous, in-bounds, unblocked walk (each step orthogonally adjacent).
 * A helper for callers/tests to validate an externally supplied route. `start` may be blocked. */
export function isValidPath(path: readonly GridPos[], grid: NavGrid): boolean {
  if (path.length === 0) return false;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (i > 0 && !walkable(grid, p.gx, p.gy)) return false;
    if (i > 0) {
      const q = path[i - 1];
      const step = Math.abs(p.gx - q.gx) + Math.abs(p.gy - q.gy);
      if (step !== 1) return false;
    }
  }
  return true;
}
