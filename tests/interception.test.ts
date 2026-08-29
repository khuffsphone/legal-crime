import { describe, it, expect } from 'vitest';
import {
  areHostile,
  isCarryingCollector,
  unitDistance,
  canIntercept,
  detectInterceptions,
  resolveInterceptions,
} from '../src/sim/interception';
import { spawnCollector, spawnEnforcer, spawnUnit, unitArrived } from '../src/sim/movement';
import { update } from '../src/sim/realtime';
import { createInitialState } from '../src/sim/state';
import { cleanCash } from '../src/sim/laundering';
import { INTERCEPT_RADIUS, INTERCEPT_HEAT } from '../src/sim/constants';
import type { GameState } from '../src/sim/types';
import type { MovableUnit } from '../src/sim/movement';

function stateWith(units: MovableUnit[]): GameState {
  const s = createInitialState(1);
  s.units.push(...units);
  return s;
}

describe('hostility & carrying predicates', () => {
  it('hostility requires two different owned factions', () => {
    const c = spawnCollector('c', 0, 0, 'player', 100);
    const eEnemy = spawnEnforcer('e', 0, 0, 'rival-a');
    const eFriend = spawnEnforcer('f', 0, 0, 'player');
    const neutral = spawnUnit('n', 0, 0);
    expect(areHostile(c, eEnemy)).toBe(true);
    expect(areHostile(c, eFriend)).toBe(false); // same faction
    expect(areHostile(c, neutral)).toBe(false); // neutral has no faction
  });

  it('isCarryingCollector is true only for collectors with a positive take', () => {
    expect(isCarryingCollector(spawnCollector('c', 0, 0, 'player', 50))).toBe(true);
    expect(isCarryingCollector(spawnCollector('c', 0, 0, 'player', 0))).toBe(false);
    expect(isCarryingCollector(spawnEnforcer('e', 0, 0, 'player'))).toBe(false);
  });

  it('unitDistance is Euclidean grid distance', () => {
    const a = spawnUnit('a', 0, 0);
    const b = spawnUnit('b', 3, 4);
    expect(unitDistance(a, b)).toBeCloseTo(5);
  });
});

describe('canIntercept — the ambush condition', () => {
  it('fires for a hostile enforcer in range of a carrying collector', () => {
    const c = spawnCollector('c', 5, 5, 'player', 100);
    const e = spawnEnforcer('e', 5.5, 5, 'rival-a'); // 0.5 tiles away, within radius
    expect(canIntercept(e, c)).toBe(true);
  });

  it('does not fire out of range, for friendlies, or against a non-carrier', () => {
    const c = spawnCollector('c', 5, 5, 'player', 100);
    const far = spawnEnforcer('e', 5 + INTERCEPT_RADIUS + 0.1, 5, 'rival-a');
    const friend = spawnEnforcer('f', 5, 5, 'player');
    const empty = spawnCollector('c2', 5, 5, 'player', 0);
    const enemyEnforcerNearEmpty = spawnEnforcer('e2', 5, 5, 'rival-a');
    expect(canIntercept(far, c)).toBe(false);
    expect(canIntercept(friend, c)).toBe(false);
    expect(canIntercept(enemyEnforcerNearEmpty, empty)).toBe(false);
  });
});

describe('detectInterceptions — pure detection without mutation', () => {
  it('reports the live ambush but leaves the collector untouched', () => {
    const collector = spawnCollector('c', 3, 3, 'player', 120);
    const enforcer = spawnEnforcer('e', 3.2, 3, 'rival-a');
    const events = detectInterceptions([collector, enforcer]);
    expect(events).toEqual([
      { attackerId: 'e', collectorId: 'c', attackerFaction: 'rival-a', victimFaction: 'player', amount: 120 },
    ]);
    expect(collector.carrying).toBe(120); // detection does not rob
  });
});

