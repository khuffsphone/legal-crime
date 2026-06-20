// RTS-2 — spatial units & continuous movement. Pure & deterministic; imports NO Phaser, so it
// is unit-tested by stepping dt and asserting positions directly. Units carry a continuous
// grid-space position and a list of tile waypoints; `advanceUnit(dt)` walks them along that
// path at MOVE_SPEED tiles/second. Motion is arc-length parametrized, so it is exactly
// frame-rate independent: stepping the same total time in one big dt or many small dt lands
// the unit in the same place. The Phaser scene only renders unit positions via gridToScreen.

import { MOVE_SPEED, ARRIVE_EPSILON } from './constants';
import type { GridPos, Vec2 } from './iso';
import { gridToScreen } from './iso';
import { findPath, type NavGrid } from './pathfinding';

/** What a unit does on the map. Collectors carry cash and can be ambushed (RTS-4); enforcers
 * are the muscle that intercept hostile collectors. Plain movers (RTS-2/3) leave this unset. */
export type UnitRole = 'collector' | 'enforcer';

export interface MovableUnit {
  id: string;
  /** Continuous grid-space position (gx, gy are fractional while between tiles). */
  pos: GridPos;
  /** Remaining tile waypoints to travel to, in order. Empty ⇒ idle / arrived. */
  path: GridPos[];
  /** Movement rate in tiles per second. Defaults to MOVE_SPEED at spawn. */
  speed: number;
  /** Owning family id (RTS-4). Undefined ⇒ neutral; two units are hostile only if both have a
   * factionId and the ids differ. */
  factionId?: string;
  /** Map role (RTS-4/5). Undefined for plain RTS-2/3 movers. */
  role?: UnitRole;
  /** Dirty cash physically carried by a collector in transit (RTS-4/5). Absent ⇒ 0. */
  carrying?: number;
  /** District a collector's take was gathered from (RTS-5) — governs the deposit skim. */
  originDistrictId?: string;
  /** Tutorial safety net (RTS-12): a protected collector cannot be intercepted/robbed, so a new
   * player's first paycheck is guaranteed home. Set by startCollectorRun while the world has
   * tutorial free-runs left; normal risk resumes once they are spent. */
  protectedRun?: boolean;
}

/** Create an idle unit standing at tile (gx, gy). Plain mover — no faction/role (RTS-2/3). */
export function spawnUnit(id: string, gx: number, gy: number, speed: number = MOVE_SPEED): MovableUnit {
  return { id, pos: { gx, gy }, path: [], speed };
}

/** A collector carrying `carrying` dirty cash for `factionId` (RTS-4/5). Ambush-able in transit. */
export function spawnCollector(
  id: string,
  gx: number,
  gy: number,
  factionId: string,
  carrying: number,
  speed: number = MOVE_SPEED,
): MovableUnit {
  return { id, pos: { gx, gy }, path: [], speed, factionId, role: 'collector', carrying };
}

/** An enforcer (muscle) for `factionId` (RTS-4) — intercepts hostile collectors. */
export function spawnEnforcer(
  id: string,
  gx: number,
  gy: number,
  factionId: string,
  speed: number = MOVE_SPEED,
): MovableUnit {
  return { id, pos: { gx, gy }, path: [], speed, factionId, role: 'enforcer' };
}

/** The integer tile the unit currently occupies (its rounded position). */
export function unitTile(u: MovableUnit): GridPos {
  return { gx: Math.round(u.pos.gx), gy: Math.round(u.pos.gy) };
}

/** Whether the unit has no remaining waypoints (idle / has arrived). */
export function unitArrived(u: MovableUnit): boolean {
  return u.path.length === 0;
}

/** The unit's final destination tile, or undefined if it is idle. */
export function unitDestination(u: MovableUnit): GridPos | undefined {
  return u.path.length === 0 ? undefined : u.path[u.path.length - 1];
}

/** Screen-space position for rendering (the projection of the continuous grid position). */
export function unitScreenPos(u: MovableUnit): Vec2 {
  return gridToScreen(u.pos.gx, u.pos.gy);
}

/**
 * Assign a waypoint list (tile centers, in travel order). A leading waypoint equal to the
 * unit's current tile is dropped so the unit always walks toward genuinely new tiles — this is
 * what lets `issueMove` hand off a full [start, …, goal] path unchanged.
 */
export function setUnitPath(u: MovableUnit, path: readonly GridPos[]): void {
  const tile = unitTile(u);
  const trimmed = path.length > 0 && path[0].gx === tile.gx && path[0].gy === tile.gy
    ? path.slice(1)
    : path.slice();
  u.path = trimmed.map((p) => ({ gx: p.gx, gy: p.gy }));
}

/**
 * Route the unit to `target`, pathing around blocked tiles via the nav grid. Returns true and
 * assigns the route if one exists; returns false and leaves the unit idle where it is if the
 * target is unreachable. The unit's current tile is the path start.
 */
export function issueMove(u: MovableUnit, target: GridPos, grid: NavGrid): boolean {
  const path = findPath(unitTile(u), target, grid);
  if (!path) return false;
  setUnitPath(u, path);
  return true;
}

/** Stop the unit immediately, discarding any remaining waypoints (position is unchanged). */
export function stopUnit(u: MovableUnit): void {
  u.path = [];
}

/**
 * Advance one unit by `dt` seconds along its path at its speed. Consumes waypoints as it
 * reaches them (within ARRIVE_EPSILON tiles). Returns true iff the unit emptied its path this
 * step (i.e. arrived at its destination on this call). Non-positive dt is a no-op (false).
 *
 * The unit moves a budget of `speed · dt` tiles of arc length along the polyline; because the
 * motion is parametrized purely by distance travelled, the result depends only on the total
 * time elapsed, not on how it was subdivided — hence frame-rate independence.
 */
export function advanceUnit(u: MovableUnit, dt: number): boolean {
  if (!(dt > 0) || u.path.length === 0) return false;

  let budget = u.speed * dt;
  let arrivedNow = false;

  while (budget > 0 && u.path.length > 0) {
    const wp = u.path[0];
    const dx = wp.gx - u.pos.gx;
    const dy = wp.gy - u.pos.gy;
    const dist = Math.hypot(dx, dy);

    if (dist <= ARRIVE_EPSILON || dist <= budget) {
      // Snap onto the waypoint and consume it; spend its distance from the budget.
      u.pos = { gx: wp.gx, gy: wp.gy };
      budget -= dist;
      u.path.shift();
      if (u.path.length === 0) arrivedNow = true;
    } else {
      // Not enough budget to reach the waypoint — move partway toward it and stop.
      const t = budget / dist;
      u.pos = { gx: u.pos.gx + dx * t, gy: u.pos.gy + dy * t };
      budget = 0;
    }
  }
  return arrivedNow;
}

/** Advance every unit in place by `dt`. Returns the ids of units that arrived this step. */
export function advanceUnits(units: MovableUnit[], dt: number): string[] {
  const arrived: string[] = [];
  for (const u of units) {
    if (advanceUnit(u, dt)) arrived.push(u.id);
  }
  return arrived;
}
