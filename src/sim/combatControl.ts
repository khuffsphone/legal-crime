// COMBAT PR A — the CONTROL SURFACE (attack-move / focus-fire / disengage). Pure & Phaser-free.
// ⚠ SIM-ADJACENT, ADDITIVE: per-unit combat orders live in an OPTIONAL GameState slice
// (state.combatOrders) driven by the real-time WRAPPER (realtime.update) — tick()/applyCommand()/
// commands.ts never see them, the MovableUnit type is untouched, and the slice is plain JSON so
// saves round-trip it wholesale. With the ?combat=1 flag off the slice never exists and every code
// path here is a structural no-op, so existing outcomes stay bit-identical (the beatCops law).
//
// NO-X-RAY (the load-bearing invariant): every hostile-sensing decision — attack-move acquisition,
// the focus-fire designation + chase, the disengage threat vector — keys off the SAME IsVisible
// predicate the opPreview selectors take (the scene injects its fog closure; nothing here reads fog
// directly, and there is no parallel visibility check to drift). A fogged rival can NEVER trigger,
// steer, or deny an order differently than an empty tile would: ordering INTO fog and moving INTO
// fog behave identically whether or not something hides there (no fog probes via unit behavior).
//
// RNG: none. Every verb and every per-tick decision is deterministic, so this module draws from NO
// cursor — there is deliberately no combatRngState. A future stochastic combat verb must add its own
// salted cursor per the beatCops pattern (state.lawRngState), never the shared state.rngState.
//
// These verbs add NO combat mechanic: engagement stays the 35a proximity auto-engage, damage/cadence
// stay the combatTuning tables (45/0.45 caps untouched). The surface only decides WHERE units walk.

import { hostile, isCombatant } from './combat';
import { issueMove, unitTile, type MovableUnit } from './movement';
import { isCommandableTile, pickUnit } from './selection';
import type { NavGrid } from './pathfinding';
import type { IsVisible } from './opPreview';
import type { GridPos } from './iso';
import type { GameState } from './types';

/** Acquisition radius (tiles) for ATTACK-MOVE + the DISENGAGE threat scan. Value parity with the
 * render-side ATTACK_MOVE_ACQUIRE_RADIUS (src/scenes/combatOrders.ts) so the flagged surface feels
 * like the input-only #17 layer it supersedes — still NOT a combat constant (reach stays 35a's). */
export const COMBAT_ACQUIRE_RADIUS = 5;
/** An ATTACK-MOVE within this of its destination counts as arrived (mirrors the #17 layer). */
export const COMBAT_ARRIVE_EPS = 0.6;
/** One DISENGAGE retreat leg (tiles) — longer than the acquire radius, so a single clean leg exits
 * the threat scan and the order self-clears instead of oscillating on its own boundary. */
export const DISENGAGE_STEP_TILES = 6;

export type CombatStance = 'ATTACK_MOVE' | 'FOCUS_FIRE' | 'DISENGAGE';

/** One unit's standing combat order. Plain JSON data — saves round-trip the slice wholesale. */
export interface CombatOrder {
  stance: CombatStance;
  /** ATTACK_MOVE — the ordered destination to advance toward between engagements. */
  dest?: GridPos;
  /** FOCUS_FIRE — the designated target's unit id. */
  targetId?: string;
  /** FOCUS_FIRE — the last tile the player actually SAW the target on. When the target slips into
   * fog the order demotes to an ATTACK_MOVE on this tile: the player keeps the knowledge they
   * legitimately had, and nothing tracks the target through the fog (NO-X-RAY). */
  lastSeen?: GridPos;
}

/** The slice type stored at state.combatOrders (unit id → standing order). */
export type CombatOrders = Record<string, CombatOrder>;

/** World context the verbs need but the GameState doesn't carry: the nav grid (pathing) and the
 * fog predicate (the scene's isRevealed closure — the SAME one opPreview consumes). The realtime
 * hook is INERT without it, so a headless update() can never acquire through fog by omission. */
