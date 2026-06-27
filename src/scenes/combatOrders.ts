// COMBAT CONTROL ORDERS (pure, Phaser-free). The STOP / HOLD / ATTACK-MOVE control verbs are an INPUT layer
// over the EXISTING order system (issueMove / stopUnit) + the RTS-35a proximity auto-engage — they add NO
// sim mechanic and never touch combat resolution. This module owns the testable decisions: the per-unit
// order record, the verb→order transitions, and the per-tick AUTO-ORDER resolution that an ATTACK-MOVE unit
// runs (divert to ENGAGE a hostile met en route — "converts to attack on contact"; a HOLD unit stands and
// fights without chasing). The scene keeps the order map render-side (the sim MovableUnit type is untouched)
// and dispatches the chosen action to the existing issueMove / stopUnit. Selection stays authoritative — the
// scene decides WHICH units carry an order; this only names the stance + resolves it.

import type { GridPos } from '../sim';

/** A render-side acquisition radius (tiles) for ATTACK-MOVE: a hostile this close is engaged before it
 * reaches melee, so the advance "converts to attack on contact". Deliberately wider than the 35a engage
 * reach so the unit notices a foe en route. NOT a sim constant — it tunes input acquisition only. */
export const ATTACK_MOVE_ACQUIRE_RADIUS = 5;

export type OrderStance = 'NORMAL' | 'HOLD' | 'ATTACK_MOVE';

export interface UnitOrder {
  stance: OrderStance;
  /** ATTACK-MOVE destination — the point to advance toward between engagements. */
  dest?: GridPos;
}

/** The default (no special stance) — the unit just follows whatever path the order system gave it. */
export const NORMAL_ORDER: UnitOrder = { stance: 'NORMAL' };

/** STOP — cancel the unit's order. Returns a NORMAL stance; the caller also clears the path (stopUnit). */
export function stopOrder(): UnitOrder {
  return { stance: 'NORMAL' };
}

/** HOLD — stand and fight without chasing. A persistent stance; the unit keeps its tile. */
export function holdOrder(): UnitOrder {
  return { stance: 'HOLD' };
}

/** ATTACK-MOVE — advance toward `dest`, engaging any hostile met en route. */
export function attackMoveOrder(dest: GridPos): UnitOrder {
  return { stance: 'ATTACK_MOVE', dest: { gx: dest.gx, gy: dest.gy } };
}

/** The minimal unit shape the resolver reads — a subset of the sim MovableUnit (no Phaser, no mutation). */
export interface OrderUnit {
  id: string;
  pos: GridPos;
  factionId?: string;
  role?: string;
  downed?: boolean;
}

/** Two units are hostile fighters: both factioned, different families, neither a collector or downed.
 * Mirrors the 35a hostility rule — collectors stay autonomous (robbed via interception, never an attack
 * target), so an attack-move never diverts onto one. Pure read. */
export function isHostileTarget(self: OrderUnit, other: OrderUnit): boolean {
  return (
    other.id !== self.id &&
    !!self.factionId && !!other.factionId && self.factionId !== other.factionId &&
    !other.downed && other.role !== 'collector' &&
    !self.downed && self.role !== 'collector'
  );
}

function dist(a: GridPos, b: GridPos): number {
  return Math.hypot(a.gx - b.gx, a.gy - b.gy);
}

/** The nearest hostile fighter within `radius` of `self`, or undefined. Pure read. */
export function nearestHostile(self: OrderUnit, units: readonly OrderUnit[], radius: number): OrderUnit | undefined {
  let best: OrderUnit | undefined;
  let bestD = radius + 1e-9;
  for (const o of units) {
    if (!isHostileTarget(self, o)) continue;
    const d = dist(self.pos, o.pos);
    if (d <= radius && d < bestD) { bestD = d; best = o; }
  }
  return best;
}

/** What a stance-carrying unit should do this tick. The scene turns this into issueMove / stopUnit. */
export type AutoOrder =
  | { kind: 'engage'; targetId: string; tile: GridPos } // move ONTO the hostile (35a trades blows on contact)
  | { kind: 'advance'; tile: GridPos }                  // resume toward the ATTACK-MOVE destination
  | { kind: 'hold' }                                    // STAND (HOLD, or ATTACK-MOVE arrived / nothing to chase)
  | { kind: 'none' };                                   // NORMAL — not managed by the stance system

/**
 * The per-tick decision for a unit's stance — the heart of the verbs.
 *   ATTACK_MOVE: a hostile within `acquireRadius` ⇒ ENGAGE it (the verb "converts to attack on contact");
 *                else ADVANCE toward dest until within `arriveEps`, then HOLD.
 *   HOLD:        ALWAYS stands — it fights only what 35a auto-engages already in range; it NEVER chases.
 *   NORMAL:      not managed (the unit follows its existing path).
 * Pure: reads positions and decides; the scene issues the move/stop against the EXISTING systems.
 */
export function resolveAutoOrder(
  self: OrderUnit,
  order: UnitOrder,
  units: readonly OrderUnit[],
  acquireRadius: number = ATTACK_MOVE_ACQUIRE_RADIUS,
  arriveEps: number = 0.6,
): AutoOrder {
  if (order.stance === 'HOLD') return { kind: 'hold' }; // stand and fight; never chase
  if (order.stance === 'ATTACK_MOVE') {
    const foe = nearestHostile(self, units, acquireRadius);
    if (foe) return { kind: 'engage', targetId: foe.id, tile: { gx: Math.round(foe.pos.gx), gy: Math.round(foe.pos.gy) } };
    if (order.dest && dist(self.pos, order.dest) > arriveEps) return { kind: 'advance', tile: order.dest };
    return { kind: 'hold' }; // arrived / nothing to chase — stand
  }
  return { kind: 'none' };
}