describe('resolveInterceptions — the ambush resolves', () => {
  it('transfers the carried cash to the attacker family as dirty money and stops the collector', () => {
    const collector = spawnCollector('c', 5, 5, 'player', 300);
    const enforcer = spawnEnforcer('e', 5.2, 5, 'rival-a');
    const s = stateWith([collector, enforcer]);
    const rival = s.rivals.find((r) => r.id === 'rival-a')!;
    const cashBefore = rival.cash;
    const cleanBefore = cleanCash(rival);

    const events = resolveInterceptions(s);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ attackerId: 'e', collectorId: 'c', amount: 300 });
    expect(rival.cash).toBe(cashBefore + 300); // gained the take
    expect(rival.dirtyCash).toBe(300); // ...as dirty money
    expect(cleanCash(rival)).toBe(cleanBefore); // clean unchanged
    expect(rival.heat).toBe(INTERCEPT_HEAT);
    expect(collector.carrying).toBe(0); // emptied
    expect(unitArrived(collector)).toBe(true); // stopped
    expect(s.units).not.toContain(collector); // robbed one-shot [C] runner retires; it cannot become an inert duplicate
    expect(s.log.some((e) => e.kind === 'interception')).toBe(true);
  });

  it('preserves an intercepted automated route collector so its route machinery can resume it', () => {
    const collector = spawnCollector('route-c', 5, 5, 'player', 180);
    collector.routeId = 'route-biz-front-0';
    collector.routePhase = 'toBank';
    const enforcer = spawnEnforcer('e', 5.1, 5, 'rival-a');
    const s = stateWith([collector, enforcer]);

    expect(resolveInterceptions(s)).toHaveLength(1);
    expect(collector.carrying).toBe(0);
    expect(unitArrived(collector)).toBe(true);
    expect(s.units).toContain(collector); // route collectors are permanent; advanceRoutes owns their next leg
  });

  it('robs a collector at most once even with two enforcers nearby', () => {
    const collector = spawnCollector('c', 5, 5, 'player', 200);
    const e1 = spawnEnforcer('e1', 5.1, 5, 'rival-a');
    const e2 = spawnEnforcer('e2', 5.2, 5, 'rival-b');
    const s = stateWith([collector, e1, e2]);
    const rivalA = s.rivals.find((r) => r.id === 'rival-a')!;
    const rivalB = s.rivals.find((r) => r.id === 'rival-b')!;

    const events = resolveInterceptions(s);
    expect(events).toHaveLength(1);
    expect(events[0].attackerId).toBe('e1'); // the nearer enforcer wins
    expect(rivalA.dirtyCash).toBe(200);
    expect(rivalB.dirtyCash).toBe(0); // got nothing
  });

  it('does not fire for friendlies, neutrals, or out-of-range enemies', () => {
    const collector = spawnCollector('c', 5, 5, 'player', 100);
    const friend = spawnEnforcer('f', 5, 5, 'player');
    const neutral = spawnUnit('n', 5, 5);
    const farEnemy = spawnEnforcer('e', 9, 9, 'rival-a');
    const s = stateWith([collector, friend, neutral, farEnemy]);

    expect(resolveInterceptions(s)).toEqual([]);
    expect(collector.carrying).toBe(100); // untouched
  });

  it('is deterministic: identical setups resolve identically', () => {
    const build = () => {
      const c = spawnCollector('c', 2, 2, 'player', 150);
      const e = spawnEnforcer('e', 2.3, 2, 'rival-a');
      return stateWith([c, e]);
    };
    const a = build();
    const b = build();
    expect(resolveInterceptions(a)).toEqual(resolveInterceptions(b));
    const ra = a.rivals.find((r) => r.id === 'rival-a')!;
    const rb = b.rivals.find((r) => r.id === 'rival-a')!;
    expect(ra.dirtyCash).toBe(rb.dirtyCash);
  });
});

describe('update — interception fires in the real-time loop after movement', () => {
  it('an enforcer that closes on a carrying collector under stepped dt robs it', () => {
    const collector = spawnCollector('c', 5, 5, 'player', 250);
    // Enforcer starts just out of range and walks onto the collector.
    const enforcer = spawnEnforcer('e', 8, 5, 'rival-a', 2);
    enforcer.path = [{ gx: 5, gy: 5 }];
    const s = stateWith([collector, enforcer]);
    const rival = s.rivals.find((r) => r.id === 'rival-a')!;

    let totalIntercepted = 0;
    for (let i = 0; i < 30 && totalIntercepted === 0; i++) {
      const r = update(s, 0.1, 1000); // long week so no settlement interferes
      totalIntercepted += r.interceptions.length;
    }
    expect(totalIntercepted).toBe(1);
    expect(rival.dirtyCash).toBe(250);
    expect(collector.carrying).toBe(0);
  });

  it('a week settlement cannot bank a take that was robbed in transit (intercept before settle)', () => {
    const collector = spawnCollector('c', 5, 5, 'player', 100);
    const enforcer = spawnEnforcer('e', 5.1, 5, 'rival-a');
    const s = stateWith([collector, enforcer]);
    const r = update(s, 0.1, 0.05); // dt crosses the 0.05s week boundary AND triggers the ambush
    expect(r.interceptions).toHaveLength(1);
    expect(r.weeksFired).toBeGreaterThanOrEqual(1);
    expect(collector.carrying).toBe(0);
  });
});