export interface CombatCtx {
  grid: NavGrid;
  isVisible: IsVisible;
}

/** Why an order was refused. NO-X-RAY: a fogged target yields 'no-visible-target' — the SAME value
 * an empty tile yields, decided on one code path, so no caller can tell the two apart. The more
 * specific denials only ever describe VISIBLE things (visible friendly, visible collector). */
export type CombatDenial =
  | 'no-selection'       // no live fighter among the given unit ids
  | 'bad-destination'    // nowhere any of them could path (or a cornered disengage)
  | 'no-visible-target'  // nothing the player can SEE there (missing, downed, or fog-hidden alike)
  | 'not-a-fighter'      // a visible collector — robbed via interception, never an attack target
  | 'not-hostile'        // a visible friendly/self — focus-fire needs an enemy fighter
  | 'not-engaged';       // disengage with no VISIBLE threat in the scan radius

export interface CombatOrderResult {
  /** Unit ids that actually received the order (pathed + slice entry written). */
  issued: string[];
  /** Set iff issued is empty — exactly one reason, ready for the status line. */
  denial?: CombatDenial;
}

/** Opt-in flag (?combat=1) — default OFF so normal play is byte-identical (copsRequested pattern).
 * Pure: takes the query string, never reads window (the sim stays DOM-free). */
export function combatRequested(search: string): boolean {
  if (!search) return false;
  try {
    return new URLSearchParams(search).get('combat') === '1';
  } catch {
    return false;
  }
}

/** The live fighters among `unitIds` (missing/downed/collector ids drop out — selection can go
 * stale by the time the click lands, so the verb re-validates against the sim truth). */
function eligibleFighters(state: GameState, unitIds: readonly string[]): MovableUnit[] {
  const out: MovableUnit[] = [];
  for (const u of state.units) {
    if (unitIds.includes(u.id) && isCombatant(u)) out.push(u);
  }
  return out;
}

function dist(a: GridPos, b: GridPos): number {
  return Math.hypot(a.gx - b.gx, a.gy - b.gy);
}

/** Write `order` for the unit, creating the slice on first use (the only place it is created —
 * a flag-off game never grows the field, keeping its state tree byte-identical). */
function setOrder(state: GameState, unitId: string, order: CombatOrder): void {
  const orders = state.combatOrders ?? (state.combatOrders = {});
  orders[unitId] = order;
}

/** Whether the unit's current path already ends on `tile`. */
function pathEndsAt(u: MovableUnit, tile: GridPos): boolean {
  const end = u.path.length > 0 ? u.path[u.path.length - 1] : undefined;
  return !!end && end.gx === tile.gx && end.gy === tile.gy;
}

/** Keep the unit heading for `tile`: re-path ONLY when its path's end tile differs from the goal
 * (at most one A* per goal change — an en-route divert happens the tick the goal flips, "engages
 * along the way", without per-frame pathfinding thrash). */
function steerToward(u: MovableUnit, tile: GridPos, grid: NavGrid): void {
  if (!pathEndsAt(u, tile)) issueMove(u, tile, grid);
}

/** The nearest hostile fighter within `radius` that the player can SEE. The visibility gate is the
 * injected predicate — a fogged hostile is structurally invisible to acquisition (NO-X-RAY), so an
 * attack-moving unit walks straight past a hidden ambush exactly as if the tile were empty. */
export function nearestVisibleHostile(
  self: MovableUnit,
  units: ReadonlyArray<MovableUnit>,
  radius: number,
  isVisible: IsVisible,
): MovableUnit | undefined {
  let best: MovableUnit | undefined;
  let bestD = radius + 1e-9;
  for (const o of units) {
    if (o === self || !hostile(self, o) || !isVisible(o.pos)) continue;
    const d = dist(self.pos, o.pos);
    if (d <= radius && d < bestD) { bestD = d; best = o; }
  }
  return best;
}

