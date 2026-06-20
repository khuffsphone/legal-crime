// RTS-4 — interception & ambush (THE signature mechanic, made spatial). Pure & deterministic;
// imports NO Phaser, so it is unit-tested by placing units and asserting the cash transfer.
//
// A Collector carries dirty cash in transit (set when it leaves a business in RTS-5). While it
// moves, a hostile ENFORCER that closes within INTERCEPT_RADIUS robs it: the carried cash is
// redirected to the attacker's family as dirty money — the same crediting path a safe
// collection uses (creditCrimeIncome) — and the collector is stopped, emptied of its take. The
// money is "in transit" (not yet on anyone's books), so an ambush is not a double count: it
// simply changes WHO banks the take. This is the spatial expression of S2's collector
// bottleneck — the run can be robbed before it reaches the safe house.

import { HEAT_MAX, INTERCEPT_RADIUS, INTERCEPT_HEAT } from './constants';
import { creditCrimeIncome } from './laundering';
import { stopUnit, type MovableUnit } from './movement';
import { findFamily, type GameState } from './types';

/** A unit currently carrying cash that an ambush can redirect. */
export function isCarryingCollector(u: MovableUnit): boolean {
  return u.role === 'collector' && (u.carrying ?? 0) > 0;
}

/** Two units are hostile only if both are owned and by different families. */
export function areHostile(a: MovableUnit, b: MovableUnit): boolean {
  return !!a.factionId && !!b.factionId && a.factionId !== b.factionId;
}

/** Euclidean grid-space distance between two units. */
export function unitDistance(a: MovableUnit, b: MovableUnit): number {
  return Math.hypot(a.pos.gx - b.pos.gx, a.pos.gy - b.pos.gy);
}

/** Whether `enforcer` (hostile muscle) is positioned to ambush `collector` this instant. */
export function canIntercept(enforcer: MovableUnit, collector: MovableUnit): boolean {
  return (
    enforcer.role === 'enforcer' &&
    isCarryingCollector(collector) &&
    areHostile(enforcer, collector) &&
    unitDistance(enforcer, collector) <= INTERCEPT_RADIUS
  );
}

export interface InterceptionEvent {
  attackerId: string;
  collectorId: string;
  attackerFaction: string;
  victimFaction: string;
  amount: number;
}

/**
 * Detect every ambush that is live this instant, WITHOUT mutating: for each carrying collector,
 * the nearest hostile enforcer within range is its ambusher. Deterministic — collectors are
 * scanned in array order and ties on distance break by enforcer array order.
 */
export function detectInterceptions(units: readonly MovableUnit[]): InterceptionEvent[] {
  const events: InterceptionEvent[] = [];
  for (const collector of units) {
    if (!isCarryingCollector(collector)) continue;
    let attacker: MovableUnit | null = null;
    let best = Infinity;
    for (const e of units) {
      if (!canIntercept(e, collector)) continue;
      const d = unitDistance(e, collector);
      if (d < best) {
        best = d;
        attacker = e;
      }
    }
    if (attacker) {
      events.push({
        attackerId: attacker.id,
        collectorId: collector.id,
        attackerFaction: attacker.factionId!,
        victimFaction: collector.factionId!,
        amount: collector.carrying ?? 0,
      });
    }
  }
  return events;
}

/**
 * Detect and RESOLVE all live ambushes on state.units: the carried cash is credited to the
 * attacker's family as dirty money, the attacker takes ambush heat, and the collector is
 * stopped and emptied. Returns the resolved events (also appended to state.log). Mutates state.
 *
 * No RNG — interception is deterministic given positions. Each collector is robbed at most once
 * per call (its carry is zeroed), so two enforcers cannot double-spend the same take.
 */
export function resolveInterceptions(state: GameState): InterceptionEvent[] {
  const events = detectInterceptions(state.units);
  for (const ev of events) {
    const attackerFamily = findFamily(state, ev.attackerFaction);
    const collector = state.units.find((u) => u.id === ev.collectorId);
    if (!collector || (collector.carrying ?? 0) <= 0) continue; // already robbed this pass

    if (attackerFamily) {
      creditCrimeIncome(attackerFamily, ev.amount); // the take is dirty money
      attackerFamily.heat = Math.min(HEAT_MAX, attackerFamily.heat + INTERCEPT_HEAT);
    }
    collector.carrying = 0;
    stopUnit(collector);

    state.log.push({
      tick: state.tick,
      kind: 'interception',
      message: `${ev.attackerFaction} ambushed ${ev.victimFaction}'s collector ${ev.collectorId} for $${ev.amount}`,
      data: { ...ev },
    });
  }
  return events;
}
