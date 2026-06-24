// RTS-35a — pure tests for the embodied unit-vs-unit combat: the health model (damage reduces health,
// zero = DOWN), proximity engagement (opposing thugs in range fight), the rival-AI symmetry (a rival
// engages a nearby player thug), collectors stay out of it, and the exercisable kill (they fight → one
// goes down → the `down` beat fires + the unit leaves play).
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  unitHealth, isCombatant, hostile, enemyInRange, damageUnit, resolveProximityCombat,
} from '../src/sim/combat';
import { spawnCollector, type MovableUnit } from '../src/sim/movement';
import { THUG_MAX_HEALTH, COMBAT_ENGAGE_RANGE, COMBAT_MELEE_DAMAGE } from '../src/sim/constants';
import type { GameState } from '../src/sim/types';

function thug(id: string, fid: string, gx: number, gy: number): MovableUnit {
  return { id, pos: { gx, gy }, path: [], speed: 1, factionId: fid, role: 'enforcer' };
}
function withUnits(...us: MovableUnit[]): GameState {
  const s = createInitialState(1, { bigCity: true });
  s.units = us;
  return s;
}

describe('the health model', () => {
  it('a fresh unit reads full health; damage reduces it', () => {
    const u = thug('a', 'player', 0, 0);
    expect(unitHealth(u)).toBe(THUG_MAX_HEALTH);
    expect(damageUnit(u, 30)).toBe(false); // not yet down
    expect(unitHealth(u)).toBe(THUG_MAX_HEALTH - 30);
  });
  it('ZERO health = DOWN (incapacitated, stops moving)', () => {
    const u = thug('a', 'player', 0, 0); u.health = 10; u.path = [{ gx: 5, gy: 5 }];
    expect(damageUnit(u, 24)).toBe(true); // this hit downed it
    expect(u.downed).toBe(true);
    expect(unitHealth(u)).toBe(0);
    expect(u.path).toEqual([]); // stopped
    expect(damageUnit(u, 50)).toBe(false); // already down — no further effect
  });
});

describe('who fights', () => {
  it('a factioned non-collector is a combatant; a collector is NOT', () => {
    expect(isCombatant(thug('a', 'player', 0, 0))).toBe(true);
    expect(isCombatant(spawnCollector('c', 0, 0, 'player', 300))).toBe(false);
    const neutral: MovableUnit = { id: 'n', pos: { gx: 0, gy: 0 }, path: [], speed: 1 };
    expect(isCombatant(neutral)).toBe(false); // no faction
  });
  it('only DIFFERENT-family combatants are hostile', () => {
    expect(hostile(thug('a', 'player', 0, 0), thug('b', 'rival-a', 0, 0))).toBe(true);
    expect(hostile(thug('a', 'player', 0, 0), thug('b', 'player', 0, 0))).toBe(false); // same family
  });
});

describe('proximity engagement', () => {
  it('an enemy just inside range is found; just outside is not', () => {
    const me = thug('a', 'player', 0, 0);
    const near = thug('b', 'rival-a', COMBAT_ENGAGE_RANGE - 0.3, 0);
    const far = thug('c', 'rival-a', COMBAT_ENGAGE_RANGE + 2, 0);
    expect(enemyInRange(me, [me, near, far])).toBe(near);
    expect(enemyInRange(me, [me, far])).toBeUndefined();
  });

  it('two opposing thugs in range FIGHT — both take damage on a step', () => {
    const p = thug('p', 'player', 0, 0);
    const r = thug('r', 'rival-a', 1, 0); // within COMBAT_ENGAGE_RANGE (1.3)
    const s = withUnits(p, r);
    const events = resolveProximityCombat(s, 0.5);
    expect(events.length).toBe(2); // each swings once
    expect(unitHealth(p)).toBe(THUG_MAX_HEALTH - COMBAT_MELEE_DAMAGE); // the rival hit the player thug
    expect(unitHealth(r)).toBe(THUG_MAX_HEALTH - COMBAT_MELEE_DAMAGE); // …and the player hit back
  });

  it('⭐ the RIVAL AI is symmetric — a rival ENGAGES a nearby player thug (not just robs collectors)', () => {
    const p = thug('p', 'player', 4, 4);
    const r = thug('r', 'rival-a', 4.5, 4);
    const s = withUnits(p, r);
    resolveProximityCombat(s, 0.5);
    expect(unitHealth(p)).toBeLessThan(THUG_MAX_HEALTH); // the rival drew blood on the player unit
  });

  it('a collector in range is NOT engaged (collectors are robbed, not brawled)', () => {
    const r = thug('r', 'rival-a', 0, 0);
    const col = spawnCollector('c', 0.5, 0, 'player', 300);
    const s = withUnits(r, col);
    const events = resolveProximityCombat(s, 0.5);
    expect(events.length).toBe(0); // no brawl with a collector
    expect(unitHealth(col)).toBe(THUG_MAX_HEALTH); // untouched by combat
  });

  it('out of range ⇒ no engagement', () => {
    const s = withUnits(thug('p', 'player', 0, 0), thug('r', 'rival-a', 10, 10));
    expect(resolveProximityCombat(s, 0.5).length).toBe(0);
  });
});

describe('⭐ EXERCISABLE — two opposing thugs fight until one goes DOWN', () => {
  it('they trade blows over steps; one drops, a `down` beat fires, and it leaves play', () => {
    const p = thug('p', 'player', 0, 0);
    const r = thug('r', 'rival-a', 1, 0);
    r.health = COMBAT_MELEE_DAMAGE; // the rival is already hurt — the next clean hit drops it
    const s = withUnits(p, r);
    let down: ReturnType<typeof resolveProximityCombat>[number] | undefined;
    for (let i = 0; i < 20 && !down; i++) {
      const evs = resolveProximityCombat(s, 1.0); // 1s steps so cooldowns clear between swings
      down = evs.find((e) => e.kind === 'down');
    }
    expect(down).toBeDefined();
    expect(down!.unitId).toBe('r');         // the rival went down
    expect(down!.faction).toBe('rival-a');
    expect(s.units.find((u) => u.id === 'r')).toBeUndefined(); // removed from play (a real result)
    const log = s.log.find((l) => l.kind === 'unit-down');
    expect(log).toBeDefined();              // a "down" line for The Wire
  });
});
