// RTS-1 — isometric projection math. Pure & deterministic; imports NO Phaser, so it is
// unit-tested by asserting coordinates directly. Phaser scenes consume these functions to
// place and depth-sort sprites.
//
// PROJECTION: 2:1 dimetric ("standard game isometric"). A tile is a diamond ISO_TILE_WIDTH ×
// ISO_TILE_HEIGHT (128 × 64). gridToScreen returns the CENTER of a tile's diamond; grid +gx
// goes down-right on screen, +gy goes down-left. screenToGrid is the exact inverse.

/** Tile diamond width in pixels (the art-pipeline contract — see RTS-1 receipt). */
export const ISO_TILE_WIDTH = 128;
/** Tile diamond height in pixels (2:1 ratio with the width). */
export const ISO_TILE_HEIGHT = 64;
export const ISO_TILE_HALF_WIDTH = ISO_TILE_WIDTH / 2; // 64
export const ISO_TILE_HALF_HEIGHT = ISO_TILE_HEIGHT / 2; // 32

export interface Vec2 {
  x: number;
  y: number;
}
export interface GridPos {
  gx: number;
  gy: number;
}

/** Grid (gx, gy) → screen-space CENTER of that tile's diamond. gx/gy may be fractional. */
export function gridToScreen(gx: number, gy: number): Vec2 {
  return {
    x: (gx - gy) * ISO_TILE_HALF_WIDTH,
    y: (gx + gy) * ISO_TILE_HALF_HEIGHT,
  };
}

/** Screen-space point → continuous grid coordinate (exact inverse of gridToScreen). */
export function screenToGrid(sx: number, sy: number): GridPos {
  const a = sx / ISO_TILE_HALF_WIDTH; // gx - gy
  const b = sy / ISO_TILE_HALF_HEIGHT; // gx + gy
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
}

/** Screen-space point → the integer tile whose diamond contains it (round of the inverse).
 * Negative zero is normalized to 0 so tile coordinates are always canonical. */
export function screenToTile(sx: number, sy: number): GridPos {
  const g = screenToGrid(sx, sy);
  const norm = (n: number): number => (n === 0 ? 0 : n);
  return { gx: norm(Math.round(g.gx)), gy: norm(Math.round(g.gy)) };
}

/** The four screen-space corners of a tile's diamond, in [top, right, bottom, left] order. */
export function tileCorners(gx: number, gy: number): [Vec2, Vec2, Vec2, Vec2] {
  const c = gridToScreen(gx, gy);
  return [
    { x: c.x, y: c.y - ISO_TILE_HALF_HEIGHT }, // top
    { x: c.x + ISO_TILE_HALF_WIDTH, y: c.y }, // right
    { x: c.x, y: c.y + ISO_TILE_HALF_HEIGHT }, // bottom
    { x: c.x - ISO_TILE_HALF_WIDTH, y: c.y }, // left
  ];
}

/** Painter's-order depth key: larger = nearer the viewer (drawn on top). */
export function depthValue(gx: number, gy: number): number {
  return gx + gy;
}

export interface DepthItem {
  gx: number;
  gy: number;
  /** Tie-break within the same tile (e.g. ground=0, building=1, unit=2). */
  layer?: number;
}

/**
 * Painter's-algorithm comparator (back-to-front). Sort ascending: smaller gx+gy draws first
 * (further back / higher on screen). Ties break by gx, then by layer — deterministic.
 */
export function compareDepth(a: DepthItem, b: DepthItem): number {
  const da = depthValue(a.gx, a.gy);
  const db = depthValue(b.gx, b.gy);
  if (da !== db) return da - db;
  if (a.gx !== b.gx) return a.gx - b.gx;
  return (a.layer ?? 0) - (b.layer ?? 0);
}

/** A new array of items sorted back-to-front for correct isometric layering. */
export function depthSort<T extends DepthItem>(items: readonly T[]): T[] {
  return [...items].sort(compareDepth);
}

/** The four orthogonal grid neighbors of a tile, in [E, W, S, N] order. */
export function tileNeighbors(gx: number, gy: number): GridPos[] {
  return [
    { gx: gx + 1, gy },
    { gx: gx - 1, gy },
    { gx, gy: gy + 1 },
    { gx, gy: gy - 1 },
  ];
}

/** The eight grid neighbors (orthogonal + diagonal) — for diagonal-capable pathfinding. */
export function tileNeighbors8(gx: number, gy: number): GridPos[] {
  const out: GridPos[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      out.push({ gx: gx + dx, gy: gy + dy });
    }
  }
  return out;
}

/** Whether (gx, gy) lies within a cols × rows grid. */
export function inBounds(gx: number, gy: number, cols: number, rows: number): boolean {
  return gx >= 0 && gy >= 0 && gx < cols && gy < rows;
}

/** Grid Manhattan distance. */
export function manhattan(a: GridPos, b: GridPos): number {
  return Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy);
}

/** Whether two grid positions are the same tile. */
export function tileEquals(a: GridPos, b: GridPos): boolean {
  return a.gx === b.gx && a.gy === b.gy;
}