/** Every VISIBLE hostile fighter within `radius` of `self` — the disengage threat set. Hidden
 * hostiles are excluded, so a retreat vector can never point away from something the player cannot
 * see (watching which way your man runs must not probe the fog). */
export function visibleThreats(
  self: MovableUnit,
  units: ReadonlyArray<MovableUnit>,
  radius: number,
  isVisible: IsVisible,
): MovableUnit[] {
  const out: MovableUnit[] = [];
  for (const o of units) {
    if (o === self || !hostile(self, o) || !isVisible(o.pos)) continue;
    if (dist(self.pos, o.pos) <= radius) out.push(o);
  }
  return out;
}

/** The scene's right-click target pick, made fog-safe: the unit under `point` counts ONLY if the
 * player can see it. Without this the VERB ROUTING itself is an X-ray (a fogged rival under the
 * cursor would route 'attack' where empty ground routes 'move'). A fogged rival therefore routes
 * exactly like empty ground. Pure; same pickUnit the selection layer uses. */
export function pickVisibleHostile(
  units: ReadonlyArray<MovableUnit>,
  point: GridPos,
  selfFamilyId: string,
  isVisible: IsVisible,
): MovableUnit | undefined {
  const visible = units.filter((u) => isVisible(u.pos));
  const hit = pickUnit(visible, point);
  if (!hit || !hit.factionId || hit.factionId === selfFamilyId) return undefined;
  if (hit.role === 'collector' || hit.downed) return undefined;
  return hit;
}

// ── THE VERBS (wrapped commands — applyCommand/commands.ts untouched) ──────────────────────────

/**
 * ATTACK-MOVE: path the given fighters to `dest`; en route each one auto-diverts onto the nearest
 * VISIBLE hostile inside COMBAT_ACQUIRE_RADIUS (the 35a proximity combat then trades the blows),
 * and resumes toward `dest` when its foe drops. The order self-clears on arrival.
 */
export function orderAttackMove(
  state: GameState,
  unitIds: readonly string[],
  dest: GridPos,
  ctx: CombatCtx,
): CombatOrderResult {
  const movers = eligibleFighters(state, unitIds);
  if (movers.length === 0) return { issued: [], denial: 'no-selection' };
  if (!isCommandableTile(dest, ctx.grid)) return { issued: [], denial: 'bad-destination' };
  const issued: string[] = [];
  for (const u of movers) {
    if (!issueMove(u, dest, ctx.grid)) continue; // unreachable for THIS unit — leave it as it was
    setOrder(state, u.id, { stance: 'ATTACK_MOVE', dest: { gx: dest.gx, gy: dest.gy } });
    issued.push(u.id);
  }
  return issued.length > 0 ? { issued } : { issued, denial: 'bad-destination' };
}

/**
 * FOCUS-FIRE: designate ONE visible enemy fighter; every given fighter converges on it via the
 * EXISTING attack verb (move-to-engage — 35a resolves contact; no new combat rule, no cap change,
 * and concentration comes from convergence, not from any damage redirection). The order keeps the
 * crew converging while the target lives AND stays visible; see advanceCombatOrders for the fog
 * demotion. NO-X-RAY: a fogged target is refused with the SAME denial as no target at all.
 */
