// SELECTION/CONTROL QoL (pure, Phaser-free). The keyboard SHORTCUTS that turn a selection into fast
// control — TAB-cycle through idle (no-order) units, numbered CONTROL GROUPS (bind/recall), and the
// drag-box SCREEN-RECT hit math. Like orderRouting/cameraFeel this owns only the DECISION/MATH so it
// is unit-tested without Phaser; IsoScene wires the keys/pointer to these and applies the result.
//
// CANON HELD: selection stays AUTHORITATIVE — every helper here speaks in unit IDs (the same id list
// the Selection set carries), never the live unit objects, so the scene composes them straight into
// selectMany/selectOnly. No sim mutation; no Phaser.

import type { MovableUnit } from '../sim';

// ── idle (no-order) cycle ─────────────────────────────────────────────────────────────────────
// A unit is IDLE when it has no remaining move waypoints AND is not holding a PATROL stance — i.e. it
// has no standing order and is free to be redirected. TAB walks the player's idle units in array order.

/** Whether a unit has no standing order (no path, not patrolling) — the TAB-cycle candidate test. */
export function isIdleUnit(u: Pick<MovableUnit, 'path' | 'patrol'>): boolean {
  return u.path.length === 0 && !u.patrol;
}

/** The ids of every idle unit, in the given order (the cycle order). */
export function idleUnitIds(units: readonly MovableUnit[]): string[] {
  return units.filter(isIdleUnit).map((u) => u.id);
}

/**
 * The next idle unit to select when TAB (reverse=false) / Shift+TAB (reverse=true) is pressed.
 * Cycles relative to the currently-selected idle unit (the last one in `currentIds` that is idle),
 * wrapping around. If nothing currently selected is idle, starts at the first (forward) / last
 * (reverse) idle unit. Returns undefined only when there are no idle units at all. Pure.
 */
export function nextIdleId(
  idleIds: readonly string[],
  currentIds: readonly string[],
  reverse = false,
): string | undefined {
  if (idleIds.length === 0) return undefined;
  // Anchor on the last selected unit that is itself idle, so repeated TABs march through the set.
  let anchor = -1;
  for (const id of currentIds) {
    const i = idleIds.indexOf(id);
    if (i !== -1) anchor = i;
  }
  if (anchor === -1) return reverse ? idleIds[idleIds.length - 1] : idleIds[0];
  const step = reverse ? -1 : 1;
  return idleIds[(anchor + step + idleIds.length) % idleIds.length];
}

// ── control groups (bind / recall) ────────────────────────────────────────────────────────────
// Ctrl+1..9 BINDS the current selection to a numbered group; bare 1..9 RECALLS it. Groups store ids
// (the selection vocabulary); recall filters out stale ids (units that have since died/despawned).

/** A numbered control group store: group number (1..9) → bound unit ids. */
export type ControlGroups = Record<number, string[]>;

/** The double-tap window (ms): a second recall of the same group within this centres the camera. */
export const GROUP_DOUBLE_TAP_MS = 350;

function dedupe(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) if (!out.includes(id)) out.push(id);
  return out;
}

/** Bind `ids` (deduped, order preserved) to group `n` — returns a NEW store (never mutates). */
export function bindGroup(groups: ControlGroups, n: number, ids: readonly string[]): ControlGroups {
  return { ...groups, [n]: dedupe(ids) };
}

/** Whether group `n` was ever bound (even if every member has since gone stale). */
export function hasGroup(groups: ControlGroups, n: number): boolean {
  return Array.isArray(groups[n]);
}

/**
 * The LIVE members of group `n`: its bound ids filtered to those still present in `liveIds`. A unit
 * that died/despawned drops out silently. Returns [] for an unbound group or one gone fully stale.
 */
export function recallGroup(
  groups: ControlGroups,
  n: number,
  liveIds: readonly string[],
): string[] {
  const ids = groups[n];
  if (!ids) return [];
  const live = new Set(liveIds);
  return ids.filter((id) => live.has(id));
}

/** Persist the stale-pruned membership of group `n` back into the store (returns a NEW store). */
export function pruneGroup(groups: ControlGroups, n: number, liveIds: readonly string[]): ControlGroups {
  if (!Array.isArray(groups[n])) return groups;
  return { ...groups, [n]: recallGroup(groups, n, liveIds) };
}

/** The most recent group recall — the scene keeps this to detect a double-tap. */
export interface RecallTap {
  group: number;
  atMs: number;
}

/**
 * Whether recalling group `n` at `nowMs` is a DOUBLE-TAP of the last recall (same group, within the
 * window) — the gesture that centres the camera on the group. Pure; `nowMs` is supplied by the caller.
 */
export function isCenterRecall(
  prev: RecallTap | undefined,
  n: number,
  nowMs: number,
  windowMs = GROUP_DOUBLE_TAP_MS,
): boolean {
  return prev !== undefined && prev.group === n && nowMs >= prev.atMs && nowMs - prev.atMs <= windowMs;
}

// ── drag-box screen-rect hit math ─────────────────────────────────────────────────────────────
// The marquee selects every unit whose SCREEN position falls inside the dragged rectangle. Corners
// may be given in any order. (Grid-space box hit-testing lives in sim/selection.unitsInBox; this is
// its screen-space sibling — the marquee works after camera scroll/zoom, so it hit-tests in pixels.)

/** A unit projected to screen space for marquee hit-testing. */
export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
}

/** Ids of every point inside the axis-aligned screen rectangle [(x0,y0),(x1,y1)] (corners any order). */
export function idsInScreenRect(
  points: readonly ScreenPoint[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): string[] {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  return points
    .filter((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)
    .map((p) => p.id);
}
