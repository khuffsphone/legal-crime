// RTS-35a — embodied unit-vs-unit COMBAT. Pure & Phaser-free. The first slice of the embodied-combat
// arc: a HEALTH model + PROXIMITY engagement so player thugs and rival thugs FIGHT when they get near
// each other (not just rob collectors). Settles AROUND the tick — the real-time wrapper (realtime.ts)
// calls resolveProximityCombat each step; tick()/applyCommand() are untouched.
//
// DESIGN CHOICE — AUTO-ENGAGE (noted): combat is automatic on proximity, not a separate command. The
// player POSITIONS/MOVES units (the existing move/raid verbs); any two opposing combatants within
// COMBAT_ENGAGE_RANGE trade discrete swings on their attack cadence. This is the cleaner RTS-standard
// model (no new verb, reuses movement) and it makes the rival AI symmetric: a rival near a player thug
// fights it. Discrete swings (a per-unit cooldown) — not continuous DPS — so each hit is one beat the
// render layer can flinch + sound on.

import {
  COMBAT_ATTACK_INTERVAL, COMBAT_ENGAGE_RANGE, COMBAT_MELEE_DAMAGE, THUG_MAX_HEALTH,
} from './constants';
import type { MovableUnit } from './movement';
import type { GameState, WeaponTier } from './types';

/** A unit's combat condition (absent ⇒ full). */
export function unitHealth(u: MovableUnit): number {
  return u.health ?? THUG_MAX_HEALTH;
}

/** A FIGHTER: a factioned, non-collector, not-downed unit (thugs + enforcers fight; collectors don't —
 * they're robbed via the interception path, which is preserved). Pure read. */
export function isCombatant(u: MovableUnit): boolean {
  return !!u.factionId && u.role !== 'collector' && !u.downed;
}

/** Two units are hostile fighters: both combatants, on different families. */
export function hostile(a: MovableUnit, b: MovableUnit): boolean {
  return isCombatant(a) && isCombatant(b) && a.factionId !== b.factionId;
}

function tileDist(a: MovableUnit, b: MovableUnit): number {
  return Math.hypot(a.pos.gx - b.pos.gx, a.pos.gy - b.pos.gy);
}

/** The nearest hostile fighter within engagement range of `u`, if any. Pure read. */
export function enemyInRange(u: MovableUnit, units: ReadonlyArray<MovableUnit>): MovableUnit | undefined {
  let best: MovableUnit | undefined;
  let bestD = COMBAT_ENGAGE_RANGE + 1e-9;
  for (const o of units) {
    if (o === u || !hostile(u, o)) continue;
    const d = tileDist(u, o);
    if (d <= COMBAT_ENGAGE_RANGE && d < bestD) { bestD = d; best = o; }
  }
  return best;
}

/** Apply `amount` damage to `u`; clamps at 0 and DOWNS the unit there (incapacitated — stops moving).
 * Returns true if THIS hit downed it. Pure (mutates u). */
export function damageUnit(u: MovableUnit, amount: number): boolean {
  if (u.downed) return false;
  const h = Math.max(0, unitHealth(u) - Math.max(0, amount));
  u.health = h;
  if (h <= 0) { u.downed = true; u.path = []; return true; }
  return false;
}

export interface CombatEvent {
  kind: 'hit' | 'down';
  attackerId: string;
  unitId: string;          // the struck / downed unit
  faction: string;         // the struck / downed unit's family (drives the corpse-memory colour)
  gx: number; gy: number;  // the struck / downed unit's position (for the render beat)
  weapon?: WeaponTier;     // the ATTACKER's weapon — render picks melee swing vs ranged recoil
}

/**
 * RTS-35a — one proximity-combat step (`dt` seconds). Bleeds each unit's swing cooldown, then every
 * READY combatant swings at its nearest hostile fighter in range, dealing COMBAT_MELEE_DAMAGE. A unit
 * reduced to 0 goes DOWN and is REMOVED from play (a real result). Returns the beats (one per swing,
 * `hit` or `down`) for the render layer to flinch/sound/kill on. Pure (mutates state); no Phaser, no RNG.
 */
export function resolveProximityCombat(state: GameState, dt: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  if (!(dt > 0)) return events;

  // bleed swing cooldowns
  for (const u of state.units) if ((u.attackCd ?? 0) > 0) u.attackCd = Math.max(0, (u.attackCd as number) - dt);

  // each ready fighter swings once at its nearest enemy in range (a downed target this pass is skipped,
  // since hostile() excludes downed units)
  for (const u of state.units) {
    if (!isCombatant(u) || (u.attackCd ?? 0) > 0) continue;
    const target = enemyInRange(u, state.units);
    if (!target) continue;
    u.attackCd = COMBAT_ATTACK_INTERVAL;
    const went = damageUnit(target, COMBAT_MELEE_DAMAGE);
    events.push({
      kind: went ? 'down' : 'hit',
      attackerId: u.id, unitId: target.id, faction: target.factionId as string,
      gx: target.pos.gx, gy: target.pos.gy, weapon: u.weapon,
    });
    if (went) {
      state.log.push({
        tick: state.tick,
        kind: 'unit-down',
        message: `${target.factionId === state.player.id ? 'one of your thugs' : 'a rival thug'} went down in a brawl`,
        data: { unitId: target.id, faction: target.factionId, byFaction: u.factionId },
      });
    }
  }

  // remove downed units — out of the fight (a real result; the scene drops their view on the `down` beat)
  if (events.some((e) => e.kind === 'down')) state.units = state.units.filter((u) => !u.downed);
  return events;
}