export function orderFocusFire(
  state: GameState,
  unitIds: readonly string[],
  targetId: string,
  ctx: CombatCtx,
): CombatOrderResult {
  const attackers = eligibleFighters(state, unitIds);
  if (attackers.length === 0) return { issued: [], denial: 'no-selection' };
  const target = state.units.find((u) => u.id === targetId);
  // ONE code path for missing, downed, and fog-hidden — the denial cannot leak which it was.
  if (!target || target.downed || !ctx.isVisible(target.pos)) {
    return { issued: [], denial: 'no-visible-target' };
  }
  if (target.role === 'collector') return { issued: [], denial: 'not-a-fighter' };
  const tile = unitTile(target);
  const issued: string[] = [];
  let anyHostile = false;
  for (const u of attackers) {
    if (!hostile(u, target)) continue; // self / same family — focus-fire needs an enemy
    anyHostile = true;
    if (!issueMove(u, tile, ctx.grid)) continue;
    setOrder(state, u.id, { stance: 'FOCUS_FIRE', targetId, lastSeen: { gx: tile.gx, gy: tile.gy } });
    issued.push(u.id);
  }
  if (issued.length > 0) return { issued };
  return { issued, denial: anyHostile ? 'bad-destination' : 'not-hostile' };
}

/**
 * DISENGAGE (roadmap A9 — the player-side pair of the shipped rival telegraph-retreat): break off
 * and path AWAY from the VISIBLE threats near each fighter. Engagement is proximity-emergent, so
 * walking out of reach IS the disengage; the verb owns picking the away vector and keeping the leg
 * going until the unit is clear of every visible threat (then the order self-clears). Fighters with
 * no visible threat nearby are left untouched.
 */
export function orderDisengage(
  state: GameState,
  unitIds: readonly string[],
  ctx: CombatCtx,
): CombatOrderResult {
  const movers = eligibleFighters(state, unitIds);
  if (movers.length === 0) return { issued: [], denial: 'no-selection' };
  const issued: string[] = [];
  let anyThreat = false;
  for (const u of movers) {
    const threats = visibleThreats(u, state.units, COMBAT_ACQUIRE_RADIUS, ctx.isVisible);
    if (threats.length === 0) continue; // nothing this unit can see to break from
    anyThreat = true;
    if (issueRetreatLeg(u, threats, ctx.grid)) {
      setOrder(state, u.id, { stance: 'DISENGAGE' });
      issued.push(u.id);
    }
  }
  if (issued.length > 0) return { issued };
  return { issued, denial: anyThreat ? 'bad-destination' : 'not-engaged' };
}

/** Path one retreat leg directly away from the threat centroid. Deterministic: exact-overlap breaks
 * east (a fixed convention, no roll), candidates shrink toward the unit until one paths. */
function issueRetreatLeg(u: MovableUnit, threats: readonly MovableUnit[], grid: NavGrid): boolean {
  let cx = 0;
  let cy = 0;
  for (const t of threats) { cx += t.pos.gx; cy += t.pos.gy; }
  cx /= threats.length;
  cy /= threats.length;
  let dx = u.pos.gx - cx;
  let dy = u.pos.gy - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
  const here = unitTile(u);
  for (const step of [DISENGAGE_STEP_TILES, Math.ceil(DISENGAGE_STEP_TILES / 2), 1]) {
    const tile = {
      gx: Math.min(grid.cols - 1, Math.max(0, Math.round(u.pos.gx + dx * step))),
      gy: Math.min(grid.rows - 1, Math.max(0, Math.round(u.pos.gy + dy * step))),
    };
    if (tile.gx === here.gx && tile.gy === here.gy) continue; // clamped back onto our own tile
    if (issueMove(u, tile, grid)) return true;
  }
  return false; // cornered — caller reports it; the unit keeps whatever it was doing
}

/** Clear the standing combat order for each id (STOP / HOLD / a fresh manual MOVE all cancel a
 * stance — matching the #17 input-layer hygiene). No-op when the slice doesn't exist. */
export function clearCombatOrders(state: GameState, unitIds: readonly string[]): void {
  const orders = state.combatOrders;
  if (!orders) return;
  for (const id of unitIds) delete orders[id];
}

// ── THE REALTIME HOOK (additive wrapper line — see realtime.update) ────────────────────────────

