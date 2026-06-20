// RTS-3 — selection & command. Pure & deterministic; imports NO Phaser, so the RTS control
// layer (hit-testing, the selection set, and turning a click into movement) is unit-tested
// headlessly. The Phaser scene converts pointer events to grid-space points via screenToGrid
// and calls these functions; it never owns control logic itself.

import { PICK_RADIUS } from './constants';
import type { GridPos } from './iso';
import { issueMove, unitTile, type MovableUnit } from './movement';
import type { NavGrid } from './pathfinding';

// ── selection set ───────────────────────────────────────────────────────────────────────────
// Selection is immutable view-state: every helper returns a NEW Selection, never mutates, so
// it composes cleanly and is trivial to test by value.

export interface Selection {
  /** Ids of currently selected units, in selection order (deduped). */
  ids: string[];
}

export function emptySelection(): Selection {
  return { ids: [] };
}

/** Select exactly one unit (replacing any prior selection). */
export function selectOnly(id: string): Selection {
  return { ids: [id] };
}

/** Select exactly this set of units (deduped, order preserved). */
export function selectMany(ids: readonly string[]): Selection {
  return { ids: dedupe(ids) };
}

/** Add a unit to the selection (no-op if already selected). */
export function addToSelection(sel: Selection, id: string): Selection {
  return sel.ids.includes(id) ? sel : { ids: [...sel.ids, id] };
}

/** Toggle a unit's membership (the shift-click gesture). */
export function toggleSelection(sel: Selection, id: string): Selection {
  return sel.ids.includes(id)
    ? { ids: sel.ids.filter((x) => x !== id) }
    : { ids: [...sel.ids, id] };
}

export function clearSelection(): Selection {
  return { ids: [] };
}

export function isSelected(sel: Selection, id: string): boolean {
  return sel.ids.includes(id);
}

/** The live unit objects for a selection, skipping ids no longer present (e.g. destroyed). */
export function selectedUnits(sel: Selection, units: readonly MovableUnit[]): MovableUnit[] {
  return sel.ids
    .map((id) => units.find((u) => u.id === id))
    .filter((u): u is MovableUnit => u !== undefined);
}

function dedupe(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) if (!out.includes(id)) out.push(id);
  return out;
}

// ── hit-testing ─────────────────────────────────────────────────────────────────────────────

/**
 * The unit closest to `point` (grid space) within `radius` tiles, or null if none is close
 * enough / the list is empty. Deterministic: ties on distance break by the unit's order in
 * the array (the first wins), so the same click always picks the same unit.
 */
export function pickUnit(
  units: readonly MovableUnit[],
  point: GridPos,
  radius: number = PICK_RADIUS,
): MovableUnit | null {
  let best: MovableUnit | null = null;
  let bestDist = Infinity;
  for (const u of units) {
    const dx = u.pos.gx - point.gx;
    const dy = u.pos.gy - point.gy;
    const d = Math.hypot(dx, dy);
    if (d <= radius && d < bestDist) {
      best = u;
      bestDist = d;
    }
  }
  return best;
}

/** Ids of every unit whose position falls inside the axis-aligned grid rectangle [a, b]
 * (inclusive). Corners may be given in any order — this is the drag-box multi-select. */
export function unitsInBox(units: readonly MovableUnit[], a: GridPos, b: GridPos): string[] {
  const minX = Math.min(a.gx, b.gx);
  const maxX = Math.max(a.gx, b.gx);
  const minY = Math.min(a.gy, b.gy);
  const maxY = Math.max(a.gy, b.gy);
  return units
    .filter((u) => u.pos.gx >= minX && u.pos.gx <= maxX && u.pos.gy >= minY && u.pos.gy <= maxY)
    .map((u) => u.id);
}

// ── command resolution ──────────────────────────────────────────────────────────────────────

export interface MoveResolution {
  /** Ids that received a valid path to the target. */
  moved: string[];
  /** Ids that could not path to the target (unreachable / blocked) — left where they were. */
  failed: string[];
}

/**
 * Translate a move command — the selected units + a target tile — into issued movement,
 * routing each unit around blocked tiles. Returns which units moved and which had no path.
 * Pure aside from mutating each unit's own `path` via issueMove; deterministic (BFS paths).
 */
export function resolveMoveCommand(
  units: readonly MovableUnit[],
  selectedIds: readonly string[],
  target: GridPos,
  grid: NavGrid,
): MoveResolution {
  const moved: string[] = [];
  const failed: string[] = [];
  for (const id of selectedIds) {
    const unit = units.find((u) => u.id === id);
    if (!unit) continue;
    if (issueMove(unit, target, grid)) moved.push(id);
    else failed.push(id);
  }
  return { moved, failed };
}

/** Whether a target tile is a legal move destination on this grid (in-bounds, not blocked).
 * Lets the scene reject a right-click on a wall before issuing, and tests assert it directly. */
export function isCommandableTile(target: GridPos, grid: NavGrid): boolean {
  const gx = Math.round(target.gx);
  const gy = Math.round(target.gy);
  if (gx < 0 || gy < 0 || gx >= grid.cols || gy >= grid.rows) return false;
  return !grid.isBlocked(gx, gy);
}

/** Re-export for scenes that issue a single ad-hoc move without building a selection. */
export { issueMove, unitTile };
