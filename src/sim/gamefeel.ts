// RTS-8 — game-feel & legibility selectors. Pure & deterministic; imports NO Phaser, so the
// derived views that drive the on-screen tension are unit-tested headlessly. NO new mechanics
// and NO economy mutation — these are READ-ONLY views over existing spatial state (collector
// carry + hostile proximity), reusing the RTS-4 interception predicates. IsoScene renders them.

import { INTERCEPT_RADIUS, DANGER_RADIUS } from './constants';
import { areHostile, isCarryingCollector, unitDistance } from './interception';
import type { GridPos } from './iso';
import type { MovableUnit } from './movement';
import type { GameState } from './types';

/** How exposed a carrying collector is, by the nearest hostile enforcer's distance. */
export type ThreatLevel = 'safe' | 'threatened' | 'ambush';

export interface CollectorCarryView {
  id: string;
  /** Dirty cash the collector is physically carrying (0 if empty / not a collector). */
  carrying: number;
  /** True when it is a collector carrying a take — i.e. robbable in transit, worth flagging. */
  vulnerable: boolean;
}

/** The "what is this unit carrying, and is it exposed" view for a single unit. */
export function collectorCarryView(u: MovableUnit): CollectorCarryView {
  const carrying = u.role === 'collector' ? u.carrying ?? 0 : 0;
  return { id: u.id, carrying, vulnerable: isCarryingCollector(u) };
}

/** Every collector currently carrying a take (the values walking across the map). */
export function carryingCollectors(state: GameState): CollectorCarryView[] {
  return state.units.filter(isCarryingCollector).map(collectorCarryView);
}

/** Whether `other` is a unit that could ambush `collector` (a hostile enforcer). */
export function isThreatTo(other: MovableUnit, collector: MovableUnit): boolean {
  return other.role === 'enforcer' && areHostile(other, collector);
}

export interface ThreatView {
  collectorId: string;
  carrying: number;
  /** Nearest hostile enforcer's id, or null if none exists at all. */
  nearestEnemyId: string | null;
  /** Distance to that enforcer (Infinity if none). */
  distance: number;
  level: ThreatLevel;
}

/** Classify a distance into a threat level (ambush ≤ INTERCEPT_RADIUS < threatened ≤ DANGER_RADIUS). */
export function threatLevelForDistance(distance: number): ThreatLevel {
  if (distance <= INTERCEPT_RADIUS) return 'ambush';
  if (distance <= DANGER_RADIUS) return 'threatened';
  return 'safe';
}

/**
 * The threat view for one collector: its nearest hostile enforcer and the resulting level.
 * A non-carrying collector (or a non-collector) is always 'safe' with no enemy considered —
 * there is nothing at stake to be threatened. Deterministic: nearest by distance, ties broken
 * by unit array order.
 */
export function collectorThreat(collector: MovableUnit, units: readonly MovableUnit[]): ThreatView {
  const carrying = collector.role === 'collector' ? collector.carrying ?? 0 : 0;
  if (!isCarryingCollector(collector)) {
    return { collectorId: collector.id, carrying, nearestEnemyId: null, distance: Infinity, level: 'safe' };
  }
  let nearestEnemyId: string | null = null;
  let distance = Infinity;
  for (const other of units) {
    if (!isThreatTo(other, collector)) continue;
    const d = unitDistance(other, collector);
    if (d < distance) {
      distance = d;
      nearestEnemyId = other.id;
    }
  }
  return { collectorId: collector.id, carrying, nearestEnemyId, distance, level: threatLevelForDistance(distance) };
}

/**
 * Every carrying collector that is currently NOT safe (a hostile enforcer within DANGER_RADIUS),
 * in unit array order. This is the selector IsoScene reads to draw proximity warnings. Pure —
 * never mutates state.
 */
export function threatenedCollectors(state: GameState): ThreatView[] {
  const out: ThreatView[] = [];
  for (const u of state.units) {
    if (!isCarryingCollector(u)) continue;
    const t = collectorThreat(u, state.units);
    if (t.level !== 'safe') out.push(t);
  }
  return out;
}

/** Whether any carrying collector is in danger right now (for a HUD alert pip). */
export function anyCollectorInDanger(state: GameState): boolean {
  return threatenedCollectors(state).length > 0;
}

/**
 * The nearest hostile enforcer (a unit of a DIFFERENT owned faction with the enforcer role) to a
 * grid point, within `radius` — or null if none is close. Used to telegraph whether a collector
 * run is risky to dispatch BEFORE the cash is on the street (RTS-13). Pure, deterministic.
 */
export function hostileEnforcerNear(
  state: GameState,
  familyId: string,
  point: GridPos,
  radius: number,
): MovableUnit | null {
  let best: MovableUnit | null = null;
  let bestDist = Infinity;
  for (const u of state.units) {
    if (u.role !== 'enforcer' || !u.factionId || u.factionId === familyId) continue;
    const d = Math.hypot(u.pos.gx - point.gx, u.pos.gy - point.gy);
    if (d <= radius && d < bestDist) {
      best = u;
      bestDist = d;
    }
  }
  return best;
}