/**
 * Advance every standing combat order one decision step. Steering is goal-keyed: a unit re-paths
 * only when its goal TILE changes (steerToward), so an attack-move diverts onto a sighted foe the
 * tick it appears — "engages along the way" — yet pathfinding never runs per-frame. The whole pass
 * is deterministic (state.units order; nearest-first with array-order tie-break).
 *
 * STRUCTURAL NO-OPS (the numbers-frozen contract): absent slice ⇒ untouched state; absent ctx
 * (headless update() without the scene's grid+fog) ⇒ untouched state — the hook can never invent
 * a visibility rule of its own. Only ordered units' paths and the slice itself are ever written;
 * no RNG cursor, no health, no cash, no clock.
 */
export function advanceCombatOrders(state: GameState, dt: number, ctx?: CombatCtx): void {
  if (!(dt > 0) || !ctx) return;
  const orders = state.combatOrders;
  if (!orders) return;
  // prune orders whose unit left play (downed units leave state.units the same combat step)
  for (const id of Object.keys(orders)) {
    if (!state.units.some((u) => u.id === id)) delete orders[id];
  }
  for (const u of state.units) {
    const order = orders[u.id];
    if (!order) continue;
    if (!isCombatant(u)) { delete orders[u.id]; continue; }
    if (order.stance === 'ATTACK_MOVE') advanceAttackMove(state, u, order, orders, ctx);
    else if (order.stance === 'FOCUS_FIRE') advanceFocusFire(state, u, order, orders, ctx);
    else advanceDisengage(state, u, orders, ctx);
  }
}

function advanceAttackMove(
  state: GameState,
  u: MovableUnit,
  order: CombatOrder,
  orders: CombatOrders,
  ctx: CombatCtx,
): void {
  const foe = nearestVisibleHostile(u, state.units, COMBAT_ACQUIRE_RADIUS, ctx.isVisible);
  if (foe) {
    // converts to attack ON SIGHT, en route — divert onto the foe; 35a trades the blows. A HIDDEN
    // hostile never reaches this branch, so the course is untouched (the fog-probe test's teeth).
    steerToward(u, unitTile(foe), ctx.grid);
    return;
  }
  if (order.dest && dist(u.pos, order.dest) > COMBAT_ARRIVE_EPS) {
    steerToward(u, order.dest, ctx.grid); // resume the advance (also re-aims after a foe drops)
    return;
  }
  delete orders[u.id]; // arrived with nothing left to fight — the order is spent
}

function advanceFocusFire(
  state: GameState,
  u: MovableUnit,
  order: CombatOrder,
  orders: CombatOrders,
  ctx: CombatCtx,
): void {
  const target = state.units.find((t) => t.id === order.targetId);
  if (!target || !hostile(u, target)) { delete orders[u.id]; return; } // down/gone — spent
  if (ctx.isVisible(target.pos)) {
    const tile = unitTile(target);
    order.lastSeen = { gx: tile.gx, gy: tile.gy };
    steerToward(u, tile, ctx.grid); // converge — re-paths only when the mark changes tile
    return;
  }
  // The mark slipped into fog. Keep ONLY the knowledge the player really had: demote to an
  // ATTACK-MOVE on the last SEEN tile. Nothing tracks the live target through the fog (NO-X-RAY);
  // if it resurfaces inside the acquire radius the attack-move re-engages it like any hostile.
  if (order.lastSeen) {
    orders[u.id] = { stance: 'ATTACK_MOVE', dest: { gx: order.lastSeen.gx, gy: order.lastSeen.gy } };
  } else {
    delete orders[u.id];
  }
}

function advanceDisengage(state: GameState, u: MovableUnit, orders: CombatOrders, ctx: CombatCtx): void {
  const threats = visibleThreats(u, state.units, COMBAT_ACQUIRE_RADIUS, ctx.isVisible);
  if (threats.length === 0) { delete orders[u.id]; return; } // clear of every visible threat — done
  if (u.path.length === 0) issueRetreatLeg(u, threats, ctx.grid); // keep the breakoff going
}
